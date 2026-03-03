"""Simulate any combination of agents across all 4 seats.

Flexible tool for testing tier combinations and measuring win rates.
Put any agent (DQN tier, random, rule-v1, heuristic bot) at any seat.

Modes:
  Single combo: specify agents for all 4 seats, run N games.
  All combos:   enumerate all mixable tier combinations for seats 1-3
                with a fixed seat 0 agent. Builds a lookup table.
  Adaptive:     controller dynamically picks tiers per-game based on
                a running session win rate, simulating live play.

Usage:
    # Specific combination
    python -m simulator.simulation.simulate --s0 rule-v1 --s1 selfish --s2 selfish --s3 selfish --games 500

    # Altruistic helping seat 0
    python -m simulator.simulation.simulate --s0 casual --s1 altruistic --s2 altruistic --s3 altruistic --target 0

    # Hyper-adversarial helping seat 2 (target auto-set to seat 2)
    python -m simulator.simulation.simulate --s0 random --s1 hyper_adversarial --s2 selfish --s3 hyper_adversarial

    # All 125 combos for seats 1-3 against rule-v1
    python -m simulator.simulation.simulate --s0 rule-v1 --all --target 0 --games 200

    # Adaptive controller simulation
    python -m simulator.simulation.simulate --s0 casual --adaptive --games 2000
    python -m simulator.simulation.simulate --s0 rule-v1 --adaptive --adaptive-target 0.10 --games 5000

    # Baseline sanity check
    python -m simulator.simulation.simulate --baseline --games 100

    # Fast run without stats/plots
    python -m simulator.simulation.simulate --s0 rule-v1 --s1 selfish --s2 selfish --s3 selfish --no-stats
"""

import argparse
import itertools
import json
import os
import sys
import time
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from engine.game_logic.game import UnoGame
from engine.config.game import NUM_PLAYERS, PLAYER_SEAT, BOT_SEATS
from simulator.config.tiers import (
    AGENT_CHOICES, AGENT_ALIASES, MIXABLE_TIERS, TARGET_SEAT_TIERS, FIXED_TARGET,
    VOLUNTARY_DRAW_POLICY, TierModelPool, resolve_agent_name,
    TIER_ORDER, AdaptiveTierController, TIER_SEAT_OVERRIDE,
)
from simulator.config.simulation import TIER_GAMES, TIER_RESULTS_PATH, DATA_DIR
from simulator.simulation.game_stats import GameStatCollector, print_stats_summary, plot_stats


# Short names for plot filenames
SHORT_NAMES = {
    "random": "rnd",
    "random-vd": "rndvd",
    "rule-v1": "rv1",
    "noob": "noob",
    "casual": "cas",
    "pro": "pro",
    "selfish": "sel",
    "adversarial": "adv",
    "altruistic": "alt",
    "hyper_altruistic": "halt",
    "hyper_adversarial": "hadv",
}


def _short(name):
    """Get short form of an agent name for filenames."""
    return SHORT_NAMES.get(name, name[:4])


def _build_plot_path(seats, games, data_dir):
    """Build a descriptive plot filename from seat agents.

    Format: sim_{s0}_{s1}_{s2}_{s3}_{games}g_stats.png
    """
    parts = [_short(s) for s in seats]
    return os.path.join(data_dir, f"sim_{'_'.join(parts)}_{games}g_stats.png")


def _build_results_path(seats, games, data_dir):
    """Build a descriptive results filename from seat agents.

    Format: sim_{s0}_{s1}_{s2}_{s3}_{games}g_results.json
    """
    parts = [_short(s) for s in seats]
    return os.path.join(data_dir, f"sim_{'_'.join(parts)}_{games}g_results.json")


def _build_adaptive_results_path(seat0, target_wr, games, data_dir):
    """Build a descriptive results filename for adaptive mode.

    Format: adaptive_{s0}_t{target}_{games}g_results.json
    """
    s0 = _short(seat0)
    target_str = f"{target_wr:.0%}".replace("%", "")
    return os.path.join(data_dir, f"adaptive_{s0}_t{target_str}_{games}g_results.json")


def _build_adaptive_plot_path(seat0, target_wr, games, data_dir):
    """Build plot filename for adaptive mode.

    Format: adaptive_{s0}_t{target}_{games}g_plots.png
    """
    s0 = _short(seat0)
    target_str = f"{target_wr:.0%}".replace("%", "")
    return os.path.join(data_dir, f"adaptive_{s0}_t{target_str}_{games}g_plots.png")


