import { UNO_BUTTON } from '../config/settings.js';
import { ASSET_DIMENSIONS } from '../config/assetDimensions.js';

export class UnoButton {
    constructor(scene, onPress) {
        this.scene = scene;
        this.onPress = onPress;
        this.enabled = false;

        const { X, Y, DEPTH, ALPHA, RAISE, SHADOW_ALPHA } = UNO_BUTTON;
        const { WIDTH, HEIGHT } = ASSET_DIMENSIONS.UNO_BUTTON;

        this.baseY = Y;
        this.raisedY = Y - RAISE;

        // Shadow: same texture, tinted black, sits at base position
        this.shadow = scene.add.image(X, Y, 'uno_btn');
        this.shadow.setDisplaySize(WIDTH, HEIGHT);
        this.shadow.setDepth(DEPTH - 1);
        this.shadow.setTint(0xFFFFFF);
        this.shadow.setAlpha(SHADOW_ALPHA);

        // Button: raised above shadow
        this.sprite = scene.add.image(X, this.raisedY, 'uno_btn');
        this.sprite.setDisplaySize(WIDTH, HEIGHT);
        this.sprite.setDepth(DEPTH);
        this.sprite.setAlpha(ALPHA.DISABLED);

        this.baseScaleX = this.sprite.scaleX;
        this.baseScaleY = this.sprite.scaleY;

        this.ctaTween = null;
        this.setupInput();
        this.sprite.input.cursor = 'default';
    }

    setupInput() {
        this.sprite.setInteractive({ useHandCursor: true });

        // Expand touch target
        const hitArea = this.sprite.input.hitArea;
        const pad = UNO_BUTTON.HIT_PADDING / this.sprite.scaleX;
        hitArea.setTo(hitArea.x - pad, hitArea.y - pad, hitArea.width + pad * 2, hitArea.height + pad * 2);

        this.sprite.on('pointerover', () => {
            if (!this.enabled) return;
            this.stopCTA();
            const { SCALE, DURATION, EASE } = UNO_BUTTON.HOVER;
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
            this.scene.tweens.killTweensOf(this.sprite);
            this.scene.tweens.killTweensOf(this.shadow);
            this.scene.tweens.add({
                targets: this.sprite,
                scaleX: this.baseScaleX,
                scaleY: this.baseScaleY,
                y: this.raisedY,
                duration: UNO_BUTTON.HOVER.DURATION,
                ease: UNO_BUTTON.HOVER.EASE,
            });
            this.scene.tweens.add({
                targets: this.shadow,
                alpha: UNO_BUTTON.SHADOW_ALPHA,
                duration: UNO_BUTTON.HOVER.DURATION,
                onComplete: () => { this.startCTA(); }
            });
        });

        this.sprite.on('pointerdown', () => {
            if (!this.enabled) return;
            this.scene.tweens.killTweensOf(this.sprite);
            this.scene.tweens.killTweensOf(this.shadow);
            const { DURATION, EASE } = UNO_BUTTON.PRESS;
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
            if (this.onPress) this.onPress();
        });

        this.sprite.on('pointerup', () => {
            if (!this.enabled) return;
            this.scene.tweens.killTweensOf(this.sprite);
            this.scene.tweens.killTweensOf(this.shadow);
            const { DURATION, EASE } = UNO_BUTTON.POP_BACK;
            this.scene.tweens.add({
                targets: this.sprite,
                y: this.raisedY,
                duration: DURATION,
                ease: EASE,
            });
            this.scene.tweens.add({
                targets: this.shadow,
                alpha: UNO_BUTTON.SHADOW_ALPHA,
                duration: DURATION,
            });
        });
    }

    enable() {
        this.enabled = true;
        this.sprite.setAlpha(UNO_BUTTON.ALPHA.ACTIVE);
        this.sprite.input.cursor = 'pointer';
        this.startCTA();
    }

    disable() {
        this.enabled = false;
        this.stopCTA();
        this.sprite.setAlpha(UNO_BUTTON.ALPHA.DISABLED);
        this.sprite.input.cursor = 'default';
        this.sprite.setScale(this.baseScaleX, this.baseScaleY);
        this.sprite.y = this.raisedY;
        this.shadow.setAlpha(UNO_BUTTON.SHADOW_ALPHA);
    }

    startCTA() {
        this.stopCTA();
        const { CTA } = UNO_BUTTON;
        const angle = Phaser.Math.DegToRad(CTA.ANGLE);
        const targets = [this.sprite, this.shadow];

        // Start tilted left
        targets.forEach(t => t.setRotation(-angle));

        // Subtle pendulum tilt
        this.ctaTween = this.scene.tweens.add({
            targets,
            rotation: angle,
            duration: CTA.DURATION,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        // Wobbly squash-stretch on a different cycle
        this.wobbleTween = this.scene.tweens.add({
            targets,
            scaleX: this.baseScaleX * CTA.WOBBLE_SCALE,
            scaleY: this.baseScaleY * (2 - CTA.WOBBLE_SCALE),
            duration: CTA.WOBBLE_DURATION,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    stopCTA() {
        if (this.ctaTween) {
            this.ctaTween.stop();
            this.ctaTween = null;
        }
        if (this.wobbleTween) {
            this.wobbleTween.stop();
            this.wobbleTween = null;
        }
        this.scene.tweens.killTweensOf(this.sprite);
        this.scene.tweens.killTweensOf(this.shadow);
        this.sprite.setScale(this.baseScaleX, this.baseScaleY);
        this.sprite.setRotation(0);
        this.shadow.setRotation(0);
    }
}
