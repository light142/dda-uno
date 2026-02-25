"""Train an adversarial agent: learns to make seat 0 lose.

Team reward: +1 when ANY bot wins (seat 0 loses), -1 when seat 0 wins.
All bots share the same goal so they learn to cooperate against seat 0.

Supports resume: automatically finds the latest checkpoint and continues.

Usage:
    python -m simulator.training.train_adversarial
    python -m simulator.training.train_adversarial --fresh   # ignore checkpoints, start over
"""

import os
import sys
import glob
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

ADVERSARIAL_DIR = os.path.join(MODEL_DIR, "adversarial")


def adversarial_reward(payoffs: list, seat: int) -> float:
    """Team reward for adversarial agents.

    All bots share the same goal: seat 0 must lose.

    Args:
        payoffs: Original payoffs from the game.
        seat: The bot's seat index.

    Returns:
        Custom reward value.
    """
    winner = max(range(len(payoffs)), key=lambda i: payoffs[i])

    if winner == PLAYER_SEAT:
        return -1.0   # Seat 0 won — team failed
    else:
        return 1.0    # Any bot won — team succeeded


def create_seat0_opponent(opponent_type: str):
    """Create the seat 0 opponent based on config.

    Args:
        opponent_type: "random", "rule-v1", or "self-play"

    Returns:
        Agent for seat 0 (or None for self-play, handled separately).
    """
    if opponent_type == "random":
        return RandomAgent(num_actions=NUM_ACTIONS)
    elif opponent_type == "rule-v1":
        return load_model('uno-rule-v1').agents[0]
    elif opponent_type == "self-play":
        return None  # Will use the training agent itself
    else:
        raise ValueError(f"Unknown opponent type: {opponent_type}")


def evaluate(game: UnoGame, agent: RLAgent, num_games: int) -> dict:
    """Evaluate the agent over multiple games.

    Args:
        game: UnoGame instance with agents set.
        agent: The agent being evaluated.
        num_games: Number of evaluation games.

    Returns:
        dict with win counts per seat.
    """
    wins = {i: 0 for i in range(NUM_PLAYERS)}

    for _ in range(num_games):
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

    # Extract episode numbers and find the highest
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
    """Main training loop for the adversarial agent."""
    # Check for resume
    start_episode = 1
    checkpoint_path = None

    if not fresh:
        checkpoint_path, start_episode_found = find_latest_checkpoint(ADVERSARIAL_DIR)
        if checkpoint_path:
            start_episode = start_episode_found + 1

    print()
    print("=" * 60)
    print("  ADVERSARIAL AGENT TRAINING")
    print("=" * 60)
    print(f"  Opponent    : {SEAT0_OPPONENT}")
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
        # Self-play: seat 0 also uses the RL agent
        seat0 = rl_agent.agent

    # Assign agents: seat 0 = opponent, seats 1-3 = RL agent
    agents = [None] * NUM_PLAYERS
    agents[0] = seat0
    for seat in BOT_SEATS:
        agents[seat] = rl_agent.agent  # Share the same DQNAgent across bot seats

    game.set_agents(agents)

    # Training loop
    for episode in range(start_episode, NUM_EPISODES + 1):
        # Run one game (training mode)
        result = game.run_game(is_training=True)

        # Feed transitions with TEAM reward (any bot winning = +1 for all bots)
        for seat in BOT_SEATS:
            transitions = game.get_training_data_custom_reward(
                result['trajectories'],
                result['payoffs'],
                seat=seat,
                reward_fn=adversarial_reward,
            )
            for transition in transitions:
                rl_agent.feed(transition)

        # Periodic evaluation
        if episode % EVAL_EVERY == 0:
            wins = evaluate(game, rl_agent, EVAL_NUM_GAMES)
            bot_wins = sum(wins[s] for s in BOT_SEATS)
            pct_done = episode / NUM_EPISODES * 100
            bar_len = 20
            filled = int(bar_len * episode / NUM_EPISODES)
            bar = "█" * filled + "░" * (bar_len - filled)

            print()
            print(f"  ┌─ Episode {episode:,}/{NUM_EPISODES:,} ({pct_done:.0f}%) [{bar}]")
            print(f"  │  Seat 0 (opponent)    : {wins[0]:>3}/{EVAL_NUM_GAMES}  ({wins[0]/EVAL_NUM_GAMES:.1%})")
            print(f"  │  Bots (adversarial)   : {bot_wins:>3}/{EVAL_NUM_GAMES}  ({bot_wins/EVAL_NUM_GAMES:.1%})")
            print(f"  └{'─' * 50}")

        # Periodic save
        if episode % SAVE_EVERY == 0:
            rl_agent.save(ADVERSARIAL_DIR, f"checkpoint_{episode}.pt")
            print(f"  ✓ Checkpoint saved: episode {episode:,}")

    # Final save
    rl_agent.save(ADVERSARIAL_DIR, "adversarial_agent.pt")
    print()
    print("=" * 60)
    print(f"  TRAINING COMPLETE — saved to {ADVERSARIAL_DIR}/adversarial_agent.pt")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--fresh', action='store_true', help='Start training from scratch, ignoring checkpoints')
    args = parser.parse_args()
    train(fresh=args.fresh)