def plot_adaptive(output, plot_path):
    """Generate adaptive simulation research plots.

    4-panel figure:
      1. Win Rate Trajectory — cumulative WR over games with target line
         and convergence marker.
      2. Error Over Time — signed error with band thresholds overlaid.
      3. Tier Usage Timeline — rolling window tier distribution (stacked area).
      4. Overall Tier Distribution — bar chart with base vs variation split.
    """
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        import numpy as np
    except ImportError:
        print("  WARNING: matplotlib not installed, skipping plot generation")
        return

    wr_traj = output.get('wr_trajectory', [])
    if not wr_traj:
        return

    n = len(wr_traj)
    x = np.arange(1, n + 1)
    target = output['metadata']['target_win_rate']
    conv_game = output['convergence']['game']

    # Tier color map (consistent ordering)
    tier_colors = {
        'hyper_adversarial': '#d62728',
        'adversarial': '#ff7f0e',
        'selfish': '#bcbd22',
        'random': '#7f7f7f',
        'altruistic': '#17becf',
        'hyper_altruistic': '#2ca02c',
    }
    tier_short = {
        'hyper_adversarial': 'hadv',
        'adversarial': 'adv',
        'selfish': 'sel',
        'random': 'rnd',
        'altruistic': 'alt',
        'hyper_altruistic': 'halt',
    }

    fig, axes = plt.subplots(2, 2, figsize=(16, 10))
    fig.suptitle(
        f"Adaptive Controller: {output['metadata']['seat0']} @ "
        f"{target:.0%} target  ({n:,} games)",
        fontsize=14, fontweight='bold',
    )

    # --- Panel 1: Win Rate Trajectory ---
    ax = axes[0, 0]
    ax.plot(x, wr_traj, linewidth=0.8, color='#1f77b4', label='Win Rate')
    ax.axhline(target, color='red', linestyle='--', linewidth=1, label=f'Target ({target:.0%})')
    if conv_game:
        ax.axvline(conv_game, color='green', linestyle=':', linewidth=1,
                   label=f'Converged (game {conv_game})')
    ax.set_xlabel('Game')
    ax.set_ylabel('Cumulative Win Rate')
    ax.set_title('Win Rate Convergence')
    ax.legend(fontsize=8)
    ax.set_ylim(0, max(0.6, max(wr_traj) * 1.1))
    ax.grid(True, alpha=0.3)

    # --- Panel 2: Error Over Time ---
    ax = axes[0, 1]
    errors = [wr - target for wr in wr_traj]
    ax.plot(x, errors, linewidth=0.6, color='#1f77b4', alpha=0.8)
    ax.axhline(0, color='red', linestyle='--', linewidth=1)
    # Show band thresholds
    from engine.game_logic.tiers.tier_controller import AdaptiveTierController
    for bound, tier in AdaptiveTierController.DEFAULT_BANDS:
        ax.axhline(bound, color=tier_colors.get(tier, 'gray'),
                   linestyle=':', linewidth=0.7, alpha=0.6)
        ax.text(n * 1.01, bound, tier_short.get(tier, tier),
                fontsize=7, va='center', color=tier_colors.get(tier, 'gray'))
    if conv_game:
        ax.axvline(conv_game, color='green', linestyle=':', linewidth=1)
    ax.set_xlabel('Game')
    ax.set_ylabel('Error (WR - Target)')
    ax.set_title('Error Over Time')
    ax.grid(True, alpha=0.3)

    # --- Panel 3: Tier Usage Timeline (rolling window) ---
    ax = axes[1, 0]
    # Reconstruct tier sequence from output — we stored wr_trajectory but not
    # tier_sequence in JSON. Use tier_usage counts to show rolling distribution.
    # Since we don't have per-game tier sequence in output, show a stacked bar
    # of tier usage in 50-game windows from wr_trajectory + error bands.
    # Actually, we can reconstruct which tier the base controller would pick
    # from the error trajectory.
    window = 50
    num_windows = n // window
    if num_windows > 0:
        ctrl = AdaptiveTierController(target_win_rate=target)
        # Reconstruct base tier per game from error
        tier_windows = {t: [] for t in TIER_ORDER}
        for w in range(num_windows):
            start = w * window
            end = start + window
            window_errors = errors[start:end]
            counts = {t: 0 for t in TIER_ORDER}
            for e in window_errors:
                t = ctrl._base_tier(e)
                counts[t] += 1
            for t in TIER_ORDER:
                tier_windows[t].append(counts[t] / window * 100)

        window_x = np.arange(1, num_windows + 1) * window
        bottom = np.zeros(num_windows)
        for t in TIER_ORDER:
            vals = np.array(tier_windows[t])
            ax.bar(window_x, vals, bottom=bottom, width=window * 0.8,
                   color=tier_colors[t], label=tier_short[t])
            bottom += vals
        ax.set_xlabel(f'Game (windows of {window})')
        ax.set_ylabel('Tier %')
        ax.set_title(f'Base Tier Distribution ({window}-game windows)')
        ax.legend(fontsize=7, ncol=3, loc='upper right')
        ax.set_ylim(0, 100)
    else:
        ax.text(0.5, 0.5, 'Not enough games', ha='center', va='center',
                transform=ax.transAxes)
    ax.grid(True, alpha=0.3)

    # --- Panel 4: Overall Tier Distribution (base vs variation) ---
    ax = axes[1, 1]
    tiers = TIER_ORDER
    base_counts = [output['tier_base_usage'].get(t, 0) for t in tiers]
    var_counts = [output['tier_variation_usage'].get(t, 0) for t in tiers]
    labels = [tier_short[t] for t in tiers]
    colors = [tier_colors[t] for t in tiers]

    bar_x = np.arange(len(tiers))
    bar_w = 0.35
    ax.bar(bar_x - bar_w / 2, base_counts, bar_w, label='Base',
           color=colors, edgecolor='black', linewidth=0.5)
    ax.bar(bar_x + bar_w / 2, var_counts, bar_w, label='Variation',
           color=colors, edgecolor='black', linewidth=0.5, alpha=0.5)
    ax.set_xticks(bar_x)
    ax.set_xticklabels(labels)
    ax.set_ylabel('Games')
    ax.set_title('Tier Usage: Base vs Variation')
    ax.legend(fontsize=8)
    ax.grid(True, alpha=0.3, axis='y')

    # Add WR annotation on each bar
    for i, t in enumerate(tiers):
        wr_val = output['tier_seat0_win_rates'].get(t)
        total_count = base_counts[i] + var_counts[i]
        if wr_val is not None and total_count > 0:
            ax.text(i, total_count + max(sum(base_counts), 1) * 0.02,
                    f'{wr_val:.0%}', ha='center', fontsize=7, color='black')

    plt.tight_layout()
    plt.savefig(plot_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"  Plots saved to {os.path.basename(plot_path)}")


