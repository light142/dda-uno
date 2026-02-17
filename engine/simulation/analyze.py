"""Analyze simulation results.

Reads the simulation results JSON and prints summary statistics.
Optionally generates convergence plots.

Usage:
    python -m simulation.analyze
    python -m simulation.analyze --plot    # requires matplotlib
"""

import argparse
import json
import os
import sys

from config.simulation import RESULTS_PATH


def load_results(path: str = RESULTS_PATH) -> dict:
    """Load simulation results from JSON file."""
    if not os.path.exists(path):
        print(f"No results file found at {path}")
        print("Run simulation first: python -m simulation.simulate")
        sys.exit(1)

    with open(path) as f:
        return json.load(f)


def analyze_baseline(results: dict) -> None:
    """Print baseline simulation analysis."""
    print("=" * 60)
    print("BASELINE SIMULATION RESULTS")
    print("=" * 60)
    print(f"Games played: {results['num_games']}")
    print()
    print("Win rates (expected ~25% each for 4 random agents):")
    for seat, rate in results['win_rates'].items():
        deviation = abs(rate - 0.25)
        status = "OK" if deviation < 0.05 else "WARN"
        print(f"  Seat {seat}: {rate:.1%} (deviation: {deviation:.1%}) [{status}]")
    print()

    # Check if results are statistically reasonable
    max_deviation = max(abs(r - 0.25) for r in results['win_rates'].values())
    if max_deviation < 0.05:
        print("PASS: All seats within 5% of expected 25% win rate.")
    else:
        print("WARN: Some seats deviate >5% from 25%. Try more games.")


def analyze_adaptive(results: dict) -> None:
    """Print adaptive simulation analysis."""
    print("=" * 60)
    print("ADAPTIVE SIMULATION RESULTS")
    print("=" * 60)
    print(f"Games played: {results['num_games']}")
    print(f"Seat 0 bot: {results['bot_name']}")
    print(f"Target win rate: {results['target_win_rate']:.0%}")
    print()
    print(f"Final win rate: {results['final_win_rate']:.1%}")
    print(f"Final bot strength: {results['final_strength']:.3f}")
    print(f"Error: {results['error']:.1%}")
    print()

    # Convergence analysis
    history = results['history']
    if len(history) >= 100:
        # Check last 100 games
        last_100 = history[-100:]
        last_100_wr = sum(1 for h in last_100 if h['player_won']) / 100
        print(f"Last 100 games win rate: {last_100_wr:.1%}")

    if len(history) >= 10:
        # Check last 10 games
        last_10 = history[-10:]
        last_10_wr = sum(1 for h in last_10 if h['player_won']) / 10
        print(f"Last 10 games win rate: {last_10_wr:.0%}")

    # Strength trajectory
    if history:
        strengths = [h['bot_strength'] for h in history]
        print(f"\nStrength range: {min(strengths):.3f} - {max(strengths):.3f}")
        print(f"Strength std dev: {_std(strengths):.3f}")

    # Verdict
    print()
    if results['error'] < 0.05:
        print("PASS: Win rate within 5% of target.")
    elif results['error'] < 0.10:
        print("CLOSE: Win rate within 10% of target. Try more games.")
    else:
        print("MISS: Win rate >10% from target. Adjust controller or retrain.")


def plot_results(results: dict) -> None:
    """Generate convergence plots (requires matplotlib)."""
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib not installed. Install with: pip install matplotlib")
        return

    history = results['history']
    if not history:
        print("No history data to plot.")
        return

    games = [h['game'] for h in history]

    if results['mode'] == 'baseline':
        # Plot per-seat win rates over time
        for seat in range(4):
            rates = [h['win_rates'][str(seat)] for h in history]
            plt.plot(games, rates, label=f'Seat {seat}')
        plt.axhline(y=0.25, color='gray', linestyle='--', label='Expected (25%)')
        plt.title('Baseline: Win Rates Over Time')
    else:
        # Two subplots: win rate and strength
        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 8), sharex=True)

        win_rates = [h['win_rate'] for h in history]
        ax1.plot(games, win_rates, alpha=0.7, label='Actual')
        ax1.axhline(y=results['target_win_rate'], color='r',
                     linestyle='--', label=f'Target ({results["target_win_rate"]:.0%})')
        ax1.set_ylabel('Win Rate')
        ax1.set_title(f'Adaptive Simulation: {results["bot_name"]} bot')
        ax1.legend()
        ax1.grid(True, alpha=0.3)

        strengths = [h['bot_strength'] for h in history]
        ax2.plot(games, strengths, color='orange', alpha=0.7)
        ax2.set_xlabel('Game')
        ax2.set_ylabel('Bot Strength')
        ax2.grid(True, alpha=0.3)

        plt.tight_layout()

    plot_path = os.path.join(os.path.dirname(RESULTS_PATH), 'simulation_plot.png')
    plt.savefig(plot_path, dpi=150)
    print(f"Plot saved to {plot_path}")
    plt.show()


def _std(values: list) -> float:
    """Simple standard deviation."""
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    variance = sum((v - mean) ** 2 for v in values) / (len(values) - 1)
    return variance ** 0.5


def main():
    parser = argparse.ArgumentParser(description="Analyze simulation results")
    parser.add_argument('--plot', action='store_true', help='Generate plots')
    parser.add_argument('--file', type=str, default=RESULTS_PATH,
                        help=f'Results file path (default: {RESULTS_PATH})')
    args = parser.parse_args()

    results = load_results(args.file)

    if results['mode'] == 'baseline':
        analyze_baseline(results)
    else:
        analyze_adaptive(results)

    if args.plot:
        plot_results(results)


if __name__ == "__main__":
    main()
