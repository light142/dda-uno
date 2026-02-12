import { GameLogic } from '../logic/GameLogic.js';
import { Deck } from './Deck.js';
import { COLORS } from '../config/constants.js';

/**
 * Local game simulator — acts as the backend for local play.
 * Owns the deck and all authoritative game state.
 * Exposes a request/response API that GameScene calls.
 */
export class LocalGameSimulator {
    constructor() {
        this.deck = null;
        this.hands = [];
        this.topCard = null;
        this.activeColor = null;
        this.isClockwise = true;
        this.playerCount = 4;
        this.deckTotal = 0;
    }

    // ── Public API ───────────────────────────────────────

    /**
     * Initialize a new game: create deck, deal cards, pick starter.
     * @param {number} playerCount
     * @param {number} cardsPerPlayer
     * @returns {{ playerHands, starterCard, deckRemaining, deckTotal }}
     */
    startGame(playerCount = 4, cardsPerPlayer = 7) {
        this.playerCount = playerCount;
        this.isClockwise = true;

        this.deck = new Deck();
        this.deck.reset();

        // Deal round-robin
        this.hands = Array.from({ length: playerCount }, () => []);
        for (let round = 0; round < cardsPerPlayer; round++) {
            for (let p = 0; p < playerCount; p++) {
                const card = this.deck.draw();
                if (card) this.hands[p].push(card);
            }
        }

        // Pick starter card (must be a number card per UNO rules)
        let starterCard = this.deck.draw();
        while (starterCard && GameLogic.isActionCard(starterCard)) {
            this.deck.cards.unshift(starterCard);
            this.deck.shuffle();
            starterCard = this.deck.draw();
        }

        this.topCard = starterCard ? { suit: starterCard.suit, value: starterCard.value } : null;
        this.activeColor = starterCard ? starterCard.suit : null;
        this.deckTotal = this.deck.remaining();

        return {
            playerHands: this.hands.map(h => h.map(c => ({ ...c }))),
            starterCard: starterCard ? { ...starterCard } : null,
            deckRemaining: this.deck.remaining(),
            deckTotal: this.deckTotal
        };
    }

    /**
     * Process a player card play.
     * @param {{ suit: string|null, value: string }} cardData
     * @param {string|null} chosenColor
     * @returns {{ valid, botMoves, newTopCard, newActiveColor, isClockwise, deckRemaining }}
     */
    playerPlay(cardData, chosenColor) {
        if (!GameLogic.isValidPlay(cardData, this.topCard, this.activeColor)) {
            return { valid: false, botMoves: [] };
        }

        // Remove card from player 0's hand
        const handIndex = this.hands[0].findIndex(
            c => c.suit === cardData.suit && c.value === cardData.value
        );
        if (handIndex === -1) {
            return { valid: false, botMoves: [] };
        }
        this.hands[0].splice(handIndex, 1);

        // Update game state
        this.topCard = { suit: cardData.suit, value: cardData.value };
        this.activeColor = GameLogic.resolveActiveColor(cardData, chosenColor);
        this.isClockwise = GameLogic.resolveDirection(this.isClockwise, cardData);

        // Generate bot moves
        const botMoves = this._generateBotMovesAfterPlay(cardData);

        return {
            valid: true,
            botMoves,
            newTopCard: { ...this.topCard },
            newActiveColor: this.activeColor,
            isClockwise: this.isClockwise,
            deckRemaining: this.deck.remaining()
        };
    }

    /**
     * Process a player pass (draw a card).
     * @returns {{ drawnCard, botMoves, newTopCard, newActiveColor, isClockwise, deckRemaining }}
     */
    playerPass() {
        const drawnCard = this.deck.draw();
        if (drawnCard) {
            this.hands[0].push({ ...drawnCard });
        }

        const nextIndex = GameLogic.getNextPlayerIndex(0, this.isClockwise);
        const botMoves = this._generateMovesUntilPlayerTurn(
            [], nextIndex, this.isClockwise, this.topCard, this.activeColor
        );

        return {
            drawnCard: drawnCard ? { ...drawnCard } : null,
            botMoves,
            newTopCard: { ...this.topCard },
            newActiveColor: this.activeColor,
            isClockwise: this.isClockwise,
            deckRemaining: this.deck.remaining()
        };
    }

    // ── Read-only Accessors ──────────────────────────────

    getDeckRemaining() { return this.deck ? this.deck.remaining() : 0; }
    getDeckTotal()     { return this.deckTotal; }
    getTopCard()       { return this.topCard ? { ...this.topCard } : null; }
    getActiveColor()   { return this.activeColor; }
    getIsClockwise()   { return this.isClockwise; }

    // ── Private ──────────────────────────────────────────

