import { ApiClient } from './ApiClient.js';

/**
 * GameApiAdapter — replaces LocalGameSimulator with backend API calls.
 *
 * Exposes the same method signatures so GameScene can swap between
 * local simulation and server-backed play with minimal changes.
 * Methods are async (unlike LocalGameSimulator's sync API).
 */
export class GameApiAdapter {
    constructor() {
        this.gameId = null;
        this._cachedState = null;
    }

    // ── Game Lifecycle ──────────────────────────────────

    /**
     * Start a new game on the server.
     * Maps to: POST /api/games
     *
     * @returns {{ playerHands, starterCard, deckRemaining, deckTotal }}
     */
    async startGame() {
        const res = await ApiClient.post('/api/games');
        this.gameId = res.gameState.gameId;
        this._cachedState = res.gameState;

        const gs = res.gameState;
        return {
            playerHands: gs.playerHands,
            starterCard: gs.topCard,
            deckRemaining: gs.deckRemaining,
            deckTotal: gs.deckRemaining + (gs.discardPile?.length || 0)
                + this._countAllHands(gs.playerHands),
        };
    }

    /**
     * Play a card.
     * Maps to: POST /api/games/:gameId/play
     *
     * @param {{ suit, value }} cardData
     * @param {string|null} chosenColor
     */
    async playerPlay(cardData, chosenColor) {
        const body = {
            card: cardData,
            chosenColor,
        };

        const res = await ApiClient.post(`/api/games/${this.gameId}/play`, body);
        this._cachedState = res.gameState;

        return {
            valid: res.valid,
            botTurns: res.botTurns || [],
            topCard: res.gameState.topCard,
            activeColor: res.gameState.activeColor,
            isClockwise: res.gameState.isClockwise,
            deckRemaining: res.gameState.deckRemaining,
            winner: res.gameState.winner,
        };
    }

    /**
     * Draw a card and pass.
     * Maps to: POST /api/games/:gameId/pass
     */
    async playerPass() {
        const res = await ApiClient.post(`/api/games/${this.gameId}/pass`);
        this._cachedState = res.gameState;

        return {
            drawnCard: res.drawnCard,
            botTurns: res.botTurns || [],
            topCard: res.gameState.topCard,
            activeColor: res.gameState.activeColor,
            isClockwise: res.gameState.isClockwise,
            deckRemaining: res.gameState.deckRemaining,
            winner: res.gameState.winner,
        };
    }

    /**
     * Fetch current game state (for reconnection / page refresh).
     * Maps to: GET /api/games/:gameId
     */
    async getGameState() {
        const res = await ApiClient.get(`/api/games/${this.gameId}`);
        this._cachedState = res.gameState;
        return res.gameState;
    }

    // ── Cached Accessors (same interface as LocalGameSimulator) ──

    getTopCard() {
        return this._cachedState?.topCard || null;
    }

    getActiveColor() {
        return this._cachedState?.activeColor || null;
    }

    getIsClockwise() {
        return this._cachedState?.isClockwise ?? true;
    }

    // ── Private ─────────────────────────────────────────

    /**
     * Count total cards across all player hands.
     * Handles mixed array: Card[] for human, int for bots.
     * @private
     */
    _countAllHands(playerHands) {
        if (!playerHands) return 0;
        return playerHands.reduce((sum, hand) => {
            return sum + (typeof hand === 'number' ? hand : hand.length);
        }, 0);
    }
}