def _safe_save_path(path):
    """If path already exists, rename the old file with a timestamp suffix."""
    if os.path.exists(path):
        ts = datetime.fromtimestamp(os.path.getmtime(path)).strftime("%Y%m%d_%H%M%S")
        base, ext = os.path.splitext(path)
        old_path = f"{base}_{ts}{ext}"
        os.rename(path, old_path)
        print(f"  Renamed old plot -> {os.path.basename(old_path)}")


def needs_cli_target(agents: list) -> bool:
    """Check if any agent needs --target from CLI.

    Agents in FIXED_TARGET (altruistic→0, hyper_altruistic→0,
    hyper_adversarial→2) are auto-configured and don't need CLI input.
    """
    return any(a in TARGET_SEAT_TIERS and a not in FIXED_TARGET for a in agents)


def build_target_dict(seats, cli_target):
    """Build per-seat target dict from agent types and CLI --target.

    - altruistic/hyper_altruistic → always 0 (hardcoded)
    - hyper_adversarial → always 2 (hardcoded, trained with selfish star at seat 2)
    - everything else → None
    """
    targets = {}
    for i, agent in enumerate(seats):
        if agent in FIXED_TARGET:
            targets[i] = FIXED_TARGET[agent]
        elif agent in TARGET_SEAT_TIERS:
            targets[i] = cli_target
        else:
            targets[i] = None
    return targets


def get_draw_caps(seats):
    """Build per-seat voluntary draw caps based on each agent's training policy."""
    return {i: VOLUNTARY_DRAW_POLICY.get(seats[i], 0) for i in range(len(seats))}


