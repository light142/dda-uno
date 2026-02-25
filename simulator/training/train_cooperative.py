"""Train a cooperative agent: learns to help a designated bot teammate win.

Custom reward: +1 when target seat wins, -1 when the agent itself wins,
-1 when another seat wins.

Target seat plane (plane 11) rotates among bot seats (1, 2, 3) each episode.
This trains a universal "help any bot" model used in hyper adversarial tier,
where the lucky bot (selfish) needs its teammates to support it.

Supports resume: automatically finds the latest checkpoint and continues.

Usage:
    python -m simulator.training.train_cooperative
    python -m simulator.training.train_cooperative --fresh   # ignore checkpoints, start over
"""

import os
import sys
import glob
import random
import argparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from rlcard.agents import RandomAgent
from rlcard.models import load as load_model

from engine.game_logic.game import UnoGame
from engine.game_logic.agents import RLAgent
from engine.config.game import NUM_PLAYERS, NUM_ACTIONS, PLAYER_SEAT, BOT_SEATS
from simulator.config.training import (
    SEAT0_OPPONENT, NUM_EPISODES, EVAL_EVERY, EVAL_NUM_GAMES,
    MODEL_DIR, SAVE_EVERY,
)

COOPERATIVE_DIR = os.path.join(MODEL_DIR, "cooperative")


def cooperative_reward(payoffs: list, seat: int, target_seat: int) -> float:
    """Custom reward for cooperative agents.

    Args:
        payoffs: Original payoffs from the game.
        seat: The bot's seat index.
        target_seat: Which seat we're trying to help win.

    Returns:
        Custom reward value.
    """
    winner = max(range(len(payoffs)), key=lambda i: payoffs[i])

    if winner == target_seat:
        return 1.0   # Target seat won — mission accomplished
    elif winner == seat:
        return -1.0   # This bot won — bad, we were supposed to help target
    else:
        return -1.0   # Another seat won — failed to protect target


def create_seat0_opponent(opponent_type: str):
    """Create the seat 0 opponent based on config."""
    if opponent_type == "random":
        return RandomAgent(num_actions=NUM_ACTIONS)
    elif opponent_type == "rule-v1":
        return load_model('uno-rule-v1').agents[0]
    elif opponent_type == "self-play":
        return None
    else:
        raise ValueError(f"Unknown opponent type: {opponent_type}")


def evaluate(game: UnoGame, num_games: int, target_seat: int) -> dict:
    """Evaluate: check how often the target seat wins."""
    wins = {i: 0 for i in range(NUM_PLAYERS)}

    for _ in range(num_games):
        game.set_target_seat(target_seat)
        result = game.run_game(is_training=False)
        wins[result['winner']] += 1

    return wins


def find_latest_checkpoint(checkpoint_dir: str):
    """Find the latest checkpoint file and its episode number.

    Returns:
        (path, episode) or (None, 0) if no checkpoints exist.
    """
    pattern = os.path.join(checkpoint_dir, "checkpoint_*.pt")
    files = glob.glob(pattern)
    if not files:
        return None, 0

    best_path, best_ep = None, 0
    for f in files:
        name = os.path.basename(f)
        try:
            ep = int(name.replace("checkpoint_", "").replace(".pt", ""))
            if ep > best_ep:
                best_ep = ep
                best_path = f
        except ValueError:
            continue

    return best_path, best_ep


def train(fresh: bool = False):
    """Main training loop for the cooperative agent."""
    # Check for resume
    start_episode = 1
    checkpoint_path = None

    if not fresh:
        checkpoint_path, start_episode_found = find_latest_checkpoint(COOPERATIVE_DIR)
        if checkpoint_path:
            start_episode = start_episode_found + 1

    print()
    print("=" * 60)
    print("  COOPERATIVE AGENT TRAINING")
    print("=" * 60)
    print(f"  Opponent    : {SEAT0_OPPONENT}")
    print(f"  Target      : rotating among bot seats {BOT_SEATS}")
    print(f"  Episodes    : {start_episode:,} -> {NUM_EPISODES:,}")
    if checkpoint_path:
        print(f"  Resume from : {checkpoint_path}")
    else:
        print(f"  Status      : Starting fresh")
    print(f"  Model dir   : {MODEL_DIR}")
    print("=" * 60)
    print()

    if start_episode > NUM_EPISODES:
        print("Already completed all episodes. Use --fresh to restart.")
        return

    # Create game and agents
    game = UnoGame()

    # Create the RL agent — load checkpoint if resuming
    if checkpoint_path:
        rl_agent = RLAgent(model_path=checkpoint_path)
    else:
        rl_agent = RLAgent()

    # Create seat 0 opponent
    seat0 = create_seat0_opponent(SEAT0_OPPONENT)
    if seat0 is None:
        seat0 = rl_agent.agent

    # Assign agents
    agents = [None] * NUM_PLAYERS
    agents[0] = seat0
    for seat in BOT_SEATS:
        agents[seat] = rl_agent.agent

    game.set_agents(agents)

    # Cooperative helps by playing smart cards, not by passing
    game.set_allow_voluntary_draw(False)

    # Training loop
    for episode in range(start_episode, NUM_EPISODES + 1):
        # Rotate target among bot seats (1, 2, 3)
        current_target = random.choice(BOT_SEATS)

        # Set target seat plane before running the game
        game.set_target_seat(current_target)

        # Run one game
        result = game.run_game(is_training=True)

        # Feed transitions with COOPERATIVE reward (target seat winning = good)
        for seat in BOT_SEATS:
            transitions = game.get_training_data_custom_reward(
                result['trajectories'],
                result['payoffs'],
                seat=seat,
                reward_fn=lambda payoffs, s: cooperative_reward(payoffs, s, current_target),
            )
            for transition in transitions:
                rl_agent.feed(transition)

        # Periodic evaluation (eval with target=1 for consistency)
        if episode % EVAL_EVERY == 0:
            eval_target = BOT_SEATS[0]  # seat 1
            wins = evaluate(game, EVAL_NUM_GAMES, eval_target)
            target_wins = wins[eval_target]
            pct_done = episode / NUM_EPISODES * 100
            bar_len = 20
            filled = int(bar_len * episode / NUM_EPISODES)
            bar = "█" * filled + "░" * (bar_len - filled)

            print()
            print(f"  ┌─ Episode {episode:,}/{NUM_EPISODES:,} ({pct_done:.0f}%) [{bar}]")
            print(f"  │  Target seat {eval_target}       : {target_wins:>3}/{EVAL_NUM_GAMES}  ({target_wins/EVAL_NUM_GAMES:.1%})")
            print(f"  │  Seat 0 (opponent)   : {wins[0]:>3}/{EVAL_NUM_GAMES}  ({wins[0]/EVAL_NUM_GAMES:.1%})")
            print(f"  └{'─' * 50}")

        # Periodic save
        if episode % SAVE_EVERY == 0:
            rl_agent.save(COOPERATIVE_DIR, f"checkpoint_{episode}.pt")
            print(f"  ✓ Checkpoint saved: episode {episode:,}")

    # Final save
    rl_agent.save(COOPERATIVE_DIR, "cooperative_agent.pt")
    print()
    print("=" * 60)
    print(f"  TRAINING COMPLETE — saved to {COOPERATIVE_DIR}/cooperative_agent.pt")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--fresh', action='store_true',
                        help='Start training from scratch, ignoring checkpoints')
    args = parser.parse_args()
    train(fresh=args.fresh)
