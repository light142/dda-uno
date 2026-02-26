"""Train an adversarial agent: learns to make seat 0 lose.

Team reward: +1 when ANY bot wins (seat 0 loses), -1 when seat 0 wins.
All bots share the same goal so they learn to cooperate against seat 0.

Opponent pool weighted toward strong opponents (pro, rule-v1).
After 20% of training, includes selfish checkpoints as opponents.

Supports resume, --fresh, and --test flags.

Usage:
    python -m simulator.training.train_adversarial
    python -m simulator.training.train_adversarial --fresh
    python -m simulator.training.train_adversarial --test
"""

import os
import sys
import glob
import random
import argparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from engine.game_logic.game import UnoGame
from engine.game_logic.agents import RLAgent
from engine.config.game import NUM_PLAYERS, NUM_ACTIONS, PLAYER_SEAT, BOT_SEATS
from simulator.config.training import (
    NUM_EPISODES, EVAL_EVERY, EVAL_NUM_GAMES,
    MODEL_DIR, SAVE_EVERY, OPPONENT_POOL,
    SELFISH_CHECKPOINT_START, REPLAY_MEMORY_SIZE,
)
from simulator.config.tiers import VOLUNTARY_DRAW_POLICY
from simulator.training.opponents import (
    create_opponent_pool, pick_opponent, try_load_selfish_checkpoint,
)
from simulator.training.metrics import (
    TrainingLogger, count_voluntary_draws, get_dqn_metrics,
    print_eval_header, print_eval_metrics,
)

ADVERSARIAL_DIR = os.path.join(MODEL_DIR, "adversarial")

# Opponent weights: bias toward strong opponents
ADVERSARIAL_WEIGHTS = {
    "random": 10, "rule-v1": 25, "noob": 15,
    "casual": 15, "pro": 30,
}


def adversarial_reward(payoffs, seat):
    """Team reward: +1 if any bot wins, -1 if seat 0 wins."""
    winner = max(range(len(payoffs)), key=lambda i: payoffs[i])
    if winner == PLAYER_SEAT:
        return -1.0
    else:
        return 1.0


def pick_weighted_opponent(pool, selfish_entry=None):
    """Pick opponent with adversarial weighting (bias toward strong)."""
    candidates = list(pool)
    if selfish_entry is not None:
        agent, vd_cap = selfish_entry
        candidates.append(("selfish-ckpt", agent, vd_cap))

    weights = [ADVERSARIAL_WEIGHTS.get(name, 15) for name, _, _ in candidates]
    return random.choices(candidates, weights=weights, k=1)[0]


def evaluate(game, rl_agent, num_games):
    """Evaluate with rule-v1 at seat 0."""
    from rlcard.models import load as load_model
    eval_opponent = load_model('uno-rule-v1').agents[0]

    agents = [None] * NUM_PLAYERS
    agents[0] = eval_opponent
    for seat in BOT_SEATS:
        agents[seat] = rl_agent.agent
    game.set_agents(agents)
    game.set_max_voluntary_draws({0: 0, 1: 5, 2: 5, 3: 5})

    wins = {i: 0 for i in range(NUM_PLAYERS)}
    total_game_length = 0
    total_vd = {i: 0 for i in range(NUM_PLAYERS)}

    for _ in range(num_games):
        result = game.run_game(is_training=False)
        wins[result['winner']] += 1

        game_len = sum(
            len(result['trajectories'][s]) // 2
            for s in range(NUM_PLAYERS)
        )
        total_game_length += game_len

        for s in range(NUM_PLAYERS):
            total_vd[s] += count_voluntary_draws(result['trajectories'], s)

    avg_game_length = total_game_length / num_games
    vd_per_seat = {s: total_vd[s] / num_games for s in range(NUM_PLAYERS)}

    return wins, avg_game_length, vd_per_seat


def find_latest_checkpoint(checkpoint_dir):
    """Find the latest checkpoint file and its episode number."""
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


