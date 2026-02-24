"""Translation layer between human-readable card objects and RLCard's format.

RLCard action mapping (61 actions):
    - Actions  0-14: red   (0-9, skip, reverse, draw_2, wild, wild_draw_4)
    - Actions 15-29: green (same pattern)
    - Actions 30-44: blue  (same pattern)
    - Actions 45-59: yellow (same pattern)
    - Action 60: draw

Format translations:
    - Colors: red<->r, green<->g, blue<->b, yellow<->y
    - Values: block<->skip, plus2<->draw_2, plus4<->wild_draw_4
    - Wilds: In RLCard, wild cards encode chosen color (r-wild = play wild choosing red)
"""

import numpy as np
from collections import OrderedDict
from typing import Optional

from .cards import Card, is_wild, is_valid_play

# ---------------------------------------------------------------------------
# Color mappings
# ---------------------------------------------------------------------------
COLOR_TO_RL = {"red": "r", "green": "g", "blue": "b", "yellow": "y"}
RL_TO_COLOR = {v: k for k, v in COLOR_TO_RL.items()}

# ---------------------------------------------------------------------------
# Value mappings (API <-> RLCard)
# ---------------------------------------------------------------------------
VALUE_TO_RL = {
    "block": "skip",
    "plus2": "draw_2",
    "plus4": "wild_draw_4",
    "wild": "wild",
    "reverse": "reverse",
}
RL_TO_VALUE = {v: k for k, v in VALUE_TO_RL.items()}

# Numbers don't change
for _i in range(10):
    VALUE_TO_RL[str(_i)] = str(_i)
    RL_TO_VALUE[str(_i)] = str(_i)

# ---------------------------------------------------------------------------
# RLCard action space: 4 colors x 15 values + 1 draw = 61
# ---------------------------------------------------------------------------
COLORS = ["r", "g", "b", "y"]
TRAITS = [
    "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
    "skip", "reverse", "draw_2", "wild", "wild_draw_4",
]

# Build action ID tables
ACTION_LIST: list[str] = []
ACTION_TO_ID: dict[str, int] = {}

for _ci, _color in enumerate(COLORS):
    for _ti, _trait in enumerate(TRAITS):
        _action_str = f"{_color}-{_trait}"
        _action_id = _ci * 15 + _ti
        ACTION_LIST.append(_action_str)
        ACTION_TO_ID[_action_str] = _action_id

ACTION_LIST.append("draw")
ACTION_TO_ID["draw"] = 60


# ---------------------------------------------------------------------------
# Public conversion functions
# ---------------------------------------------------------------------------

def action_id_to_card(action_id: int) -> tuple[Optional[Card], Optional[str]]:
    """Convert RLCard action ID to (Card, chosen_color).

    Returns (None, None) for draw action (ID 60).
    For wild cards, the color in the action IS the chosen color.
    """
    if action_id == 60:
        return None, None

    action_str = ACTION_LIST[action_id]
    rl_color, rl_trait = action_str.split("-", 1)

    api_value = RL_TO_VALUE.get(rl_trait, rl_trait)
    api_color = RL_TO_COLOR.get(rl_color)
    chosen_color = None

    if rl_trait in ("wild", "wild_draw_4"):
        chosen_color = api_color   # The color in the action = chosen color
        api_color = None           # Wild cards have null suit

    return Card(suit=api_color, value=api_value), chosen_color


def card_to_action_id(card: Card, chosen_color: Optional[str] = None) -> int:
    """Convert a card play to RLCard action ID.

    For wild cards, *chosen_color* determines the action ID.
    """
    rl_value = VALUE_TO_RL.get(card.value, card.value)

    if is_wild(card):
        if not chosen_color:
            chosen_color = "red"
        rl_color = COLOR_TO_RL.get(chosen_color, "r")
    else:
        rl_color = COLOR_TO_RL.get(card.suit, "r")

    action_str = f"{rl_color}-{rl_value}"
    return ACTION_TO_ID.get(action_str, 60)


def encode_game_state(hand: list[Card], top_card: Card, active_color: str) -> dict:
    """Build RLCard-compatible state dict for querying trained agents.

    Returns dict with 'obs' (numpy [4,4,15]) and 'legal_actions' (OrderedDict).
    """
    obs = np.zeros((4, 4, 15), dtype=np.float32)

    # Plane 0-2: encode hand
    card_counts: dict[str, int] = {}
    for card in hand:
        key = _card_to_rl_key(card)
        if key:
            card_counts[key] = card_counts.get(key, 0) + 1

    for key, count in card_counts.items():
        rl_color, rl_trait = key.split("-", 1)
        ci = COLORS.index(rl_color)
        ti = TRAITS.index(rl_trait)

        if rl_trait in ("wild", "wild_draw_4"):
            # Wild cards: mark all color slots
            for c in range(4):
                obs[min(count, 2)][c][ti] = 1
        else:
            obs[min(count, 2)][ci][ti] = 1

    # Plane 3: encode target (top card)
    target_key = _card_to_rl_key(top_card, active_color)
    if target_key:
        rl_color, rl_trait = target_key.split("-", 1)
        ci = COLORS.index(rl_color)
        ti = TRAITS.index(rl_trait)
        obs[3][ci][ti] = 1

    # Legal actions
    legal = get_legal_action_ids(hand, top_card, active_color)

    return {
        "obs": obs,
        "legal_actions": legal,
        "raw_obs": {},
        "raw_legal_actions": [],
    }


def get_legal_action_ids(hand: list[Card], top_card: Card,
                         active_color: str) -> OrderedDict:
    """Compute legal RLCard action IDs from game state."""
    legal: OrderedDict[int, None] = OrderedDict()
    has_playable = False

    for card in hand:
        if is_valid_play(card, top_card, active_color):
            has_playable = True
            if is_wild(card):
                # Wild cards generate 4 actions (one per color choice)
                for color in ["red", "green", "blue", "yellow"]:
                    aid = card_to_action_id(card, color)
                    legal[aid] = None
            else:
                aid = card_to_action_id(card)
                legal[aid] = None

    if not has_playable:
        legal[60] = None  # Draw

    return legal


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _card_to_rl_key(card: Card, active_color: str = None) -> Optional[str]:
    """Convert card to RLCard key string like 'r-0', 'g-skip', etc."""
    rl_value = VALUE_TO_RL.get(card.value, card.value)

    if is_wild(card):
        color = active_color or (card.suit if card.suit else "red")
        rl_color = COLOR_TO_RL.get(color, "r")
    else:
        if card.suit is None:
            return None
        rl_color = COLOR_TO_RL.get(card.suit)
        if not rl_color:
            return None

    return f"{rl_color}-{rl_value}"
