import { DIRECTION_ARROW } from '../config/settings.js';
import { ASSET_DIMENSIONS } from '../config/assetDimensions.js';

export class DirectionArrow {
    constructor(scene) {
        this.scene = scene;
        this.isClockwise = true;

        const { X, Y, DEPTH, ALPHA } = DIRECTION_ARROW;
        const { WIDTH, HEIGHT } = ASSET_DIMENSIONS.ARROW;

        this.sprite = scene.add.image(X, Y, 'arrow');
        this.sprite.setDisplaySize(WIDTH, HEIGHT);
        this.sprite.setDepth(DEPTH);
        this.sprite.setAlpha(ALPHA);

        this.startIdle();
    }

    startIdle() {
        const { DURATION } = DIRECTION_ARROW.IDLE_SPIN;
        const direction = this.isClockwise ? -360 : 360;

        this.idleSpinTween = this.scene.tweens.add({
            targets: this.sprite,
            angle: `+=${direction}`,
            duration: DURATION,
            repeat: -1,
            ease: 'Linear',
        });

        const { WIDTH, HEIGHT } = ASSET_DIMENSIONS.ARROW;
        const baseScaleX = WIDTH / this.sprite.texture.getSourceImage().width;
        const baseScaleY = HEIGHT / this.sprite.texture.getSourceImage().height;
        const { MAX_SCALE, DURATION: PULSE_DURATION } = DIRECTION_ARROW.PULSE;

        this.pulseTween = this.scene.tweens.add({
            targets: this.sprite,
            scaleX: baseScaleX * MAX_SCALE,
            scaleY: baseScaleY * MAX_SCALE,
            duration: PULSE_DURATION,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    /**
     * Instantly set direction without animation (for state restoration).
     */
    setDirection(isClockwise) {
        if (this.idleSpinTween) {
            this.idleSpinTween.stop();
            this.idleSpinTween = null;
        }
        if (this.pulseTween) {
            this.pulseTween.stop();
            this.pulseTween = null;
        }

        this.isClockwise = isClockwise;
        this.sprite.setTexture(isClockwise ? 'arrow' : 'r_arrow');
        this.sprite.setAngle(0);
        this.startIdle();
    }

    toggle(onComplete) {
        const nextClockwise = !this.isClockwise;
        const { SHRINK_DURATION, GROW_DURATION, SPIN_ANGLE, EASE_IN, EASE_OUT } = DIRECTION_ARROW.TRANSITION;

        if (this.idleSpinTween) {
            this.idleSpinTween.stop();
            this.idleSpinTween = null;
        }
        if (this.pulseTween) {
            this.pulseTween.stop();
            this.pulseTween = null;
        }

        const { WIDTH, HEIGHT } = ASSET_DIMENSIONS.ARROW;
        const baseScaleX = WIDTH / this.sprite.texture.getSourceImage().width;
        const baseScaleY = HEIGHT / this.sprite.texture.getSourceImage().height;

        // Spin direction: positive for clockwise arrow, negative for reverse arrow
        const spinSign = nextClockwise ? 1 : -1;

        // Shrink + spin out
        this.scene.tweens.add({
            targets: this.sprite,
            // scaleX: 0,
            // scaleY: 0,
            angle: `+=${SPIN_ANGLE * spinSign}`,
            duration: SHRINK_DURATION,
            ease: EASE_IN,
            onComplete: () => {
                // Swap texture
                this.isClockwise = nextClockwise;
                this.sprite.setTexture(this.isClockwise ? 'arrow' : 'r_arrow');

                // Grow + spin in (opposite direction)
                this.scene.tweens.add({
                    targets: this.sprite,
                    // scaleX: baseScaleX,
                    // scaleY: baseScaleY,
                    angle: `+=${SPIN_ANGLE * spinSign * -1}`,
                    duration: GROW_DURATION,
                    ease: EASE_OUT,
                    onComplete: () => {
                        this.startIdle();
                        if (onComplete) onComplete();
                    },
                });
            },
        });
    }
}
