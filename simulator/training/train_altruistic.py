"""Train an altruistic agent: learns to help seat 0 (the human player) win.

Custom reward: +1 when seat 0 wins, -1 when the agent itself wins,
-1 when another bot wins. Per-step shaping: -0.5 for action cards
targeting seat 0, +0.5 for action cards targeting opponents.

Opponent pool with equal weights (must help any skill level).
Includes random-vd opponent to learn with VD-using players.
After 20% of training, includes selfish checkpoints as opponents.

VD disabled for altruistic bots — they help by playing smart cards, not by passing.
Seat 0 VD cap follows opponent type.

Supports resume, --fresh, and --test flags.

Usage:
    python -m simulator.training.train_altruistic
    python -m simulator.training.train_altruistic --fresh
    python -m simulator.training.train_altruistic --test
"""

import os
import sys
import glob
import argparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from engine.game_logic.game import UnoGame
from engine.game_logic.agents import RLAgent
from engine.config.game import NUM_PLAYERS, NUM_ACTIONS, PLAYER_SEAT, BOT_SEATS
from simulator.config.training import (
    NUM_EPISODES, EVAL_EVERY, EVAL_NUM_GAMES,
    MODEL_DIR, SAVE_EVERY, ALTRUISTIC_POOL,
    SELFISH_CHECKPOINT_START, REPLAY_MEMORY_SIZE,
)
from simulator.training.opponents import (
    create_opponent_pool, pick_opponent, try_load_selfish_checkpoint,
)
from simulator.training.metrics import (
    TrainingLogger, count_voluntary_draws, get_dqn_metrics,
    print_eval_header, print_eval_metrics, patch_dqn_loss_tracking,
    reorganize_with_shaping,
)

ALTRUISTIC_DIR = os.path.join(MODEL_DIR, "altruistic")

# Per-step action card reward shaping
TARGET_HIT_PENALTY = -0.5   # penalty for skip/draw-2/wild+4 on seat 0
OPPONENT_HIT_BONUS = 0.5    # bonus for skip/draw-2/wild+4 on other bots


def altruistic_reward(payoffs, seat):
    """Custom reward: +1 if seat 0 wins, -1 otherwise."""
    winner = max(range(len(payoffs)), key=lambda i: payoffs[i])
    if winner == PLAYER_SEAT:
        return 1.0
    elif winner == seat:
        return -1.0
    else:
        return -1.0


def evaluate(game, rl_agent, pool, num_games):
    """Evaluate with mixed opponents at seat 0, DQN at seats 1-3 (VD disabled)."""
    game.set_target_seat(PLAYER_SEAT)

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
    """Main training loop for the altruistic agent."""
    num_episodes = 200 if test else NUM_EPISODES
    eval_every = 50 if test else EVAL_EVERY
    save_every = 100 if test else SAVE_EVERY
    eval_num_games = 20 if test else EVAL_NUM_GAMES

    start_episode = 1
    checkpoint_path = None

    if not fresh and not test:
        checkpoint_path, start_episode_found = find_latest_checkpoint(ALTRUISTIC_DIR)
        if checkpoint_path:
            start_episode = start_episode_found + 1

    print()
    print("=" * 60)
    print("  ALTRUISTIC AGENT TRAINING")
    print("=" * 60)
    print(f"  Target          : seat 0 (human player)")
    print(f"  Opponent pool   : {ALTRUISTIC_POOL} (equal weights)")
    print(f"  Voluntary draw  : DISABLED for bots (help by playing cards)")
    print(f"  Action shaping  : {TARGET_HIT_PENALTY} hit target, +{OPPONENT_HIT_BONUS} hit opponent")
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

    pool = create_opponent_pool(ALTRUISTIC_POOL)
    logger = TrainingLogger(MODEL_DIR, "altruistic")

    game.set_target_seat(PLAYER_SEAT)

    selfish_entry = None
    selfish_start = int(num_episodes * SELFISH_CHECKPOINT_START)
    selfish_refresh = max(1, int(num_episodes * 0.05))  # refresh every 5%

    for episode in range(start_episode, num_episodes + 1):
        # Try loading latest selfish checkpoint (starts at 20%, refreshes every 5%)
        if episode >= selfish_start and episode % selfish_refresh == 0:
            new_entry = try_load_selfish_checkpoint(MODEL_DIR)
            if new_entry:
                if selfish_entry is None:
                    print(f"  + Selfish checkpoint loaded as opponent")
                else:
                    print(f"  + Selfish checkpoint refreshed")
                selfish_entry = new_entry

        # Pick opponent
        name, seat0_agent, seat0_vd = pick_opponent(pool, selfish_entry)

        agents = [None] * NUM_PLAYERS
        agents[0] = seat0_agent
        for seat in BOT_SEATS:
            agents[seat] = rl_agent.agent

        game.set_agents(agents)
        # Seat 0 VD follows opponent type, bots have VD disabled
        game.set_max_voluntary_draws({0: seat0_vd, 1: 0, 2: 0, 3: 0})

        result = game.run_game(is_training=True)

        # Feed with per-step action card shaping + terminal game outcome
        for seat in BOT_SEATS:
            base_reward = altruistic_reward(result['payoffs'], seat)
            transitions = reorganize_with_shaping(
                result['trajectories'], seat, base_reward,
                target_seat=PLAYER_SEAT,
                target_hit_penalty=TARGET_HIT_PENALTY,
                opponent_hit_bonus=OPPONENT_HIT_BONUS,
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
                seat0_label="helped",
                bots_label="altruistic",
            )

            logger.log_eval(
                episode, wins, eval_num_games, loss, epsilon,
                avg_game_length, vd_per_seat, buffer_size,
            )

        if episode % save_every == 0:
            rl_agent.save(ALTRUISTIC_DIR, f"checkpoint_{episode}.pt")
            logger.plot()
            print(f"  \u2713 Checkpoint saved: episode {episode:,}")

    rl_agent.save(ALTRUISTIC_DIR, "altruistic_agent.pt")
    logger.plot()
    print()
    print("=" * 60)
    print(f"  TRAINING COMPLETE \u2014 saved to {ALTRUISTIC_DIR}/altruistic_agent.pt")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--fresh', action='store_true',
                        help='Start training from scratch, ignoring checkpoints')
    parser.add_argument('--test', action='store_true',
                        help='Smoke test: 200 episodes with fast eval')
    args = parser.parse_args()
    train(fresh=args.fresh, test=args.test)
