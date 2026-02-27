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

    # Hyper-adversarial helping seat 2
    python -m simulator.simulation.simulate --s0 random --s1 hyper_adversarial --s2 selfish --s3 hyper_adversarial --target 2

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
    TIER_ORDER, AdaptiveTierController,
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


def _safe_save_path(path):
    """If path already exists, rename the old file with a timestamp suffix."""
    if os.path.exists(path):
        ts = datetime.fromtimestamp(os.path.getmtime(path)).strftime("%Y%m%d_%H%M%S")
        base, ext = os.path.splitext(path)
        old_path = f"{base}_{ts}{ext}"
        os.rename(path, old_path)
        print(f"  Renamed old plot -> {os.path.basename(old_path)}")


def needs_cli_target(agents: list) -> bool:
    """Check if any agent needs --target from CLI (hyper_adversarial only).

    Altruistic/hyper_altruistic have fixed targets (seat 0) and don't need CLI input.
    """
    return any(a in TARGET_SEAT_TIERS and a not in FIXED_TARGET for a in agents)


def build_target_dict(seats, cli_target):
    """Build per-seat target dict from agent types and CLI --target.

    - altruistic/hyper_altruistic → always 0 (hardcoded)
    - hyper_adversarial → uses cli_target
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

    # Per-seat targets: altruistic/hyper_alt → 0, hyper_adversarial → cli_target, rest → None
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

    # Validate: only hyper_adversarial needs --target from CLI
    if needs_cli_target(seats) and target_seat is None:
        print("ERROR: Using hyper_adversarial agents requires --target N")
        print("  Example: --target 2  (hyper_adversarial bots help seat 2 win)")
        print("  Note: altruistic/hyper_altruistic always target seat 0 automatically.")
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
        print("ERROR: Mixable tiers include hyper_adversarial which requires --target N")
        print("  Example: --target 2  (hyper_adversarial bots help seat 2 win)")
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

    Seat 0 uses a fixed agent (--s0). Seats 1-3 all use the tier chosen
    by the AdaptiveTierController each game, based on a running session
    win rate (wins / total games so far).
    """
    seat0 = resolve_agent_name(args.s0)
    num_games = args.games
    target_wr = args.adaptive_target

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
    print(f"  Controller   : AdaptiveTierController (deterministic)")
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

    eval_every = 100
    start_time = time.time()

    print("Running games...")
    for g in range(num_games):
        # Running session win rate
        win_rate = wins / total if total > 0 else 0.0

        # Controller picks the tier
        tier = controller.select_tier(win_rate, total)
        tier_usage[tier] = tier_usage.get(tier, 0) + 1

        # Set up agents: seat 0 = fixed, seats 1-3 = tier agent
        agents = [pool.get(seat0)] + [pool.get(tier)] * 3
        game.set_agents(agents)

        # Set targets and VD caps for the chosen tier
        seats = [seat0, tier, tier, tier]
        game.set_target_seat(build_target_dict(seats, 0))
        game.set_max_voluntary_draws(get_draw_caps(seats))

        result = game.run_game(is_training=False)
        winner = result['winner']
        total += 1
        if winner == PLAYER_SEAT:
            wins += 1
            tier_wins[tier] = tier_wins.get(tier, 0) + 1

        # Progress display
        done = g + 1
        wr = wins / total
        print(
            f"\r  Game {done:>6}/{num_games}  "
            f"wr: {wr:.2%}  tier: {tier:>18}  "
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
            print()
            print(f"  ┌─ Game {done:,}/{num_games:,} ({pct:.0f}%) [{bar}] ETA: {eta / 60:.1f}m")
            print(f"  │  Win rate: {wr:.2%}  (target: {target_wr:.0%})")
            print(f"  │  Current tier: {tier}")
            print(f"  └{'─' * 50}")

    print()

    # Summary
    final_wr = wins / total if total > 0 else 0.0
    elapsed_total = time.time() - start_time

    print()
    print("=" * 60)
    print("  RESULTS")
    print("=" * 60)
    print(f"  Seat 0 win rate : {final_wr:.2%}  (target: {target_wr:.0%})")
    print(f"  Total games     : {total}")
    print(f"  Completed in    : {elapsed_total / 60:.1f} minutes")
    print()
    print("  Tier Usage:")
    print(f"  {'Tier':>20}  {'Games':>6}  {'Usage':>7}  {'S0 WR':>7}")
    print(f"  {'-' * 20}  {'-' * 6}  {'-' * 7}  {'-' * 7}")
    for t in TIER_ORDER:
        count = tier_usage.get(t, 0)
        t_wins = tier_wins.get(t, 0)
        t_wr = t_wins / count if count > 0 else 0.0
        usage_pct = count / total if total > 0 else 0.0
        print(f"  {t:>20}  {count:>6}  {usage_pct:>6.1%}  {t_wr:>6.2%}")
    print("=" * 60)

    # Build output
    output = {
        'mode': 'adaptive',
        'metadata': {
            'seat0': seat0,
            'target_win_rate': target_wr,
            'games': num_games,
        },
        'final_win_rate': round(final_wr, 4),
        'tier_usage': {t: tier_usage.get(t, 0) for t in TIER_ORDER},
        'tier_seat0_win_rates': {
            t: round(tier_wins.get(t, 0) / tier_usage[t], 4) if tier_usage.get(t, 0) > 0 else None
            for t in TIER_ORDER
        },
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
        help='Target seat for hyper_adversarial/altruistic agents (plane 11)',
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
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, 'w') as f:
        json.dump(output, f, indent=2)
    print(f"\nResults saved to {args.output}")


if __name__ == "__main__":
    main()
