"""Training metrics logger with CSV output and optional matplotlib plots."""

import os
import csv

# Draw action ID in RLCard UNO
DRAW_ACTION_ID = 60

# Action card IDs that affect the next player (skip their turn / force draws)
# Action IDs use 15-card color groups: action_id % 15 gives card type offset
SKIP_IDS = {10, 25, 40, 55}
REVERSE_IDS = {11, 26, 41, 56}
DRAW2_IDS = {12, 27, 42, 57}
WILD_IDS = {13, 28, 43, 58}
WILD_DRAW4_IDS = {14, 29, 44, 59}
OFFENSIVE_ACTION_IDS = SKIP_IDS | DRAW2_IDS | WILD_DRAW4_IDS
ALL_SPECIAL_IDS = SKIP_IDS | REVERSE_IDS | DRAW2_IDS | WILD_IDS | WILD_DRAW4_IDS


class TrainingLogger:
    """Logs training metrics to CSV and optionally generates plots."""

    def __init__(self, model_dir, tier_name):
        """Initialize the logger.

        Args:
            model_dir: Base model directory (e.g. simulator/models/).
            tier_name: Name of the tier being trained (e.g. "selfish").
        """
        self.tier_dir = os.path.join(model_dir, tier_name)
        os.makedirs(self.tier_dir, exist_ok=True)

        self.csv_path = os.path.join(self.tier_dir, "metrics.csv")
        self.plot_path = os.path.join(self.tier_dir, "training_progress.png")
        self.tier_name = tier_name

        self._rows = []
        self._header_written = False

    def log_eval(self, episode, wins, num_games, loss, epsilon,
                 avg_game_length, vd_per_seat, buffer_size):
        """Log one evaluation result.

        Args:
            episode: Current episode number.
            wins: Dict {seat: win_count}.
            num_games: Number of eval games played.
            loss: Current DQN loss value.
            epsilon: Current epsilon value.
            avg_game_length: Average turns per game during eval.
            vd_per_seat: Dict {seat: avg_voluntary_draws} during eval.
            buffer_size: Current replay buffer size.
        """
        seat0_wr = wins.get(0, 0) / num_games if num_games > 0 else 0
        bot_wins = sum(v for k, v in wins.items() if k != 0)
        bot_wr = bot_wins / num_games if num_games > 0 else 0

        row = {
            'episode': episode,
            'seat0_wr': round(seat0_wr, 4),
            'bot_wr': round(bot_wr, 4),
            'loss': round(loss, 6) if loss is not None else '',
            'epsilon': round(epsilon, 4),
            'avg_game_length': round(avg_game_length, 1),
            'vd_s0': round(vd_per_seat.get(0, 0), 2),
            'vd_s1': round(vd_per_seat.get(1, 0), 2),
            'vd_s2': round(vd_per_seat.get(2, 0), 2),
            'vd_s3': round(vd_per_seat.get(3, 0), 2),
            'buffer_size': buffer_size,
        }

        self._rows.append(row)
        self._write_csv(row)

    def _write_csv(self, row):
        """Append a row to the CSV file."""
        fieldnames = list(row.keys())

        if not self._header_written:
            with open(self.csv_path, 'w', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                # Write all accumulated rows
                for r in self._rows:
                    writer.writerow(r)
            self._header_written = True
        else:
            with open(self.csv_path, 'a', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writerow(row)

    def plot(self):
        """Generate training progress plots. Graceful if matplotlib unavailable."""
        try:
            import matplotlib
            matplotlib.use('Agg')
            import matplotlib.pyplot as plt
        except ImportError:
            print("  WARNING: matplotlib not installed, skipping plot generation")
            return

        if len(self._rows) < 2:
            return

        episodes = [r['episode'] for r in self._rows]
        seat0_wr = [r['seat0_wr'] for r in self._rows]
        bot_wr = [r['bot_wr'] for r in self._rows]
        losses = [r['loss'] if r['loss'] != '' else None for r in self._rows]
        epsilons = [r['epsilon'] for r in self._rows]
        game_lengths = [r['avg_game_length'] for r in self._rows]

        fig, axes = plt.subplots(2, 2, figsize=(14, 10))
        fig.suptitle(f'{self.tier_name} Training Progress', fontsize=14, fontweight='bold')

        # 1. Win rates
        ax = axes[0, 0]
        ax.plot(episodes, seat0_wr, label='Seat 0 (opponent)', color='#e74c3c')
        ax.plot(episodes, bot_wr, label='Bots', color='#2ecc71')
        ax.axhline(y=0.25, color='gray', linestyle='--', alpha=0.5, label='25% baseline')
        ax.set_xlabel('Episode')
        ax.set_ylabel('Win Rate')
        ax.set_title('Win Rates')
        ax.legend()
        ax.set_ylim(0, 1)
        ax.grid(True, alpha=0.3)

        # 2. Loss curve
        ax = axes[0, 1]
        valid_losses = [(e, l) for e, l in zip(episodes, losses) if l is not None]
        if valid_losses:
            ax.plot([e for e, _ in valid_losses], [l for _, l in valid_losses], color='#3498db')
        ax.set_xlabel('Episode')
        ax.set_ylabel('Loss')
        ax.set_title('DQN Loss')
        ax.grid(True, alpha=0.3)

        # 3. Epsilon schedule
        ax = axes[1, 0]
        ax.plot(episodes, epsilons, color='#9b59b6')
        ax.set_xlabel('Episode')
        ax.set_ylabel('Epsilon')
        ax.set_title('Exploration Rate')
        ax.set_ylim(0, 1.1)
        ax.grid(True, alpha=0.3)

        # 4. Average game length
        ax = axes[1, 1]
        ax.plot(episodes, game_lengths, color='#e67e22')
        ax.set_xlabel('Episode')
        ax.set_ylabel('Turns')
        ax.set_title('Avg Game Length')
        ax.grid(True, alpha=0.3)

        plt.tight_layout()
        plt.savefig(self.plot_path, dpi=100)
        plt.close(fig)


def count_voluntary_draws(trajectories, seat):
    """Count times a player chose draw when other actions were available.

    Args:
        trajectories: Per-seat trajectory lists from game result.
        seat: Seat index to count for.

    Returns:
        Number of voluntary draws.
    """
    traj = trajectories[seat]
    count = 0
    for i in range(0, len(traj) - 1, 2):
        state = traj[i]
        action = traj[i + 1]
        if action == DRAW_ACTION_ID and len(state['legal_actions']) > 1:
            count += 1
    return count


def reorganize_with_shaping(trajectories, seat, base_reward, target_seat,
                            vd_penalty=0.0, target_hit_penalty=0.0,
                            opponent_hit_bonus=0.0):
    """Reorganize trajectory with per-step reward shaping.

    Supports voluntary draw penalties and action card shaping. The base
    game outcome reward is applied to the terminal step only. Intermediate
    steps get shaped rewards based on the action taken.

    Args:
        trajectories: Raw per-seat trajectory lists from run_game().
        seat: Seat index to extract transitions for.
        base_reward: Game outcome reward for the terminal step.
        target_seat: The seat this agent should help (e.g. PLAYER_SEAT=0).
        vd_penalty: Per-step penalty for voluntary draws (0.0 to disable).
        target_hit_penalty: Penalty for playing offensive cards on target.
        opponent_hit_bonus: Bonus for playing offensive cards on opponents.

    Returns:
        List of [state, action, reward, next_state, done] transitions.
    """
    traj = trajectories[seat]
    transitions = []

    for i in range(0, len(traj) - 2, 2):
        state = traj[i]
        action = traj[i + 1]
        next_state = traj[i + 2]
        is_terminal = (i + 2 >= len(traj) - 1)

        if is_terminal:
            reward = base_reward
        elif action == DRAW_ACTION_ID and len(state['legal_actions']) > 1:
            reward = vd_penalty
        elif action in OFFENSIVE_ACTION_IDS:
            next_player = int(state['obs'][6, :, 0].argmax())
            if next_player == target_seat:
                reward = target_hit_penalty
            else:
                reward = opponent_hit_bonus
        else:
            reward = 0.0

        transitions.append([state, action, reward, next_state, is_terminal])

    return transitions


def patch_dqn_loss_tracking(rl_agent):
    """Monkey-patch DQN agent to store loss after each training step.

    RLCard's DQNAgent computes loss in train() but only prints it —
    never stores it on the object. This patches q_estimator.update()
    to capture the return value. Call once after creating the RLAgent.
    """
    dqn = rl_agent.agent
    original_update = dqn.q_estimator.update

    def update_with_tracking(*args, **kwargs):
        loss = original_update(*args, **kwargs)
        dqn._last_loss = loss
        return loss

    dqn.q_estimator.update = update_with_tracking


def get_dqn_metrics(rl_agent):
    """Extract current metrics from a DQN agent.

    Args:
        rl_agent: RLAgent instance.

    Returns:
        (loss, epsilon, buffer_size) tuple.
    """
    dqn = rl_agent.agent
    total_t = dqn.total_t

    # Current epsilon
    if total_t < len(dqn.epsilons):
        epsilon = dqn.epsilons[total_t]
    else:
        epsilon = dqn.epsilons[-1]

    # Current loss (from patched train method)
    loss = getattr(dqn, '_last_loss', None)

    # Buffer size — RLCard Memory stores data in .memory (a list)
    if hasattr(dqn.memory, 'memory') and isinstance(dqn.memory.memory, list):
        buffer_size = len(dqn.memory.memory)
    else:
        buffer_size = 0

    return loss, epsilon, buffer_size


def print_eval_header(episode, num_episodes):
    """Print the evaluation header with progress bar."""
    pct_done = episode / num_episodes * 100
    bar_len = 20
    filled = int(bar_len * episode / num_episodes)
    bar = "\u2588" * filled + "\u2591" * (bar_len - filled)
    print()
    print(f"  \u250c\u2500 Episode {episode:,}/{num_episodes:,} ({pct_done:.0f}%) [{bar}]")


def print_eval_metrics(wins, num_games, loss, epsilon, avg_game_length,
                       vd_per_seat, buffer_size, buffer_max,
                       seat0_label="opponent", bots_label="bots"):
    """Print formatted evaluation metrics."""
    seat0_wins = wins.get(0, 0)
    bot_wins = sum(v for k, v in wins.items() if k != 0)

    print(f"  \u2502  Seat 0 ({seat0_label:12s}) : {seat0_wins:>3}/{num_games}  ({seat0_wins/num_games:.1%})")
    print(f"  \u2502  Bots ({bots_label:14s}) : {bot_wins:>3}/{num_games}  ({bot_wins/num_games:.1%})")

    if loss is not None:
        print(f"  \u2502  Loss                : {loss:.6f}")
    print(f"  \u2502  Epsilon             : {epsilon:.4f}")
    print(f"  \u2502  Avg game length     : {avg_game_length:.1f} turns")

    vd_parts = [f"s{s}={vd_per_seat.get(s, 0):.1f}" for s in range(4)]
    print(f"  \u2502  Avg VD per seat     : {'  '.join(vd_parts)}")

    print(f"  \u2502  Buffer              : {buffer_size:,} / {buffer_max:,}")
    print(f"  \u2514{'\u2500' * 50}")
