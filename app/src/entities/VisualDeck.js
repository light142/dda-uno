import { DECK_VISUAL, DECK_OFFSET, SHUFFLE } from '../config/settings.js';
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
        this.visualRemaining = 0;
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

                // Decrement visual counter and update layers
                if (this.scene.deckTotal) {
                    this.visualRemaining = Math.max(0, this.visualRemaining - 1);
                    this.updateLayers(this.visualRemaining, this.scene.deckTotal);
                }

                // Call callback to continue with card dealing
                if (callback) callback();
            }
        });
    }

    /**
     * Update visible layers based on remaining cards in the deck.
     * @param {number} remaining - cards left in the deck
     * @param {number} total - total cards the deck started with
     */
    updateLayers(remaining, total) {
        const max = DECK_VISUAL.STACK_LAYERS;
        const min = DECK_VISUAL.MIN_LAYERS;

        let visible;
        if (remaining <= min) {
            visible = remaining;
        } else {
            const ratio = Math.max(0, Math.min(1, remaining / total));
            visible = Math.max(min, Math.round(max * ratio));
        }

        this.stackLayers.forEach((layer, i) => {
            layer.setVisible(i < visible);
        });
    }

    /**
     * Casino-style interleaving shuffle animation.
     * Phase 1 (Cut & Fan) — deck splits into two fanned-out halves
     * Phase 2 (Interleave) — cards arc from each pile into a center stack, alternating
     * Phase 3 (Square up)  — stack snaps back to original layout
     * Repeats with increasing speed, ends with a bounce flourish.
     * @param {Function} callback - Called when all shuffle passes complete
     */
    shuffle(callback) {
        const half = Math.floor(this.stackLayers.length / 2);
        const leftHalf = this.stackLayers.slice(0, half);
        const rightHalf = this.stackLayers.slice(half);
        const totalCards = this.stackLayers.length;

        // Snapshot each sprite's resting state
        const originals = this.stackLayers.map(s => ({
            x: s.x, y: s.y, rotation: s.rotation,
            scaleX: s.scaleX, scaleY: s.scaleY
        }));

        let pass = 0;

        const doPass = () => {
            // --- Final flourish: square-up bounce ---
            if (pass >= SHUFFLE.PASSES) {
                let bounced = 0;
                this.stackLayers.forEach((sprite, i) => {
                    const orig = originals[i];
                    this.scene.tweens.add({
                        targets: sprite,
                        scaleX: orig.scaleX * SHUFFLE.BOUNCE_SCALE,
                        scaleY: orig.scaleY * SHUFFLE.BOUNCE_SCALE,
                        y: orig.y - 6,
                        duration: SHUFFLE.BOUNCE_DURATION,
                        ease: 'Quad.easeOut',
                        yoyo: true,
                        onComplete: () => {
                            bounced++;
                            if (bounced >= totalCards && callback) callback();
                        }
                    });
                });
                return;
            }

            // Each pass accelerates
            const speed = 1 - pass * SHUFFLE.SPEED_RAMP;
            const cutDur = Math.round(SHUFFLE.CUT_DURATION * speed);
            const interleaveDur = Math.round(SHUFFLE.INTERLEAVE_DURATION * speed);
            const interleaveStagger = Math.round(SHUFFLE.INTERLEAVE_STAGGER * speed);
            const squareUpDur = Math.round(SHUFFLE.SQUARE_UP_DURATION * speed);
            const pause = Math.round(SHUFFLE.PAUSE_BETWEEN * speed);

            // ---- Phase 1: Cut & Fan ----
            // Each half slides apart AND fans out (cards spread with Y spacing + rotation)
            let cutDone = 0;
            const onCutDone = () => {
                cutDone++;
                if (cutDone < totalCards) return;
                this.scene.time.delayedCall(pause, startInterleave);
            };

            leftHalf.forEach((sprite, i) => {
                const orig = originals[i];
                this.scene.tweens.add({
                    targets: sprite,
                    x: orig.x - SHUFFLE.SPLIT_DISTANCE,
                    y: orig.y - SHUFFLE.CUT_LIFT - i * SHUFFLE.FAN_SPREAD,
                    rotation: -SHUFFLE.FAN_ROTATION * (i + 1),
                    duration: cutDur,
                    ease: 'Power2',
                    onComplete: onCutDone
                });
            });

            rightHalf.forEach((sprite, i) => {
                const orig = originals[half + i];
                this.scene.tweens.add({
                    targets: sprite,
                    x: orig.x + SHUFFLE.SPLIT_DISTANCE,
                    y: orig.y - SHUFFLE.CUT_LIFT - i * SHUFFLE.FAN_SPREAD,
                    rotation: SHUFFLE.FAN_ROTATION * (i + 1),
                    duration: cutDur,
                    ease: 'Power2',
                    onComplete: onCutDone
                });
            });

            // ---- Phase 2: Interleave (two-step: lift then place) ----
            const startInterleave = () => {
                // Alternating order: L[0], R[0], L[1], R[1], L[2], R[2]
                const interleaveOrder = [];
                for (let j = 0; j < half; j++) {
                    interleaveOrder.push(leftHalf[j]);
                    if (j < rightHalf.length) {
                        interleaveOrder.push(rightHalf[j]);
                    }
                }

                let interleaveDone = 0;
                interleaveOrder.forEach((sprite, order) => {
                    const targetY = -order * DECK_VISUAL.LAYER_OFFSET_Y;
                    const totalDelay = order * interleaveStagger;

                    // Step 1: Lift card off the pile
                    this.scene.tweens.add({
                        targets: sprite,
                        y: sprite.y - SHUFFLE.INTERLEAVE_ARC,
                        rotation: 0,
                        duration: Math.round(interleaveDur * 0.4),
                        delay: totalDelay,
                        ease: 'Quad.easeOut',
                        onStart: () => {
                            this.bringToTop(sprite);
                        },
                        onComplete: () => {
                            // Step 2: Arc down to center stack
                            this.scene.tweens.add({
                                targets: sprite,
                                x: 0,
                                y: targetY,
                                duration: Math.round(interleaveDur * 0.6),
                                ease: 'Quad.easeIn',
                                onComplete: () => {
                                    interleaveDone++;
                                    if (interleaveDone >= totalCards) {
                                        this.scene.time.delayedCall(pause, startSquareUp);
                                    }
                                }
                            });
                        }
                    });
                });
            };

            // ---- Phase 3: Square Up ----
            const startSquareUp = () => {
                // Restore original rendering order
                this.stackLayers.forEach(sprite => this.bringToTop(sprite));

                let squareDone = 0;
                this.stackLayers.forEach((sprite, i) => {
                    const orig = originals[i];
                    this.scene.tweens.add({
                        targets: sprite,
                        x: orig.x,
                        y: orig.y,
                        rotation: orig.rotation,
                        duration: squareUpDur,
                        ease: 'Back.easeOut',
                        onComplete: () => {
                            squareDone++;
                            if (squareDone >= totalCards) {
                                pass++;
                                this.scene.time.delayedCall(40, doPass);
                            }
                        }
                    });
                });
            };
        };

        doPass();
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
        // Sync visual counter with actual deck
        if (this.scene.deckTotal) {
            this.visualRemaining = this.scene.deckTotal;
        }
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
