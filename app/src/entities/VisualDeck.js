import { DECK_VISUAL, DECK_OFFSET } from '../config/settings.js';
import { ASSET_DIMENSIONS } from '../config/assetDimensions.js';

/**
 * VisualDeck - Visual representation of the card deck
 * Shows a stacked deck of cards with animations when cards are dealt
 */
export class VisualDeck extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);

        this.scene = scene;
        this.stackLayers = [];
        this.rotation = Phaser.Math.DegToRad(DECK_VISUAL.ROTATION);

        // Add this container to the scene
        scene.add.existing(this);

        // Create the stacked deck visual
        this.create();

        // Set depth so deck is below dealt cards but above background
        this.setDepth(1);
    }

    /**
     * Get the default center deck position
     * @returns {Object} {x, y} position for deck
     */
    static getDefaultPosition() {
        return { x: DECK_OFFSET.X, y: DECK_OFFSET.Y };
    }

    /**
     * Create the stacked deck visual with multiple card back sprites
     */
    create() {
        // Create card back sprites with offsets to create 3D stack effect
        for (let i = 0; i < DECK_VISUAL.STACK_LAYERS; i++) {
            const offsetX = i * DECK_VISUAL.LAYER_OFFSET_X;
            const offsetY = -i * DECK_VISUAL.LAYER_OFFSET_Y; // Negative for upward stack

            // Create card back sprite with fixed display size
            const cardSprite = this.scene.add.image(offsetX, offsetY, 'card_back_deck');
            cardSprite.setDisplaySize(ASSET_DIMENSIONS.CARD_DECK.WIDTH, ASSET_DIMENSIONS.CARD_DECK.HEIGHT);

            // Add to container
            this.add(cardSprite);

            // Store reference
            this.stackLayers.push(cardSprite);
        }
    }

    /**
     * Animate a card popping from the deck
     * @param {Function} callback - Called when animation completes
     */
    dealCardAnimation(callback) {
        // Get the top layer (last in array)
        const topCard = this.stackLayers[this.stackLayers.length - 1];

        if (!topCard) {
            // No cards left to animate
            if (callback) callback();
            return;
        }

        // Store original position
        const originalY = topCard.y;

        // Animate: lift up and fade out
        this.scene.tweens.add({
            targets: topCard,
            y: originalY - DECK_VISUAL.CARD_POP_LIFT,
            alpha: 0,
            duration: DECK_VISUAL.CARD_POP_DURATION,
            ease: 'Power2',
            onComplete: () => {
                // Reset the card for next deal
                topCard.y = originalY;
                topCard.alpha = 1;

                // Call callback to continue with card dealing
                if (callback) callback();
            }
        });
    }

    /**
     * Reset the deck visual to full state
     * Called when a new deal starts
     */
    reset() {
        // Reset all layers to visible
        this.stackLayers.forEach(layer => {
            layer.setAlpha(1);
            layer.setVisible(true);
        });
    }

    /**
     * Get the world position of the top of the deck
     * Used for spawning cards from the correct position
     */
    getTopCardPosition() {
        const topCard = this.stackLayers[this.stackLayers.length - 1];
        if (topCard) {
            const worldPos = topCard.getWorldTransformMatrix();
            return {
                x: worldPos.tx,
                y: worldPos.ty
            };
        }
        // Fallback to container position
        return { x: this.x, y: this.y };
    }

    /**
     * Reposition the deck with optional animation
     * @param {number} x - New X position
     * @param {number} y - New Y position
     * @param {boolean} animate - Whether to animate the transition
     * @param {Function} callback - Called when repositioning completes
     */
    repositionDeck(x, y, animate = true, callback) {
        if (animate) {
            this.scene.tweens.add({
                targets: this,
                x: x,
                y: y,
                duration: 500,
                ease: 'Power2',
                onComplete: () => {
                    if (callback) callback();
                }
            });
        } else {
            this.x = x;
            this.y = y;
            if (callback) callback();
        }
    }

    /**
     * Get deck's current position
     * @returns {Object} {x, y} position
     */
    getDeckPosition() {
        return { x: this.x, y: this.y };
    }
}
