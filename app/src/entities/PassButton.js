import { PASS_BUTTON } from '../config/settings.js';
import { ASSET_DIMENSIONS } from '../config/assetDimensions.js';

export class PassButton {
    constructor(scene, onPress) {
        this.scene = scene;
        this.onPress = onPress;
        this.enabled = false;

        const { X, Y, DEPTH, RAISE, SHADOW_ALPHA } = PASS_BUTTON;
        const { WIDTH, HEIGHT } = ASSET_DIMENSIONS.PASS_BUTTON;

        this.baseY = Y;
        this.raisedY = Y - RAISE;

        // Shadow: same texture, tinted white, sits at base position
        this.shadow = scene.add.image(X, Y, 'pass_disabled_btn');
        this.shadow.setDisplaySize(WIDTH, HEIGHT);
        this.shadow.setDepth(DEPTH - 1);
        this.shadow.setTint(0xFFFFFF);
        this.shadow.setAlpha(SHADOW_ALPHA);

        // Button: raised above shadow
        this.sprite = scene.add.image(X, this.raisedY, 'pass_disabled_btn');
        this.sprite.setDisplaySize(WIDTH, HEIGHT);
        this.sprite.setDepth(DEPTH);

        this.baseScaleX = this.sprite.scaleX;
        this.baseScaleY = this.sprite.scaleY;

        this.setupInput();
    }

    setupInput() {
        this.sprite.setInteractive({ useHandCursor: true });

        // Expand touch target
        const hitArea = this.sprite.input.hitArea;
        const pad = PASS_BUTTON.HIT_PADDING / this.sprite.scaleX;
        hitArea.setTo(hitArea.x - pad, hitArea.y - pad, hitArea.width + pad * 2, hitArea.height + pad * 2);

        this.sprite.on('pointerover', () => {
            if (!this.enabled) return;
            const { SCALE, DURATION, EASE } = PASS_BUTTON.HOVER;
            this.scene.tweens.add({
                targets: this.sprite,
                scaleX: this.baseScaleX * SCALE,
                scaleY: this.baseScaleY * SCALE,
                duration: DURATION,
                ease: EASE,
            });
        });

        this.sprite.on('pointerout', () => {
            if (!this.enabled) return;
            this.scene.tweens.add({
                targets: this.sprite,
                scaleX: this.baseScaleX,
                scaleY: this.baseScaleY,
                y: this.raisedY,
                duration: PASS_BUTTON.HOVER.DURATION,
                ease: PASS_BUTTON.HOVER.EASE,
            });
            this.scene.tweens.add({
                targets: this.shadow,
                alpha: PASS_BUTTON.SHADOW_ALPHA,
                duration: PASS_BUTTON.HOVER.DURATION,
            });
        });

        this.sprite.on('pointerdown', () => {
            if (!this.enabled) return;
            const { DURATION, EASE } = PASS_BUTTON.PRESS;
            // Snap sink — fast visual feedback
            this.scene.tweens.add({
                targets: this.sprite,
                y: this.baseY,
                duration: DURATION,
                ease: EASE,
            });
            this.scene.tweens.add({
                targets: this.shadow,
                alpha: 0.05,
                duration: DURATION,
            });
            // Fire callback immediately
            if (this.onPress) this.onPress();
        });

        this.sprite.on('pointerup', () => {
            if (!this.enabled) return;
            const { DURATION, EASE } = PASS_BUTTON.POP_BACK;
            // Cosmetic pop-back
            this.scene.tweens.add({
                targets: this.sprite,
                y: this.raisedY,
                duration: DURATION,
                ease: EASE,
            });
            this.scene.tweens.add({
                targets: this.shadow,
                alpha: PASS_BUTTON.SHADOW_ALPHA,
                duration: DURATION,
            });
        });
    }

    enable() {
        this.enabled = true;
        this.sprite.setTexture('pass_btn');
        this.shadow.setTexture('pass_btn');
        this.sprite.input.cursor = 'pointer';
    }

    disable() {
        this.enabled = false;
        this.sprite.setTexture('pass_disabled_btn');
        this.shadow.setTexture('pass_disabled_btn');
        this.sprite.input.cursor = 'default';
        this.sprite.setScale(this.baseScaleX, this.baseScaleY);
        this.sprite.y = this.raisedY;
        this.shadow.setAlpha(PASS_BUTTON.SHADOW_ALPHA);
    }
}
