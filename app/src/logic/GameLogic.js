import { CARD_EFFECTS, COLOR_ORDER, VALUE_ORDER } from '../config/constants.js';

/**
 * Pure UNO game rules engine — no Phaser dependencies.
 * All methods are static and operate on plain data objects.
 */
export class GameLogic {

    // ── Card Validation ──

    /**
     * Can this card be legally played on the current top card?
     * @param {{ suit: string|null, value: string }} card
     * @param {{ suit: string|null, value: string }} topCard
     * @param {string} activeColor - current active color (may differ from topCard.suit for wilds)
     * @returns {boolean}
     */
    static isValidPlay(card, topCard, activeColor) {
        // Wild and Plus4 can always be played
        if (card.value === 'wild' || card.value === 'plus4') return true;
        // Match color to active color
        if (card.suit === activeColor) return true;
        // Match value
        if (card.value === topCard.value) return true;
        return false;
    }

    /**
     * Filter a hand to only playable cards.
     * @param {Array<{ suit: string|null, value: string }>} hand
     * @param {{ suit: string|null, value: string }} topCard
     * @param {string} activeColor
     * @returns {Array}
     */
    static getPlayableCards(hand, topCard, activeColor) {
        return hand.filter(card => GameLogic.isValidPlay(card, topCard, activeColor));
    }

    /**
     * Does the player have any valid play?
     * @param {Array} hand
     * @param {Object} topCard
     * @param {string} activeColor
     * @returns {boolean}
     */
    static hasValidPlay(hand, topCard, activeColor) {
        return hand.some(card => GameLogic.isValidPlay(card, topCard, activeColor));
    }

    // ── Card Effects ──

    /**
     * Determine what effect a played card has.
     * @param {{ value: string }} card
     * @returns {{ type: string, drawCount: number }}
     */
    static getCardEffect(card) {
        return CARD_EFFECTS[card.value] || { type: 'none', drawCount: 0 };
    }

    /**
     * Get the draw penalty count for a card.
     * @param {{ value: string }} card
     * @returns {number}
     */
    static getDrawCount(card) {
        const effect = GameLogic.getCardEffect(card);
        return effect.drawCount;
    }

    // ── Turn Calculation ──

    /**
     * Get the next player index given direction.
     * Clockwise (table): 0→3→2→1→0
     * Counter-clockwise: 0→1→2→3→0
     * @param {number} fromIndex
     * @param {boolean} isClockwise
     * @param {number} playerCount
     * @returns {number}
     */
    static getNextPlayerIndex(fromIndex, isClockwise, playerCount = 4) {
        return isClockwise
            ? (fromIndex - 1 + playerCount) % playerCount
            : (fromIndex + 1) % playerCount;
    }

    /**
     * Resolve direction after a card is played.
     * Only changes if card is a reverse.
     * @param {boolean} currentIsClockwise
     * @param {{ value: string }} card
     * @returns {boolean}
     */
    static resolveDirection(currentIsClockwise, card) {
        if (card.value === 'reverse') {
            return !currentIsClockwise;
        }
        return currentIsClockwise;
    }

    /**
     * Determine the active color after a card is played.
     * For non-wild cards: returns card.suit
     * For wild/plus4: returns chosenColor
     * @param {{ suit: string|null, value: string }} card
     * @param {string|null} chosenColor
     * @returns {string}
     */
    static resolveActiveColor(card, chosenColor = null) {
        if (card.value === 'wild' || card.value === 'plus4') {
            return chosenColor || 'red'; // fallback
        }
        return card.suit;
    }

    // ── State Helpers ──

    /**
     * Check if a card is an action card (has a game effect).
     * @param {{ value: string }} card
     * @returns {boolean}
     */
    static isActionCard(card) {
        return GameLogic.getCardEffect(card).type !== 'none';
    }

    /**
     * Check if a card is a wild card.
     * @param {{ value: string }} card
     * @returns {boolean}
     */
    static isWildCard(card) {
        return card.value === 'wild' || card.value === 'plus4';
    }

    /**
     * Sort a hand for display: by color, then by value within color, wilds last.
     * @param {Array<{ suit: string|null, value: string }>} hand
     * @returns {Array} sorted copy
     */
    static sortHand(hand) {
        return [...hand].sort((a, b) => {
            const colorA = a.suit ? (COLOR_ORDER[a.suit] ?? 99) : 99;
            const colorB = b.suit ? (COLOR_ORDER[b.suit] ?? 99) : 99;
            if (colorA !== colorB) return colorA - colorB;
            const valueA = VALUE_ORDER[a.value] ?? 99;
            const valueB = VALUE_ORDER[b.value] ?? 99;
            return valueA - valueB;
        });
    }
}
