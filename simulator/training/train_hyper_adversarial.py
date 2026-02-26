"""Train hyper-adversarial agents: joint training of selfish star + cooperative support.

Replaces the old cooperative training with a proper joint training setup.
Two DQN networks operate in the same game:
  - Star seat (frozen selfish checkpoint): plays to win, rotates among bot seats
  - Support seats (cooperative DQN, training): learn to help the star win

Cooperative reward: +2 when star wins, +1 when other bot wins,
-2 when seat 0 (human) wins.

Requires a pre-trained selfish_agent.pt from Phase 1.

Supports resume, --fresh, and --test flags.

Usage:
    python -m simulator.training.train_hyper_adversarial
    python -m simulator.training.train_hyper_adversarial --fresh
    python -m simulator.training.train_hyper_adversarial --test
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
    REPLAY_MEMORY_SIZE,
)
from simulator.config.tiers import VOLUNTARY_DRAW_POLICY
from simulator.training.opponents import create_opponent_pool, pick_opponent
from simulator.training.metrics import (
    TrainingLogger, count_voluntary_draws, get_dqn_metrics,
    print_eval_header, print_eval_metrics,
)

HYPER_ADVERSARIAL_DIR = os.path.join(MODEL_DIR, "hyper_adversarial")

# Cooperative reward (for support seats)
TARGET_WIN_REWARD = 2.0     # Star seat wins — mission accomplished
BOT_WIN_REWARD = 1.0        # Another bot wins — team still beat seat 0
SEAT0_WIN_PENALTY = -2.0    # Seat 0 wins — catastrophic

# Opponent weights for seat 0 (bias toward strong)
OPPONENT_WEIGHTS = {
    "random": 15, "rule-v1": 25, "noob": 15,
    "casual": 20, "pro": 25,
}


def cooperative_reward(payoffs, seat, target_seat):
    """Cooperative reward for support seats.

    Args:
        payoffs: Game payoffs.
        seat: This support bot's seat index.
        target_seat: The star seat index.

    Returns:
        Reward value.
    """
    winner = max(range(len(payoffs)), key=lambda i: payoffs[i])

    if winner == target_seat:
        return TARGET_WIN_REWARD
    elif winner == PLAYER_SEAT:
        return SEAT0_WIN_PENALTY
    else:
        return BOT_WIN_REWARD


def pick_weighted_opponent(pool):
    """Pick opponent with hyper-adversarial weighting."""
    weights = [OPPONENT_WEIGHTS.get(name, 15) for name, _, _ in pool]
    return random.choices(pool, weights=weights, k=1)[0]


def evaluate(game, selfish_agent, coop_agent, num_games):
    """Evaluate with rule-v1 at seat 0, selfish at seat 2 (star), coop at 1 and 3."""
    from rlcard.models import load as load_model
    eval_opponent = load_model('uno-rule-v1').agents[0]

    target_seat = 2  # Fixed star seat for eval consistency
    agents = [None] * NUM_PLAYERS
    agents[0] = eval_opponent
    agents[target_seat] = selfish_agent
    for seat in BOT_SEATS:
        if seat != target_seat:
            agents[seat] = coop_agent.agent

    game.set_agents(agents)
    game.set_max_voluntary_draws({0: 0, target_seat: 5, **{
        s: 0 for s in BOT_SEATS if s != target_seat
    }})
    game.set_target_seat(target_seat)

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
    """Main training loop for hyper-adversarial (cooperative support) agent."""
    num_episodes = 200 if test else NUM_EPISODES
    eval_every = 50 if test else EVAL_EVERY
    save_every = 100 if test else SAVE_EVERY
    eval_num_games = 20 if test else EVAL_NUM_GAMES

    # Load frozen selfish agent
    selfish_path = os.path.join(MODEL_DIR, "selfish", "selfish_agent.pt")
    if not os.path.exists(selfish_path):
        # Try latest checkpoint
        from simulator.training.opponents import try_load_selfish_checkpoint
        entry = try_load_selfish_checkpoint(MODEL_DIR)
        if entry is None:
            print("ERROR: No selfish agent found. Train selfish first (Phase 1).")
            print(f"  Expected: {selfish_path}")
            return
        selfish_agent_obj = entry[0]
        print(f"  Using selfish checkpoint (final agent not found)")
    else:
        selfish_rl = RLAgent(model_path=selfish_path)
        selfish_agent_obj = selfish_rl.agent

    # Check for resume
    start_episode = 1
    checkpoint_path = None

    if not fresh and not test:
        checkpoint_path, start_episode_found = find_latest_checkpoint(
            HYPER_ADVERSARIAL_DIR
        )
        if checkpoint_path:
            start_episode = start_episode_found + 1

    print()
    print("=" * 60)
    print("  HYPER-ADVERSARIAL JOINT TRAINING")
    print("=" * 60)
    print(f"  Star agent      : frozen selfish_agent.pt")
    print(f"  Support reward  : +{TARGET_WIN_REWARD} star, +{BOT_WIN_REWARD} bot, {SEAT0_WIN_PENALTY} seat0")
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

    # Cooperative DQN (the agent being trained)
    if checkpoint_path:
        coop_agent = RLAgent(model_path=checkpoint_path)
    else:
        coop_agent = RLAgent()

    pool = create_opponent_pool(OPPONENT_POOL)
    logger = TrainingLogger(MODEL_DIR, "hyper_adversarial")

    for episode in range(start_episode, num_episodes + 1):
        # Rotate star seat among bot seats
        star_seat = random.choice(BOT_SEATS)
        support_seats = [s for s in BOT_SEATS if s != star_seat]

        # Pick seat 0 opponent
        name, seat0_agent, seat0_vd = pick_weighted_opponent(pool)

        # Assign agents
        agents = [None] * NUM_PLAYERS
        agents[0] = seat0_agent
        agents[star_seat] = selfish_agent_obj  # Frozen selfish
        for seat in support_seats:
            agents[seat] = coop_agent.agent

        game.set_agents(agents)

        # VD caps: star gets 5 (selfish), support gets 0, seat 0 per type
        vd_caps = {0: seat0_vd, star_seat: 5}
        for seat in support_seats:
            vd_caps[seat] = 0
        game.set_max_voluntary_draws(vd_caps)

        # Set target seat for cooperative plane 11
        game.set_target_seat(star_seat)

        result = game.run_game(is_training=True)

        # Feed cooperative reward ONLY to support seats
        for seat in support_seats:
            transitions = game.get_training_data_custom_reward(
                result['trajectories'],
                result['payoffs'],
                seat=seat,
                reward_fn=lambda payoffs, s, _ts=star_seat: cooperative_reward(
                    payoffs, s, _ts
                ),
            )
            for transition in transitions:
                coop_agent.feed(transition)

        if episode % eval_every == 0:
            wins, avg_game_length, vd_per_seat = evaluate(
                game, selfish_agent_obj, coop_agent, eval_num_games
            )
            loss, epsilon, buffer_size = get_dqn_metrics(coop_agent)

            print_eval_header(episode, num_episodes)
            # Custom display: show star vs opponent
            seat0_wins = wins.get(0, 0)
            star_wins = wins.get(2, 0)  # eval uses fixed star=2
            support_wins = sum(wins.get(s, 0) for s in [1, 3])
            print(f"  \u2502  Seat 0 (opponent)   : {seat0_wins:>3}/{eval_num_games}  ({seat0_wins/eval_num_games:.1%})")
            print(f"  \u2502  Star (selfish, s2)  : {star_wins:>3}/{eval_num_games}  ({star_wins/eval_num_games:.1%})")
            print(f"  \u2502  Support (s1+s3)     : {support_wins:>3}/{eval_num_games}  ({support_wins/eval_num_games:.1%})")
            if loss is not None:
                print(f"  \u2502  Loss                : {loss:.6f}")
            print(f"  \u2502  Epsilon             : {epsilon:.4f}")
            print(f"  \u2502  Avg game length     : {avg_game_length:.1f} turns")
            vd_parts = [f"s{s}={vd_per_seat.get(s, 0):.1f}" for s in range(4)]
            print(f"  \u2502  Avg VD per seat     : {'  '.join(vd_parts)}")
            print(f"  \u2502  Buffer              : {buffer_size:,} / {REPLAY_MEMORY_SIZE:,}")
            print(f"  \u2514{'\u2500' * 50}")

            logger.log_eval(
                episode, wins, eval_num_games, loss, epsilon,
                avg_game_length, vd_per_seat, buffer_size,
            )

        if episode % save_every == 0:
            coop_agent.save(HYPER_ADVERSARIAL_DIR, f"checkpoint_{episode}.pt")
            logger.plot()
            print(f"  \u2713 Checkpoint saved: episode {episode:,}")

    coop_agent.save(HYPER_ADVERSARIAL_DIR, "hyper_adversarial_agent.pt")
    logger.plot()
    print()
    print("=" * 60)
    print(f"  TRAINING COMPLETE \u2014 saved to {HYPER_ADVERSARIAL_DIR}/hyper_adversarial_agent.pt")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--fresh', action='store_true',
                        help='Start training from scratch, ignoring checkpoints')
    parser.add_argument('--test', action='store_true',
                        help='Smoke test: 200 episodes with fast eval')
    args = parser.parse_args()
    train(fresh=args.fresh, test=args.test)
