import { loadMainScreenAssets, MENU_CARD_KEYS } from '../utils/assetLoader.js';
import { ASSET_DIMENSIONS } from '../config/assetDimensions.js';
import { MAIN_MENU } from '../config/settings.js';

const FORM_CSS = `
    .uno-form-container {
        background: rgba(8, 22, 62, 0.92);
        border: 2px solid rgba(80, 160, 255, 0.3);
        border-radius: 20px;
        padding: 32px 40px;
        width: 340px;
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5),
                    inset 0 1px 0 rgba(120, 180, 255, 0.08),
                    0 0 40px rgba(30, 80, 180, 0.15);
    }
    .uno-form-title {
        color: #FFFFFF;
        font-size: 26px;
        text-align: center;
        margin: 0 0 28px 0;
        font-weight: 700;
        letter-spacing: 1.5px;
        text-shadow: 0 2px 10px rgba(30, 100, 220, 0.5);
    }
    .uno-form-field {
        margin-bottom: 18px;
    }
    .uno-form-label {
        color: #8BB8E8;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 1.5px;
        margin-bottom: 6px;
        display: block;
    }
    .uno-form-input {
        width: 100%;
        padding: 11px 14px;
        background: rgba(4, 14, 44, 0.95);
        border: 1.5px solid rgba(80, 160, 255, 0.2);
        border-radius: 10px;
        color: #E0EEFF;
        font-size: 16px;
        outline: none;
        transition: border-color 0.25s, box-shadow 0.25s;
        box-sizing: border-box;
        font-family: inherit;
    }
    .uno-form-input::placeholder {
        color: rgba(160, 195, 240, 0.35);
    }
    .uno-form-input:focus {
        border-color: rgba(80, 160, 255, 0.6);
        box-shadow: 0 0 12px rgba(50, 130, 255, 0.15);
    }
    .uno-form-error {
        color: #ff6b6b;
        font-size: 12px;
        margin-top: 4px;
        min-height: 16px;
        text-align: center;
    }
    .uno-form-divider {
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(80, 160, 255, 0.2), transparent);
        margin: 4px 0 8px 0;
    }
    .uno-form-btn {
        width: 100%;
        padding: 12px;
        border: none;
        border-radius: 12px;
        font-size: 15px;
        font-weight: 700;
        cursor: pointer;
        letter-spacing: 0.8px;
        transition: transform 0.12s, box-shadow 0.12s, background 0.2s;
        font-family: inherit;
    }
    .uno-form-btn:active {
        transform: scale(0.97);
    }
    .uno-form-btn-primary {
        background: linear-gradient(135deg, #E83A30, #C4241A);
        color: #FFFFFF;
        margin-top: 6px;
        box-shadow: 0 4px 16px rgba(232, 58, 48, 0.3);
    }
    .uno-form-btn-primary:hover {
        background: linear-gradient(135deg, #F04838, #E83A30);
        box-shadow: 0 4px 20px rgba(232, 58, 48, 0.4);
    }
    .uno-form-btn-back {
        background: transparent;
        color: #8BB8E8;
        border: 1.5px solid rgba(80, 160, 255, 0.2);
        margin-top: 10px;
    }
    .uno-form-btn-back:hover {
        border-color: rgba(80, 160, 255, 0.45);
        color: #FFFFFF;
    }

    /* ── Mobile overrides ── */
    .uno-form-container.mobile {
        width: 480px;
        padding: 28px 36px;
        border-radius: 24px;
    }
    .mobile .uno-form-title {
        font-size: 34px;
        margin-bottom: 24px;
    }
    .mobile .uno-form-field {
        margin-bottom: 14px;
    }
    .mobile .uno-form-label {
        font-size: 15px;
        margin-bottom: 8px;
    }
    .mobile .uno-form-input {
        padding: 16px 18px;
        font-size: 22px;
        border-radius: 12px;
    }
    .mobile .uno-form-error {
        font-size: 16px;
        min-height: 20px;
    }
    .mobile .uno-form-btn {
        padding: 18px;
        font-size: 20px;
        border-radius: 14px;
    }
    .mobile .uno-form-btn-back {
        margin-top: 8px;
    }

`;

// const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
//     || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
const isMobile = true;
export class MainMenuScene extends Phaser.Scene {
    constructor() {
        super('MainMenuScene');
    }

    preload() {
        loadMainScreenAssets(this);
    }