def run_combo(game, pool, seats, cli_target, num_games, show_progress=False,
              collect_stats=False):
    """Run num_games with a specific agent assignment and return results.

    Args:
        game: UnoGame instance (reused).
        pool: TierModelPool with cached agents.
        seats: List of 4 agent names [s0, s1, s2, s3].
        cli_target: CLI --target value for cooperative agents, or None.
        num_games: Number of games to play.
        show_progress: Print progress every 500 games.
        collect_stats: Collect rich per-game statistics.

    Returns:
        dict with per-seat win counts, win rates, and optional stats.
    """
    agents = [pool.get(seats[i]) for i in range(NUM_PLAYERS)]
    game.set_agents(agents)

    # Per-seat targets: altruistic/hyper_alt → 0, hyper_adversarial → 2, rest → None
    game.set_target_seat(build_target_dict(seats, cli_target))

    # Set per-seat voluntary draw caps matching training policy
    game.set_max_voluntary_draws(get_draw_caps(seats))

    wins = {i: 0 for i in range(NUM_PLAYERS)}
    collector = GameStatCollector(NUM_PLAYERS, seats) if collect_stats else None

    eval_every = 500
    for g in range(num_games):
        result = game.run_game(is_training=False)
        winner = result['winner']
        wins[winner] += 1

        if collector is not None:
            collector.record(result['trajectories'], winner)

        if show_progress:
            done = g + 1
            s0_wr = wins[PLAYER_SEAT] / done
            # Overwrite in place
            print(
                f"\r  Game {done:>6}/{num_games}  "
                f"winner: seat {winner} ({seats[winner]:>16})  "
                f"s0-wr: {s0_wr:.2%}",
                end="", flush=True,
            )
            if done % eval_every == 0:
                pct = done / num_games * 100
                bar_len = 20
                filled = int(bar_len * done / num_games)
                bar = "█" * filled + "░" * (bar_len - filled)
                print()  # newline to escape the \r line
                print(f"  ┌─ Game {done:,}/{num_games:,} ({pct:.0f}%) [{bar}]")
                for i in range(NUM_PLAYERS):
                    wr = wins[i] / done
                    print(f"  │  Seat {i} ({seats[i]:>16}) : {wins[i]:>4}/{done}  ({wr:.1%})")
                print(f"  └{'─' * 50}")
    if show_progress:
        print()  # final newline after last \r line

    win_rates = {i: wins[i] / num_games for i in range(NUM_PLAYERS)}
    out = {'wins': wins, 'win_rates': win_rates, 'games': num_games}

    if collector is not None:
        out['stats'] = collector.summary()

    return out


def run_single(args):
    """Run a single combination."""
    seats = [resolve_agent_name(a) for a in [args.s0, args.s1, args.s2, args.s3]]
    target_seat = args.target

    # Validate: check if any agent needs --target from CLI
    if needs_cli_target(seats) and target_seat is None:
        print("ERROR: Some agents require --target N to set plane 11")
        sys.exit(1)

    print()
    print("=" * 60)
    print("  TIER SIMULATION")
    print("=" * 60)
    print(f"  Seat 0 : {seats[0]}")
    print(f"  Seat 1 : {seats[1]}")
    print(f"  Seat 2 : {seats[2]}")
    print(f"  Seat 3 : {seats[3]}")
    if target_seat is not None:
        print(f"  Target : seat {target_seat} (plane 11)")
    print(f"  Games  : {args.games:,}")
    print("=" * 60)
    print()

    # Load only the agents we need
    unique_agents = list(set(seats))
    print("Loading agents...")
    pool = TierModelPool(tiers_to_load=unique_agents)
    print()

    game = UnoGame()
    print("Running games...")
    result = run_combo(
        game, pool, seats, target_seat, args.games,
        show_progress=True, collect_stats=not args.no_stats,
    )

    # Print results
    print("=" * 60)
    print("  RESULTS")
    print("=" * 60)
    for i in range(NUM_PLAYERS):
        wr = result['win_rates'][i]
        w = result['wins'][i]
        label = seats[i]
        print(f"  Seat {i} ({label:>16}) : {w:>4}/{args.games}  ({wr:.1%})")
    print("=" * 60)

    # Print rich stats and generate plot
    if 'stats' in result:
        print_stats_summary(result['stats'], seats)
        plot_path = _build_plot_path(seats, args.games, DATA_DIR)
        _safe_save_path(plot_path)
        plot_stats(result['stats'], seats, plot_path)

    # Build output
    output = {
        'mode': 'single',
        'seats': {f's{i}': seats[i] for i in range(NUM_PLAYERS)},
        'target_seat': target_seat,
        'games': args.games,
        'wins': result['wins'],
        'win_rates': {f's{k}': round(v, 4) for k, v in result['win_rates'].items()},
    }
    if 'stats' in result:
        # Strip internal keys (prefixed with _) before serialization
        output['stats'] = {k: v for k, v in result['stats'].items() if not k.startswith('_')}
    return output


