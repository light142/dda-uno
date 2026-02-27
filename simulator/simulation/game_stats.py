"""Rich per-game statistics collector for UNO simulation.

Processes game trajectories to extract detailed stats like voluntary draws,
special card usage, end-game hand sizes, offensive targeting, and game length.
Accumulates across many games and produces aggregated summaries.
"""

import math
import numbers
import statistics
from collections import defaultdict

from rlcard.games.uno.utils import ACTION_SPACE

from simulator.training.metrics import (
    DRAW_ACTION_ID, SKIP_IDS, REVERSE_IDS, DRAW2_IDS,
    WILD_IDS, WILD_DRAW4_IDS, OFFENSIVE_ACTION_IDS,
)


def _agg(values, decimals=2):
    """Aggregate a list of numbers into summary statistics."""
    if not values:
        return {"mean": None, "median": None, "min": None, "max": None, "std": None}
    m = round(statistics.mean(values), decimals)
    med = round(statistics.median(values), decimals)
    lo, hi = min(values), max(values)
    std = round(statistics.stdev(values), decimals) if len(values) > 1 else 0.0
    return {"mean": m, "median": med, "min": lo, "max": hi, "std": std}


def extract_game_stats(trajectories, winner, num_players=4):
    """Extract all stats from a single game's trajectories.

    Single-pass per seat through the trajectory. Returns a flat dict
    of per-game metrics.
    """
    stats = {"winner": winner}

    # Game length: total turns across all seats
    game_length = 0
    for s in range(num_players):
        game_length += len(trajectories[s]) // 2
    stats["game_length"] = game_length

    # Per-seat extraction
    for seat in range(num_players):
        traj = trajectories[seat]
        prefix = f"s{seat}_"

        vd_count = 0
        consec_vd = 0
        max_consec_vd = 0
        vd_hand_sizes = []
        cards_played = 0
        draws_total = 0
        skip_count = 0
        reverse_count = 0
        draw2_count = 0
        wild_count = 0
        wd4_count = 0
        targeting = defaultdict(int)  # victim_seat -> count
        # Per-card-type targeting: (victim_seat, card_type) -> count
        targeting_by_type = defaultdict(lambda: defaultdict(int))

        for i in range(0, len(traj) - 1, 2):
            state = traj[i]
            raw_action = traj[i + 1]
            if isinstance(raw_action, numbers.Integral):
                action = int(raw_action)
            elif isinstance(raw_action, str):
                action = ACTION_SPACE.get(raw_action, -1)
            else:
                continue
            if action < 0:
                continue

            legal = state['legal_actions']
            hand_size = len(state['raw_obs']['hand'])
            is_draw = (action == DRAW_ACTION_ID)
            is_voluntary = is_draw and len(legal) > 1

            if is_draw:
                draws_total += 1

            if is_voluntary:
                vd_count += 1
                consec_vd += 1
                max_consec_vd = max(max_consec_vd, consec_vd)
                vd_hand_sizes.append(hand_size)
            else:
                consec_vd = 0

            if not is_draw:
                cards_played += 1
                if action in SKIP_IDS:
                    skip_count += 1
                if action in REVERSE_IDS:
                    reverse_count += 1
                if action in DRAW2_IDS:
                    draw2_count += 1
                if action in WILD_IDS:
                    wild_count += 1
                if action in WILD_DRAW4_IDS:
                    wd4_count += 1

                # Offensive targeting (with card type breakdown)
                if action in OFFENSIVE_ACTION_IDS:
                    next_player = int(state['obs'][6, :, 0].argmax())
                    targeting[next_player] += 1
                    if action in SKIP_IDS:
                        targeting_by_type[next_player]["skip"] += 1
                    elif action in DRAW2_IDS:
                        targeting_by_type[next_player]["draw2"] += 1
                    elif action in WILD_DRAW4_IDS:
                        targeting_by_type[next_player]["wd4"] += 1

        # End hand size from final state
        end_hand = 0
        if traj:
            final_state = traj[-1] if len(traj) % 2 == 1 else traj[-2]
            if isinstance(final_state, dict) and 'raw_obs' in final_state:
                end_hand = len(final_state['raw_obs']['hand'])

        stats[prefix + "voluntary_draws"] = vd_count
        stats[prefix + "max_consec_vd"] = max_consec_vd
        stats[prefix + "vd_hand_sizes"] = vd_hand_sizes
        stats[prefix + "cards_played"] = cards_played
        stats[prefix + "draws_total"] = draws_total
        stats[prefix + "end_hand_size"] = end_hand
        stats[prefix + "skip"] = skip_count
        stats[prefix + "reverse"] = reverse_count
        stats[prefix + "draw2"] = draw2_count
        stats[prefix + "wild"] = wild_count
        stats[prefix + "wd4"] = wd4_count
        stats[prefix + "targeting"] = dict(targeting)
        stats[prefix + "targeting_by_type"] = {
            v: dict(types) for v, types in targeting_by_type.items()
        }

    # Win margin: sum of remaining cards across losers
    margin = 0
    for s in range(num_players):
        if s != winner:
            margin += stats[f"s{s}_end_hand_size"]
    stats["win_margin"] = margin

    return stats


