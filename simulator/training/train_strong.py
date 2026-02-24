"""Train a strong agent: learns to win UNO / make seat 0 lose.

Reward: +1 when the agent wins, -1 when it loses.
This is the standard RLCard reward — no custom reward needed.

Usage:
    python -m simulator.training.train_strong
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from rlcard.agents import RandomAgent
from rlcard.models import load as load_model

from simulator.game import UnoGame
from engine.agents import RLAgent
from engine.config.game import NUM_PLAYERS, NUM_ACTIONS, BOT_SEATS
from simulator.config.training import (
    SEAT0_OPPONENT, NUM_EPISODES, EVAL_EVERY, EVAL_NUM_GAMES,
    MODEL_DIR, SAVE_EVERY,
)


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


def train():
    """Main training loop for the strong agent."""
    print(f"Training STRONG agent")
    print(f"  Seat 0 opponent: {SEAT0_OPPONENT}")
    print(f"  Episodes: {NUM_EPISODES}")
    print(f"  Model dir: {MODEL_DIR}")
    print()

    # Create game and agents
    game = UnoGame()

    # Create the RL agent (will play at seat 1, same weights shared across bot seats)
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
    for episode in range(1, NUM_EPISODES + 1):
        # Run one game (training mode)
        result = game.run_game(is_training=True)

        # Feed transitions to the agent (standard reward: agent wins = +1)
        training_data = game.get_training_data(
            result['trajectories'], result['payoffs']
        )
        for seat in BOT_SEATS:
            for transition in training_data[seat]:
                rl_agent.feed(transition)

        # Periodic evaluation
        if episode % EVAL_EVERY == 0:
            wins = evaluate(game, rl_agent, EVAL_NUM_GAMES)
            bot_wins = sum(wins[s] for s in BOT_SEATS)
            print(
                f"Episode {episode}/{NUM_EPISODES} | "
                f"Seat 0 wins: {wins[0]}/{EVAL_NUM_GAMES} "
                f"({wins[0]/EVAL_NUM_GAMES:.1%}) | "
                f"Bot wins: {bot_wins}/{EVAL_NUM_GAMES} "
                f"({bot_wins/EVAL_NUM_GAMES:.1%})"
            )

        # Periodic save
        if episode % SAVE_EVERY == 0:
            save_path = os.path.join(MODEL_DIR, "strong")
            rl_agent.save(save_path, f"checkpoint_{episode}.pt")
            print(f"  Saved checkpoint at episode {episode}")

    # Final save
    save_path = os.path.join(MODEL_DIR, "strong")
    rl_agent.save(save_path, "strong_agent.pt")
    print(f"\nTraining complete. Model saved to {save_path}/strong_agent.pt")


if __name__ == "__main__":
    train()
