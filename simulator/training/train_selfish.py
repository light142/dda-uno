"""Train a selfish agent: each bot learns to win for itself.

Individual reward: +1 when any bot wins, -1 when seat 0 wins.
DQN at seats 1-3, mixed opponent at seat 0.

Per-step reward shaping (ProBot/rule-v1 inspired):
  - Power cards (skip/reverse/draw2/wild+4) conserved during normal play
  - Power cards rewarded when next player is about to win (1-2 cards)
  - Regular wilds penalized when non-wild options exist (paving card only)

Full opponent pool (random, rule-v1, noob, casual, pro) from the start.
Self-play with own checkpoints enabled after 40% of training.

Supports resume, --fresh, and --test flags.

Usage:
    python -m simulator.training.train_selfish
    python -m simulator.training.train_selfish --fresh   # start over
    python -m simulator.training.train_selfish --test    # smoke test (200 episodes)
"""

import os
import sys
import glob
import argparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from engine.game_logic.game import UnoGame
from engine.game_logic.agents import RLAgent
from engine.config.game import NUM_PLAYERS, PLAYER_SEAT, BOT_SEATS
from simulator.config.training import (
    NUM_EPISODES, EVAL_EVERY, EVAL_NUM_GAMES,
    MODEL_DIR, SAVE_EVERY, OPPONENT_POOL, REPLAY_MEMORY_SIZE,
    SELFISH_CHECKPOINT_START,
)
from simulator.config.tiers import VOLUNTARY_DRAW_POLICY
from simulator.training.opponents import (
    create_opponent_pool, pick_opponent, try_load_selfish_checkpoint,
)
from simulator.training.metrics import (
    TrainingLogger, count_voluntary_draws, get_dqn_metrics,
    print_eval_header, print_eval_metrics, patch_dqn_loss_tracking,
    reorganize_selfish_shaping,
)

SELFISH_DIR = os.path.join(MODEL_DIR, "selfish")

# Per-step reward shaping constants
POWER_CARD_WASTE = -0.2   # power card when no danger + alternatives exist
POWER_CARD_BLOCK = 0.3    # power card when next player <= 2 cards
WILD_WASTE = -0.15        # regular wild when non-wild playable

# Self-play: load own checkpoints as opponents
SELF_PLAY_START = 0.40
SELF_PLAY_REFRESH_PCT = 0.05


def selfish_reward(payoffs):
    """Individual reward: +1 if any bot wins, -1 if seat 0 wins."""
    winner = max(range(len(payoffs)), key=lambda i: payoffs[i])
    if winner in BOT_SEATS:
        return 1.0
    return -1.0


def evaluate(game, rl_agent, pool, num_games):
    """Evaluate with mixed opponents at seat 0, DQN at seats 1-3."""
    wins = {i: 0 for i in range(NUM_PLAYERS)}
    total_game_length = 0
    total_vd = {i: 0 for i in range(NUM_PLAYERS)}

    for _ in range(num_games):
        name, seat0_agent, seat0_vd = pick_opponent(pool)

        agents = [None] * NUM_PLAYERS
        agents[0] = seat0_agent
        for seat in BOT_SEATS:
            agents[seat] = rl_agent.agent
        game.set_agents(agents)
        game.set_max_voluntary_draws({0: seat0_vd, 1: 0, 2: 0, 3: 0})

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
    """Main training loop for the selfish agent."""
    num_episodes = 200 if test else NUM_EPISODES
    eval_every = 50 if test else EVAL_EVERY
    save_every = 100 if test else SAVE_EVERY
    eval_num_games = 20 if test else EVAL_NUM_GAMES

    start_episode = 1
    checkpoint_path = None

    if not fresh and not test:
        checkpoint_path, start_episode_found = find_latest_checkpoint(SELFISH_DIR)
        if checkpoint_path:
            start_episode = start_episode_found + 1

    print()
    print("=" * 60)
    print("  SELFISH AGENT TRAINING")
    print("=" * 60)
    print(f"  Seat assignment : fixed (DQN at seats 1-3)")
    print(f"  Reward shaping  : power={POWER_CARD_WASTE}/{POWER_CARD_BLOCK}, wild={WILD_WASTE}")
    print(f"  Opponent pool   : {OPPONENT_POOL}")
    print(f"  Self-play       : after {SELF_PLAY_START:.0%} of training")
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
    patch_dqn_loss_tracking(rl_agent)

    pool = create_opponent_pool(OPPONENT_POOL)

    logger = TrainingLogger(MODEL_DIR, "selfish")

    # Self-play state
    selfish_entry = None
    self_play_start = int(num_episodes * SELF_PLAY_START)
    self_play_refresh = max(1, int(num_episodes * SELF_PLAY_REFRESH_PCT))

    for episode in range(start_episode, num_episodes + 1):
        # Self-play: load own checkpoints after threshold
        if episode >= self_play_start and episode % self_play_refresh == 0:
            new_entry = try_load_selfish_checkpoint(MODEL_DIR)
            if new_entry:
                if selfish_entry is None:
                    print(f"  + Self-play enabled: selfish checkpoint loaded")
                else:
                    print(f"  + Self-play checkpoint refreshed")
                selfish_entry = new_entry

        # Pick opponent for seat 0
        name, seat0_agent, seat0_vd = pick_opponent(pool, selfish_entry)

        agents = [None] * NUM_PLAYERS
        agents[0] = seat0_agent
        for seat in BOT_SEATS:
            agents[seat] = rl_agent.agent

        game.set_agents(agents)
        game.set_max_voluntary_draws({0: seat0_vd, 1: 0, 2: 0, 3: 0})

        result = game.run_game(is_training=True)

        # Feed with selfish reward + per-step power card shaping
        base_reward = selfish_reward(result['payoffs'])
        for seat in BOT_SEATS:
            transitions = reorganize_selfish_shaping(
                result['trajectories'], seat, base_reward,
                power_waste=POWER_CARD_WASTE,
                power_block=POWER_CARD_BLOCK,
                wild_waste=WILD_WASTE,
            )
            for transition in transitions:
                rl_agent.feed(transition)

        if episode % eval_every == 0:
            wins, avg_game_length, vd_per_seat = evaluate(
                game, rl_agent, pool, eval_num_games
            )
            loss, epsilon, buffer_size = get_dqn_metrics(rl_agent)

            print_eval_header(episode, num_episodes)
            print_eval_metrics(
                wins, eval_num_games, loss, epsilon,
                avg_game_length, vd_per_seat,
                buffer_size, REPLAY_MEMORY_SIZE,
                bots_label="selfish",
            )

            logger.log_eval(
                episode, wins, eval_num_games, loss, epsilon,
                avg_game_length, vd_per_seat, buffer_size,
            )

        if episode % save_every == 0:
            rl_agent.save(SELFISH_DIR, f"checkpoint_{episode}.pt")
            logger.plot()
            print(f"  \u2713 Checkpoint saved: episode {episode:,}")

    rl_agent.save(SELFISH_DIR, "selfish_agent.pt")
    logger.plot()
    print()
    print("=" * 60)
    print(f"  TRAINING COMPLETE \u2014 saved to {SELFISH_DIR}/selfish_agent.pt")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--fresh', action='store_true',
                        help='Start training from scratch, ignoring checkpoints')
    parser.add_argument('--test', action='store_true',
                        help='Smoke test: 200 episodes with fast eval')
    args = parser.parse_args()
    train(fresh=args.fresh, test=args.test)