    create() {
        this.formActive = false;
        this.formDom = null;
        this.formOverlay = null;

        const { WIDTH, HEIGHT } = ASSET_DIMENSIONS.BACKGROUND;
        const { LOGO, BUTTONS, FLOATING_CARDS } = MAIN_MENU;

        // Background
        const bg = this.add.image(WIDTH / 2, HEIGHT / 2, 'main_bg');
        bg.setDisplaySize(WIDTH, HEIGHT);

        // Floating cards (behind logo)
        this.spawnFloatingCards(FLOATING_CARDS);

        // Logo
        this.logo = this.add.image(LOGO.X, LOGO.Y, 'logo');
        this.logo.setDisplaySize(ASSET_DIMENSIONS.LOGO.WIDTH, ASSET_DIMENSIONS.LOGO.HEIGHT);
        this.logo.setDepth(FLOATING_CARDS.DEPTH + 1);

        this.tweens.add({
            targets: this.logo,
            y: LOGO.Y - LOGO.FLOAT.DISTANCE,
            duration: LOGO.FLOAT.DURATION,
            yoyo: true,
            repeat: -1,
            ease: LOGO.FLOAT.EASE
        });

        // Buttons
        this.menuButtons = [];
        const centerX = WIDTH / 2;
        const buttonDefs = [
            { key: 'login_button', action: () => this.onEmailSignIn() },
            { key: 'new_user_button', action: () => this.onNewAccount() },
        ];

        const totalWidth = (buttonDefs.length - 1) * BUTTONS.SPACING;
        buttonDefs.forEach((def, i) => {
            const x = centerX - totalWidth / 2 + i * BUTTONS.SPACING;
            const btn = this.createButton(x, BUTTONS.Y, def.key, def.action);
            btn.setDepth(FLOATING_CARDS.DEPTH + 1);
            btn.setData('baseY', BUTTONS.Y);
            this.menuButtons.push(btn);
        });
    }

    // ── Floating cards ──────────────────────────────────────────────────

    spawnFloatingCards(cfg) {
        const { MENU_CARD, BACKGROUND } = ASSET_DIMENSIONS;
        const halfW = MENU_CARD.WIDTH / 2;
        const halfH = MENU_CARD.HEIGHT / 2;
        const zones = cfg.ZONES;
        const placed = [];
        const minDist = cfg.MIN_DISTANCE;

        for (let i = 0; i < cfg.COUNT; i++) {
            const texture = MENU_CARD_KEYS[i % MENU_CARD_KEYS.length];
            const zone = zones[i % zones.length];

            const minX = Math.max(zone.x, halfW);
            const maxX = Math.min(zone.x + zone.w, BACKGROUND.WIDTH - halfW);
            const minY = Math.max(zone.y, halfH);
            const maxY = Math.min(zone.y + zone.h, BACKGROUND.HEIGHT - halfH);

            let homeX, homeY, valid;
            let attempts = 0;
            do {
                homeX = Phaser.Math.Between(minX, maxX);
                homeY = Phaser.Math.Between(minY, maxY);
                valid = placed.every(p =>
                    Phaser.Math.Distance.Between(homeX, homeY, p.x, p.y) >= minDist
                );
                attempts++;
            } while (!valid && attempts < 50);

            placed.push({ x: homeX, y: homeY });

            const card = this.add.image(homeX, homeY, texture);
            card.setDisplaySize(MENU_CARD.WIDTH, MENU_CARD.HEIGHT);
            card.setDepth(cfg.DEPTH);
            card.setAlpha(Phaser.Math.FloatBetween(cfg.ALPHA.MIN, cfg.ALPHA.MAX));
            card.setRotation(Phaser.Math.DegToRad(Phaser.Math.Between(-30, 30)));

            card.setData('homeX', homeX);
            card.setData('homeY', homeY);
            card.setData('minX', minX);
            card.setData('maxX', maxX);
            card.setData('minY', minY);
            card.setData('maxY', maxY);

            this.driftCard(card, cfg);
        }
    }

    driftCard(card, cfg) {
        const range = cfg.DRIFT.RANGE;
        const homeX = card.getData('homeX');
        const homeY = card.getData('homeY');
        const duration = Phaser.Math.Between(cfg.DRIFT.DURATION.MIN, cfg.DRIFT.DURATION.MAX);
        const spinDeg = Phaser.Math.Between(cfg.SPIN.MIN, cfg.SPIN.MAX);

        const destX = Phaser.Math.Clamp(
            homeX + Phaser.Math.Between(-range, range),
            card.getData('minX'), card.getData('maxX')
        );
        const destY = Phaser.Math.Clamp(
            homeY + Phaser.Math.Between(-range, range),
            card.getData('minY'), card.getData('maxY')
        );

        this.tweens.add({
            targets: card,
            x: destX,
            y: destY,
            rotation: card.rotation + Phaser.Math.DegToRad(spinDeg),
            duration,
            ease: cfg.DRIFT.EASE,
            onComplete: () => this.driftCard(card, cfg)
        });
    }

