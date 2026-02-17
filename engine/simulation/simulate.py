"""Run simulation: test the adaptive agents + win rate controller.

Plays N games with a fixed bot at seat 0 (simulating a human player)
and adaptive agents at seats 1-3. The controller adjusts bot strength
after each game to converge toward the target win rate.

Can also run with RLCard's random agents (no trained models needed)
as a baseline to verify ~25% win rate per seat.

Usage:
    python -m simulation.simulate
    python -m simulation.simulate --baseline    # random agents only
    python -m simulation.simulate --bot pro     # use ProBot at seat 0
    python -m simulation.simulate --games 500
"""

import argparse
import json
import os
import sys

from rlcard.agents import RandomAgent

from game_logic.game import UnoGame
from game_logic.controller import WinRateController
from game_logic.store import PlayerStore, PlayerStats
from config.game import NUM_PLAYERS, NUM_ACTIONS, BOT_SEATS, PLAYER_SEAT
from config.simulation import (
    NUM_GAMES, SEAT0_BOT, MODEL_DIR,
    STRONG_MODEL_PATH, WEAK_MODEL_PATH,
    DATA_DIR, RESULTS_PATH,
)
from config.controller import TARGET_WIN_RATE


def run_baseline(num_games: int) -> dict:
    """Run baseline simulation with all random agents.

    Verifies the game engine works: all seats should win ~25%.

    Args:
        num_games: Number of games to play.

    Returns:
        dict with per-seat win counts and rates.
    """
    print(f"Running BASELINE simulation ({num_games} games, all random agents)")
    print()

    game = UnoGame()
    agents = [RandomAgent(num_actions=NUM_ACTIONS) for _ in range(NUM_PLAYERS)]
    game.set_agents(agents)

    wins = {i: 0 for i in range(NUM_PLAYERS)}
    history = []

    for i in range(1, num_games + 1):
        result = game.run_game(is_training=False)
        wins[result['winner']] += 1

        if i % 100 == 0 or i == num_games:
            rates = {s: wins[s] / i for s in range(NUM_PLAYERS)}
            print(
                f"Game {i}/{num_games} | "
                + " | ".join(f"Seat {s}: {rates[s]:.1%}" for s in range(NUM_PLAYERS))
            )

        history.append({
            'game': i,
            'winner': result['winner'],
            'win_rates': {s: wins[s] / i for s in range(NUM_PLAYERS)},
        })

    final_rates = {s: wins[s] / num_games for s in range(NUM_PLAYERS)}
    print(f"\nFinal win rates: {', '.join(f'Seat {s}: {r:.1%}' for s, r in final_rates.items())}")

    return {
        'mode': 'baseline',
        'num_games': num_games,
        'wins': wins,
        'win_rates': final_rates,
        'history': history,
    }


def run_adaptive(num_games: int, bot_name: str) -> dict:
    """Run adaptive simulation with controller.

    Seat 0 = fixed bot (simulating human), Seats 1-3 = adaptive agents.
    Controller adjusts bot strength after each game.

    Args:
        num_games: Number of games to play.
        bot_name: Which fixed bot at seat 0 ("noob", "casual", "pro").

    Returns:
        dict with win rates, strength history, convergence data.
    """
    from simulation.bots import get_bot
    from game_logic.agents.adaptive import AdaptiveAgent

    print(f"Running ADAPTIVE simulation ({num_games} games)")
    print(f"  Seat 0: {bot_name} bot")
    print(f"  Target win rate: {TARGET_WIN_RATE:.0%}")
    print(f"  Strong model: {STRONG_MODEL_PATH}")
    print(f"  Weak model: {WEAK_MODEL_PATH}")
    print()

    # Check if trained models exist
    if not os.path.exists(STRONG_MODEL_PATH) or not os.path.exists(WEAK_MODEL_PATH):
        print("ERROR: Trained models not found. Run training first:")
        print("  python -m training.train_strong")
        print("  python -m training.train_weak")
        sys.exit(1)

    # Setup
    game = UnoGame()
    controller = WinRateController()
    store = PlayerStore()
    player_id = f"sim_{bot_name}"
    player = store.get_or_create_player(player_id)

    # Create agents
    seat0_bot = get_bot(bot_name)
    adaptive_agents = []
    for seat in BOT_SEATS:
        agent = AdaptiveAgent(
            strong_model_path=STRONG_MODEL_PATH,
            weak_model_path=WEAK_MODEL_PATH,
            strength=player.bot_strength,
        )
        adaptive_agents.append(agent)

    agents = [None] * NUM_PLAYERS
    agents[PLAYER_SEAT] = seat0_bot
    for i, seat in enumerate(BOT_SEATS):
        agents[seat] = adaptive_agents[i]

    game.set_agents(agents)

    # Simulation loop
    wins = {i: 0 for i in range(NUM_PLAYERS)}
    history = []

    for i in range(1, num_games + 1):
        result = game.run_game(is_training=False)
        winner = result['winner']
        wins[winner] += 1

        player_won = winner == PLAYER_SEAT
        current_win_rate = wins[PLAYER_SEAT] / i

        # Controller adjusts strength
        new_strength = controller.adjust(current_win_rate, adaptive_agents[0].strength)

        # Update all adaptive agents
        for agent in adaptive_agents:
            agent.strength = new_strength

        # Record
        player = store.record_game(player_id, player_won, new_strength)

        history.append({
            'game': i,
            'winner': winner,
            'player_won': player_won,
            'win_rate': current_win_rate,
            'bot_strength': new_strength,
        })

        if i % 100 == 0 or i == num_games:
            print(
                f"Game {i}/{num_games} | "
                f"Seat 0 WR: {current_win_rate:.1%} "
                f"(target: {TARGET_WIN_RATE:.0%}) | "
                f"Strength: {new_strength:.3f}"
            )

    final_rate = wins[PLAYER_SEAT] / num_games
    print(f"\nFinal seat 0 win rate: {final_rate:.1%} (target: {TARGET_WIN_RATE:.0%})")
    print(f"Final bot strength: {adaptive_agents[0].strength:.3f}")
    print(f"Error: {abs(final_rate - TARGET_WIN_RATE):.1%}")

    return {
        'mode': 'adaptive',
        'bot_name': bot_name,
        'num_games': num_games,
        'target_win_rate': TARGET_WIN_RATE,
        'final_win_rate': final_rate,
        'final_strength': adaptive_agents[0].strength,
        'error': abs(final_rate - TARGET_WIN_RATE),
        'wins': wins,
        'history': history,
    }


def main():
    parser = argparse.ArgumentParser(description="Run UNO simulation")
    parser.add_argument('--baseline', action='store_true',
                        help='Run baseline with all random agents')
    parser.add_argument('--bot', type=str, default=SEAT0_BOT,
                        choices=['noob', 'casual', 'pro'],
                        help=f'Fixed bot at seat 0 (default: {SEAT0_BOT})')
    parser.add_argument('--games', type=int, default=NUM_GAMES,
                        help=f'Number of games (default: {NUM_GAMES})')
    args = parser.parse_args()

    if args.baseline:
        results = run_baseline(args.games)
    else:
        results = run_adaptive(args.games, args.bot)

    # Save results
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(RESULTS_PATH, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to {RESULTS_PATH}")


if __name__ == "__main__":
    main()