def train(fresh=False, test=False):
    """Main training loop for the adversarial agent."""
    num_episodes = 200 if test else NUM_EPISODES
    eval_every = 50 if test else EVAL_EVERY
    save_every = 100 if test else SAVE_EVERY
    eval_num_games = 20 if test else EVAL_NUM_GAMES

    start_episode = 1
    checkpoint_path = None

    if not fresh and not test:
        checkpoint_path, start_episode_found = find_latest_checkpoint(ADVERSARIAL_DIR)
        if checkpoint_path:
            start_episode = start_episode_found + 1

    print()
    print("=" * 60)
    print("  ADVERSARIAL AGENT TRAINING")
    print("=" * 60)
    print(f"  Opponent pool   : {OPPONENT_POOL} (weighted strong)")
    print(f"  Network         : [256, 256]")
    print(f"  Episodes        : {start_episode:,} -> {num_episodes:,}")
    if test:
        print(f"  Mode            : SMOKE TEST")
    if checkpoint_path:
        print(f"  Resume from     : {checkpoint_path}")
    else:
        print(f"  Status          : Starting fresh")
    print(f"  Model dir       : {MODEL_DIR}")
    print("=" * 60)
    print()

    if start_episode > num_episodes:
        print("Already completed all episodes. Use --fresh to restart.")
        return

    game = UnoGame()

    if checkpoint_path:
        rl_agent = RLAgent(model_path=checkpoint_path)
    else:
        rl_agent = RLAgent()

    pool = create_opponent_pool(OPPONENT_POOL)
    logger = TrainingLogger(MODEL_DIR, "adversarial")

    selfish_entry = None
    selfish_check_episode = int(num_episodes * SELFISH_CHECKPOINT_START)

    for episode in range(start_episode, num_episodes + 1):
        # Try loading selfish checkpoint after 20%
        if episode == selfish_check_episode:
            selfish_entry = try_load_selfish_checkpoint(MODEL_DIR)
            if selfish_entry:
                print(f"  + Selfish checkpoint loaded as opponent")

        # Pick opponent
        name, seat0_agent, seat0_vd = pick_weighted_opponent(pool, selfish_entry)

        agents = [None] * NUM_PLAYERS
        agents[0] = seat0_agent
        for seat in BOT_SEATS:
            agents[seat] = rl_agent.agent

        game.set_agents(agents)
        game.set_max_voluntary_draws({0: seat0_vd, 1: 5, 2: 5, 3: 5})

        result = game.run_game(is_training=True)

        # Feed with team adversarial reward
        for seat in BOT_SEATS:
            transitions = game.get_training_data_custom_reward(
                result['trajectories'],
                result['payoffs'],
                seat=seat,
                reward_fn=adversarial_reward,
            )
            for transition in transitions:
                rl_agent.feed(transition)

        if episode % eval_every == 0:
            wins, avg_game_length, vd_per_seat = evaluate(
                game, rl_agent, eval_num_games
            )
            loss, epsilon, buffer_size = get_dqn_metrics(rl_agent)

            print_eval_header(episode, num_episodes)
            print_eval_metrics(
                wins, eval_num_games, loss, epsilon,
                avg_game_length, vd_per_seat,
                buffer_size, REPLAY_MEMORY_SIZE,
                bots_label="adversarial",
            )

            logger.log_eval(
                episode, wins, eval_num_games, loss, epsilon,
                avg_game_length, vd_per_seat, buffer_size,
            )

        if episode % save_every == 0:
            rl_agent.save(ADVERSARIAL_DIR, f"checkpoint_{episode}.pt")
            logger.plot()
            print(f"  \u2713 Checkpoint saved: episode {episode:,}")

    rl_agent.save(ADVERSARIAL_DIR, "adversarial_agent.pt")
    logger.plot()
    print()
    print("=" * 60)
    print(f"  TRAINING COMPLETE \u2014 saved to {ADVERSARIAL_DIR}/adversarial_agent.pt")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--fresh', action='store_true',
                        help='Start training from scratch, ignoring checkpoints')
    parser.add_argument('--test', action='store_true',
                        help='Smoke test: 200 episodes with fast eval')
    args = parser.parse_args()
    train(fresh=args.fresh, test=args.test)
