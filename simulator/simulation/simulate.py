"""Simulate any combination of agents across all 4 seats.

Flexible tool for testing tier combinations and measuring win rates.
Put any agent (DQN tier, random, rule-v1, heuristic bot) at any seat.

Modes:
  Single combo: specify agents for all 4 seats, run N games.
  All combos:   enumerate all mixable tier combinations for seats 1-3
                with a fixed seat 0 agent. Builds a lookup table.

Usage:
    # Specific combination
    python -m simulator.simulation.simulate --s0 rule-v1 --s1 selfish --s2 selfish --s3 selfish --games 500

    # Altruistic helping seat 0
    python -m simulator.simulation.simulate --s0 casual --s1 altruistic --s2 altruistic --s3 altruistic --target 0

    # Hyper-adversarial helping seat 2
    python -m simulator.simulation.simulate --s0 random --s1 hyper_adversarial --s2 selfish --s3 hyper_adversarial --target 2

    # All 125 combos for seats 1-3 against rule-v1
    python -m simulator.simulation.simulate --s0 rule-v1 --all --target 0 --games 200

    # Baseline sanity check
    python -m simulator.simulation.simulate --baseline --games 100
"""

import argparse
import itertools
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from engine.game_logic.game import UnoGame
from engine.config.game import NUM_PLAYERS, PLAYER_SEAT, BOT_SEATS
from simulator.config.tiers import (
    AGENT_CHOICES, AGENT_ALIASES, MIXABLE_TIERS, TARGET_SEAT_TIERS, FIXED_TARGET,
    VOLUNTARY_DRAW_POLICY, TierModelPool, resolve_agent_name,
)
from simulator.config.simulation import TIER_GAMES, TIER_RESULTS_PATH, DATA_DIR


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


def run_combo(game, pool, seats, cli_target, num_games, show_progress=False):
    """Run num_games with a specific agent assignment and return results.

    Args:
        game: UnoGame instance (reused).
        pool: TierModelPool with cached agents.
        seats: List of 4 agent names [s0, s1, s2, s3].
        cli_target: CLI --target value for cooperative agents, or None.
        num_games: Number of games to play.
        show_progress: Print progress every 500 games.

    Returns:
        dict with per-seat win counts and win rates.
    """
    agents = [pool.get(seats[i]) for i in range(NUM_PLAYERS)]
    game.set_agents(agents)

    # Per-seat targets: altruistic/hyper_alt → 0, hyper_adversarial → cli_target, rest → None
    game.set_target_seat(build_target_dict(seats, cli_target))

    # Set per-seat voluntary draw caps matching training policy
    game.set_max_voluntary_draws(get_draw_caps(seats))

    wins = {i: 0 for i in range(NUM_PLAYERS)}
    eval_every = 500
    for g in range(num_games):
        result = game.run_game(is_training=False)
        winner = result['winner']
        wins[winner] += 1
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
    return {'wins': wins, 'win_rates': win_rates, 'games': num_games}


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
    result = run_combo(game, pool, seats, target_seat, args.games, show_progress=True)

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

    # Build output
    output = {
        'mode': 'single',
        'seats': {f's{i}': seats[i] for i in range(NUM_PLAYERS)},
        'target_seat': target_seat,
        'games': args.games,
        'wins': result['wins'],
        'win_rates': {f's{k}': round(v, 4) for k, v in result['win_rates'].items()},
    }
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

        result = run_combo(game, pool, seats, target_seat, args.games)

        key = f"{combo[0]},{combo[1]},{combo[2]}"
        results[key] = {
            'seat1': combo[0],
            'seat2': combo[1],
            'seat3': combo[2],
            'seat0_win_rate': round(result['win_rates'][PLAYER_SEAT], 4),
            'per_seat_wins': result['wins'],
            'games': args.games,
        }

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


def main():
    parser = argparse.ArgumentParser(
        description="Simulate UNO tier combinations",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Examples:
  %(prog)s --s0 rule-v1 --s1 selfish --s2 selfish --s3 selfish --games 100
  %(prog)s --s0 casual --s1 altruistic --s2 selfish --s3 altruistic --target 0
  %(prog)s --s0 rule-v1 --all --target 0 --games 200
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

    args = parser.parse_args()

    if args.baseline:
        args.s0 = args.s1 = args.s2 = args.s3 = 'random'
        args.target = None

    if args.all:
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
