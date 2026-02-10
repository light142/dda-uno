import { ANIMATION, CARD_SCALE } from '../config/settings.js';
import { ASSET_DIMENSIONS } from '../config/assetDimensions.js';
/**
 * Card entity class
 * Represents a single playing card with animations and interactions
 */
export class Card extends Phaser.GameObjects.Image {
    constructor(scene, x, y, suit, value, isPlayer) {
        // Start as deck card back
        super(scene, x, y, 'card_back_deck');

        this.scene = scene;
        this.suit = suit;
        this.value = value;
        this.isPlayer = isPlayer;

        // Texture keys based on player type
        this.cardBackKey = isPlayer ? 'card_back_player' : 'card_back';
        // Wild cards have no suit — their value IS the texture key (e.g. 'wild')
        const faceKey = suit ? `${value}_${suit}` : value;
        this.cardFaceKey = isPlayer ? `${faceKey}_player` : faceKey;

        this.isFaceUp = false;
        this.isSelected = false;
        this.originalY = y;

        // Store base display dimensions (deck size when spawned)
        const deckDims = ASSET_DIMENSIONS.CARD_DECK;
        this.baseDisplayWidth = deckDims.WIDTH;
        this.baseDisplayHeight = deckDims.HEIGHT;

        // Add to scene
        scene.add.existing(this);

        this.setDepth(2);

        // Set initial display size (deck size) - fixed regardless of texture resolution
        this.setDisplaySize(this.baseDisplayWidth, this.baseDisplayHeight);

        // Store base scale for reference (calculated from fixed display size)
        this.baseScaleX = this.scaleX;
        this.baseScaleY = this.scaleY;
    }

    /**
     * Get target dimensions based on player type
     */
    getTargetDimensions(scale = 1) {
        const dims = this.isPlayer ? ASSET_DIMENSIONS.CARD_PLAYER : ASSET_DIMENSIONS.CARD;
        return {
            width: dims.WIDTH * scale,
            height: dims.HEIGHT * scale
        };
    }

    /**
     * Set card to target display size with optional scale multiplier
     */
    setTargetSize(scale = 1) {
        const { width, height } = this.getTargetDimensions(scale);
        this.setDisplaySize(width, height);
    }

    /**
     * Flip card to show face
     */
    flip(callback) {
        if (this.isFaceUp) return;

        const currentDisplayWidth = this.displayWidth;
        const currentDisplayHeight = this.displayHeight;

        // Flip animation - shrink horizontally
        this.scene.tweens.add({
            targets: this,
            scaleX: 0,
            duration: ANIMATION.FLIP_DURATION,
            ease: 'Linear',
            onComplete: () => {
                // Change to card face (use player-specific texture)
                this.setTexture(this.cardFaceKey);

                // Maintain fixed display size regardless of new texture resolution
                this.setDisplaySize(currentDisplayWidth, currentDisplayHeight);
                this.isFaceUp = true;

                // Update base scales to match fixed display size with new texture
                this.baseScaleX = this.scaleX;
                this.baseScaleY = this.scaleY;
                this.scaleX = 0; // reset so flip-back tween has range to animate

                // Flip back to show
                this.scene.tweens.add({
                    targets: this,
                    scaleX: this.baseScaleX,
                    duration: ANIMATION.FLIP_DURATION,
                    ease: 'Linear',
                    onComplete: () => {
                        // Bounce effect
                        this.bounce();
                        if (callback) callback();
                    }
                });
            }
        });
    }

    /**
     * Flip card to hide (show back)
     */
    flipToBack(callback) {
        if (!this.isFaceUp) return;

        const currentDisplayWidth = this.displayWidth;
        const currentDisplayHeight = this.displayHeight;

        this.scene.tweens.add({
            targets: this,
            scaleX: 0,
            duration: ANIMATION.FLIP_DURATION,
            ease: 'Linear',
            onComplete: () => {
                // Use player-specific card back texture
                this.setTexture(this.cardBackKey);

                // Maintain fixed display size regardless of new texture resolution
                this.setDisplaySize(currentDisplayWidth, currentDisplayHeight);
                this.isFaceUp = false;

                // Update base scales to match fixed display size with new texture
                this.baseScaleX = this.scaleX;
                this.baseScaleY = this.scaleY;
                this.scaleX = 0; // reset so flip-back tween has range to animate

                this.scene.tweens.add({
                    targets: this,
                    scaleX: this.baseScaleX,
                    duration: ANIMATION.FLIP_DURATION,
                    ease: 'Linear',
                    onComplete: callback
                });
            }
        });
    }

