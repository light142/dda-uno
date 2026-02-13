import { GameLogic } from '../logic/GameLogic.js';
import { Deck } from './Deck.js';
import { COLORS } from '../config/constants.js';

/**
 * LocalGameSimulator — local mock server for offline play.
 *
 * Returns the **exact same response shapes** as the real backend API
 * (matching GameApiAdapter's method signatures), so GameScene uses
 * a single code path regardless of backend.
 *
 * Configurable via `LocalGameSimulator.SCENARIOS` to simulate
 * different server behaviors (UNO penalties, delays, errors, etc.).
 */
export class LocalGameSimulator {

    /**
     * Configurable server-like behavior for testing and local play.
     * Modify these at runtime to simulate different scenarios.
     */
    static SCENARIOS = {
        /** Artificial response delay in ms (simulates network latency) */
        SIMULATE_DELAY: 0,
        /** Throw a network-like error on the next call */
        FORCE_NETWORK_ERROR: false,
        /** Reject the next play as invalid (even if legal) */
        FORCE_INVALID_PLAY: false,
    };

    constructor() {
        this.deck = null;
        this.hands = [];          // Full card arrays for ALL players (internal state)
        this.topCard = null;
        this.activeColor = null;
        this.isClockwise = true;
        this.playerCount = 4;
        this.discardPile = [];
        this.gameId = null;
        this._reshuffledThisTurn = false;
        this._deckCountAfterReshuffle = 0;
    }

    // ── Server Simulation ────────────────────────────────

    /** @private Simulate network delay and error scenarios */
    async _simulateServer() {
        if (LocalGameSimulator.SCENARIOS.FORCE_NETWORK_ERROR) {
            LocalGameSimulator.SCENARIOS.FORCE_NETWORK_ERROR = false; // one-shot
            throw new Error('Network request failed');
        }
        if (LocalGameSimulator.SCENARIOS.SIMULATE_DELAY > 0) {
            await new Promise(r => setTimeout(r, LocalGameSimulator.SCENARIOS.SIMULATE_DELAY));
        }
    }

    // ── Public API (same signatures as GameApiAdapter) ───

    /**
     * Start a new game.
     * Matches: POST /api/games → GameApiAdapter.startGame()
     *
     * @returns {{ playerHands: [Card[], int, int, int], starterCard, deckRemaining, deckTotal }}
     */
    async startGame() {
        await this._simulateServer();

        this.isClockwise = true;
        this.discardPile = [];
        this.gameId = `local-${Date.now()}`;

        this.deck = new Deck();
        this.deck.reset();

        // Deal 7 cards to 4 players (round-robin)
        this.hands = Array.from({ length: 4 }, () => []);
        for (let round = 0; round < 7; round++) {
            for (let p = 0; p < 4; p++) {
                const card = this.deck.draw();
                if (card) this.hands[p].push(card);
            }
        }

        // Starter card: skip plus4 and action cards, allow wild
        let starterCard = this.deck.draw();
        while (starterCard && (starterCard.value === 'plus4' || GameLogic.isActionCard(starterCard))) {
            this.deck.cards.unshift(starterCard);
            this.deck.shuffle();
            starterCard = this.deck.draw();
        }

        this.topCard = starterCard ? { suit: starterCard.suit, value: starterCard.value } : null;
        if (starterCard && GameLogic.isWildCard(starterCard)) {
            // Wild starter: first player (human) decides color based on hand
            this.activeColor = this._pickBestColor(this.hands[0], starterCard);
        } else {
            this.activeColor = starterCard ? starterCard.suit : null;
        }
        if (starterCard) this.discardPile.push({ ...this.topCard });

        return {
            playerHands: this._externalHands(),
            starterCard: this.topCard ? { ...this.topCard } : null,
            activeColor: this.activeColor,
            deckRemaining: this.deck.remaining(),
            deckTotal: this._totalCardCount(),
        };
    }

