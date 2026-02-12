import { COLOR_PICKER } from '../config/settings.js';
import { ASSET_DIMENSIONS } from '../config/assetDimensions.js';

const COLORS_LIST = ['red', 'blue', 'green', 'yellow'];

/**
 * ColorPicker — overlay UI for choosing a wild card color.
 *
 * Usage:
 *   const color = await ColorPicker.show(scene, 'wild');
 *   // color is 'red' | 'blue' | 'green' | 'yellow'
 */
export class ColorPicker {
    /**
     * Show the color picker overlay.
     * @param {Phaser.Scene} scene
     * @param {string} cardValue - 'wild' or 'plus4'
     * @returns {Promise<string>} resolves with chosen color
     */
    static show(scene, cardValue) {
        return new Promise((resolve) => {
            ColorPicker.dismiss(scene);

            const cfg = COLOR_PICKER;

            // Container for all picker elements
            const container = scene.add.container(cfg.X, cfg.Y);
            container.setDepth(cfg.DEPTH);
            container.setAlpha(0);
            container.setScale(0);

            // Dark background panel
            const bg = scene.add.graphics();
            bg.fillStyle(cfg.OVERLAY.BG_COLOR, cfg.OVERLAY.BG_ALPHA);
            bg.fillRoundedRect(
                -cfg.OVERLAY.WIDTH / 2, -cfg.OVERLAY.HEIGHT / 2,
                cfg.OVERLAY.WIDTH, cfg.OVERLAY.HEIGHT,
                cfg.OVERLAY.CORNER_RADIUS
            );
            bg.lineStyle(cfg.OVERLAY.BORDER_WIDTH, cfg.OVERLAY.BORDER_COLOR, cfg.OVERLAY.BORDER_ALPHA);
            bg.strokeRoundedRect(
                -cfg.OVERLAY.WIDTH / 2, -cfg.OVERLAY.HEIGHT / 2,
                cfg.OVERLAY.WIDTH, cfg.OVERLAY.HEIGHT,
                cfg.OVERLAY.CORNER_RADIUS
            );
            container.add(bg);

            // Title text
            const title = scene.add.text(0, cfg.TITLE.OFFSET_Y, cfg.TITLE.TEXT, {
                fontFamily: 'Arial, sans-serif',
                fontSize: `${cfg.TITLE.FONT_SIZE}px`,
                color: cfg.TITLE.COLOR,
                align: 'center',
            });
            title.setOrigin(0.5);
            container.add(title);

            // 4 colored card choices
            const totalWidth = (COLORS_LIST.length - 1) * cfg.CARD_SPACING;
            const startX = -totalWidth / 2;
            const dims = ASSET_DIMENSIONS.CARD;

            COLORS_LIST.forEach((color, i) => {
                const textureKey = `${cardValue}_${color}`;
                const cardImg = scene.add.image(
                    startX + i * cfg.CARD_SPACING,
                    10,
                    textureKey
                );
                cardImg.setDisplaySize(
                    dims.WIDTH * cfg.CARD_SCALE,
                    dims.HEIGHT * cfg.CARD_SCALE
                );

                const baseScaleX = cardImg.scaleX;
                const baseScaleY = cardImg.scaleY;

                cardImg.setInteractive({ useHandCursor: true });

                cardImg.on('pointerover', () => {
                    scene.tweens.killTweensOf(cardImg);
                    scene.tweens.add({
                        targets: cardImg,
                        scaleX: baseScaleX * cfg.CARD_HOVER_SCALE,
                        scaleY: baseScaleY * cfg.CARD_HOVER_SCALE,
                        duration: cfg.CARD_HOVER_DURATION,
                        ease: 'Back.easeOut',
                    });
                });

                cardImg.on('pointerout', () => {
                    scene.tweens.killTweensOf(cardImg);
                    scene.tweens.add({
                        targets: cardImg,
                        scaleX: baseScaleX,
                        scaleY: baseScaleY,
                        duration: cfg.CARD_HOVER_DURATION,
                        ease: 'Sine.easeOut',
                    });
                });

                cardImg.on('pointerdown', () => {
                    scene.tweens.add({
                        targets: cardImg,
                        scaleX: baseScaleX * 1.25,
                        scaleY: baseScaleY * 1.25,
                        duration: 80,
                        yoyo: true,
                        ease: 'Sine.easeOut',
                        onComplete: () => {
                            ColorPicker.dismiss(scene);
                            resolve(color);
                        }
                    });
                });

                container.add(cardImg);
            });

            scene._colorPicker = container;

            // Bounce-in animation
            scene.tweens.add({
                targets: container,
                alpha: 1,
                scaleX: 1.05,
                scaleY: 1.05,
                duration: cfg.BOUNCE_IN_MS * 0.6,
                ease: 'Back.easeOut',
                onComplete: () => {
                    scene.tweens.add({
                        targets: container,
                        scaleX: 1,
                        scaleY: 1,
                        duration: cfg.BOUNCE_IN_MS * 0.4,
                        ease: 'Sine.easeOut',
                    });
                }
            });
        });
    }

    /**
     * Dismiss the color picker overlay.
     * @param {Phaser.Scene} scene
     */
    static dismiss(scene) {
        const container = scene._colorPicker;
        if (!container) return;
        scene._colorPicker = null;

        scene.tweens.add({
            targets: container,
            alpha: 0,
            scaleX: 0.8,
            scaleY: 0.8,
            duration: COLOR_PICKER.FADE_OUT_MS,
            ease: 'Sine.easeIn',
            onComplete: () => container.destroy(),
        });
    }
}