class GameStatCollector:
    """Accumulates per-game stats across many games for aggregated summaries."""

    def __init__(self, num_players=4, seat_names=None):
        self.num_players = num_players
        self.seat_names = seat_names or [f"seat_{i}" for i in range(num_players)]
        self.num_games = 0

        # Game-level
        self._game_lengths = []
        self._win_margins = []

        # Per-seat accumulators
        self._vd_counts = {s: [] for s in range(num_players)}
        self._max_consec_vd = {s: [] for s in range(num_players)}
        self._vd_hand_sizes = {s: [] for s in range(num_players)}
        self._cards_played = {s: [] for s in range(num_players)}
        self._draws_total = {s: [] for s in range(num_players)}
        self._end_hand_sizes = {s: [] for s in range(num_players)}
        self._end_hand_when_losing = {s: [] for s in range(num_players)}
        self._skip = {s: [] for s in range(num_players)}
        self._reverse = {s: [] for s in range(num_players)}
        self._draw2 = {s: [] for s in range(num_players)}
        self._wild = {s: [] for s in range(num_players)}
        self._wd4 = {s: [] for s in range(num_players)}

        # Targeting: (attacker, victim) -> total count
        self._targeting = defaultdict(int)
        # Per-type targeting: (attacker, victim, card_type) -> total count
        self._targeting_by_type = defaultdict(int)

        # Win rate convergence: running wins per seat
        self._wins = {s: 0 for s in range(num_players)}
        self._convergence = {s: [] for s in range(num_players)}

    def record(self, trajectories, winner):
        """Record stats from a single completed game."""
        stats = extract_game_stats(trajectories, winner, self.num_players)
        self.num_games += 1

        # Track convergence
        self._wins[winner] = self._wins.get(winner, 0) + 1
        n = self.num_games
        # Sample at powers of 10, every 10% of progress, and every 100 games
        if n <= 10 or n % max(1, n // 10) == 0 or n % 100 == 0:
            for s in range(self.num_players):
                self._convergence[s].append({
                    "game": n,
                    "win_rate": round(self._wins.get(s, 0) / n, 4),
                })

        self._game_lengths.append(stats["game_length"])
        self._win_margins.append(stats["win_margin"])

        for s in range(self.num_players):
            p = f"s{s}_"
            self._vd_counts[s].append(stats[p + "voluntary_draws"])
            self._max_consec_vd[s].append(stats[p + "max_consec_vd"])
            self._vd_hand_sizes[s].extend(stats[p + "vd_hand_sizes"])
            self._cards_played[s].append(stats[p + "cards_played"])
            self._draws_total[s].append(stats[p + "draws_total"])
            self._end_hand_sizes[s].append(stats[p + "end_hand_size"])
            if s != winner:
                self._end_hand_when_losing[s].append(stats[p + "end_hand_size"])
            self._skip[s].append(stats[p + "skip"])
            self._reverse[s].append(stats[p + "reverse"])
            self._draw2[s].append(stats[p + "draw2"])
            self._wild[s].append(stats[p + "wild"])
            self._wd4[s].append(stats[p + "wd4"])

            for victim, count in stats[p + "targeting"].items():
                self._targeting[(s, victim)] += count
            for victim, types in stats[p + "targeting_by_type"].items():
                for card_type, count in types.items():
                    self._targeting_by_type[(s, victim, card_type)] += count

    def summary(self):
        """Produce aggregated summary dict."""
        n = self.num_games
        if n == 0:
            return {}

        # Compute 95% confidence intervals for win rates
        convergence = {}
        for s in range(self.num_players):
            wins = self._wins.get(s, 0)
            wr = wins / n
            # Wilson score interval (works well even near 0% or 100%)
            z = 1.96  # 95% CI
            denom = 1 + z * z / n
            center = (wr + z * z / (2 * n)) / denom
            margin = z * math.sqrt((wr * (1 - wr) + z * z / (4 * n)) / n) / denom
            convergence[str(s)] = {
                "win_rate": round(wr, 4),
                "ci_low": round(max(0, center - margin), 4),
                "ci_high": round(min(1, center + margin), 4),
                "wins": wins,
                "trajectory": self._convergence[s],
            }

        result = {
            "games": n,
            "game_length": _agg(self._game_lengths),
            "win_margin": _agg(self._win_margins),
            "convergence": convergence,
            "per_seat": {},
        }

        # Keep raw lists for plotting (not serialized to JSON)
        result["_game_lengths_raw"] = self._game_lengths
        result["_end_hand_sizes_raw"] = {s: list(self._end_hand_sizes[s]) for s in range(self.num_players)}

        for s in range(self.num_players):
            vd_total = sum(self._vd_counts[s])
            draws_total = sum(self._draws_total[s])
            cards_total = sum(self._cards_played[s])

            seat_data = {
                "label": self.seat_names[s],
                "voluntary_draws": {
                    "per_game": round(vd_total / n, 2),
                    "total": vd_total,
                    "max_per_game": max(self._vd_counts[s]) if self._vd_counts[s] else 0,
                },
                "max_consecutive_vd": {
                    "mean": round(statistics.mean(self._max_consec_vd[s]), 2) if self._max_consec_vd[s] else 0,
                    "max": max(self._max_consec_vd[s]) if self._max_consec_vd[s] else 0,
                },
                "vd_hand_size": _agg(self._vd_hand_sizes[s]) if self._vd_hand_sizes[s] else None,
                "end_hand_size": {
                    "mean": round(statistics.mean(self._end_hand_sizes[s]), 2) if self._end_hand_sizes[s] else None,
                    "when_losing": round(statistics.mean(self._end_hand_when_losing[s]), 2) if self._end_hand_when_losing[s] else None,
                },
                "cards_played": {
                    "per_game": round(cards_total / n, 2),
                    "total": cards_total,
                },
                "draws": {
                    "per_game": round(draws_total / n, 2),
                    "total": draws_total,
                },
                "special_cards": {
                    "skip": round(sum(self._skip[s]) / n, 2),
                    "reverse": round(sum(self._reverse[s]) / n, 2),
                    "draw_2": round(sum(self._draw2[s]) / n, 2),
                    "wild": round(sum(self._wild[s]) / n, 2),
                    "wild_draw_4": round(sum(self._wd4[s]) / n, 2),
                },
                "hit_by": {},
                "attacks": {},
            }

            # Targeting: who hits this seat, and who this seat hits
            for attacker in range(self.num_players):
                if attacker == s:
                    continue
                hits = self._targeting.get((attacker, s), 0)
                if hits > 0:
                    seat_data["hit_by"][f"s{attacker}"] = hits

            for victim in range(self.num_players):
                if victim == s:
                    continue
                hits = self._targeting.get((s, victim), 0)
                if hits > 0:
                    seat_data["attacks"][f"s{victim}"] = hits

            # Per-type targeting breakdown: {victim: {skip: N, draw2: N, wd4: N}}
            attacks_by_type = {}
            for victim in range(self.num_players):
                if victim == s:
                    continue
                breakdown = {}
                for ct in ("skip", "draw2", "wd4"):
                    val = self._targeting_by_type.get((s, victim, ct), 0)
                    if val > 0:
                        breakdown[ct] = val
                if breakdown:
                    attacks_by_type[f"s{victim}"] = breakdown
            seat_data["attacks_by_type"] = attacks_by_type

            result["per_seat"][str(s)] = seat_data

        return result


def print_stats_summary(summary, seat_names):
    """Print a formatted rich stats summary to console."""
    if not summary:
        return

    n = summary["games"]
    gl = summary["game_length"]
    wm = summary["win_margin"]

    print()
    print("=" * 60)
    print("  GAME STATISTICS")
    print("=" * 60)
    print(f"  Game Length      : {gl['mean']} avg  (median {gl['median']}, range {gl['min']}-{gl['max']})")
    print(f"  Win Margin       : {wm['mean']} avg remaining cards for losers")

    # Win rate convergence
    conv = summary.get("convergence", {})
    if conv:
        print()
        print("  Win Rate Convergence (95% CI):")
        for s_key, c in conv.items():
            s = int(s_key)
            label = seat_names[s] if s < len(seat_names) else f"seat_{s}"
            wr_pct = c['win_rate'] * 100
            lo_pct = c['ci_low'] * 100
            hi_pct = c['ci_high'] * 100
            traj = c.get("trajectory", [])
            # Show convergence path: first, 25%, 50%, 75%, final
            if len(traj) >= 5:
                checkpoints = [traj[0], traj[len(traj)//4], traj[len(traj)//2], traj[3*len(traj)//4], traj[-1]]
                path = " -> ".join(f"{p['win_rate']:.1%}@{p['game']}" for p in checkpoints)
            elif traj:
                path = " -> ".join(f"{p['win_rate']:.1%}@{p['game']}" for p in traj)
            else:
                path = ""
            print(f"    s{s} ({label:>16}) : {wr_pct:.1f}%  [{lo_pct:.1f}%-{hi_pct:.1f}%]  {path}")

    print("-" * 60)

    for s_key, seat in summary["per_seat"].items():
        s = int(s_key)
        label = seat["label"]
        cp = seat["cards_played"]
        dr = seat["draws"]
        vd = seat["voluntary_draws"]
        eh = seat["end_hand_size"]
        sp = seat["special_cards"]
        mcv = seat["max_consecutive_vd"]

        print(f"\n  Seat {s} ({label})")
        print(f"    Cards played   : {cp['per_game']}/game  ({cp['total']} total)")
        print(f"    Draws          : {dr['per_game']}/game  ({vd['per_game']} voluntary, max streak {mcv['max']})")

        if seat["vd_hand_size"] is not None:
            vhs = seat["vd_hand_size"]
            print(f"    VD hand size   : {vhs['mean']} avg  (median {vhs['median']}, range {vhs['min']}-{vhs['max']})")

        losing_str = f"  ({eh['when_losing']} when losing)" if eh['when_losing'] is not None else ""
        print(f"    End hand size  : {eh['mean']} avg{losing_str}")
        print(f"    Specials/game  : skip {sp['skip']}  rev {sp['reverse']}  +2 {sp['draw_2']}  wild {sp['wild']}  wd4 {sp['wild_draw_4']}")

        hit_by = seat["hit_by"]
        attacks = seat["attacks"]
        if hit_by:
            parts = [f"s{k.replace('s', '')}:{v}" for k, v in hit_by.items()]
            print(f"    Hit by         : {'  '.join(parts)}")
        if attacks:
            parts = [f"s{k.replace('s', '')}:{v}" for k, v in attacks.items()]
            print(f"    Attacks        : {'  '.join(parts)}")

    print()
    print("=" * 60)


def plot_stats(summary, seat_names, output_path):
    """Generate simulation stats plots and save as PNG.

    Subplots (2×3 grid):
        1. Win Rate Convergence — per-seat win rate over games with 95% CI
        2. End Hand Size — box plot of cards remaining at game end per seat
        3. Offensive Targeting Heatmap — attacker × victim matrix
        4. Attacks on Each Seat — grouped bars by adjacent attackers per victim
        5. Draws (Forced vs Voluntary) — grouped bars per seat
        6. Play Efficiency — cards played vs draws per game per seat

    Args:
        summary: Summary dict from GameStatCollector.summary().
        seat_names: List of agent names per seat.
        output_path: Path to save the PNG file.
    """
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        import numpy as np
    except ImportError:
        print("  WARNING: matplotlib not installed, skipping plot generation")
        return

    if not summary:
        return

    n = summary["games"]
    num_players = len(summary["per_seat"])
    colors = ['#e74c3c', '#2ecc71', '#3498db', '#e67e22']

    # Short display names for plot labels
    _SHORT = {
        "random": "rnd", "random-vd": "rndvd", "rule-v1": "rv1",
        "noob": "noob", "casual": "cas", "pro": "pro",
        "selfish": "sel", "adversarial": "adv", "altruistic": "alt",
        "hyper_altruistic": "h-alt", "hyper_adversarial": "h-adv",
    }
    short = [_SHORT.get(s, s[:4]) for s in seat_names]

    fig, axes = plt.subplots(2, 3, figsize=(18, 10))
    title_parts = []
    for s in range(num_players):
        title_parts.append(f"s{s}={short[s]}")
    fig.suptitle(f'Simulation Stats ({n} games)\n{", ".join(title_parts)}',
                 fontsize=12, fontweight='bold')

    # 1. Win Rate Convergence (skip first 1% — too noisy from low N)
    ax = axes[0, 0]
    conv = summary.get("convergence", {})
    cutoff = max(10, n // 100)
    all_wrs = []
    for s_key, c in conv.items():
        s = int(s_key)
        traj = c.get("trajectory", [])
        if traj:
            filtered = [p for p in traj if p["game"] >= cutoff]
            if filtered:
                games = [p["game"] for p in filtered]
                wrs = [p["win_rate"] * 100 for p in filtered]
                ax.plot(games, wrs, label=f's{s} {short[s]}', color=colors[s])
                all_wrs.extend(wrs)
        # Draw final CI as error bar
        final_wr = c["win_rate"] * 100
        ci_lo = c["ci_low"] * 100
        ci_hi = c["ci_high"] * 100
        ax.errorbar(n, final_wr, yerr=[[final_wr - ci_lo], [ci_hi - final_wr]],
                     fmt='o', color=colors[s], capsize=4, markersize=5)
        all_wrs.extend([ci_lo, ci_hi])
    ax.axhline(y=25, color='gray', linestyle='--', alpha=0.5, label='25% baseline')
    all_wrs.append(25)
    ax.set_xlabel('Game')
    ax.set_ylabel('Win Rate (%)')
    ax.set_title('Win Rate Convergence')
    ax.legend(fontsize=8)
    # Auto-fit y-axis to data range with padding
    if all_wrs:
        lo = max(0, min(all_wrs) - 5)
        hi = min(100, max(all_wrs) + 5)
        ax.set_ylim(lo, hi)
    ax.grid(True, alpha=0.3)

    # 2. End Hand Size Distribution (box plot per seat)
    ax = axes[0, 1]
    raw_ehs = summary.get("_end_hand_sizes_raw", {})
    if raw_ehs:
        box_data = [raw_ehs[s] for s in range(num_players)]
        bp = ax.boxplot(box_data, patch_artist=True, widths=0.5,
                        medianprops=dict(color='black', linewidth=1.5))
        for i, patch in enumerate(bp['boxes']):
            patch.set_facecolor(colors[i])
            patch.set_alpha(0.7)
        # Add mean markers
        means = [np.mean(raw_ehs[s]) for s in range(num_players)]
        ax.scatter(range(1, num_players + 1), means, color='black',
                   marker='D', s=30, zorder=5, label='Mean')
        ax.set_xticklabels([f's{i}\n{short[i]}' for i in range(num_players)], fontsize=8)
        ax.legend(fontsize=8)
    ax.set_ylabel('Cards Remaining')
    ax.set_title('End Hand Size (0 = winner)')
    ax.grid(True, alpha=0.3, axis='y')

    # 3. Offensive Targeting Heatmap
    ax = axes[0, 2]
    target_matrix = np.zeros((num_players, num_players))
    for s_key, seat in summary["per_seat"].items():
        s = int(s_key)
        for v_key, count in seat.get("attacks", {}).items():
            v = int(v_key.replace("s", ""))
            target_matrix[s][v] = count
    # Mask diagonal and zero cells
    mask = np.eye(num_players, dtype=bool) | (target_matrix == 0)
    masked = np.ma.masked_where(mask, target_matrix)
    from matplotlib.colors import LinearSegmentedColormap
    cmap = LinearSegmentedColormap.from_list('GnWtRd', ['#00FF00', '#ffffff', '#FF0000'])
    cmap.set_bad(color='#f0f0f0')
    im = ax.imshow(masked, cmap=cmap, aspect='auto', vmin=0)
    ax.set_xticks(range(num_players))
    ax.set_yticks(range(num_players))
    xlabels = [f's{i}\n{short[i]}' for i in range(num_players)]
    ylabels = [f's{i} {short[i]}' for i in range(num_players)]
    ax.set_xticklabels(xlabels, fontsize=8)
    ax.set_yticklabels(ylabels, fontsize=8)
    ax.set_xlabel('Victim')
    ax.set_ylabel('Attacker')
    ax.set_title('Offensive Targeting')
    vmax = target_matrix.max() if target_matrix.max() > 0 else 1
    for i in range(num_players):
        for j in range(num_players):
            if i == j:
                continue
            val = int(target_matrix[i][j])
            text_color = 'white' if val > vmax * 0.6 else 'black'
            ax.text(j, i, f'{val:,}', ha='center', va='center',
                    fontsize=10, color=text_color, fontweight='bold')
    fig.colorbar(im, ax=ax, shrink=0.8)

    # Bar palette: s0 coral-red, bots dark/light navy
    bar_colors = ['#ED5C52', '#2B3A67', '#5A6FA0', '#9AABC7']

    # 4. Attacks by Each Seat (grouped bars by victim)
    ax = axes[1, 0]
    # Adjacent victims per attacker (UNO clockwise/counter-clockwise)
    attacker_victims = {0: [1, 3], 1: [0, 2], 2: [1, 3], 3: [0, 2]}
    attackers = [0, 1, 2, 3]  # s0 always first
    width = 0.3
    group_centers = np.arange(len(attackers)) * 1.0
    labeled = set()
    for ai, attacker in enumerate(attackers):
        vics = attacker_victims[attacker]
        offsets = [-(width / 2 + 0.02), width / 2 + 0.02]
        for vi, victim in enumerate(vics):
            seat = summary["per_seat"][str(attacker)]
            total_hits = seat.get("attacks", {}).get(f"s{victim}", 0)
            lbl = f's{victim} {short[victim]}' if victim not in labeled else None
            labeled.add(victim)
            ax.bar(group_centers[ai] + offsets[vi], total_hits, width,
                   color=bar_colors[victim], alpha=0.85, label=lbl)
            if total_hits > 0:
                ax.text(group_centers[ai] + offsets[vi], total_hits,
                        f'{total_hits:,}', ha='center', va='bottom', fontsize=7)
    ax.set_xticks(group_centers)
    ax.set_xticklabels([f's{a}\n{short[a]}' for a in attackers], fontsize=8)
    ax.set_ylabel('Total Hits')
    ax.set_title('Attacks by Each Seat')
    ax.legend(fontsize=8)
    ax.grid(True, alpha=0.3, axis='y')

    # 5. Draws: Forced vs Voluntary (grouped by type)
    ax = axes[1, 1]
    seats_range = range(num_players)
    total_draws = [summary["per_seat"][str(s)]["draws"]["per_game"] for s in seats_range]
    vol_draws = [summary["per_seat"][str(s)]["voluntary_draws"]["per_game"] for s in seats_range]
    forced_draws = [t - v for t, v in zip(total_draws, vol_draws)]
    group_labels = ['Forced', 'Voluntary']
    group_data = [forced_draws, vol_draws]
    group_x = np.arange(len(group_labels))
    bar_width = 0.15
    offsets = (np.arange(num_players) - (num_players - 1) / 2) * (bar_width + 0.02)
    for s in seats_range:
        vals = [group_data[g][s] for g in range(len(group_labels))]
        ax.bar(group_x + offsets[s], vals, bar_width,
               color=bar_colors[s], alpha=0.85,
               label=f's{s} {short[s]}')
    ax.set_xticks(group_x)
    ax.set_xticklabels(group_labels, fontsize=9)
    ax.set_ylabel('Per Game')
    ax.set_title('Draws (Forced vs Voluntary)')
    ax.legend(fontsize=8)
    ax.grid(True, alpha=0.3, axis='y')

    # 6. Play Efficiency (cards played vs draws per game)
    ax = axes[1, 2]
    cards_played = [summary["per_seat"][str(s)]["cards_played"]["per_game"] for s in seats_range]
    total_draws_vals = [summary["per_seat"][str(s)]["draws"]["per_game"] for s in seats_range]
    x = np.arange(num_players)
    ax.bar(x - 0.15, cards_played, 0.3, label='Cards Played', color='#2ecc71', alpha=0.8)
    ax.bar(x + 0.15, total_draws_vals, 0.3, label='Draws', color='#e74c3c', alpha=0.8)
    ax.set_xticks(x)
    ax.set_xticklabels([f's{i}\n{short[i]}' for i in seats_range], fontsize=8)
    ax.set_ylabel('Per Game')
    ax.set_title('Play Efficiency')
    ax.legend(fontsize=8)
    ax.grid(True, alpha=0.3, axis='y')

    plt.tight_layout()
    plt.savefig(output_path, dpi=120)
    plt.close(fig)
    print(f"  Plot saved to {output_path}")