    /**
     * Human plays a card.
     * Matches: POST /api/games/:gameId/play → GameApiAdapter.playerPlay()
     *
     * @param {{ suit, value }} cardData
     * @param {string|null} chosenColor
     */
    async playerPlay(cardData, chosenColor) {
        await this._simulateServer();
        this._reshuffledThisTurn = false;
        this._deckCountAfterReshuffle = 0;

        // Forced rejection scenario
        if (LocalGameSimulator.SCENARIOS.FORCE_INVALID_PLAY) {
            LocalGameSimulator.SCENARIOS.FORCE_INVALID_PLAY = false; // one-shot
            return this._invalidPlayResponse();
        }

        // Validate the play
        if (!GameLogic.isValidPlay(cardData, this.topCard, this.activeColor)) {
            return this._invalidPlayResponse();
        }

        const handIndex = this.hands[0].findIndex(
            c => c.suit === cardData.suit && c.value === cardData.value
        );
        if (handIndex === -1) {
            return this._invalidPlayResponse();
        }
        this.hands[0].splice(handIndex, 1);

        // Update game state
        this.topCard = { suit: cardData.suit, value: cardData.value };
        this.discardPile.push({ ...this.topCard });
        this.activeColor = GameLogic.resolveActiveColor(cardData, chosenColor);
        this.isClockwise = GameLogic.resolveDirection(this.isClockwise, cardData);

        // Check human win (played last card)
        if (this.hands[0].length === 0) {
            return {
                valid: true,
                botTurns: [],
                topCard: { ...this.topCard },
                activeColor: this.activeColor,
                isClockwise: this.isClockwise,
                deckRemaining: this.deck.remaining(),
                winner: 0,
                reshuffled: false,
            };
        }

        // Generate bot turns (processes effects of the human's card first)
        const botTurns = this._generateBotTurnsAfterPlay(cardData);
        const winner = this._findWinner();

        return {
            valid: true,
            botTurns,
            topCard: { ...this.topCard },
            activeColor: this.activeColor,
            isClockwise: this.isClockwise,
            deckRemaining: this.deck.remaining(),
            winner,
            reshuffled: this._reshuffledThisTurn,
            deckCountAfterReshuffle: this._deckCountAfterReshuffle,
        };
    }

    /**
     * Human draws a card and passes.
     * Matches: POST /api/games/:gameId/pass → GameApiAdapter.playerPass()
     */
    async playerPass() {
        await this._simulateServer();
        this._reshuffledThisTurn = false;
        this._deckCountAfterReshuffle = 0;

        const drawnCard = this.deck.draw();
        if (drawnCard) {
            this.hands[0].push({ ...drawnCard });
        }

        // Reshuffle immediately when draw pile becomes empty
        if (this.deck.remaining() === 0) {
            this._reshuffleDiscardIntoDeck();
        }

        const nextIndex = GameLogic.getNextPlayerIndex(0, this.isClockwise);
        const botTurns = this._generateBotTurnsUntilPlayer(nextIndex);
        const winner = this._findWinner();

        return {
            drawnCard: drawnCard ? { ...drawnCard } : null,
            botTurns,
            topCard: { ...this.topCard },
            activeColor: this.activeColor,
            isClockwise: this.isClockwise,
            deckRemaining: this.deck.remaining(),
            winner,
            reshuffled: this._reshuffledThisTurn,
            deckCountAfterReshuffle: this._deckCountAfterReshuffle,
        };
    }

    /**
     * Get current game state (for reconnection).
     * Matches: GET /api/games/:gameId → GameApiAdapter.getGameState()
     */
    async getGameState() {
        return this._buildGameState();
    }

    // ── Cached Accessors (same interface as GameApiAdapter) ──

    getTopCard() { return this.topCard ? { ...this.topCard } : null; }
    getActiveColor() { return this.activeColor; }
    getIsClockwise() { return this.isClockwise; }

    // ── Private: Response Builders ───────────────────────

    /** @private Build an invalid-play response */
    _invalidPlayResponse() {
        return {
            valid: false,
            botTurns: [],
            topCard: { ...this.topCard },
            activeColor: this.activeColor,
            isClockwise: this.isClockwise,
            deckRemaining: this.deck.remaining(),
            winner: null,
        };
    }

