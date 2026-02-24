const TOAST = {
    WIDTH: 620,
    HEIGHT: 200,
    CORNER_RADIUS: 22,
    BG_COLOR: 0x0a1a2e,
    BG_ALPHA: 0.94,
    BORDER_COLOR: 0xFFD700,
    BORDER_WIDTH: 2,
    DEPTH: 200,
    Y: 340,
    BOUNCE_IN_MS: 250,
    FADE_OUT_MS: 300,

    TITLE_SIZE: 28,
    TITLE_COLOR: '#FFD700',

    MSG_SIZE: 20,
    MSG_COLOR: '#ECDABD',

    BTN: {
        WIDTH: 170,
        HEIGHT: 54,
        CORNER_RADIUS: 14,
        SPACING: 30,
        OFFSET_Y: 48,
        FONT_SIZE: 22,
    },

    YES_BG: 0x2a7a3a,
    YES_HOVER: 0x35993f,
    YES_COLOR: '#FFFFFF',

    NO_BG: 0x8a2020,
    NO_HOVER: 0xa52a2a,
    NO_COLOR: '#FFFFFF',
};

const RESUME_MESSAGES = [
    { title: 'The Cards Remember...', msg: 'Your unfinished game awaits. Shall we?' },
];

/**
 * ResumeToast — playful toast prompt asking if the player wants to resume
 * their in-progress game. Styled like ErrorPopup but with Yes/No buttons.
 *
 * Usage:
 *   ResumeToast.show(scene, onYes, onNo);
 */
export class ResumeToast {
    /**
     * Show a resume prompt with Yes/No buttons.
     *
     * @param {Phaser.Scene} scene
     * @param {Function} onYes - called when player taps Yes
     * @param {Function} onNo  - called when player taps No
     */
    static show(scene, onYes, onNo) {
        this.dismiss(scene);

        const pick = RESUME_MESSAGES[Math.floor(Math.random() * RESUME_MESSAGES.length)];
        const centerX = scene.cameras.main.width / 2;
        const centerY = TOAST.Y;

        const container = scene.add.container(centerX, centerY);
        container.setDepth(TOAST.DEPTH);
        container.setAlpha(0);
        container.setScale(0);

        // Background panel
        const bg = scene.add.graphics();
        bg.fillStyle(TOAST.BG_COLOR, TOAST.BG_ALPHA);
        bg.fillRoundedRect(
            -TOAST.WIDTH / 2, -TOAST.HEIGHT / 2,
            TOAST.WIDTH, TOAST.HEIGHT,
            TOAST.CORNER_RADIUS,
        );
        bg.lineStyle(TOAST.BORDER_WIDTH, TOAST.BORDER_COLOR, 0.6);
        bg.strokeRoundedRect(
            -TOAST.WIDTH / 2, -TOAST.HEIGHT / 2,
            TOAST.WIDTH, TOAST.HEIGHT,
            TOAST.CORNER_RADIUS,
        );
        container.add(bg);

        // Title text
        const title = scene.add.text(0, -TOAST.HEIGHT / 2 + 36, pick.title, {
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            fontSize: `${TOAST.TITLE_SIZE}px`,
            fontStyle: 'bold',
            color: TOAST.TITLE_COLOR,
            align: 'center',
        });
        title.setOrigin(0.5);
        container.add(title);

        // Message text
        const msg = scene.add.text(0, -TOAST.HEIGHT / 2 + 80, pick.msg, {
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            fontSize: `${TOAST.MSG_SIZE + 5}px`,
            color: TOAST.MSG_COLOR,
            align: 'center',
            wordWrap: { width: TOAST.WIDTH - 50 },
        });
        msg.setOrigin(0.5);
        container.add(msg);

        // Buttons
        const btnY = TOAST.BTN.OFFSET_Y;
        const halfGap = TOAST.BTN.SPACING / 2;

        this._addButton(scene, container, -halfGap - TOAST.BTN.WIDTH / 2, btnY,
            'Jump In!', TOAST.YES_BG, TOAST.YES_HOVER, TOAST.YES_COLOR, () => {
                this.dismiss(scene, () => onYes());
            });

        this._addButton(scene, container, halfGap + TOAST.BTN.WIDTH / 2, btnY,
            'New Game', TOAST.NO_BG, TOAST.NO_HOVER, TOAST.NO_COLOR, () => {
                this.dismiss(scene, () => onNo());
            });

        scene._resumeToast = container;

        // Bounce-in
        scene.tweens.add({
            targets: container,
            alpha: 1,
            scaleX: 1.06,
            scaleY: 1.06,
            duration: TOAST.BOUNCE_IN_MS * 0.6,
            ease: 'Back.easeOut',
            onComplete: () => {
                scene.tweens.add({
                    targets: container,
                    scaleX: 1,
                    scaleY: 1,
                    duration: TOAST.BOUNCE_IN_MS * 0.4,
                    ease: 'Sine.easeOut',
                });
            },
        });
    }

    /**
     * @private
     */
    static _addButton(scene, container, x, y, label, bgColor, hoverColor, textColor, onClick) {
        const { WIDTH: W, HEIGHT: H, CORNER_RADIUS: R, FONT_SIZE } = TOAST.BTN;

        const btnBg = scene.add.graphics();
        btnBg.fillStyle(bgColor, 1);
        btnBg.fillRoundedRect(-W / 2, -H / 2, W, H, R);
        btnBg.x = x;
        btnBg.y = y;
        container.add(btnBg);

        const text = scene.add.text(x, y, label, {
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            fontSize: `${FONT_SIZE}px`,
            fontStyle: 'bold',
            color: textColor,
            align: 'center',
        });
        text.setOrigin(0.5);
        container.add(text);

        // Invisible hit area
        const hitArea = scene.add.rectangle(x, y, W, H)
            .setOrigin(0.5)
            .setAlpha(0.01)
            .setInteractive({ useHandCursor: true });
        container.add(hitArea);

        hitArea.on('pointerover', () => {
            btnBg.clear();
            btnBg.fillStyle(hoverColor, 1);
            btnBg.fillRoundedRect(-W / 2, -H / 2, W, H, R);
        });

        hitArea.on('pointerout', () => {
            btnBg.clear();
            btnBg.fillStyle(bgColor, 1);
            btnBg.fillRoundedRect(-W / 2, -H / 2, W, H, R);
        });

        hitArea.on('pointerdown', () => {
            scene.tweens.add({
                targets: [btnBg, text],
                scaleX: 0.93,
                scaleY: 0.93,
                duration: 60,
                yoyo: true,
                ease: 'Sine.easeOut',
                onComplete: onClick,
            });
        });
    }

    /**
     * Dismiss the resume toast with a fade-out.
     * @param {Phaser.Scene} scene
     * @param {Function} [onComplete]
     */
    static dismiss(scene, onComplete) {
        const container = scene._resumeToast;
        if (!container) {
            if (onComplete) onComplete();
            return;
        }
        scene._resumeToast = null;

        scene.tweens.add({
            targets: container,
            alpha: 0,
            scaleY: 0.8,
            y: container.y - 20,
            duration: TOAST.FADE_OUT_MS,
            ease: 'Sine.easeIn',
            onComplete: () => {
                container.destroy();
                if (onComplete) onComplete();
            },
        });
    }
}