    // ── Button factory ──────────────────────────────────────────────────

    createButton(x, y, texture, callback) {
        const { BUTTONS } = MAIN_MENU;
        const { MENU_BUTTON } = ASSET_DIMENSIONS;
        const scale = BUTTONS.SCALE;

        const btn = this.add.image(x, y, texture);
        btn.setDisplaySize(MENU_BUTTON.WIDTH * scale, MENU_BUTTON.HEIGHT * scale);
        btn.setInteractive({ useHandCursor: true });

        const baseW = MENU_BUTTON.WIDTH * scale;
        const baseH = MENU_BUTTON.HEIGHT * scale;

        btn.on('pointerover', () => {
            this.tweens.add({
                targets: btn,
                displayWidth: baseW * BUTTONS.HOVER.SCALE,
                displayHeight: baseH * BUTTONS.HOVER.SCALE,
                duration: BUTTONS.HOVER.DURATION,
                ease: BUTTONS.HOVER.EASE
            });
        });

        btn.on('pointerout', () => {
            this.tweens.add({
                targets: btn,
                displayWidth: baseW,
                displayHeight: baseH,
                duration: BUTTONS.HOVER.DURATION,
                ease: BUTTONS.HOVER.EASE
            });
        });

        btn.on('pointerdown', () => {
            btn.setDisplaySize(baseW * BUTTONS.PRESS.SCALE, baseH * BUTTONS.PRESS.SCALE);
        });

        btn.on('pointerup', () => {
            btn.setDisplaySize(baseW, baseH);
            callback();
        });

        return btn;
    }

    // ── Form flow ───────────────────────────────────────────────────────

    onEmailSignIn() {
        this.showForm('signin');
    }

    onNewAccount() {
        this.showForm('signup');
    }

    showForm(type) {
        if (this.formActive) return;
        this.formActive = true;

        this.menuButtons.forEach(btn => btn.disableInteractive());

        const { FORM } = MAIN_MENU;
        const dur = FORM.ANIM.MENU_OUT_DURATION;
        const offset = FORM.ANIM.MENU_OUT_OFFSET;

        // Stop logo float
        this.tweens.killTweensOf(this.logo);

        // Slide logo up + fade
        this.tweens.add({
            targets: this.logo,
            y: this.logo.y - offset,
            alpha: 0,
            duration: dur,
            ease: 'Cubic.easeIn'
        });

        // Slide buttons down + fade
        this.menuButtons.forEach((btn, i) => {
            this.tweens.add({
                targets: btn,
                y: btn.y + offset,
                alpha: 0,
                duration: dur,
                delay: i * FORM.ANIM.STAGGER,
                ease: 'Cubic.easeIn'
            });
        });

        const totalDelay = dur + FORM.ANIM.STAGGER * this.menuButtons.length;
        this.time.delayedCall(totalDelay, () => this.createForm(type));
    }

