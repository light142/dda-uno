"""Shared opponent pool for training scripts.

Creates, caches, and randomly selects opponents for seat 0 (or any seat).
Each opponent carries its VD cap so training scripts can set per-seat caps.
"""

import os
import random
import glob

from engine.config.game import NUM_ACTIONS
from simulator.config.tiers import VOLUNTARY_DRAW_POLICY


def create_opponent_pool(mix_list):
    """Create opponents from a list of agent type names.

    Args:
        mix_list: List of agent type strings, e.g. ["random", "rule-v1", "noob"]

    Returns:
        List of (name, agent, vd_cap) tuples.
    """
    pool = []

    for name in mix_list:
        agent = _create_agent(name)
        vd_cap = VOLUNTARY_DRAW_POLICY.get(name, 0)
        pool.append((name, agent, vd_cap))

    return pool


def _create_agent(name):
    """Create a single agent by type name."""
    if name in ("random", "random-vd"):
        from rlcard.agents import RandomAgent
        return RandomAgent(num_actions=NUM_ACTIONS)

    elif name == "rule-v1":
        from rlcard.models import load as load_model
        return load_model('uno-rule-v1').agents[0]

    elif name in ("noob", "casual", "pro"):
        from engine.game_logic.bots import get_bot
        return get_bot(name)

    else:
        raise ValueError(f"Unknown opponent type: {name}")


def try_load_selfish_checkpoint(model_dir):
    """Try to load the latest selfish checkpoint as an opponent.

    NEVER crashes — returns None if no checkpoint or model found.

    Args:
        model_dir: Base model directory (e.g. simulator/models/).

    Returns:
        (agent, vd_cap) tuple, or None if no checkpoint available.
    """
    try:
        selfish_dir = os.path.join(model_dir, "selfish")
        if not os.path.isdir(selfish_dir):
            return None

        # Try final agent first
        final = os.path.join(selfish_dir, "selfish_agent.pt")
        if os.path.exists(final):
            path = final
        else:
            # Find latest checkpoint
            pattern = os.path.join(selfish_dir, "checkpoint_*.pt")
            files = glob.glob(pattern)
            if not files:
                return None

            best_path, best_ep = None, 0
            for f in files:
                fname = os.path.basename(f)
                try:
                    ep = int(fname.replace("checkpoint_", "").replace(".pt", ""))
                    if ep > best_ep:
                        best_ep = ep
                        best_path = f
                except ValueError:
                    continue

            if best_path is None:
                return None
            path = best_path

        from engine.game_logic.agents import RLAgent
        rl = RLAgent(model_path=path)
        vd_cap = VOLUNTARY_DRAW_POLICY.get("selfish", 5)
        return (rl.agent, vd_cap)

    except Exception as e:
        print(f"  WARNING: Failed to load selfish checkpoint: {e}")
        return None


def pick_opponent(pool, selfish_entry=None):
    """Randomly pick one opponent from the pool.

    Args:
        pool: List of (name, agent, vd_cap) tuples from create_opponent_pool().
        selfish_entry: Optional (agent, vd_cap) from try_load_selfish_checkpoint().
            If provided, adds "selfish-ckpt" as an equal-weight option.

    Returns:
        (name, agent, vd_cap) tuple.
    """
    candidates = list(pool)
    if selfish_entry is not None:
        agent, vd_cap = selfish_entry
        candidates.append(("selfish-ckpt", agent, vd_cap))

    return random.choice(candidates)
