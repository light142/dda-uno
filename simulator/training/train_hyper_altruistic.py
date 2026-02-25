"""Train a hyper altruistic agent: learns to help seat 0 win by strategic passing.

Unlike regular altruistic, this agent can DRAW (pass) even with playable cards.
It learns WHEN passing is worth the penalty cost — e.g., right before seat 0's
turn when the current top card matches seat 0's likely hand.

Reward: +2 when seat 0 wins, -1 when the agent itself wins,
-1 when another bot wins, MINUS 0.5 per voluntary draw (cumulative).

Slightly stronger "help seat 0" signal than altruistic, with voluntary draw
available. The pass penalty prevents spam while letting the DQN learn
the optimal number of strategic passes.

Target seat plane (plane 11) is always set to seat 0.
Voluntary draw flag is enabled so 'draw' is always a legal action.

Mixed seat 0 opponents (50% random + 50% rule-v1) for robustness.

Most impactful at seats 1 and 3 (adjacent to seat 0 in both turn directions).

Supports resume: automatically finds the latest checkpoint and continues.

Usage:
    python -m simulator.training.train_hyper_altruistic
    python -m simulator.training.train_hyper_altruistic --fresh   # ignore checkpoints, start over
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

HYPER_ALTRUISTIC_DIR = os.path.join(MODEL_DIR, "hyper_altruistic")

# Reward tuning (stronger help signal + moderate pass penalty)
WIN_BONUS = 2.0        # +2 when seat 0 wins
SELF_WIN_PENALTY = -1.0
OTHER_WIN_PENALTY = -1.0
PASS_PENALTY = -0.5     # -0.5 per voluntary draw (cumulative over game)

# Draw action ID in RLCard UNO (action 60 = 'draw')
DRAW_ACTION_ID = 60


def count_voluntary_draws(trajectories, seat):
    """Count times a bot chose draw when other actions were available.

    RLCard trajectory format: [state, action, state, action, ..., state]
    Even indices = state dicts, odd indices = action IDs.
    """
    traj = trajectories[seat]
    count = 0
    for i in range(0, len(traj) - 1, 2):
        state = traj[i]
        action = traj[i + 1]
        if action == DRAW_ACTION_ID and len(state['legal_actions']) > 1:
            count += 1
    return count


def hyper_altruistic_reward(payoffs, seat, voluntary_draws):
    """Custom reward for hyper altruistic agents.

    Base reward depends on who won, then subtract cumulative pass penalty.

    Args:
        payoffs: Original payoffs from the game.
        seat: The bot's seat index.
        voluntary_draws: Number of times this bot drew with playable cards.

    Returns:
        Custom reward value.
    """
    winner = max(range(len(payoffs)), key=lambda i: payoffs[i])

    if winner == PLAYER_SEAT:
        base = WIN_BONUS
    elif winner == seat:
        base = SELF_WIN_PENALTY
    else:
        base = OTHER_WIN_PENALTY

    return base + voluntary_draws * PASS_PENALTY


def evaluate(game, num_games):
    """Evaluate: check how often seat 0 wins + average voluntary draws."""
    wins = {i: 0 for i in range(NUM_PLAYERS)}
    total_voluntary_draws = 0

    for _ in range(num_games):
        game.set_target_seat(PLAYER_SEAT)
        result = game.run_game(is_training=False)
        wins[result['winner']] += 1
        for seat in BOT_SEATS:
            total_voluntary_draws += count_voluntary_draws(
                result['trajectories'], seat
            )

    avg_draws = total_voluntary_draws / (num_games * len(BOT_SEATS))
    return wins, avg_draws


def find_latest_checkpoint(checkpoint_dir):
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


def train(fresh=False):
    """Main training loop for the hyper altruistic agent."""
    # Check for resume
    start_episode = 1
    checkpoint_path = None

    if not fresh:
        checkpoint_path, start_episode_found = find_latest_checkpoint(
            HYPER_ALTRUISTIC_DIR
        )
        if checkpoint_path:
            start_episode = start_episode_found + 1

    print()
    print("=" * 60)
    print("  HYPER ALTRUISTIC AGENT TRAINING")
    print("=" * 60)
    print(f"  Target      : seat 0 (human player)")
    print(f"  Seat 0 mix  : 50% random + 50% rule-v1")
    print(f"  Voluntary draw : ENABLED (draw always legal)")
    print(f"  Reward      : +{WIN_BONUS} win, {PASS_PENALTY} per pass")
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

    # Voluntary draw is already enabled by default (True in UnoGame)
    # Hyper altruistic learns WHEN to pass via the -1 per pass penalty

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

    # Training loop
    for episode in range(start_episode, NUM_EPISODES + 1):
        # Randomly pick seat 0 opponent each episode
        agents[0] = random.choice(seat0_options)
        game.set_agents(agents)

        # Run one game
        result = game.run_game(is_training=True)

        # Feed transitions with HYPER ALTRUISTIC reward (seat 0 winning + pass penalty)
        for seat in BOT_SEATS:
            vd = count_voluntary_draws(result['trajectories'], seat)
            transitions = game.get_training_data_custom_reward(
                result['trajectories'],
                result['payoffs'],
                seat=seat,
                reward_fn=lambda payoffs, s, _vd=vd: hyper_altruistic_reward(
                    payoffs, s, _vd
                ),
            )
            for transition in transitions:
                rl_agent.feed(transition)

        # Periodic evaluation (always use rule-v1 for consistent eval)
        if episode % EVAL_EVERY == 0:
            agents[0] = seat0_rule
            game.set_agents(agents)

            wins, avg_draws = evaluate(game, EVAL_NUM_GAMES)
            pct_done = episode / NUM_EPISODES * 100
            bar_len = 20
            filled = int(bar_len * episode / NUM_EPISODES)
            bar = "\u2588" * filled + "\u2591" * (bar_len - filled)

            print()
            print(f"  \u250c\u2500 Episode {episode:,}/{NUM_EPISODES:,} ({pct_done:.0f}%) [{bar}]")
            print(f"  \u2502  Seat 0 (helped)     : {wins[0]:>3}/{EVAL_NUM_GAMES}  ({wins[0]/EVAL_NUM_GAMES:.1%})")
            bot_wins = sum(wins[s] for s in BOT_SEATS)
            print(f"  \u2502  Bots (hyper alt)    : {bot_wins:>3}/{EVAL_NUM_GAMES}  ({bot_wins/EVAL_NUM_GAMES:.1%})")
            print(f"  \u2502  Avg voluntary draws : {avg_draws:.1f} per bot per game")
            print(f"  \u2514{'\u2500' * 50}")

        # Periodic save
        if episode % SAVE_EVERY == 0:
            rl_agent.save(HYPER_ALTRUISTIC_DIR, f"checkpoint_{episode}.pt")
            print(f"  \u2713 Checkpoint saved: episode {episode:,}")

    # Final save
    rl_agent.save(HYPER_ALTRUISTIC_DIR, "hyper_altruistic_agent.pt")
    print()
    print("=" * 60)
    print(f"  TRAINING COMPLETE \u2014 saved to {HYPER_ALTRUISTIC_DIR}/hyper_altruistic_agent.pt")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--fresh', action='store_true',
                        help='Start training from scratch, ignoring checkpoints')
    args = parser.parse_args()
    train(fresh=args.fresh)
