"""Tier registry and model pool for multi-tier simulation.

Centralizes tier metadata, model resolution, and cached agent loading
so both the raw simulator and future controller share a single source.
"""

import os
import glob
from typing import Optional

from engine.config.game import NUM_ACTIONS

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")

# All valid agent choices for any seat
AGENT_CHOICES = [
    "random", "random-vd", "rule-v1",
    "noob", "casual", "pro",
    "selfish", "adversarial", "altruistic", "hyper_altruistic", "hyper_adversarial",
]

# Backward compatibility alias
AGENT_ALIASES = {
    "cooperative": "hyper_adversarial",
}

# Tiers that need target_seat set (plane 11) to function properly
TARGET_SEAT_TIERS = {"altruistic", "hyper_altruistic", "hyper_adversarial"}

# Fixed target seat per agent type (None = uses --target from CLI)
# altruistic/hyper_altruistic always help seat 0 (trained that way)
# hyper_adversarial needs explicit --target (trained with rotating targets)
FIXED_TARGET = {
    "altruistic": 0,
    "hyper_altruistic": 0,
}

# DQN-trained tiers (need model loading)
DQN_TIERS = {"selfish", "adversarial", "altruistic", "hyper_altruistic", "hyper_adversarial"}

# Tiers that can be mixed per-seat in combo enumeration
MIXABLE_TIERS = ["selfish", "adversarial", "random", "altruistic", "hyper_altruistic"]

# Max voluntary draws per agent type (matches training policy)
# 0 = draw disabled, N = capped at N per game
VOLUNTARY_DRAW_POLICY = {
    "selfish": 0,           # trained with draw disabled (play cards to win)
    "adversarial": 0,       # trained with draw disabled (play cards aggressively)
    "hyper_altruistic": 5,  # trained with cap 5
    "altruistic": 0,        # trained with draw disabled
    "hyper_adversarial": 0, # support role, draw disabled
    "random": 0,            # baseline, no voluntary draw
    "random-vd": 5,         # random with voluntary draw enabled
    "rule-v1": 0,           # heuristic, always draws first if enabled (broken)
    "noob": 10,             # clueless player, draws randomly
    "casual": 0,            # heuristic bot, filters draw out
    "pro": 0,               # heuristic bot, filters draw out
}


def resolve_agent_name(name: str) -> str:
    """Resolve agent name, handling backward compatibility aliases."""
    return AGENT_ALIASES.get(name, name)


def resolve_model_path(tier_name: str) -> Optional[str]:
    """Find the best available model file for a DQN tier.

    Priority: {tier}_agent.pt > latest checkpoint_*.pt
    Returns None if no model file found.
    """
    base_dir = os.path.join(MODEL_DIR, tier_name)
    if not os.path.isdir(base_dir):
        return None

    # Try preferred filename first
    preferred = os.path.join(base_dir, f"{tier_name}_agent.pt")
    if os.path.exists(preferred):
        return preferred

    # Fallback: latest checkpoint
    pattern = os.path.join(base_dir, "checkpoint_*.pt")
    files = glob.glob(pattern)
    if not files:
        return None

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

    return best_path


class TierModelPool:
    """Loads agent models once at startup, provides cached agents on demand.

    Handles DQN tiers (loaded from disk), RandomAgent, rule-v1,
    and heuristic bots (noob/casual/pro).
    """

    def __init__(self, tiers_to_load: list = None):
        """Load the requested tiers.

        Args:
            tiers_to_load: List of tier/agent names to load. If None,
                loads all DQN tiers + random + rule-v1.
        """
        self._agents = {}

        if tiers_to_load is None:
            tiers_to_load = list(AGENT_CHOICES)

        for name in set(tiers_to_load):
            resolved = resolve_agent_name(name)
            self._load(resolved)

    def _load(self, name: str):
        """Load a single agent by name."""
        if name in self._agents:
            return

        if name in ("random", "random-vd"):
            from rlcard.agents import RandomAgent
            self._agents[name] = RandomAgent(num_actions=NUM_ACTIONS)

        elif name == "rule-v1":
            from rlcard.models import load as load_model
            self._agents[name] = load_model('uno-rule-v1').agents[0]

        elif name in ("noob", "casual", "pro"):
            from engine.game_logic.bots import get_bot
            self._agents[name] = get_bot(name)

        elif name in DQN_TIERS:
            path = resolve_model_path(name)
            if path is None:
                from rlcard.agents import RandomAgent
                print(f"  WARNING: No model found for '{name}', using random fallback")
                self._agents[name] = RandomAgent(num_actions=NUM_ACTIONS)
            else:
                from engine.game_logic.agents import RLAgent
                print(f"  Loading {name}: {os.path.basename(path)}")
                rl = RLAgent(model_path=path)
                self._agents[name] = rl.agent  # The underlying DQNAgent

        else:
            raise ValueError(
                f"Unknown agent '{name}'. Choices: {AGENT_CHOICES}"
            )

    def get(self, name: str):
        """Get the cached agent for a tier/agent name."""
        resolved = resolve_agent_name(name)
        if resolved not in self._agents:
            raise KeyError(f"Agent '{resolved}' not loaded. Loaded: {list(self._agents.keys())}")
        return self._agents[resolved]