def run_all_combos(args):
    """Enumerate all mixable tier combinations for seats 1-3."""
    seat0 = resolve_agent_name(args.s0)
    target_seat = args.target
    tiers = MIXABLE_TIERS
    combos = list(itertools.product(tiers, repeat=3))
    total = len(combos)

    # Check if any mixable tier needs --target from CLI
    needs_target = any(t in TARGET_SEAT_TIERS and t not in FIXED_TARGET for t in tiers)
    if needs_target and target_seat is None:
        print("ERROR: Some mixable tiers require --target N to set plane 11")
        sys.exit(1)

    print()
    print("=" * 60)
    print("  TIER COMBINATION SIMULATION (ALL COMBOS)")
    print("=" * 60)
    print(f"  Seat 0      : {seat0}")
    print(f"  Bot tiers   : {tiers}")
    print(f"  Combinations: {total}")
    print(f"  Games/combo : {args.games}")
    print(f"  Total games : {total * args.games:,}")
    if target_seat is not None:
        print(f"  Target      : seat {target_seat}")
    print("=" * 60)
    print()

    # Load all agents once
    all_needed = list(set([seat0] + tiers))
    print("Loading agents...")
    pool = TierModelPool(tiers_to_load=all_needed)
    print()

    game = UnoGame()
    results = {}
    start_time = time.time()

    for i, combo in enumerate(combos, 1):
        seats = [seat0, combo[0], combo[1], combo[2]]

        result = run_combo(
            game, pool, seats, target_seat, args.games,
            collect_stats=args.stats,
        )

        key = f"{combo[0]},{combo[1]},{combo[2]}"
        combo_result = {
            'seat1': combo[0],
            'seat2': combo[1],
            'seat3': combo[2],
            'seat0_win_rate': round(result['win_rates'][PLAYER_SEAT], 4),
            'per_seat_wins': result['wins'],
            'games': args.games,
        }
        if 'stats' in result:
            combo_result['stats'] = {k: v for k, v in result['stats'].items() if not k.startswith('_')}
        results[key] = combo_result

        elapsed = time.time() - start_time
        eta = elapsed / i * (total - i)
        s0_wr = result['win_rates'][PLAYER_SEAT]
        print(
            f"  [{i:>3}/{total}] "
            f"({combo[0]:>16}, {combo[1]:>16}, {combo[2]:>16}) "
            f"-> s0: {s0_wr:.1%}  "
            f"[ETA: {eta / 60:.1f}m]"
        )

    # Summary sorted by seat 0 win rate
    sorted_results = sorted(results.values(), key=lambda x: x['seat0_win_rate'])

    print()
    print("=" * 60)
    print("  RESULTS SUMMARY (sorted by seat 0 win rate)")
    print("=" * 60)
    for r in sorted_results:
        print(
            f"  ({r['seat1']:>16}, {r['seat2']:>16}, {r['seat3']:>16}) "
            f"-> s0: {r['seat0_win_rate']:.1%}"
        )
    print("=" * 60)

    elapsed_total = time.time() - start_time
    print(f"\n  Completed in {elapsed_total / 60:.1f} minutes")

    # Build output
    output = {
        'mode': 'all_combos',
        'metadata': {
            'seat0': seat0,
            'target_seat': target_seat,
            'games_per_combo': args.games,
            'total_combos': total,
            'tiers': tiers,
        },
        'results': results,
    }
    return output


