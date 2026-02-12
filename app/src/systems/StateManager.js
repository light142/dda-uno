import { Card } from '../entities/Card.js';
import { DRAG_DROP } from '../config/settings.js';
import { ASSET_DIMENSIONS } from '../config/assetDimensions.js';
import { CARD_SCALE } from '../config/settings.js';

/**
 * StateManager — handles serializing and restoring game state.
 * Restoration is fully static (instant positioning, no animations).
 */
export class StateManager {
    constructor(scene) {
        this.scene = scene;
    }

    /**
     * Serialize the current game state to a plain object.
     * @returns {Object} game state snapshot
     */
    serialize() {
        const scene = this.scene;
        const players = scene.playerManager.getAllPlayers();

        return {
            currentPlayerIndex: scene.currentPlayerIndex,
            isClockwise: scene.isClockwise,
            topCard: scene.topCard ? { ...scene.topCard } : null,
            activeColor: scene.activeColor,
            hands: players.map(player =>
                player.cards.map(card => ({
                    suit: card.suit,
                    value: card.value
                }))
            ),
            discardPile: scene.discardPile.map(card => ({
                suit: card.suit,
                value: card.value
            })),
            deckRemaining: scene.localSimulator.getDeckRemaining()
        };
    }

    /**
     * Restore the game to a given state snapshot. All positioning is STATIC.
     * @param {Object} state - game state snapshot
     */
    restore(state) {
        const scene = this.scene;

        // 1. Cancel all pending timers and tweens
        scene.cancelPendingTimers();
        scene.tweens.killAll();

        // 2. Cancel any in-progress move execution
        if (scene.moveExecutor) {
            scene.moveExecutor.cancel();
        }

        // 3. Destroy all existing cards
        scene.playerManager.getAllPlayers().forEach(player => {
            player.clearCards();
        });
        scene.discardPile.forEach(card => card.destroy());
        scene.discardPile = [];

        // 4. Set direction
        scene.isClockwise = state.isClockwise;
        scene.directionArrow.setDirection(state.isClockwise);

        // 5. Set top card and active color
        scene.topCard = state.topCard ? { ...state.topCard } : null;
        scene.activeColor = state.activeColor;
        scene.currentPlayerIndex = state.currentPlayerIndex;

        // 6. Reset visual deck
        scene.visualDeck.reset();

        // 7. Create hands for each player
        const players = scene.playerManager.getAllPlayers();
        state.hands.forEach((handData, playerIndex) => {
            const player = players[playerIndex];
            if (!player || handData.length === 0) return;

            this._createHandStatic(player, handData);
        });

        // 8. Create discard pile top card
        if (state.topCard) {
            this._createDiscardTopCard(state.topCard);
        }

        // 9. Enable/disable player turn
        if (state.currentPlayerIndex === 0) {
            scene.enablePlayerTurn();
        } else {
            scene.disablePlayerTurn();
        }
    }

    /**
     * Create all cards for a player's hand and position them statically.
     * @private
     */
    _createHandStatic(player, handData) {
        const scene = this.scene;
        const isLocal = player.isLocal;

        // Calculate final fan positions
        const tempCards = handData.map(() => null); // placeholder for count
        const positions = isLocal
            ? scene.dealer.calculateFanPositions(player, handData.length)
            : scene.dealer.calculateOtherPlayerFanPositions(player, handData.length)
                || scene.dealer.calculatePositions(player, handData.length, 37, 66);

        handData.forEach((cardData, i) => {
            const pos = positions[i];
            const card = this._createCardStatic(
                cardData, pos.x, pos.y, pos.rotation || 0, isLocal, isLocal
            );
            card.setDepth(2 + i);
            player.addCard(card);

            if (isLocal) {
                card.makeInteractive();
            }
        });
    }

    /**
     * Create a single Card entity positioned instantly (no animation).
     * @private
     */
    _createCardStatic(cardData, x, y, rotation, isPlayer, faceUp) {
        const scene = this.scene;
        const card = new Card(scene, x, y, cardData.suit, cardData.value, isPlayer);

        // Set correct texture immediately
        if (faceUp) {
            card.setTexture(card.cardFaceKey);
            card.isFaceUp = true;
        } else {
            card.setTexture(card.cardBackKey);
        }

        // Set correct display size for player type
        const dims = isPlayer ? ASSET_DIMENSIONS.CARD_PLAYER : ASSET_DIMENSIONS.CARD;
        card.setDisplaySize(dims.WIDTH * CARD_SCALE.INITIAL, dims.HEIGHT * CARD_SCALE.INITIAL);

        // Update base scales
        card.baseScaleX = card.scaleX;
        card.baseScaleY = card.scaleY;

        // Set position and rotation
        card.x = x;
        card.y = y;
        card.rotation = rotation;
        card.originalX = x;
        card.originalY = y;
        card.originalRotation = rotation;

        return card;
    }

    /**
     * Create the top discard card face-up at the play zone center.
     * @private
     */
    _createDiscardTopCard(topCardData) {
        const scene = this.scene;
        const zone = DRAG_DROP.PLAY_ZONE;

        const card = new Card(
            scene, zone.X, zone.Y,
            topCardData.suit, topCardData.value, false
        );

        // Show face immediately
        card.setTexture(card.cardFaceKey);
        card.isFaceUp = true;

        const dims = ASSET_DIMENSIONS.CARD;
        card.setDisplaySize(dims.WIDTH, dims.HEIGHT);
        card.baseScaleX = card.scaleX;
        card.baseScaleY = card.scaleY;
        card.setDepth(2);

        scene.discardPile.push(card);
    }
}
