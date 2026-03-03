"""Backward-compatible re-exports from engine.game_logic.tiers.

All tier config and the TierModelPool have moved to engine/ so they
can be shared with the API layer. This shim preserves all existing
simulator imports.
"""

import os

# Re-export everything the simulator currently imports
from engine.game_logic.tiers.tier_config import (
    TIER_ORDER,
    TIER_NAMES,
    AGENT_CHOICES,
    AGENT_ALIASES,
    TARGET_SEAT_TIERS,
    FIXED_TARGET,
    DQN_TIERS,
    MIXABLE_TIERS,
    VOLUNTARY_DRAW_POLICY,
    TIER_SEAT_OVERRIDE,
    resolve_agent_name,
)
from engine.game_logic.tiers.tier_pool import (
    TierModelPool,
    resolve_model_path,
)
from engine.game_logic.tiers.tier_controller import AdaptiveTierController

# Keep MODEL_DIR pointing to simulator/models/ for backward compat
MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")
