"""Server-side UNO game engine -- Python port of LocalGameSimulator.js.

Manages full game state: hands, deck, discard pile, direction, colors.
Bot decisions come from an external callback (*bot_decision_fn*) allowing
pluggable AI (random, trained RL agents, etc).
"""

import random
from typing import Optional, Callable

from .cards import (
    Card, Deck, is_wild, is_action_card, is_valid_play,
    get_playable_cards, resolve_active_color, resolve_direction,
    get_next_player, pick_best_color,
)


class UnoGameEngine:
    """Server-side UNO game engine using human-readable card objects.

    Manages full game state: hands, deck, discard pile, direction, colors.
    Bot decisions come from an external callback (bot_decision_fn) allowing
    pluggable AI (random, trained RL agents, etc).
    """

    def __init__(self):
        self.hands: list[list[Card]] = []
        self.deck: Optional[Deck] = None
        self.discard_pile: list[Card] = []
        self.top_card: Optional[Card] = None
        self.active_color: Optional[str] = None
        self.is_clockwise: bool = True
        self.current_player: int = 0
        self.num_players: int = 4
        self.turns: int = 0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def start_game(self) -> dict:
        """Deal cards and set up initial game state.

        Returns dict with:
            - player_hands: [Card[] for human, int for bots]
            - starter_card: Card
            - active_color: str
            - deck_remaining: int
        """
        self.is_clockwise = True
        self.discard_pile = []
        self.turns = 0
        self.deck = Deck()

        # Deal 7 cards to each player
        self.hands = [[] for _ in range(self.num_players)]
        for _ in range(7):
            for p in range(self.num_players):
                card = self.deck.draw()
                if card:
                    self.hands[p].append(card)

        # Pick starter card (skip plus4 and action cards)
        starter = self.deck.draw()
        while starter and (starter.value == "plus4" or is_action_card(starter)):
            self.deck.cards.insert(0, starter)
            self.deck.shuffle()
            starter = self.deck.draw()

        self.top_card = starter
        if starter:
            self.discard_pile.append(Card(suit=starter.suit, value=starter.value))

        if starter and is_wild(starter):
            self.active_color = pick_best_color(self.hands[0])
        else:
            self.active_color = starter.suit if starter else None

        self.current_player = 0

        return {
            "player_hands": self._external_hands(),
            "starter_card": self.top_card.to_dict() if self.top_card else None,
            "active_color": self.active_color,
            "deck_remaining": self.deck.remaining(),
            "deck_total": self._total_card_count(),
        }

    def play_card(self, player_index: int, card_data: dict,
                  chosen_color: Optional[str] = None) -> dict:
        """Human plays a card.

        Args:
            player_index: Which player (0 for human).
            card_data: {"suit": str|None, "value": str}.
            chosen_color: Color choice for wild cards.

        Returns dict with valid, top_card, active_color, is_clockwise, etc.
        """
        card = Card.from_dict(card_data)

        # Validate the play
        if not is_valid_play(card, self.top_card, self.active_color):
            return {"valid": False}

        # Find and remove card from hand
        hand = self.hands[player_index]
        idx = next((i for i, c in enumerate(hand)
                     if c.suit == card.suit and c.value == card.value), None)
        if idx is None:
            return {"valid": False}

        hand.pop(idx)
        self.turns += 1

        # Update game state
        self.top_card = Card(suit=card.suit, value=card.value)
        self.discard_pile.append(Card(suit=card.suit, value=card.value))
        self.active_color = resolve_active_color(card, chosen_color)
        self.is_clockwise = resolve_direction(self.is_clockwise, card)

        # Check for winner
        if len(hand) == 0:
            return {
                "valid": True,
                "winner": player_index,
                "top_card": self.top_card.to_dict(),
                "active_color": self.active_color,
                "is_clockwise": self.is_clockwise,
                "deck_remaining": self.deck.remaining(),
            }

        # Advance to next player, applying card effects
        next_idx = get_next_player(player_index, self.is_clockwise)

        # Apply card effects
        penalty_draw = None
        if card.value == "block":
            next_idx = get_next_player(next_idx, self.is_clockwise)
        elif card.value == "plus2":
            drawn = self._draw_cards_for_player(next_idx, 2)
            penalty_draw = {"playerIndex": next_idx, "drawnCards": drawn if next_idx == 0 else len(drawn)}
            next_idx = get_next_player(next_idx, self.is_clockwise)
        elif card.value == "plus4":
            drawn = self._draw_cards_for_player(next_idx, 4)
            penalty_draw = {"playerIndex": next_idx, "drawnCards": drawn if next_idx == 0 else len(drawn)}
            next_idx = get_next_player(next_idx, self.is_clockwise)

        self.current_player = next_idx

        return {
            "valid": True,
            "winner": None,
            "top_card": self.top_card.to_dict(),
            "active_color": self.active_color,
            "is_clockwise": self.is_clockwise,
            "deck_remaining": self.deck.remaining(),
            "next_player": self.current_player,
            "penalty_draw": penalty_draw,
        }

    def draw_card(self, player_index: int) -> Optional[dict]:
        """Player draws a card from the deck."""
        if self.deck.remaining() == 0:
            self._reshuffle_discard()

        card = self.deck.draw()
        if card:
            self.hands[player_index].append(Card(suit=card.suit, value=card.value))
            if self.deck.remaining() == 0:
                self._reshuffle_discard()
            return card.to_dict()
        return None

    def pass_turn(self, player_index: int) -> dict:
        """Player draws a card and passes.

        Returns dict with drawn_card, next_player.
        """
        drawn = self.draw_card(player_index)
        self.turns += 1
        next_idx = get_next_player(player_index, self.is_clockwise)
        self.current_player = next_idx

        return {
            "drawn_card": drawn,
            "next_player": self.current_player,
            "deck_remaining": self.deck.remaining(),
        }

    def run_bot_turns(self, bot_decision_fn: Callable) -> list[dict]:
        """Run all bot turns until it is the human's turn (player 0) or game ends.

        Args:
            bot_decision_fn: Callable(player_index, hand, top_card, active_color)
                -> (card_to_play: Card|None, chosen_color: str|None)
                If card_to_play is None, bot draws.

        Returns list of bot turn dicts.
        """
        bot_turns = []
        safety = 0

        while self.current_player != 0 and safety < 30:
            safety += 1
            p = self.current_player
            hand = self.hands[p]

            if not hand or len(hand) == 0:
                self.current_player = get_next_player(p, self.is_clockwise)
                continue

            # Ask the bot for a decision
            card, chosen_color = bot_decision_fn(p, hand, self.top_card, self.active_color)

            if card is not None:
                # Bot plays a card
                idx = next((i for i, c in enumerate(hand)
                            if c.suit == card.suit and c.value == card.value), None)
                if idx is not None:
                    hand.pop(idx)
                    self.turns += 1

                    played = Card(suit=card.suit, value=card.value)
                    self.top_card = played
                    self.discard_pile.append(Card(suit=played.suit, value=played.value))
                    self.active_color = resolve_active_color(played, chosen_color)
                    self.is_clockwise = resolve_direction(self.is_clockwise, played)

                    bot_turns.append({
                        "playerIndex": p,
                        "action": "play",
                        "card": played.to_dict(),
                        "drawnCards": 0,
                        "chosenColor": chosen_color,
                    })

                    # Apply card effects
                    next_idx = get_next_player(p, self.is_clockwise)

                    if played.value == "block":
                        next_idx = get_next_player(next_idx, self.is_clockwise)
                    elif played.value == "plus2":
                        drawn_cards = self._draw_cards_for_player(next_idx, 2)
                        bot_turns.append({
                            "playerIndex": next_idx,
                            "action": "draw",
                            "card": None,
                            # Human (0) gets actual cards; bots get count only
                            "drawnCards": drawn_cards if next_idx == 0 else len(drawn_cards),
                            "chosenColor": None,
                        })
                        next_idx = get_next_player(next_idx, self.is_clockwise)
                    elif played.value == "plus4":
                        drawn_cards = self._draw_cards_for_player(next_idx, 4)
                        bot_turns.append({
                            "playerIndex": next_idx,
                            "action": "draw",
                            "card": None,
                            # Human (0) gets actual cards; bots get count only
                            "drawnCards": drawn_cards if next_idx == 0 else len(drawn_cards),
                            "chosenColor": None,
                        })
                        next_idx = get_next_player(next_idx, self.is_clockwise)

                    # Check if bot won
                    if len(hand) == 0:
                        self.current_player = next_idx
                        return bot_turns

                    self.current_player = next_idx
                else:
                    # Card not in hand (should not happen), draw instead
                    self._bot_draw(p, bot_turns)
            else:
                # Bot draws
                self._bot_draw(p, bot_turns)

        return bot_turns

    def get_winner(self) -> Optional[int]:
        """Check if any player has 0 cards (winner)."""
        for i, hand in enumerate(self.hands):
            if len(hand) == 0:
                return i
        return None

    def get_state_for_player(self, player_index: int = 0) -> dict:
        """Build game state visible to a specific player.

        Human (player 0) sees full card arrays. Bots show card counts only.
        """
        return {
            "playerHands": self._external_hands(),
            "topCard": self.top_card.to_dict() if self.top_card else None,
            "discardPile": [c.to_dict() for c in self.discard_pile],
            "activeColor": self.active_color,
            "isClockwise": self.is_clockwise,
            "deckRemaining": self.deck.remaining(),
            "winner": self.get_winner(),
        }

    def serialize(self) -> dict:
        """Serialize full engine state for DB persistence."""
        return {
            "hands": [[c.to_dict() for c in h] for h in self.hands],
            "deck": [c.to_dict() for c in self.deck.cards] if self.deck else [],
            "discard_pile": [c.to_dict() for c in self.discard_pile],
            "top_card": self.top_card.to_dict() if self.top_card else None,
            "active_color": self.active_color,
            "is_clockwise": self.is_clockwise,
            "current_player": self.current_player,
            "turns": self.turns,
        }

    @classmethod
    def deserialize(cls, data: dict) -> "UnoGameEngine":
        """Restore engine state from serialized data."""
        engine = cls()
        engine.hands = [[Card.from_dict(c) for c in h] for h in data["hands"]]
        engine.deck = Deck.__new__(Deck)
        engine.deck.cards = [Card.from_dict(c) for c in data["deck"]]
        engine.discard_pile = [Card.from_dict(c) for c in data["discard_pile"]]
        engine.top_card = Card.from_dict(data["top_card"]) if data["top_card"] else None
        engine.active_color = data["active_color"]
        engine.is_clockwise = data["is_clockwise"]
        engine.current_player = data["current_player"]
        engine.turns = data["turns"]
        return engine

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _external_hands(self) -> list:
        """Human gets full cards, bots get counts."""
        return [
            [c.to_dict() for c in hand] if i == 0 else len(hand)
            for i, hand in enumerate(self.hands)
        ]

    def _total_card_count(self) -> int:
        """Return total cards across all hands, deck, and discard pile."""
        hand_cards = sum(len(h) for h in self.hands)
        return self.deck.remaining() + len(self.discard_pile) + hand_cards

    def _draw_cards_for_player(self, player_index: int, count: int) -> list:
        """Draw N cards for a player.

        Returns list of drawn card dicts (for revealing to the player)."""
        drawn = []
        for _ in range(count):
            if self.deck.remaining() == 0:
                if not self._reshuffle_discard():
                    break
            card = self.deck.draw()
            if card:
                new_card = Card(suit=card.suit, value=card.value)
                self.hands[player_index].append(new_card)
                drawn.append(new_card.to_dict())
                if self.deck.remaining() == 0:
                    self._reshuffle_discard()
        return drawn

    def _reshuffle_discard(self) -> bool:
        """Reshuffle discard pile into deck. Keep top card."""
        if len(self.discard_pile) <= 1:
            return False
        top = self.discard_pile[-1]
        cards_for_deck = self.discard_pile[:-1]
        self.deck.cards.extend([Card(suit=c.suit, value=c.value) for c in cards_for_deck])
        self.discard_pile = [top]
        self.deck.shuffle()
        return True

    def _bot_draw(self, player_index: int, bot_turns: list):
        """Bot draws a card and passes."""
        self.draw_card(player_index)
        self.turns += 1
        bot_turns.append({
            "playerIndex": player_index,
            "action": "draw",
            "card": None,
            "drawnCards": 1,
            "chosenColor": None,
        })
        self.current_player = get_next_player(player_index, self.is_clockwise)
