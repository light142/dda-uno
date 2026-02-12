import { GameApiError } from '../api/ApiClient.js';

const POPUP = {
    WIDTH: 420,
    HEIGHT: 80,
    CORNER_RADIUS: 16,
    BG_COLOR: 0x1a0a0a,
    BG_ALPHA: 0.88,
    BORDER_COLOR: 0xFFD700,
    BORDER_WIDTH: 2,
    TEXT_COLOR: '#ECDABD',
    TEXT_SIZE: 18,
    HINT_COLOR: '#998877',
    HINT_SIZE: 12,
    DEPTH: 200,
    Y: 340,
    AUTO_DISMISS_MS: 3000,
    BOUNCE_IN_MS: 250,
    FADE_OUT_MS: 300,
    SHAKE_OFFSET: 6,
    SHAKE_DURATION: 50,
    SHAKE_REPEATS: 2,
};

/**
 * ErrorPopup — playful in-game error toast built with Phaser graphics.
 *
 * Usage:
 *   ErrorPopup.show(scene, "Oops! That card can't go there.");
 *
 * Appears with a bounce-in + shake, auto-dismisses after 3 seconds,
 * or can be tapped to dismiss immediately.
 */
export class ErrorPopup {
    /**
     * Show an error popup in the given Phaser scene.
     * Only one popup is shown at a time — calling again replaces the previous.
     *
     * @param {Phaser.Scene} scene
     * @param {string} message
     */
    static show(scene, message) {
        // Dismiss any existing popup
        this.dismiss(scene);

        const centerX = scene.cameras.main.width / 2;
        const centerY = POPUP.Y;

        // Container for all popup elements
        const container = scene.add.container(centerX, centerY);
        container.setDepth(POPUP.DEPTH);
        container.setAlpha(0);
        container.setScale(0);

        // Background panel
        const bg = scene.add.graphics();
        bg.fillStyle(POPUP.BG_COLOR, POPUP.BG_ALPHA);
        bg.fillRoundedRect(
            -POPUP.WIDTH / 2, -POPUP.HEIGHT / 2,
            POPUP.WIDTH, POPUP.HEIGHT,
            POPUP.CORNER_RADIUS
        );
        bg.lineStyle(POPUP.BORDER_WIDTH, POPUP.BORDER_COLOR, 0.6);
        bg.strokeRoundedRect(
            -POPUP.WIDTH / 2, -POPUP.HEIGHT / 2,
            POPUP.WIDTH, POPUP.HEIGHT,
            POPUP.CORNER_RADIUS
        );
        container.add(bg);

        // Message text
        const text = scene.add.text(0, -6, message, {
            fontFamily: 'Arial, sans-serif',
            fontSize: `${POPUP.TEXT_SIZE}px`,
            color: POPUP.TEXT_COLOR,
            align: 'center',
            wordWrap: { width: POPUP.WIDTH - 40 },
        });
        text.setOrigin(0.5);
        container.add(text);

        // Hint text
        const hint = scene.add.text(0, POPUP.HEIGHT / 2 - 18, 'tap to dismiss', {
            fontFamily: 'Arial, sans-serif',
            fontSize: `${POPUP.HINT_SIZE}px`,
            color: POPUP.HINT_COLOR,
            align: 'center',
        });
        hint.setOrigin(0.5);
        container.add(hint);

        // Make tappable (invisible hit area)
        const hitArea = scene.add.rectangle(0, 0, POPUP.WIDTH, POPUP.HEIGHT)
            .setOrigin(0.5)
            .setAlpha(0.01)
            .setInteractive({ useHandCursor: true });
        container.add(hitArea);

        hitArea.on('pointerdown', () => {
            this.dismiss(scene);
        });

        // Store reference on scene for cleanup
        scene._errorPopup = container;

        // Bounce-in animation: scale 0 → 1.1 → 1.0
        scene.tweens.add({
            targets: container,
            alpha: 1,
            scaleX: 1.1,
            scaleY: 1.1,
            duration: POPUP.BOUNCE_IN_MS * 0.6,
            ease: 'Back.easeOut',
            onComplete: () => {
                // Settle
                scene.tweens.add({
                    targets: container,
                    scaleX: 1,
                    scaleY: 1,
                    duration: POPUP.BOUNCE_IN_MS * 0.4,
                    ease: 'Sine.easeOut',
                    onComplete: () => {
                        // Shake
                        scene.tweens.add({
                            targets: container,
                            x: centerX + POPUP.SHAKE_OFFSET,
                            duration: POPUP.SHAKE_DURATION,
                            yoyo: true,
                            repeat: POPUP.SHAKE_REPEATS,
                            ease: 'Sine.easeInOut',
                            onComplete: () => {
                                container.x = centerX;
                            },
                        });
                    },
                });
            },
        });

        // Auto-dismiss timer
        scene._errorPopupTimer = scene.time.delayedCall(POPUP.AUTO_DISMISS_MS, () => {
            this.dismiss(scene);
        });
    }

    /**
     * Dismiss the current popup with a fade-out.
     * @param {Phaser.Scene} scene
     */
    static dismiss(scene) {
        if (scene._errorPopupTimer) {
            scene._errorPopupTimer.remove(false);
            scene._errorPopupTimer = null;
        }

        const container = scene._errorPopup;
        if (!container) return;
        scene._errorPopup = null;

        scene.tweens.add({
            targets: container,
            alpha: 0,
            scaleY: 0.8,
            y: container.y - 20,
            duration: POPUP.FADE_OUT_MS,
            ease: 'Sine.easeIn',
            onComplete: () => {
                container.destroy();
            },
        });
    }

    /**
     * Map a caught error to a friendly, game-themed message.
     *
     * @param {Error} err
     * @returns {string}
     */
    static friendlyMessage(err) {
        if (err instanceof GameApiError) {
            switch (err.status) {
                case 400: return "Hmm, that move didn't work. Try another card!";
                case 401: return 'Your session expired. Please log in again!';
                case 404: return 'This game session was lost. Starting fresh...';
                case 409: return 'Oops! The game state got mixed up. Refreshing...';
                default:  return 'The card gods are confused... Try again!';
            }
        }
        const msg = err?.message || '';
        if (msg.includes('fetch') || msg.includes('Failed') || msg.includes('network')) {
            return 'Lost connection to the server! Check your internet.';
        }
        return 'Something went wrong. Give it another shot!';
    }
}
