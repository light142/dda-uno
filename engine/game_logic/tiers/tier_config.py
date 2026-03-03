"""Tier metadata constants shared by engine, API, and simulator.

Centralizes tier ordering, agent choices, target seat rules, voluntary
draw policies, and other constants used across the project.
"""

# The 6 adaptive tiers, ordered from hardest to easiest for seat 0 (player)
TIER_ORDER = [
    "hyper_adversarial",  # Hardest: cooperative bots targeting seat 0
    "adversarial",        # Hard: team play against seat 0
    "selfish",            # Neutral: each bot plays to win individually
    "random",             # Easy: random legal actions
    "altruistic",         # Easier: trained to help seat 0 win
    "hyper_altruistic",   # Easiest: strongly trained to help seat 0 win
]

# Convenience set
TIER_NAMES = set(TIER_ORDER)

# All valid agent choices for any seat (tiers + heuristic bots + special)
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

# Fixed target seat per agent type
# altruistic/hyper_altruistic always help seat 0 (trained that way)
# hyper_adversarial always helps seat 2 (trained with selfish star at seat 2)
FIXED_TARGET = {
    "altruistic": 0,
    "hyper_altruistic": 0,
    "hyper_adversarial": 2,
}

# DQN-trained tiers (need model loading)
DQN_TIERS = {"selfish", "adversarial", "altruistic", "hyper_altruistic", "hyper_adversarial"}

# Tiers that can be mixed per-seat in combo enumeration
MIXABLE_TIERS = ["selfish", "adversarial", "random", "altruistic", "hyper_altruistic"]

# Max voluntary draws per agent type (matches training policy)
# 0 = draw disabled, N = capped at N per game
VOLUNTARY_DRAW_POLICY = {
    "selfish": 0,
    "adversarial": 0,
    "hyper_altruistic": 5,
    "altruistic": 0,
    "hyper_adversarial": 0,
    "random": 0,
    "random-vd": 5,
    "rule-v1": 0,
    "noob": 10,
    "casual": 0,
    "pro": 0,
}


def resolve_agent_name(name: str) -> str:
    """Resolve agent name, handling backward compatibility aliases."""
    return AGENT_ALIASES.get(name, name)
