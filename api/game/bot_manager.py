"""Manages adaptive AI agents for bot decisions.

Provides the BotManager class which loads trained models, creates AdaptiveAgent
instances, queries them for decisions, and adjusts difficulty via the
WinRateController from the shared engine package.
"""

import os
import json
import random
from typing import Optional

from .cards import Card, get_playable_cards, is_wild, pick_best_color
from .rlcard_bridge import encode_game_state, action_id_to_card

# These imports come from the shared engine/ package
from engine.agents import AdaptiveAgent
from engine.controller import WinRateController


class BotManager:
    """Manages AI bot agents and adaptive difficulty."""

    def __init__(self, model_dir: str):
        self.model_dir = model_dir
        self.strong_path = os.path.join(model_dir, "strong", "strong_agent.pt")
        self.weak_path = os.path.join(model_dir, "weak", "weak_agent.pt")
        self._controller = WinRateController()
        self._manifest = self._load_manifest()

    def models_available(self) -> bool:
        """Check if trained model files exist."""
        return os.path.exists(self.strong_path) and os.path.exists(self.weak_path)

    def create_agents(self, strength: float) -> list[AdaptiveAgent]:
        """Create 3 AdaptiveAgent instances (one per bot seat) with given strength."""
        agents = []
        for _ in range(3):
            agent = AdaptiveAgent(
                strong_model_path=self.strong_path,
                weak_model_path=self.weak_path,
                strength=strength,
            )
            agents.append(agent)
        return agents

    def get_bot_decision(self, agent: AdaptiveAgent, hand: list[Card],
                         top_card: Card, active_color: str
                         ) -> tuple[Optional[Card], Optional[str]]:
        """Query an adaptive agent for a bot decision.

        Uses the RLCard bridge to translate game state -> agent -> card.

        Returns (card_to_play, chosen_color) or (None, None) for draw.
        """
        # Build RLCard-compatible state
        state = encode_game_state(hand, top_card, active_color)

        # Query agent
        action_id, _ = agent.eval_step(state)

        # Translate action back to card
        card, chosen_color = action_id_to_card(action_id)

        if card is None:
            return None, None

        # Verify the card is actually in the bot's hand
        match = next(
            (c for c in hand if c.suit == card.suit and c.value == card.value),
            None,
        )
        if match is None:
            # Fallback: pick a random playable card or draw
            playable = get_playable_cards(hand, top_card, active_color)
            if playable:
                card = random.choice(playable)
                if is_wild(card):
                    chosen_color = pick_best_color(hand)
                else:
                    chosen_color = None
                return card, chosen_color
            return None, None

        return card, chosen_color

    def make_random_decision(self, hand: list[Card], top_card: Card,
                             active_color: str
                             ) -> tuple[Optional[Card], Optional[str]]:
        """Fallback: random bot decision when models are not available."""
        playable = get_playable_cards(hand, top_card, active_color)
        if not playable:
            return None, None
        card = random.choice(playable)
        chosen_color = pick_best_color(hand) if is_wild(card) else None
        return card, chosen_color

    def adjust_strength(self, current_win_rate: float,
                        current_strength: float) -> float:
        """Use WinRateController to compute new bot strength."""
        return self._controller.adjust(current_win_rate, current_strength)

    def get_manifest(self) -> dict:
        """Return model version info from manifest.json."""
        return self._manifest

    def _load_manifest(self) -> dict:
        """Load the model manifest file, or return a default dict."""
        manifest_path = os.path.join(self.model_dir, "manifest.json")
        if os.path.exists(manifest_path):
            with open(manifest_path) as f:
                return json.load(f)
        return {
            "version": "unknown",
            "trained_at": None,
            "notes": "No manifest found",
        }