def run_adaptive(args):
    """Simulate with the adaptive controller dynamically picking tiers.

    Seat 0 uses a fixed agent (--s0). Seats 1-3 use the tier chosen by
    the AdaptiveTierController each game, based on a running session
    win rate (wins / total games so far).

    When the controller picks hyper_adversarial, TIER_SEAT_OVERRIDE applies:
    seats 1-3 become [hadv, selfish, hadv] instead of [hadv, hadv, hadv].

    Logs research data: per-game WR trajectory, convergence point,
    post-convergence error stats, tier transitions.
    """
    seat0 = resolve_agent_name(args.s0)
    num_games = args.games
    target_wr = args.adaptive_target
    convergence_threshold = 0.02  # within ±2% of target = converged

    controller = AdaptiveTierController(target_win_rate=target_wr)

    # Load all tier agents + seat 0 agent
    all_needed = list(set([seat0] + list(TIER_ORDER)))
    print()
    print("=" * 60)
    print("  ADAPTIVE CONTROLLER SIMULATION")
    print("=" * 60)
    print(f"  Seat 0       : {seat0}")
    print(f"  Target WR    : {target_wr:.0%}")
    print(f"  Games        : {num_games:,}")
    print(f"  Controller   : AdaptiveTierController (base + variation)")
    print("=" * 60)
    print()

    print("Loading agents...")
    pool = TierModelPool(tiers_to_load=all_needed)
    print()

    game = UnoGame()
    wins = 0
    total = 0
    tier_usage = {}
    tier_wins = {}
    # Variation tracking
    variation_count = 0
    tier_base_count = {}
    tier_var_count = {}
    # Research tracking
    wr_trajectory = []           # WR after each game
    error_trajectory = []        # error after each game
    tier_sequence = []           # tier picked each game
    convergence_game = None      # first game where WR stays within threshold
    converged_streak = 0         # consecutive games within threshold
    convergence_window = 50      # must stay converged for this many games
    prev_tier = None
    tier_transitions = 0         # how many times tier changed game-to-game

    eval_every = 100
    start_time = time.time()

    print("Running games...")
    for g in range(num_games):
        # Running session win rate
        win_rate = wins / total if total > 0 else 0.0

        # Controller picks the tier (with variation tracking)
        tier, is_variation = controller.select_tier_detailed(win_rate, total)
        tier_usage[tier] = tier_usage.get(tier, 0) + 1
        if is_variation:
            variation_count += 1
            tier_var_count[tier] = tier_var_count.get(tier, 0) + 1
        else:
            tier_base_count[tier] = tier_base_count.get(tier, 0) + 1

        # Track tier transitions
        if prev_tier is not None and tier != prev_tier:
            tier_transitions += 1
        prev_tier = tier
        tier_sequence.append(tier)

        # Determine bot seats: apply seat override for hadv
        if tier in TIER_SEAT_OVERRIDE:
            bot_tiers = TIER_SEAT_OVERRIDE[tier]
        else:
            bot_tiers = [tier, tier, tier]

        seats = [seat0] + bot_tiers
        agents = [pool.get(s) for s in seats]
        game.set_agents(agents)

        # Set targets and VD caps
        game.set_target_seat(build_target_dict(seats, 0))
        game.set_max_voluntary_draws(get_draw_caps(seats))

        result = game.run_game(is_training=False)
        winner = result['winner']
        total += 1
        if winner == PLAYER_SEAT:
            wins += 1
            tier_wins[tier] = tier_wins.get(tier, 0) + 1

        # Track WR and error
        wr = wins / total
        error = wr - target_wr
        wr_trajectory.append(round(wr, 4))
        error_trajectory.append(round(error, 4))

        # Convergence detection: first time WR stays within threshold
        # for convergence_window consecutive games
        if convergence_game is None:
            if abs(error) <= convergence_threshold:
                converged_streak += 1
                if converged_streak >= convergence_window:
                    convergence_game = total - convergence_window + 1
            else:
                converged_streak = 0

        # Progress display
        done = g + 1
        var_tag = " [var]" if is_variation else ""
        print(
            f"\r  Game {done:>6}/{num_games}  "
            f"wr: {wr:.2%}  tier: {tier:>18}{var_tag}  "
            f"winner: seat {winner}",
            end="", flush=True,
        )
        if done % eval_every == 0:
            elapsed = time.time() - start_time
            eta = elapsed / done * (num_games - done)
            pct = done / num_games * 100
            bar_len = 20
            filled = int(bar_len * done / num_games)
            bar = "█" * filled + "░" * (bar_len - filled)
            var_pct = variation_count / done * 100
            print()
            print(f"  ┌─ Game {done:,}/{num_games:,} ({pct:.0f}%) [{bar}] ETA: {eta / 60:.1f}m")
            print(f"  │  Win rate: {wr:.2%}  (target: {target_wr:.0%})  error: {error:+.2%}")
            print(f"  │  Current tier: {tier}  |  Variation: {var_pct:.1f}%")
            print(f"  └{'─' * 50}")

    print()

    # --- Post-simulation analysis ---
    final_wr = wins / total if total > 0 else 0.0
    elapsed_total = time.time() - start_time
    var_pct_final = variation_count / total * 100 if total > 0 else 0.0

    # Post-convergence error stats
    if convergence_game is not None:
        post_errors = error_trajectory[convergence_game - 1:]
        post_error_min = min(post_errors)
        post_error_max = max(post_errors)
        post_error_mean = sum(post_errors) / len(post_errors)
        post_error_abs_mean = sum(abs(e) for e in post_errors) / len(post_errors)
        # Post-convergence tier usage
        post_tiers = tier_sequence[convergence_game - 1:]
        post_tier_counts = {}
        for t in post_tiers:
            post_tier_counts[t] = post_tier_counts.get(t, 0) + 1
    else:
        post_errors = []
        post_error_min = post_error_max = post_error_mean = post_error_abs_mean = None
        post_tier_counts = {}

    # WR at checkpoints (every 10% of games)
    checkpoints = {}
    for pct in [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]:
        idx = min(int(num_games * pct / 100), len(wr_trajectory)) - 1
        if idx >= 0:
            checkpoints[f"{pct}%"] = wr_trajectory[idx]

    # Summary
    print()
    print("=" * 60)
    print("  RESULTS")
    print("=" * 60)
    print(f"  Seat 0 win rate : {final_wr:.2%}  (target: {target_wr:.0%})")
    print(f"  Final error     : {final_wr - target_wr:+.2%}")
    print(f"  Total games     : {total}")
    print(f"  Variation games : {variation_count} ({var_pct_final:.1f}%)")
    print(f"  Tier transitions: {tier_transitions} ({tier_transitions/max(total-1,1)*100:.1f}%)")
    print(f"  Completed in    : {elapsed_total / 60:.1f} minutes")
    print()

    # Convergence info
    print("  Convergence (±{:.0%} for {} games):".format(
        convergence_threshold, convergence_window))
    if convergence_game is not None:
        print(f"    Converged at game : {convergence_game}")
        print(f"    Post-conv error   : [{post_error_min:+.2%}, {post_error_max:+.2%}]")
        print(f"    Post-conv |error| : {post_error_abs_mean:.2%} (mean)")
        print(f"    Post-conv games   : {len(post_errors)}")
    else:
        print(f"    Did NOT converge within {num_games} games")
    print()

    # WR trajectory checkpoints
    print("  WR Trajectory:")
    for label, wr_val in checkpoints.items():
        print(f"    {label:>5} ({int(num_games * int(label[:-1]) / 100):>6} games): {wr_val:.2%}")
    print()

    # Tier usage table
    print("  Tier Usage:")
    print(f"  {'Tier':>20}  {'Total':>6}  {'Base':>6}  {'Var':>5}  {'Usage':>7}  {'S0 WR':>7}")
    print(f"  {'-' * 20}  {'-' * 6}  {'-' * 6}  {'-' * 5}  {'-' * 7}  {'-' * 7}")
    for t in TIER_ORDER:
        count = tier_usage.get(t, 0)
        base = tier_base_count.get(t, 0)
        var = tier_var_count.get(t, 0)
        t_wins = tier_wins.get(t, 0)
        t_wr = t_wins / count if count > 0 else 0.0
        usage_pct = count / total if total > 0 else 0.0
        print(f"  {t:>20}  {count:>6}  {base:>6}  {var:>5}  {usage_pct:>6.1%}  {t_wr:>6.2%}")

    # Post-convergence tier distribution
    if post_tier_counts:
        print()
        print("  Post-Convergence Tier Distribution:")
        post_total = len(post_errors)
        for t in TIER_ORDER:
            count = post_tier_counts.get(t, 0)
            pct = count / post_total * 100 if post_total > 0 else 0.0
            bar = "█" * int(pct / 2)
            print(f"  {t:>20}  {count:>5} ({pct:>5.1f}%)  {bar}")

    print("=" * 60)

    # Build output
    output = {
        'mode': 'adaptive',
        'metadata': {
            'seat0': seat0,
            'target_win_rate': target_wr,
            'games': num_games,
            'convergence_threshold': convergence_threshold,
            'convergence_window': convergence_window,
        },
        'final_win_rate': round(final_wr, 4),
        'final_error': round(final_wr - target_wr, 4),
        'variation_games': variation_count,
        'variation_rate': round(var_pct_final / 100, 4),
        'tier_transitions': tier_transitions,
        'convergence': {
            'converged': convergence_game is not None,
            'game': convergence_game,
            'post_error_range': [
                round(post_error_min, 4) if post_error_min is not None else None,
                round(post_error_max, 4) if post_error_max is not None else None,
            ],
            'post_error_abs_mean': round(post_error_abs_mean, 4) if post_error_abs_mean is not None else None,
        },
        'wr_checkpoints': checkpoints,
        'wr_trajectory': wr_trajectory,
        'tier_usage': {t: tier_usage.get(t, 0) for t in TIER_ORDER},
        'tier_base_usage': {t: tier_base_count.get(t, 0) for t in TIER_ORDER},
        'tier_variation_usage': {t: tier_var_count.get(t, 0) for t in TIER_ORDER},
        'tier_seat0_win_rates': {
            t: round(tier_wins.get(t, 0) / tier_usage[t], 4) if tier_usage.get(t, 0) > 0 else None
            for t in TIER_ORDER
        },
        'post_convergence_tier_distribution': {
            t: post_tier_counts.get(t, 0) for t in TIER_ORDER
        } if post_tier_counts else None,
    }
    return output


