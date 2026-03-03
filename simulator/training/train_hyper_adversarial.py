"""Train hyper-adversarial agents: joint training of selfish star + cooperative support.

Replaces the old cooperative training with a proper joint training setup.
Two DQN networks operate in the same game:
  - Star seat (frozen selfish checkpoint): always at seat 2
  - Support seats (cooperative DQN, training): seats 1 & 3, learn to help the star win

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
from engine.config.game import NUM_PLAYERS, NUM_ACTIONS, PLAYER_SEAT
from simulator.config.training import (
    NUM_EPISODES, EVAL_EVERY, EVAL_NUM_GAMES,
    MODEL_DIR, SAVE_EVERY, OPPONENT_POOL,
    REPLAY_MEMORY_SIZE,
)
from simulator.config.tiers import VOLUNTARY_DRAW_POLICY
from simulator.training.opponents import (
    create_opponent_pool, pick_opponent, try_load_selfish_checkpoint,
)
from simulator.training.metrics import (
    TrainingLogger, count_voluntary_draws, get_dqn_metrics,
    print_eval_header, print_eval_metrics, patch_dqn_loss_tracking,
    reorganize_with_shaping,
)

HYPER_ADVERSARIAL_DIR = os.path.join(MODEL_DIR, "hyper_adversarial")

# Terminal rewards (dominant — these drive the learning goal)
TARGET_WIN_REWARD = 5.0      # Star seat wins — mission accomplished
BOT_WIN_REWARD = 2.0         # Another bot wins — team still beat seat 0
SEAT0_WIN_PENALTY = -10.0    # Seat 0 wins — catastrophic

# Per-step reward shaping (guidance — ~3-4 shaped steps accumulate ~3-5 vs terminal 5-10)
TARGET_HIT_PENALTY = -0.8    # penalty for skip/draw-2/wild+4 on star seat
OPPONENT_HIT_BONUS = 0.6     # bonus for skip/draw-2/wild+4 on seat 0
DANGER_OPPONENT_BONUS = 1.2  # boosted bonus when seat 0 has <=3 cards (urgent block)
FRIENDLY_HIT_PENALTY = -0.4  # penalty for hitting the other support bot

# Opponent weights for seat 0 (heavy bias toward strong)
OPPONENT_WEIGHTS = {
    "random": 5, "rule-v1": 30, "noob": 5,
    "casual": 25, "pro": 35,
}

# Self-play: add selfish checkpoint to opponent pool mid-training
SELF_PLAY_START = 0.20
SELF_PLAY_REFRESH_PCT = 0.05


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


def pick_weighted_opponent(pool, selfish_entry=None):
    """Pick opponent with hyper-adversarial weighting.

    Args:
        pool: List of (name, agent, vd_cap) tuples.
        selfish_entry: Optional (agent, vd_cap) from try_load_selfish_checkpoint().
    """
    candidates = list(pool)
    weights = [OPPONENT_WEIGHTS.get(name, 15) for name, _, _ in pool]
    if selfish_entry is not None:
        agent, vd_cap = selfish_entry
        candidates.append(("selfish-ckpt", agent, vd_cap))
        weights.append(30)  # strong weight for trained DQN opponent
    return random.choices(candidates, weights=weights, k=1)[0]


def evaluate(game, selfish_agent, coop_agent, pool, num_games):
    """Evaluate with mixed opponents at seat 0, selfish fixed at seat 2."""
    star_seat = 2
    support_seats = [1, 3]

    role_wins = {"seat0": 0, "star": 0, "support": 0}
    total_game_length = 0
    total_vd = {i: 0 for i in range(NUM_PLAYERS)}

    for _ in range(num_games):
        name, seat0_agent, seat0_vd = pick_weighted_opponent(pool)

        agents = [None] * NUM_PLAYERS
        agents[0] = seat0_agent
        agents[star_seat] = selfish_agent
        for seat in support_seats:
            agents[seat] = coop_agent.agent

        game.set_agents(agents)
        game.set_max_voluntary_draws({0: seat0_vd, 1: 0, 2: 0, 3: 0})
        game.set_target_seat(star_seat)

        result = game.run_game(is_training=False)
        winner = result['winner']

        if winner == 0:
            role_wins["seat0"] += 1
        elif winner == star_seat:
            role_wins["star"] += 1
        else:
            role_wins["support"] += 1

        game_len = sum(
            len(result['trajectories'][s]) // 2
            for s in range(NUM_PLAYERS)
        )
        total_game_length += game_len

        for s in range(NUM_PLAYERS):
            total_vd[s] += count_voluntary_draws(result['trajectories'], s)

    avg_game_length = total_game_length / num_games
    vd_per_seat = {s: total_vd[s] / num_games for s in range(NUM_PLAYERS)}

    return role_wins, avg_game_length, vd_per_seat


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


def train(fresh=False, test=False, episodes=None):
    """Main training loop for hyper-adversarial (cooperative support) agent."""
    num_episodes = 200 if test else (episodes or NUM_EPISODES)
    eval_every = 50 if test else EVAL_EVERY
    save_every = 100 if test else SAVE_EVERY
    eval_num_games = 20 if test else EVAL_NUM_GAMES

    # Load frozen selfish agent
    selfish_path = os.path.join(MODEL_DIR, "selfish", "selfish_agent.pt")
    if not os.path.exists(selfish_path):
        # Try latest checkpoint
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
    print(f"  Star agent      : frozen selfish_agent.pt (fixed seat 2)")
    print(f"  Support reward  : +{TARGET_WIN_REWARD} star, +{BOT_WIN_REWARD} bot, {SEAT0_WIN_PENALTY} seat0")
    print(f"  Action shaping  : {TARGET_HIT_PENALTY} hit star, +{OPPONENT_HIT_BONUS} hit seat0, {FRIENDLY_HIT_PENALTY} hit friendly")
    print(f"  Danger bonus    : +{DANGER_OPPONENT_BONUS} when seat0 <=3 cards")
    print(f"  Voluntary draw  : DISABLED (cap=0)")
    print(f"  Opponent pool   : {OPPONENT_POOL} (heavy strong bias)")
    print(f"  Self-play       : selfish checkpoint after {SELF_PLAY_START:.0%}")
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
    patch_dqn_loss_tracking(coop_agent)

    pool = create_opponent_pool(OPPONENT_POOL)
    logger = TrainingLogger(MODEL_DIR, "hyper_adversarial")

    star_seat = 2
    support_seats = [1, 3]

    # Self-play state
    selfish_entry = None
    self_play_start = int(num_episodes * SELF_PLAY_START)
    self_play_refresh = max(1, int(num_episodes * SELF_PLAY_REFRESH_PCT))

    for episode in range(start_episode, num_episodes + 1):
        # Self-play: load selfish checkpoints as seat 0 opponent after threshold
        if episode >= self_play_start and episode % self_play_refresh == 0:
            new_entry = try_load_selfish_checkpoint(MODEL_DIR)
            if new_entry:
                if selfish_entry is None:
                    print(f"  + Self-play enabled: selfish checkpoint at seat 0")
                else:
                    print(f"  + Self-play checkpoint refreshed")
                selfish_entry = new_entry

        # Pick seat 0 opponent (with self-play candidate)
        name, seat0_agent, seat0_vd = pick_weighted_opponent(
            pool, selfish_entry)

        # Assign agents
        agents = [None] * NUM_PLAYERS
        agents[0] = seat0_agent
        agents[star_seat] = selfish_agent_obj  # Frozen selfish
        for seat in support_seats:
            agents[seat] = coop_agent.agent

        game.set_agents(agents)

        # No VD for any bot
        game.set_max_voluntary_draws({0: seat0_vd, 1: 0, 2: 0, 3: 0})

        # Set target seat for cooperative plane 11
        game.set_target_seat(star_seat)

        result = game.run_game(is_training=True)

        # Feed cooperative reward with per-step action card shaping
        for seat in support_seats:
            base_reward = cooperative_reward(result['payoffs'], seat, star_seat)
            transitions = reorganize_with_shaping(
                result['trajectories'], seat, base_reward,
                target_seat=star_seat,
                opponent_seat=PLAYER_SEAT,
                target_hit_penalty=TARGET_HIT_PENALTY,
                opponent_hit_bonus=OPPONENT_HIT_BONUS,
                friendly_hit_penalty=FRIENDLY_HIT_PENALTY,
                danger_opponent_bonus=DANGER_OPPONENT_BONUS,
            )
            for transition in transitions:
                coop_agent.feed(transition)

        if episode % eval_every == 0:
            wins, avg_game_length, vd_per_seat = evaluate(
                game, selfish_agent_obj, coop_agent, pool, eval_num_games
            )
            loss, epsilon, buffer_size = get_dqn_metrics(coop_agent)

            print_eval_header(episode, num_episodes)
            # Custom display: show role-based wins
            seat0_wins = wins["seat0"]
            star_wins = wins["star"]
            support_wins = wins["support"]
            print(f"  \u2502  Seat 0 (opponent)   : {seat0_wins:>3}/{eval_num_games}  ({seat0_wins/eval_num_games:.1%})")
            print(f"  \u2502  Star (selfish)      : {star_wins:>3}/{eval_num_games}  ({star_wins/eval_num_games:.1%})")
            print(f"  \u2502  Support (coop)      : {support_wins:>3}/{eval_num_games}  ({support_wins/eval_num_games:.1%})")
            if loss is not None:
                print(f"  \u2502  Loss                : {loss:.6f}")
            print(f"  \u2502  Epsilon             : {epsilon:.4f}")
            print(f"  \u2502  Avg game length     : {avg_game_length:.1f} turns")
            vd_parts = [f"s{s}={vd_per_seat.get(s, 0):.1f}" for s in range(4)]
            print(f"  \u2502  Avg VD per seat     : {'  '.join(vd_parts)}")
            print(f"  \u2502  Buffer              : {buffer_size:,} / {REPLAY_MEMORY_SIZE:,}")
            border = '\u2500' * 50
            print(f"  \u2514{border}")

            # Convert role wins to seat-style dict for logger (0=opponent, 1=bots)
            logger.log_eval(
                episode, {0: seat0_wins, 1: star_wins + support_wins},
                eval_num_games, loss, epsilon,
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
    parser.add_argument('--episodes', type=int, default=None,
                        help='Override total episodes (default: 100k). Resumes from last checkpoint.')
    args = parser.parse_args()
    train(fresh=args.fresh, test=args.test, episodes=args.episodes)