    /**
     * @private External hand representation:
     * Human (index 0) gets full card array, bots get card count.
     */
    _externalHands() {
        return this.hands.map((hand, i) =>
            i === 0 ? hand.map(c => ({ ...c })) : hand.length
        );
    }

    /** @private Count all cards in the game (hands + deck + discard) */
    _totalCardCount() {
        const handCards = this.hands.reduce((sum, h) => sum + h.length, 0);
        return this.deck.remaining() + this.discardPile.length + handCards;
    }

    /** @private Build full gameState object (matching API design) */
    _buildGameState() {
        return {
            gameId: this.gameId,
            status: this._findWinner() !== null ? 'finished' : 'in_progress',
            playerHands: this._externalHands(),
            topCard: this.topCard ? { ...this.topCard } : null,
            discardPile: this.discardPile.map(c => ({ ...c })),
            activeColor: this.activeColor,
            isClockwise: this.isClockwise,
            deckRemaining: this.deck.remaining(),
            winner: this._findWinner(),
        };
    }

    // ── Private: Game Logic ─────────────────────────────

    /** @private Find a player with 0 cards (winner), or null */
    _findWinner() {
        for (let i = 0; i < this.hands.length; i++) {
            if (this.hands[i].length === 0) return i;
        }
        return null;
    }

    // ── Private: Bot Turn Generation ────────────────────

    /**
     * Generate bot turns after the human plays a card.
     * Applies the human's card effects first, then loops bots.
     * @private
     */
    _generateBotTurnsAfterPlay(playerCard) {
        const botTurns = [];
        let nextIndex = GameLogic.getNextPlayerIndex(0, this.isClockwise);
        const effect = GameLogic.getCardEffect(playerCard);

        // Apply the human's card effect
        if (effect.drawCount > 0) {
            this._applyDrawPenalty(nextIndex, effect.drawCount, botTurns);
            nextIndex = GameLogic.getNextPlayerIndex(nextIndex, this.isClockwise);
        } else if (effect.type === 'skip') {
            nextIndex = GameLogic.getNextPlayerIndex(nextIndex, this.isClockwise);
        }

        return this._generateBotTurnsUntilPlayer(nextIndex, botTurns);
    }

    /**
     * Loop generating bot turns until it's the human's turn again.
     * Updates internal state as moves are generated.
     * @private
     */
    _generateBotTurnsUntilPlayer(startIndex, botTurns = []) {
        let currentIndex = startIndex;
        let safety = 0;

        while (currentIndex !== 0 && safety < 30) {
            safety++;

            const hand = this.hands[currentIndex];
            if (!hand || hand.length === 0) {
                currentIndex = GameLogic.getNextPlayerIndex(currentIndex, this.isClockwise);
                continue;
            }

            const playable = GameLogic.getPlayableCards(hand, this.topCard, this.activeColor);

            if (playable.length > 0) {
                // Bot plays a card
                const chosen = playable[Math.floor(Math.random() * playable.length)];
                let cardChosenColor = null;

                if (GameLogic.isWildCard(chosen)) {
                    cardChosenColor = this._pickBestColor(hand, chosen);
                }

                this._removeFromHand(currentIndex, chosen);
                const playedCard = { suit: chosen.suit, value: chosen.value };

                this.topCard = playedCard;
                this.discardPile.push({ ...playedCard });
                this.activeColor = GameLogic.resolveActiveColor(chosen, cardChosenColor);
                this.isClockwise = GameLogic.resolveDirection(this.isClockwise, chosen);

                botTurns.push({
                    playerIndex: currentIndex,
                    action: 'play',
                    card: playedCard,
                    drawnCards: 0,
                    chosenColor: cardChosenColor,
                });

                // Apply card effects
                const cardEffect = GameLogic.getCardEffect(chosen);
                let nextIdx = GameLogic.getNextPlayerIndex(currentIndex, this.isClockwise);

                if (cardEffect.drawCount > 0) {
                    this._applyDrawPenalty(nextIdx, cardEffect.drawCount, botTurns);
                    nextIdx = GameLogic.getNextPlayerIndex(nextIdx, this.isClockwise);
                } else if (cardEffect.type === 'skip') {
                    nextIdx = GameLogic.getNextPlayerIndex(nextIdx, this.isClockwise);
                }

                // Check if bot won
                if (this.hands[currentIndex].length === 0) break;

                currentIndex = nextIdx;
            } else {
                // Bot draws a card
                const drawnCards = this._drawCards(1);
                this._addToHand(currentIndex, drawnCards);

                botTurns.push({
                    playerIndex: currentIndex,
                    action: 'draw',
                    card: null,
                    drawnCards: 1,
                    chosenColor: null,
                });

                currentIndex = GameLogic.getNextPlayerIndex(currentIndex, this.isClockwise);
            }
        }

        return botTurns;
    }