def main():
    parser = argparse.ArgumentParser(
        description="Simulate UNO tier combinations",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Examples:
  %(prog)s --s0 rule-v1 --s1 selfish --s2 selfish --s3 selfish --games 100
  %(prog)s --s0 casual --s1 altruistic --s2 selfish --s3 altruistic --target 0
  %(prog)s --s0 rule-v1 --all --target 0 --games 200
  %(prog)s --s0 casual --adaptive --games 2000
  %(prog)s --s0 rule-v1 --adaptive --adaptive-target 0.10 --games 5000
""",
    )

    # Seat assignments (include aliases for backward compat)
    valid_choices = AGENT_CHOICES + list(AGENT_ALIASES.keys())
    for i in range(4):
        default = 'rule-v1' if i == 0 else 'selfish'
        parser.add_argument(
            f'--s{i}', type=str, default=default,
            choices=valid_choices,
            help=f'Agent for seat {i} (default: {default})',
        )

    parser.add_argument(
        '--target', type=int, default=None, choices=[0, 1, 2, 3],
        help='Target seat override for plane 11 (altruistic→0, hyper_adversarial→2 are auto-set)',
    )
    parser.add_argument(
        '--all', action='store_true',
        help='Run all mixable tier combinations for seats 1-3 (ignores --s1/s2/s3)',
    )
    parser.add_argument(
        '--baseline', action='store_true',
        help='Sanity check: all random agents, expect ~25%% win rate per seat',
    )
    parser.add_argument(
        '--games', type=int, default=TIER_GAMES,
        help=f'Games per combination (default: {TIER_GAMES})',
    )
    parser.add_argument(
        '--output', type=str, default=TIER_RESULTS_PATH,
        help=f'Output JSON path (default: {TIER_RESULTS_PATH})',
    )
    parser.add_argument(
        '--stats', action='store_true', default=False,
        help='Collect rich per-game statistics (opt-in for --all mode)',
    )
    parser.add_argument(
        '--no-stats', action='store_true', default=False,
        help='Disable stats collection for single combo mode (faster)',
    )
    parser.add_argument(
        '--adaptive', action='store_true',
        help='Adaptive mode: controller picks tier per-game based on running win rate',
    )
    parser.add_argument(
        '--adaptive-target', type=float, default=0.25,
        help='Target win rate for the adaptive controller (default: 0.25)',
    )

    args = parser.parse_args()

    if args.baseline:
        args.s0 = args.s1 = args.s2 = args.s3 = 'random'
        args.target = None

    if args.adaptive:
        output = run_adaptive(args)
    elif args.all:
        output = run_all_combos(args)
    else:
        output = run_single(args)

    # Save results
    if args.adaptive:
        seat0 = resolve_agent_name(args.s0)
        save_path = _build_adaptive_results_path(seat0, args.adaptive_target, args.games, DATA_DIR)
    elif not args.all and not args.baseline:
        # Single combo: descriptive filename like plots
        seats = [resolve_agent_name(a) for a in [args.s0, args.s1, args.s2, args.s3]]
        save_path = _build_results_path(seats, args.games, DATA_DIR)
    else:
        save_path = args.output
    _safe_save_path(save_path)
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    with open(save_path, 'w') as f:
        json.dump(output, f, indent=2)
    print(f"\nResults saved to {save_path}")

    # Generate plots for adaptive mode
    if args.adaptive:
        seat0 = resolve_agent_name(args.s0)
        plot_path = _build_adaptive_plot_path(seat0, args.adaptive_target, args.games, DATA_DIR)
        _safe_save_path(plot_path)
        plot_adaptive(output, plot_path)


if __name__ == "__main__":
    main()
