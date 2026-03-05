/**
 * LoadingSpinner — miniature VisualDeck replica with overhand shuffle animation.
 *
 * Looks like the actual game deck (card_back_deck texture, same layer proportions)
 * but scaled to ~50%. Top half lifts and tilts, then drops back one by one with bounce.
 */
import { ASSET_DIMENSIONS } from '../config/assetDimensions.js';

export class LoadingSpinner {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} [x] - center X (defaults to screen center)
     * @param {number} [y] - center Y (defaults to screen center)
     * @returns {{ hide: Function }}
     */
    static show(scene, x, y) {
        x = x ?? scene.cameras.main.width / 2;
        y = y ?? scene.cameras.main.height / 2;

        // Mini deck — half-size replica of VisualDeck
        const LAYERS = 20;
        const SCALE = 0.75;
        const CARD_W = ASSET_DIMENSIONS.CARD_DECK.WIDTH * SCALE;
        const CARD_H = ASSET_DIMENSIONS.CARD_DECK.HEIGHT * SCALE;
        const LAYER_OFFSET_X = 0.1 * SCALE;
        const LAYER_OFFSET_Y = 0.7 * SCALE;

        // Overhand shuffle params
        const LIFT_Y = 16;
        const LIFT_X = 10;
        const TILT = 0.08;
        const LIFT_DUR = 220;
        const DROP_DUR = 150;
        const DROP_STAGGER = 50;

        // -- Dim overlay --
        const overlay = scene.add.rectangle(
            scene.cameras.main.width / 2, scene.cameras.main.height / 2,
            1280, 720, 0x000000, 0
        );
        overlay.setDepth(199);
        overlay.setInteractive();

        scene.tweens.add({
            targets: overlay,
            fillAlpha: 0.45,
            duration: 300,
            ease: 'Sine.easeOut',
        });

        // -- Main container --
        const wrapper = scene.add.container(x, y);
        wrapper.setDepth(200);
        wrapper.setAlpha(0);

        // -- Build mini deck stack (same structure as VisualDeck) --
        const stackLayers = [];
        for (let i = 0; i < LAYERS; i++) {
            const offsetX = i * LAYER_OFFSET_X;
            const offsetY = -i * LAYER_OFFSET_Y;
            const card = scene.add.image(offsetX, offsetY, 'card_back_deck');
            card.setDisplaySize(CARD_W, CARD_H);
            wrapper.add(card);
            stackLayers.push(card);
        }

        // Snapshot resting positions
        const originals = stackLayers.map(s => ({
            x: s.x, y: s.y, rotation: s.rotation,
        }));

        // -- "Please wait" label --
        const labelY = CARD_H / 2 + 20;
        const label = scene.add.text(0, labelY, 'Please wait', {
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            fontSize: '20px',
            fontStyle: 'bold',
            color: '#82F1ED',
        });
        label.setOrigin(0.5).setAlpha(0.55);
        wrapper.add(label);

        let dotCount = 0;
        const dotTimer = scene.time.addEvent({
            delay: 400,
            loop: true,
            callback: () => {
                dotCount = (dotCount + 1) % 4;
                label.setText('Please wait' + '.'.repeat(dotCount));
            },
        });

        // Fade in
        scene.tweens.add({
            targets: wrapper,
            alpha: 1,
            duration: 300,
            ease: 'Sine.easeOut',
        });

        let alive = true;
        const half = Math.ceil(LAYERS / 2);
        const topHalf = stackLayers.slice(half);

        // -- Looping overhand shuffle --
        const doPass = () => {
            if (!alive) return;

            // Phase 1: Lift top half up and tilt
            let lifted = 0;
            topHalf.forEach((sprite, i) => {
                const orig = originals[half + i];
                scene.tweens.add({
                    targets: sprite,
                    y: orig.y - LIFT_Y,
                    x: orig.x + LIFT_X,
                    rotation: TILT,
                    duration: LIFT_DUR,
                    ease: 'Sine.easeOut',
                    onComplete: () => {
                        lifted++;
                        if (lifted >= topHalf.length) startDrop();
                    },
                });
            });

            // Phase 2: Drop cards back one by one (no tilt on return)
            const startDrop = () => {
                if (!alive) return;

                let dropped = 0;
                topHalf.forEach((sprite, j) => {
                    const orig = originals[half + j];
                    scene.tweens.add({
                        targets: sprite,
                        y: orig.y,
                        x: orig.x,
                        rotation: 0,
                        duration: DROP_DUR,
                        delay: j * DROP_STAGGER,
                        ease: 'Bounce.easeOut',
                        onComplete: () => {
                            dropped++;
                            if (dropped >= topHalf.length) {
                                scene.time.delayedCall(300, () => doPass());
                            }
                        },
                    });
                });
            };
        };

        // Start the first pass after fade-in
        scene.time.delayedCall(350, () => doPass());

        scene._loadingSpinner = wrapper;
        scene._loadingSpinnerOverlay = overlay;
        scene._loadingSpinnerTimer = null;
        scene._loadingSpinnerDotTimer = dotTimer;

        return {
            hide: () => {
                if (!alive) return;
                alive = false;
                dotTimer.remove(false);

                stackLayers.forEach(s => scene.tweens.killTweensOf(s));

                scene.tweens.add({
                    targets: overlay,
                    fillAlpha: 0,
                    duration: 250,
                    ease: 'Sine.easeIn',
                    onComplete: () => {
                        overlay.destroy();
                        if (scene._loadingSpinnerOverlay === overlay) {
                            scene._loadingSpinnerOverlay = null;
                        }
                    },
                });

                scene.tweens.add({
                    targets: wrapper,
                    alpha: 0,
                    scaleX: 0.85,
                    scaleY: 0.85,
                    duration: 250,
                    ease: 'Sine.easeIn',
                    onComplete: () => {
                        wrapper.destroy();
                        if (scene._loadingSpinner === wrapper) {
                            scene._loadingSpinner = null;
                            scene._loadingSpinnerTimer = null;
                            scene._loadingSpinnerDotTimer = null;
                        }
                    },
                });
            },
        };
    }

    static forceClear(scene) {
        if (scene._loadingSpinnerTimer) {
            scene._loadingSpinnerTimer.remove(false);
            scene._loadingSpinnerTimer = null;
        }
        if (scene._loadingSpinnerDotTimer) {
            scene._loadingSpinnerDotTimer.remove(false);
            scene._loadingSpinnerDotTimer = null;
        }
        if (scene._loadingSpinner) {
            scene._loadingSpinner.list.forEach(child => scene.tweens.killTweensOf(child));
            scene.tweens.killTweensOf(scene._loadingSpinner);
            scene._loadingSpinner.destroy();
            scene._loadingSpinner = null;
        }
        if (scene._loadingSpinnerOverlay) {
            scene.tweens.killTweensOf(scene._loadingSpinnerOverlay);
            scene._loadingSpinnerOverlay.destroy();
            scene._loadingSpinnerOverlay = null;
        }
    }
}
