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
        this.botTier = null;
        this.botMode = null;
        this.nextMode = null;
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
        this.botTier = res.botTier || null;
        this.botMode = res.botMode || null;

        const gs = res.gameState;
        // Use original deal state if bots played before human
        const hands = res.dealHands || gs.playerHands;
        const starter = res.dealStarterCard || gs.topCard;
        const color = res.dealActiveColor ?? gs.activeColor;
        const clockwise = res.dealIsClockwise ?? gs.isClockwise;
        return {
            playerHands: hands,
            starterCard: starter,
            activeColor: color,
            isClockwise: clockwise,
            deckRemaining: gs.deckRemaining,
            deckTotal: gs.deckRemaining + (gs.discardPile?.length || 0)
                + this._countAllHands(hands),
            botTier: res.botTier,
            botMode: res.botMode,
            initialBotTurns: res.initialBotTurns || [],
            // Post-bot final state (for after bot turn animation)
            finalTopCard: gs.topCard,
            finalActiveColor: gs.activeColor,
            finalIsClockwise: gs.isClockwise,
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
            playerHands: res.gameState.playerHands,
            discardPile: res.gameState.discardPile,
            currentPlayer: res.gameState.currentPlayer,
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
            autoPlayed: res.autoPlayed || false,
            chosenColor: res.chosenColor || null,
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

    /**
     * Check if the player has an in-progress game.
     * Maps to: GET /api/games/active
     *
     * @returns {{ hasActiveGame: boolean, gameState: object|null }}
     */
    async checkActiveGame() {
        const res = await ApiClient.get('/api/games/active');
        if (res.hasActiveGame && res.gameState) {
            this.gameId = res.gameState.gameId;
            this._cachedState = res.gameState;
            this.botTier = res.botTier || null;
            this.botMode = res.botMode || null;
            this.nextMode = res.nextMode || null;
        }
        return res;
    }

    /**
     * Change the player's bot mode (adaptive or a fixed tier).
     * Maps to: PUT /api/users/me/bot-mode
     *
     * @param {string} mode - 'adaptive' or a tier name
     * @returns {{ botMode: string }}
     */
    async setBotMode(mode) {
        const res = await ApiClient.request('PUT', '/api/users/me/bot-mode', { mode });
        this.nextMode = res.botMode;
        return res;
    }

    /**
     * Fetch the player's profile (stats, botMode, etc.).
     * Maps to: GET /api/users/me
     */
    async getProfile() {
        return await ApiClient.get('/api/users/me');
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