    /**
     * Apply a draw penalty to a player and record the move.
     * Human gets actual card data; bots get card count.
     * @private
     */
    _applyDrawPenalty(playerIndex, count, botTurns) {
        const penaltyCards = this._drawCards(count);
        this._addToHand(playerIndex, penaltyCards);

        botTurns.push({
            playerIndex,
            action: 'draw',
            card: null,
            // Human sees actual cards; bots just get count
            drawnCards: playerIndex === 0
                ? penaltyCards.map(c => ({ ...c }))
                : count,
            chosenColor: null,
        });
    }

    // ── Private: Deck & Hand Helpers ────────────────────

    /** @private Draw N cards from the deck, reshuffling discard pile when it empties */
    _drawCards(count) {
        const cards = [];
        for (let i = 0; i < count; i++) {
            if (this.deck.remaining() === 0 && !this._reshuffleDiscardIntoDeck()) {
                break; // Deck and discard both exhausted
            }
            const card = this.deck.draw();
            if (card) {
                cards.push(card);
                // Reshuffle immediately when draw pile becomes empty
                if (this.deck.remaining() === 0) {
                    this._reshuffleDiscardIntoDeck();
                }
            }
        }
        return cards;
    }

    /**
     * Reshuffle the discard pile into the deck.
     * Keeps the top discard card in place as the new discard pile.
     * @private
     * @returns {boolean} true if reshuffled, false if not enough cards
     */
    _reshuffleDiscardIntoDeck() {
        if (this.discardPile.length <= 1) return false;

        const topCard = this.discardPile[this.discardPile.length - 1];
        const cardsForDeck = this.discardPile.slice(0, -1);

        this.deck.cards.push(...cardsForDeck);
        this.discardPile = [topCard];
        this.deck.shuffle();

        this._reshuffledThisTurn = true;
        this._deckCountAfterReshuffle = this.deck.remaining();
        return true;
    }

    /** @private Remove a specific card from a player's hand */
    _removeFromHand(playerIndex, cardData) {
        const hand = this.hands[playerIndex];
        if (!hand) return;
        const idx = hand.findIndex(c => c.suit === cardData.suit && c.value === cardData.value);
        if (idx !== -1) hand.splice(idx, 1);
    }

    /** @private Add cards to a player's hand */
    _addToHand(playerIndex, cards) {
        const hand = this.hands[playerIndex];
        if (!hand) return;
        cards.forEach(c => hand.push({ ...c }));
    }

    /** @private Pick the best wild card color based on hand composition */
    _pickBestColor(hand, wildCard) {
        const counts = { red: 0, blue: 0, green: 0, yellow: 0 };
        hand.forEach(c => {
            if (c !== wildCard && c.suit && counts[c.suit] !== undefined) {
                counts[c.suit]++;
            }
        });
        let best = COLORS[0];
        let bestCount = -1;
        for (const [color, count] of Object.entries(counts)) {
            if (count > bestCount) {
                bestCount = count;
                best = color;
            }
        }
        return best;
    }
}