    /**
     * Bounce animation
     */
    bounce() {
        const scale = this.isPlayer ? CARD_SCALE.PLAYER_HIGHLIGHT : CARD_SCALE.HIGHLIGHT;
        this.scene.tweens.add({
            targets: this,
            scaleX: this.baseScaleX * scale,
            scaleY: this.baseScaleY * scale,
            duration: ANIMATION.BOUNCE_DURATION,
            yoyo: true,
            ease: 'Sine.easeInOut'
        });
    }

    /**
     * Slide card to a position
     */
    slideTo(x, y, duration, callback) {
        this.originalY = y;
        this.originalRotation = 0;
        this.rotation = Phaser.Math.DegToRad(180);

        // Switch from deck texture to player-appropriate texture
        this.setTexture(this.cardBackKey);

        // Get target dimensions
        const dims = this.getTargetDimensions(CARD_SCALE.INITIAL);

        return this.scene.tweens.add({
            targets: this,
            x: x,
            y: y,
            rotation: 0,
            displayWidth: dims.width,
            displayHeight: dims.height,
            duration: duration,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                // Store current scale as base scale for future animations
                this.baseScaleX = this.scaleX;
                this.baseScaleY = this.scaleY;
                if (callback) callback();
            }
        });
    }

    /**
     * Animate card to fan position with rotation
     */
    animateToFanPosition(x, y, rotation, delay, callback) {
        this.scene.tweens.add({
            targets: this,
            y: y - 30,
            duration: 150,
            delay: delay,
            ease: 'Quad.easeOut',
            onComplete: () => {
                this.scene.tweens.add({
                    targets: this,
                    x: x,
                    y: y,
                    rotation: rotation,
                    duration: 300,
                    ease: 'Back.easeOut',
                    onComplete: () => {
                        this.originalY = y;
                        this.originalRotation = rotation;
                        if (callback) callback();
                    }
                });
            }
        });
    }

    /**
     * Select/deselect card (moves up and straightens)
     */
    toggleSelect() {
        this.isSelected = !this.isSelected;

        const targetY = this.isSelected ? this.originalY - 50 : this.originalY;
        const targetRotation = this.isSelected ? 0 : (this.originalRotation || 0);

        this.scene.tweens.add({
            targets: this,
            y: targetY,
            rotation: targetRotation,
            duration: 200,
            ease: 'Back.easeOut'
        });

        return this.isSelected;
    }

    /**
     * Highlight card
     */
    highlight() {
        const scale = this.isPlayer ? CARD_SCALE.PLAYER_HIGHLIGHT : CARD_SCALE.HIGHLIGHT;
        this.scene.tweens.add({
            targets: this,
            scaleX: this.baseScaleX * scale,
            scaleY: this.baseScaleY * scale,
            duration: 200,
            ease: 'Power2'
        });
    }

    /**
     * Remove highlight
     */
    unhighlight() {
        const scale = this.isPlayer ? CARD_SCALE.PLAYER_INITIAL : CARD_SCALE.INITIAL;
        this.scene.tweens.add({
            targets: this,
            scaleX: this.baseScaleX * scale,
            scaleY: this.baseScaleY * scale,
            duration: 200,
            ease: 'Power2'
        });
    }

    /**
     * Make card interactive
     */
    makeInteractive(callback) {
        this.setInteractive();
        this.on('pointerdown', () => {
            if (callback) callback(this);
        });
        
        // Hover effects
        this.on('pointerover', () => {
            if (!this.isSelected) {
                this.highlight();
            }
        });
        
        this.on('pointerout', () => {
            if (!this.isSelected) {
                this.unhighlight();
            }
        });
    }

    /**
     * Add a drop shadow effect for depth perception (WebGL only)
     */
    addDropShadow(x = 1, y = 2, decay = 0.06, power = 0.8, color = 0x000000, samples = 6, intensity = 0.8) {
        if (this.preFX && !this.shadowFX) {
            this.shadowFX = this.preFX.addShadow(x, y, decay, power, color, samples, intensity);
        }
    }

    /**
     * Remove the drop shadow effect
     */
    removeDropShadow() {
        if (this.shadowFX && this.preFX) {
            this.preFX.remove(this.shadowFX);
            this.shadowFX = null;
        }
    }

    /**
     * Get card info
     */
    getInfo() {
        return {
            suit: this.suit,
            value: this.value,
            key: this.cardFaceKey,
            isFaceUp: this.isFaceUp,
            isSelected: this.isSelected
        };
    }

    /**
     * Check if card matches suit
     */
    isSuit(suit) {
        return this.suit === suit;
    }

    /**
     * Check if card matches value
     */
    isValue(value) {
        return this.value === value;
    }

    /**
     * Clean up all tweens before destroying
     */
    destroy() {
        this.scene.tweens.killTweensOf(this);
        this.removeDropShadow();
        this.removeAllListeners();
        super.destroy();
    }
}