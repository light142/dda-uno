"""Train a weak agent: learns to help seat 0 win.

Custom reward: +1 when seat 0 wins, -1 when the agent itself wins,
-0.5 when another bot (not seat 0) wins.

Usage:
    python -m simulator.training.train_weak
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from rlcard.agents import RandomAgent
from rlcard.models import load as load_model

from simulator.game import UnoGame
from engine.agents import RLAgent
from engine.config.game import NUM_PLAYERS, NUM_ACTIONS, PLAYER_SEAT, BOT_SEATS
from simulator.config.training import (
    SEAT0_OPPONENT, NUM_EPISODES, EVAL_EVERY, EVAL_NUM_GAMES,
    MODEL_DIR, SAVE_EVERY,
)


def weak_reward(payoffs: list, seat: int) -> float:
    """Custom reward for weak agents.

    The weak agent is rewarded when seat 0 wins,
    penalized when it wins itself.

    Args:
        payoffs: Original payoffs from the game.
        seat: The bot's seat index.

    Returns:
        Custom reward value.
    """
    # Find who won (highest payoff)
    winner = max(range(len(payoffs)), key=lambda i: payoffs[i])

    if winner == PLAYER_SEAT:
        return 1.0   # Seat 0 won — mission accomplished
    elif winner == seat:
        return -1.0   # This bot won — bad, we were supposed to help seat 0
    else:
        return -0.5   # Another bot won — still failed but less our fault


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


def evaluate(game: UnoGame, num_games: int) -> dict:
    """Evaluate: check how often seat 0 wins."""
    wins = {i: 0 for i in range(NUM_PLAYERS)}

    for _ in range(num_games):
        result = game.run_game(is_training=False)
        wins[result['winner']] += 1

    return wins


def train():
    """Main training loop for the weak agent."""
    print(f"Training WEAK agent")
    print(f"  Seat 0 opponent: {SEAT0_OPPONENT}")
    print(f"  Episodes: {NUM_EPISODES}")
    print(f"  Model dir: {MODEL_DIR}")
    print()

    # Create game and agents
    game = UnoGame()

    # Create the RL agent
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

    # Training loop
    for episode in range(1, NUM_EPISODES + 1):
        # Run one game
        result = game.run_game(is_training=True)

        # Feed transitions with CUSTOM reward (seat 0 winning = good)
        for seat in BOT_SEATS:
            transitions = game.get_training_data_custom_reward(
                result['trajectories'],
                result['payoffs'],
                seat=seat,
                reward_fn=weak_reward,
            )
            for transition in transitions:
                rl_agent.feed(transition)

        # Periodic evaluation
        if episode % EVAL_EVERY == 0:
            wins = evaluate(game, EVAL_NUM_GAMES)
            print(
                f"Episode {episode}/{NUM_EPISODES} | "
                f"Seat 0 wins: {wins[0]}/{EVAL_NUM_GAMES} "
                f"({wins[0]/EVAL_NUM_GAMES:.1%}) | "
                f"Bot wins: {sum(wins[s] for s in BOT_SEATS)}/{EVAL_NUM_GAMES}"
            )

        # Periodic save
        if episode % SAVE_EVERY == 0:
            save_path = os.path.join(MODEL_DIR, "weak")
            rl_agent.save(save_path, f"checkpoint_{episode}.pt")
            print(f"  Saved checkpoint at episode {episode}")

    # Final save
    save_path = os.path.join(MODEL_DIR, "weak")
    rl_agent.save(save_path, "weak_agent.pt")
    print(f"\nTraining complete. Model saved to {save_path}/weak_agent.pt")


if __name__ == "__main__":
    train()