    /**
     * Generate bot moves after the player plays a card.
     * Handles the player's card effect, then loops bots.
     * @private
     */
    _generateBotMovesAfterPlay(playerCard) {
        let { isClockwise, topCard, activeColor } = this;
        const moveset = [];

        let nextIndex = GameLogic.getNextPlayerIndex(0, isClockwise);

        const playerEffect = GameLogic.getCardEffect(playerCard);

        if (playerEffect.drawCount > 0) {
            const penaltyCards = this._drawCards(playerEffect.drawCount);
            this._addToHand(nextIndex, penaltyCards);
            moveset.push({
                playerIndex: nextIndex,
                action: 'draw',
                card: null,
                drawnCards: penaltyCards,
                chosenColor: null
            });
            nextIndex = GameLogic.getNextPlayerIndex(nextIndex, isClockwise);
        } else if (playerEffect.type === 'skip') {
            nextIndex = GameLogic.getNextPlayerIndex(nextIndex, isClockwise);
        }

        return this._generateMovesUntilPlayerTurn(
            moveset, nextIndex, isClockwise, topCard, activeColor
        );
    }

    /**
     * Loop generating bot moves until turn returns to player 0.
     * Updates internal state (hands, topCard, activeColor, isClockwise) as moves are generated.
     * @private
     */
    _generateMovesUntilPlayerTurn(moveset, startIndex, isClockwise, topCard, activeColor) {
        let currentIndex = startIndex;
        let safety = 0;

        while (currentIndex !== 0 && safety < 30) {
            safety++;

            const hand = this.hands[currentIndex];
            if (!hand || hand.length === 0) {
                currentIndex = GameLogic.getNextPlayerIndex(currentIndex, isClockwise);
                continue;
            }

            const playable = GameLogic.getPlayableCards(hand, topCard, activeColor);

            if (playable.length > 0) {
                const chosen = playable[Math.floor(Math.random() * playable.length)];
                let cardChosenColor = null;

                if (GameLogic.isWildCard(chosen)) {
                    cardChosenColor = this._pickBestColor(hand, chosen);
                }

                // Remove from bot's hand
                this._removeFromHand(currentIndex, chosen);

                moveset.push({
                    playerIndex: currentIndex,
                    action: 'play',
                    card: { suit: chosen.suit, value: chosen.value },
                    drawnCards: [],
                    chosenColor: cardChosenColor
                });

                topCard = chosen;
                activeColor = GameLogic.resolveActiveColor(chosen, cardChosenColor);
                isClockwise = GameLogic.resolveDirection(isClockwise, chosen);

                const effect = GameLogic.getCardEffect(chosen);
                let nextIndex = GameLogic.getNextPlayerIndex(currentIndex, isClockwise);

                if (effect.drawCount > 0) {
                    const penalizedIndex = nextIndex;
                    const penaltyCards = this._drawCards(effect.drawCount);
                    this._addToHand(penalizedIndex, penaltyCards);
                    moveset.push({
                        playerIndex: penalizedIndex,
                        action: 'draw',
                        card: null,
                        drawnCards: penaltyCards,
                        chosenColor: null
                    });
                    nextIndex = GameLogic.getNextPlayerIndex(penalizedIndex, isClockwise);
                } else if (effect.type === 'skip') {
                    nextIndex = GameLogic.getNextPlayerIndex(nextIndex, isClockwise);
                }

                currentIndex = nextIndex;
            } else {
                const drawnCards = this._drawCards(1);
                this._addToHand(currentIndex, drawnCards);
                moveset.push({
                    playerIndex: currentIndex,
                    action: 'draw',
                    card: null,
                    drawnCards,
                    chosenColor: null
                });

                currentIndex = GameLogic.getNextPlayerIndex(currentIndex, isClockwise);
            }
        }

        // Persist state after all bot moves
        this.topCard = topCard;
        this.activeColor = activeColor;
        this.isClockwise = isClockwise;

        return moveset;
    }

    /**
     * Draw cards from the internal deck.
     * @private
     */
    _drawCards(count) {
        const cards = [];
        for (let i = 0; i < count; i++) {
            const card = this.deck.draw();
            if (card) cards.push(card);
        }
        return cards;
    }

    /**
     * Remove a card from a player's internal hand.
     * @private
     */
    _removeFromHand(playerIndex, cardData) {
        const hand = this.hands[playerIndex];
        if (!hand) return;
        const idx = hand.findIndex(c => c.suit === cardData.suit && c.value === cardData.value);
        if (idx !== -1) hand.splice(idx, 1);
    }

    /**
     * Add cards to a player's internal hand.
     * @private
     */
    _addToHand(playerIndex, cards) {
        const hand = this.hands[playerIndex];
        if (!hand) return;
        cards.forEach(c => hand.push({ ...c }));
    }

    /**
     * Pick the best color for a wild card based on hand composition.
     * @private
     */
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
