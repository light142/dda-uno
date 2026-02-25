"""Train an altruistic agent: learns to help seat 0 (the human player) win.

Custom reward: +1 when seat 0 wins, -1 when the agent itself wins,
-1 when another bot wins.

Target seat plane (plane 11) is always set to seat 0.

Seat 0 opponent is mixed each episode (50% random, 50% rule-v1) so the
model learns general helping strategies that work regardless of how
the human player plays — from noob to pro.

Supports resume: automatically finds the latest checkpoint and continues.

Usage:
    python -m simulator.training.train_altruistic
    python -m simulator.training.train_altruistic --fresh   # ignore checkpoints, start over
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
    NUM_EPISODES, EVAL_EVERY, EVAL_NUM_GAMES,
    MODEL_DIR, SAVE_EVERY,
)

ALTRUISTIC_DIR = os.path.join(MODEL_DIR, "altruistic")

# Mixed seat 0 opponents for robust training
SEAT0_AGENTS = None  # Initialized in train()


def altruistic_reward(payoffs: list, seat: int) -> float:
    """Custom reward for altruistic agents.

    Args:
        payoffs: Original payoffs from the game.
        seat: The bot's seat index.

    Returns:
        Custom reward value.
    """
    winner = max(range(len(payoffs)), key=lambda i: payoffs[i])

    if winner == PLAYER_SEAT:
        return 1.0   # Seat 0 won — mission accomplished
    elif winner == seat:
        return -1.0   # This bot won — bad, we were supposed to help seat 0
    else:
        return -1.0   # Another bot won — failed to protect seat 0


def evaluate(game: UnoGame, num_games: int) -> dict:
    """Evaluate: check how often seat 0 wins."""
    wins = {i: 0 for i in range(NUM_PLAYERS)}

    for _ in range(num_games):
        game.set_target_seat(PLAYER_SEAT)
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
    """Main training loop for the altruistic agent."""
    # Check for resume
    start_episode = 1
    checkpoint_path = None

    if not fresh:
        checkpoint_path, start_episode_found = find_latest_checkpoint(ALTRUISTIC_DIR)
        if checkpoint_path:
            start_episode = start_episode_found + 1

    print()
    print("=" * 60)
    print("  ALTRUISTIC AGENT TRAINING")
    print("=" * 60)
    print(f"  Target      : seat 0 (human player)")
    print(f"  Seat 0 mix  : 50% random + 50% rule-v1")
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

    # Create mixed seat 0 opponents
    seat0_random = RandomAgent(num_actions=NUM_ACTIONS)
    seat0_rule = load_model('uno-rule-v1').agents[0]
    seat0_options = [seat0_random, seat0_rule]

    # Initial agent assignment (seat 0 will be swapped each episode)
    agents = [None] * NUM_PLAYERS
    agents[0] = seat0_random  # placeholder, swapped below
    for seat in BOT_SEATS:
        agents[seat] = rl_agent.agent

    game.set_agents(agents)

    # Always target seat 0
    game.set_target_seat(PLAYER_SEAT)

    # Altruistic helps by playing smart cards, not by passing
    # (voluntary draw disabled — differentiates from hyper altruistic)
    game.set_allow_voluntary_draw(False)

    # Training loop
    for episode in range(start_episode, NUM_EPISODES + 1):
        # Randomly pick seat 0 opponent each episode
        agents[0] = random.choice(seat0_options)
        game.set_agents(agents)

        # Run one game
        result = game.run_game(is_training=True)

        # Feed transitions with ALTRUISTIC reward (seat 0 winning = good)
        for seat in BOT_SEATS:
            transitions = game.get_training_data_custom_reward(
                result['trajectories'],
                result['payoffs'],
                seat=seat,
                reward_fn=altruistic_reward,
            )
            for transition in transitions:
                rl_agent.feed(transition)

        # Periodic evaluation (always use rule-v1 for consistent eval)
        if episode % EVAL_EVERY == 0:
            agents[0] = seat0_rule
            game.set_agents(agents)

            wins = evaluate(game, EVAL_NUM_GAMES)
            pct_done = episode / NUM_EPISODES * 100
            bar_len = 20
            filled = int(bar_len * episode / NUM_EPISODES)
            bar = "█" * filled + "░" * (bar_len - filled)

            print()
            print(f"  ┌─ Episode {episode:,}/{NUM_EPISODES:,} ({pct_done:.0f}%) [{bar}]")
            print(f"  │  Seat 0 (helped)     : {wins[0]:>3}/{EVAL_NUM_GAMES}  ({wins[0]/EVAL_NUM_GAMES:.1%})")
            bot_wins = sum(wins[s] for s in BOT_SEATS)
            print(f"  │  Bots (altruistic)   : {bot_wins:>3}/{EVAL_NUM_GAMES}  ({bot_wins/EVAL_NUM_GAMES:.1%})")
            print(f"  └{'─' * 50}")

        # Periodic save
        if episode % SAVE_EVERY == 0:
            rl_agent.save(ALTRUISTIC_DIR, f"checkpoint_{episode}.pt")
            print(f"  ✓ Checkpoint saved: episode {episode:,}")

    # Final save
    rl_agent.save(ALTRUISTIC_DIR, "altruistic_agent.pt")
    print()
    print("=" * 60)
    print(f"  TRAINING COMPLETE — saved to {ALTRUISTIC_DIR}/altruistic_agent.pt")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--fresh', action='store_true',
                        help='Start training from scratch, ignoring checkpoints')
    args = parser.parse_args()
    train(fresh=args.fresh)
