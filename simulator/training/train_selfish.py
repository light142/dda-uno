"""Train a selfish agent: each bot learns to win for itself.

Standard individual reward: +1 when THIS bot wins, -1 otherwise.
Uses RLCard's default payoffs directly (no custom reward function).

Random seat assignment: the DQN agent can sit at any seat (0-3),
with varied opponents filling the remaining seats. This teaches
the agent to win from any position.

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
    SELFISH_SEAT_WEIGHTS, SELFISH_CHECKPOINT_START,
    REPLAY_MEMORY_SIZE,
)
from simulator.config.tiers import VOLUNTARY_DRAW_POLICY
from simulator.training.opponents import (
    create_opponent_pool, pick_opponent, try_load_selfish_checkpoint,
)
from simulator.training.metrics import (
    TrainingLogger, count_voluntary_draws, get_dqn_metrics,
    print_eval_header, print_eval_metrics,
)

SELFISH_DIR = os.path.join(MODEL_DIR, "selfish")


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
            vd_caps[seat] = VOLUNTARY_DRAW_POLICY.get("selfish", 5)
        else:
            name, agent, vd_cap = pick_opponent(pool, selfish_entry)
            agents_map[seat] = agent
            vd_caps[seat] = vd_cap

    return dqn_seats, agents_map, vd_caps


def evaluate(game, rl_agent, num_games):
    """Evaluate with fixed config: seat 0 = rule-v1, seats 1-3 = DQN."""
    from rlcard.models import load as load_model
    eval_opponent = load_model('uno-rule-v1').agents[0]

    agents = [None] * NUM_PLAYERS
    agents[0] = eval_opponent
    for seat in [1, 2, 3]:
        agents[seat] = rl_agent.agent
    game.set_agents(agents)

    eval_vd = {0: 0, 1: 5, 2: 5, 3: 5}
    game.set_max_voluntary_draws(eval_vd)

    wins = {i: 0 for i in range(NUM_PLAYERS)}
    total_game_length = 0
    total_vd = {i: 0 for i in range(NUM_PLAYERS)}

    for _ in range(num_games):
        result = game.run_game(is_training=False)
        wins[result['winner']] += 1

        # Count game length (turns for all players)
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
    print(f"  Opponent pool   : {OPPONENT_POOL}")
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

    # Create game and agents
    game = UnoGame()

    # Create the RL agent
    if checkpoint_path:
        rl_agent = RLAgent(model_path=checkpoint_path)
    else:
        rl_agent = RLAgent()

    # Create opponent pool
    pool = create_opponent_pool(OPPONENT_POOL)

    # Metrics logger
    logger = TrainingLogger(MODEL_DIR, "selfish")

    # Training loop
    selfish_entry = None
    selfish_check_episode = int(num_episodes * SELFISH_CHECKPOINT_START)

    for episode in range(start_episode, num_episodes + 1):
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

        # Periodic evaluation
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