    createForm(type) {
        const { WIDTH, HEIGHT } = ASSET_DIMENSIONS.BACKGROUND;
        const { FORM, FLOATING_CARDS } = MAIN_MENU;
        const isSignIn = type === 'signin';

        // Dim overlay
        this.formOverlay = this.add.rectangle(
            WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x000000, 0
        );
        this.formOverlay.setDepth(FLOATING_CARDS.DEPTH + 1);
        this.tweens.add({
            targets: this.formOverlay,
            fillAlpha: FORM.OVERLAY_ALPHA,
            duration: 300,
        });

        // Build HTML
        const html = this.buildFormHTML(isSignIn);
        this.formDom = this.add.dom(WIDTH / 2, HEIGHT / 2).createFromHTML(html);
        this.formDom.setDepth(FLOATING_CARDS.DEPTH + 2);
        this.formDom.setAlpha(0);
        this.formDom.setScale(0.85);

        // Bounce in
        this.tweens.add({
            targets: this.formDom,
            alpha: 1,
            scaleX: 1,
            scaleY: 1,
            duration: FORM.ANIM.FORM_IN_DURATION,
            ease: 'Back.easeOut',
        });

        // Events
        this.formDom.addListener('click');
        this.formDom.on('click', (e) => {
            if (e.target.id === 'btn-submit') {
                e.preventDefault();
                this.handleFormSubmit(type);
            } else if (e.target.id === 'btn-back') {
                e.preventDefault();
                this.hideForm();
            }
        });

        this.formDom.addListener('keydown');
        this.formDom.on('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const inputs = [...this.formDom.node.querySelectorAll('.uno-form-input')];
                const idx = inputs.indexOf(e.target);
                if (idx >= 0 && idx < inputs.length - 1) {
                    inputs[idx + 1].focus();
                } else {
                    this.handleFormSubmit(type);
                }
            }
        });

    }

    buildFormHTML(isSignIn) {
        const title = isSignIn ? 'Welcome Back!' : 'Join the Game!';
        const submitText = isSignIn ? "Let's Go!" : 'Deal Me In!';

        const nameField = isSignIn ? '' : `
            <div class="uno-form-field">
                <label class="uno-form-label">NAME</label>
                <input class="uno-form-input" type="text" id="input-name"
                       placeholder="Enter your name" autocomplete="off" />
            </div>`;

        return `
            <style>${FORM_CSS}</style>
            <div class="uno-form-container${isMobile ? ' mobile' : ''}">
                <div class="uno-form-title">${title}</div>
                ${nameField}
                <div class="uno-form-field">
                    <label class="uno-form-label">EMAIL</label>
                    <input class="uno-form-input" type="email" id="input-email"
                           placeholder="Enter your email" autocomplete="off" />
                </div>
                <div class="uno-form-field">
                    <label class="uno-form-label">PASSWORD</label>
                    <input class="uno-form-input" type="password" id="input-password"
                           placeholder="Enter your password" />
                </div>
                <div class="uno-form-error" id="form-error"></div>
                <div class="uno-form-divider"></div>
                <button class="uno-form-btn uno-form-btn-primary" id="btn-submit">${submitText}</button>
                <button class="uno-form-btn uno-form-btn-back" id="btn-back">Back</button>
            </div>`;
    }

    hideForm() {
        const { FORM } = MAIN_MENU;

        // Scale form out
        this.tweens.add({
            targets: this.formDom,
            alpha: 0,
            scaleX: 0.85,
            scaleY: 0.85,
            duration: FORM.ANIM.FORM_OUT_DURATION,
            ease: 'Cubic.easeIn',
            onComplete: () => {
                this.formDom.removeListener('click');
                this.formDom.removeListener('keydown');
                this.formDom.destroy();
                this.formDom = null;
            },
        });

        // Fade overlay
        this.tweens.add({
            targets: this.formOverlay,
            fillAlpha: 0,
            duration: 300,
            onComplete: () => {
                this.formOverlay.destroy();
                this.formOverlay = null;
            },
        });

        this.time.delayedCall(FORM.ANIM.FORM_OUT_DURATION, () => {
            this.animateMenuIn();
        });
    }

    animateMenuIn() {
        const { LOGO, FORM } = MAIN_MENU;
        const dur = FORM.ANIM.MENU_IN_DURATION;
        const offset = FORM.ANIM.MENU_IN_OFFSET;

        // Logo slides back down into place
        this.logo.y = LOGO.Y - offset;
        this.logo.setAlpha(0);
        this.tweens.add({
            targets: this.logo,
            y: LOGO.Y,
            alpha: 1,
            duration: dur,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                // Restart idle float
                this.tweens.add({
                    targets: this.logo,
                    y: LOGO.Y - LOGO.FLOAT.DISTANCE,
                    duration: LOGO.FLOAT.DURATION,
                    yoyo: true,
                    repeat: -1,
                    ease: LOGO.FLOAT.EASE,
                });
            },
        });

        // Buttons slide back up into place
        this.menuButtons.forEach((btn, i) => {
            const baseY = btn.getData('baseY');
            btn.y = baseY + offset;
            btn.setAlpha(0);
            this.tweens.add({
                targets: btn,
                y: baseY,
                alpha: 1,
                duration: dur,
                delay: i * FORM.ANIM.STAGGER,
                ease: 'Cubic.easeOut',
                onComplete: () => {
                    if (i === this.menuButtons.length - 1) {
                        this.menuButtons.forEach(b => b.setInteractive({ useHandCursor: true }));
                        this.formActive = false;
                    }
                },
            });
        });
    }

    handleFormSubmit(type) {
        const isSignIn = type === 'signin';
        const email = this.formDom.getChildByID('input-email')?.value?.trim();
        const password = this.formDom.getChildByID('input-password')?.value?.trim();
        const name = isSignIn ? null : this.formDom.getChildByID('input-name')?.value?.trim();
        const errorEl = this.formDom.getChildByID('form-error');

        if (!email || !password || (!isSignIn && !name)) {
            if (errorEl) errorEl.textContent = 'Please fill in all fields';
            // Shake the form
            const startX = this.formDom.x;
            this.tweens.add({
                targets: this.formDom,
                x: startX - 8,
                duration: 50,
                yoyo: true,
                repeat: 3,
                ease: 'Sine.easeInOut',
                onComplete: () => { this.formDom.x = startX; },
            });
            return;
        }

        console.log(`[${type}]`, { name, email });
        this.scene.start('GameScene');
    }
}
