"""Train a selfish agent: each bot learns to win for itself.

Standard individual reward: +1 when THIS bot wins, -1 otherwise.
Uses RLCard's default payoffs directly (no custom reward function).

Random seat assignment: the DQN agent can sit at any seat (0-3),
with varied opponents filling the remaining seats. This teaches
the agent to win from any position.

Curriculum opponent scheduling: weak opponents first, then medium, then full pool.
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
import random
import argparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from engine.game_logic.game import UnoGame
from engine.game_logic.agents import RLAgent
from engine.config.game import NUM_PLAYERS, NUM_ACTIONS
from simulator.config.training import (
    NUM_EPISODES, EVAL_EVERY, EVAL_NUM_GAMES,
    MODEL_DIR, SAVE_EVERY, OPPONENT_POOL,
)
from simulator.config.tiers import VOLUNTARY_DRAW_POLICY
from simulator.training.opponents import (
    create_opponent_pool, pick_opponent, try_load_selfish_checkpoint,
)
from simulator.training.metrics import (
    TrainingLogger, count_voluntary_draws, get_dqn_metrics,
    print_eval_header, print_eval_metrics, patch_dqn_loss_tracking,
)

SELFISH_DIR = os.path.join(MODEL_DIR, "selfish")

# DQN hyperparameters (selfish-specific overrides)
SELFISH_MLP_LAYERS = [512, 512]
SELFISH_REPLAY_SIZE = 500_000
SELFISH_BATCH_SIZE = 64

# Seat weights: favor fewer DQN agents for clearer learning signal
SELFISH_SEAT_WEIGHTS = {1: 20, 2: 30, 3: 35, 4: 15}

# Curriculum opponent scheduling (progress threshold, opponent list)
CURRICULUM = [
    (0.00, ["random", "noob"]),
    (0.25, ["random", "noob", "rule-v1", "casual"]),
    (0.50, ["random", "rule-v1", "noob", "casual", "pro"]),
]

# Self-play: load own checkpoints as opponents
SELF_PLAY_START = 0.40
SELF_PLAY_REFRESH_PCT = 0.05


def get_curriculum_pool(progress):
    """Return the opponent list for the current training progress.

    Args:
        progress: Current episode / total episodes (0.0 to 1.0).

    Returns:
        List of opponent names for this phase.
    """
    pool_names = CURRICULUM[0][1]
    for threshold, names in CURRICULUM:
        if progress >= threshold:
            pool_names = names
    return pool_names


def pick_seat_config(pool, selfish_entry, seat_weights):
    """Pick random DQN seat assignment and fill opponents.

    Args:
        pool: Opponent pool from create_opponent_pool().
        selfish_entry: Optional selfish checkpoint entry, or None.
        seat_weights: Dict {num_dqn_seats: weight}.

    Returns:
        (dqn_seats, agents_map, vd_caps) where:
            dqn_seats: list of seat indices with DQN agent
            agents_map: dict {seat: agent} for non-DQN seats
            vd_caps: dict {seat: vd_cap} for all seats
    """
    # Pick number of DQN seats
    counts = list(seat_weights.keys())
    weights = list(seat_weights.values())
    num_dqn = random.choices(counts, weights=weights, k=1)[0]

    # Pick which seats are DQN
    all_seats = list(range(NUM_PLAYERS))
    dqn_seats = sorted(random.sample(all_seats, num_dqn))

    # Fill remaining seats with opponents
    agents_map = {}
    vd_caps = {}

    for seat in all_seats:
        if seat in dqn_seats:
            vd_caps[seat] = VOLUNTARY_DRAW_POLICY.get("selfish", 0)
        else:
            name, agent, vd_cap = pick_opponent(pool, selfish_entry)
            agents_map[seat] = agent
            vd_caps[seat] = vd_cap

    return dqn_seats, agents_map, vd_caps


def evaluate(game, rl_agent, pool, num_games):
    """Evaluate with mixed opponents at seat 0, DQN at seats 1-3."""
    wins = {i: 0 for i in range(NUM_PLAYERS)}
    total_game_length = 0
    total_vd = {i: 0 for i in range(NUM_PLAYERS)}

    for _ in range(num_games):
        name, seat0_agent, seat0_vd = pick_opponent(pool)

        agents = [None] * NUM_PLAYERS
        agents[0] = seat0_agent
        for seat in [1, 2, 3]:
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

    # Check for resume
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
    print(f"  Seat assignment : random (DQN at any seat)")
    print(f"  DQN seat weights: {SELFISH_SEAT_WEIGHTS}")
    print(f"  Curriculum      : {len(CURRICULUM)} phases")
    for thresh, names in CURRICULUM:
        print(f"    {thresh:.0%}: {names}")
    print(f"  Self-play       : after {SELF_PLAY_START:.0%} of training")
    print(f"  Network         : {SELFISH_MLP_LAYERS}")
    print(f"  Replay buffer   : {SELFISH_REPLAY_SIZE:,}")
    print(f"  Batch size      : {SELFISH_BATCH_SIZE}")
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

    # Create game and agents
    game = UnoGame()

    # Create the RL agent
    if checkpoint_path:
        rl_agent = RLAgent(model_path=checkpoint_path)
    else:
        rl_agent = RLAgent(
            mlp_layers=SELFISH_MLP_LAYERS,
            replay_memory_size=SELFISH_REPLAY_SIZE,
            batch_size=SELFISH_BATCH_SIZE,
        )
    patch_dqn_loss_tracking(rl_agent)

    # Create opponent pools (curriculum starts with phase 1, eval always uses full pool)
    current_pool_names = get_curriculum_pool(start_episode / num_episodes)
    pool = create_opponent_pool(current_pool_names)
    eval_pool = create_opponent_pool(OPPONENT_POOL)

    # Metrics logger
    logger = TrainingLogger(MODEL_DIR, "selfish")

    # Self-play state
    selfish_entry = None
    self_play_start = int(num_episodes * SELF_PLAY_START)
    self_play_refresh = max(1, int(num_episodes * SELF_PLAY_REFRESH_PCT))

    for episode in range(start_episode, num_episodes + 1):
        # Curriculum: check if opponent pool should change
        progress = episode / num_episodes
        new_pool_names = get_curriculum_pool(progress)
        if new_pool_names != current_pool_names:
            current_pool_names = new_pool_names
            pool = create_opponent_pool(current_pool_names)
            print(f"  + Curriculum phase: {current_pool_names}")

        # Self-play: load own checkpoints after threshold
        if episode >= self_play_start and episode % self_play_refresh == 0:
            new_entry = try_load_selfish_checkpoint(MODEL_DIR)
            if new_entry:
                if selfish_entry is None:
                    print(f"  + Self-play enabled: selfish checkpoint loaded")
                else:
                    print(f"  + Self-play checkpoint refreshed")
                selfish_entry = new_entry

        # Pick seat configuration
        dqn_seats, agents_map, vd_caps = pick_seat_config(
            pool, selfish_entry, SELFISH_SEAT_WEIGHTS
        )

        # Build agent list
        agents = [None] * NUM_PLAYERS
        for seat in range(NUM_PLAYERS):
            if seat in dqn_seats:
                agents[seat] = rl_agent.agent
            else:
                agents[seat] = agents_map[seat]

        game.set_agents(agents)
        game.set_max_voluntary_draws(vd_caps)

        # Run one game
        result = game.run_game(is_training=True)

        # Feed transitions only from DQN seats (standard payoffs)
        all_transitions = game.get_training_data(
            result['trajectories'],
            result['payoffs'],
        )
        for seat in dqn_seats:
            for transition in all_transitions[seat]:
                rl_agent.feed(transition)

        # Periodic evaluation (always uses full opponent pool)
        if episode % eval_every == 0:
            wins, avg_game_length, vd_per_seat = evaluate(
                game, rl_agent, eval_pool, eval_num_games
            )
            loss, epsilon, buffer_size = get_dqn_metrics(rl_agent)

            print_eval_header(episode, num_episodes)
            print_eval_metrics(
                wins, eval_num_games, loss, epsilon,
                avg_game_length, vd_per_seat,
                buffer_size, SELFISH_REPLAY_SIZE,
                bots_label="selfish",
            )

            logger.log_eval(
                episode, wins, eval_num_games, loss, epsilon,
                avg_game_length, vd_per_seat, buffer_size,
            )

        # Periodic save + plot
        if episode % save_every == 0:
            rl_agent.save(SELFISH_DIR, f"checkpoint_{episode}.pt")
            logger.plot()
            print(f"  \u2713 Checkpoint saved: episode {episode:,}")

    # Final save
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
