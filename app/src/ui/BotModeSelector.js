import { BOT_MODE_SELECTOR } from '../config/settings.js';
import { ErrorPopup } from './ErrorPopup.js';

const ADAPTIVE_OPTION = { key: 'adaptive', label: 'Adaptive', desc: 'auto-adjusts to your skill' };

const TIER_OPTIONS = [
    { key: 'hyper_adversarial',  label: 'Hyper Adversarial',  desc: 'hardest' },
    { key: 'adversarial',        label: 'Adversarial',        desc: 'hard' },
    { key: 'selfish',            label: 'Selfish',            desc: 'neutral' },
    { key: 'random',             label: 'Random',             desc: 'easy' },
    { key: 'altruistic',         label: 'Altruistic',         desc: 'easier' },
    { key: 'hyper_altruistic',   label: 'Hyper Altruistic',   desc: 'easiest' },
];

/**
 * BotModeSelector — modal overlay for choosing adaptive or a fixed bot tier.
 *
 * - Adaptive is separated from tier options by a divider + section label
 * - Selection plays a confirm animation; close just fades out
 * - No dim-flash: blocker and panel animate independently
 * - Font sizes match mobile game UI (22-26px labels)
 */
export class BotModeSelector {
    /**
     * @param {Phaser.Scene} scene
     * @param {string} currentMode
     * @param {object} adapter     - GameApiAdapter (has setBotMode)
     * @param {Function} onChanged - callback(newMode)
     */
    static show(scene, currentMode, adapter, onChanged) {
        this.forceClear(scene);

        const cfg = BOT_MODE_SELECTOR;
        const panel = cfg.PANEL;

        // ── Blocker (separate from panel so it doesn't scale with it) ──
        const blocker = scene.add.rectangle(
            scene.cameras.main.width / 2, scene.cameras.main.height / 2,
            1280, 720, 0x000000, 0
        );
        blocker.setDepth(cfg.DEPTH - 1);
        blocker.setInteractive();
        blocker.on('pointerdown', () => this._close(scene));

        scene.tweens.add({
            targets: blocker,
            fillAlpha: cfg.OVERLAY_ALPHA,
            duration: 200,
            ease: 'Sine.easeOut',
        });

        // ── Panel container ──
        const container = scene.add.container(panel.X, panel.Y);
        container.setDepth(cfg.DEPTH);
        container.setAlpha(0);
        container.setScale(0.92);

        // Panel background
        const bg = scene.add.graphics();
        bg.fillStyle(panel.BG_COLOR, panel.BG_ALPHA);
        bg.fillRoundedRect(-panel.WIDTH / 2, -panel.HEIGHT / 2, panel.WIDTH, panel.HEIGHT, panel.CORNER_RADIUS);
        bg.lineStyle(panel.BORDER_WIDTH, panel.BORDER_COLOR, panel.BORDER_ALPHA);
        bg.strokeRoundedRect(-panel.WIDTH / 2, -panel.HEIGHT / 2, panel.WIDTH, panel.HEIGHT, panel.CORNER_RADIUS);
        container.add(bg);

        // Title
        const titleCfg = cfg.TITLE;
        const title = scene.add.text(0, titleCfg.OFFSET_Y, titleCfg.TEXT, {
            fontFamily: titleCfg.FONT_FAMILY,
            fontSize: `${titleCfg.FONT_SIZE}px`,
            fontStyle: 'bold',
            color: titleCfg.COLOR,
            stroke: titleCfg.STROKE,
            strokeThickness: titleCfg.STROKE_THICKNESS,
        });
        title.setOrigin(0.5);
        container.add(title);

        // Subtitle
        const subCfg = cfg.SUBTITLE;
        const subtitle = scene.add.text(0, subCfg.OFFSET_Y, subCfg.TEXT, {
            fontFamily: subCfg.FONT_FAMILY,
            fontSize: `${subCfg.FONT_SIZE}px`,
            color: subCfg.COLOR,
        });
        subtitle.setOrigin(0.5);
        container.add(subtitle);

        const itemCfg = cfg.ITEM;
        let busy = false;

        // ── Adaptive option (standalone, top section) ──
        const adaptiveY = itemCfg.START_Y;
        this._addItem(scene, container, ADAPTIVE_OPTION, adaptiveY, itemCfg,
            currentMode === 'adaptive', busy,
            async () => {
                if (busy) return;
                if (currentMode === 'adaptive') { this._close(scene); return; }
                busy = true;
                try {
                    await adapter.setBotMode('adaptive');
                    this._confirmAndDismiss(scene, () => onChanged && onChanged('adaptive'));
                } catch (err) { busy = false; ErrorPopup.show(scene, ErrorPopup.friendlyMessage(err)); }
            });

        // ── Divider + section label ──
        const divY = adaptiveY + itemCfg.HEIGHT / 2 + 18;
        const divCfg = cfg.DIVIDER;
        const divGfx = scene.add.graphics();
        divGfx.lineStyle(1, divCfg.COLOR, divCfg.ALPHA);
        divGfx.lineBetween(-divCfg.WIDTH / 2, divY, divCfg.WIDTH / 2, divY);
        container.add(divGfx);

        const sectionLabel = scene.add.text(0, divY + 24, 'Or choose manually', {
            fontFamily: itemCfg.FONT_FAMILY,
            fontSize: `${cfg.SUBTITLE.FONT_SIZE}px`,
            color: '#776655',
        });
        sectionLabel.setOrigin(0.5);
        container.add(sectionLabel);

        // ── Tier options ──
        const tierStartY = divY + 66;
        TIER_OPTIONS.forEach((option, i) => {
            const y = tierStartY + i * itemCfg.SPACING;
            this._addItem(scene, container, option, y, itemCfg,
                option.key === currentMode, busy,
                async () => {
                    if (busy) return;
                    if (option.key === currentMode) { this._close(scene); return; }
                    busy = true;
                    try {
                        await adapter.setBotMode(option.key);
                        this._confirmAndDismiss(scene, () => onChanged && onChanged(option.key));
                    } catch (err) { busy = false; ErrorPopup.show(scene, ErrorPopup.friendlyMessage(err)); }
                });
        });

        // ── Close button ──
        const closeCfg = cfg.CLOSE;
        const closeBg = scene.add.graphics();
        closeBg.fillStyle(closeCfg.BG_COLOR, closeCfg.BG_ALPHA);
        closeBg.fillRoundedRect(-closeCfg.WIDTH / 2, -closeCfg.HEIGHT / 2, closeCfg.WIDTH, closeCfg.HEIGHT, closeCfg.CORNER_RADIUS);
        closeBg.setPosition(0, closeCfg.OFFSET_Y);
        container.add(closeBg);

        const closeText = scene.add.text(0, closeCfg.OFFSET_Y, closeCfg.TEXT, {
            fontFamily: closeCfg.FONT_FAMILY,
            fontSize: `${closeCfg.FONT_SIZE}px`,
            color: closeCfg.COLOR,
        });
        closeText.setOrigin(0.5);
        container.add(closeText);

        const closeHit = scene.add.zone(0, closeCfg.OFFSET_Y, closeCfg.WIDTH, closeCfg.HEIGHT)
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });
        container.add(closeHit);
        closeHit.on('pointerover', () => closeText.setColor('#82F1ED'));
        closeHit.on('pointerout', () => closeText.setColor(closeCfg.COLOR));
        closeHit.on('pointerdown', () => this._close(scene));

        scene._botModeSelector = container;
        scene._botModeSelectorBlocker = blocker;

        // Panel entrance (no scale on blocker — avoids the flash)
        scene.tweens.add({
            targets: container,
            alpha: 1,
            scaleX: 1,
            scaleY: 1,
            duration: cfg.BOUNCE_IN_MS,
            ease: 'Back.easeOut',
        });
    }

    /** @private — add a single selectable item row */
    static _addItem(scene, container, option, y, itemCfg, isSelected, _busy, onClick) {
        const itemBg = scene.add.graphics();
        if (isSelected) {
            itemBg.fillStyle(itemCfg.SELECTED_BG, itemCfg.SELECTED_BG_ALPHA);
            itemBg.fillRoundedRect(-itemCfg.WIDTH / 2, -itemCfg.HEIGHT / 2, itemCfg.WIDTH, itemCfg.HEIGHT, itemCfg.CORNER_RADIUS);
            itemBg.lineStyle(1, itemCfg.SELECTED_BORDER_COLOR, itemCfg.SELECTED_BORDER_ALPHA);
            itemBg.strokeRoundedRect(-itemCfg.WIDTH / 2, -itemCfg.HEIGHT / 2, itemCfg.WIDTH, itemCfg.HEIGHT, itemCfg.CORNER_RADIUS);
        } else {
            itemBg.fillStyle(itemCfg.NORMAL_BG, itemCfg.NORMAL_BG_ALPHA);
            itemBg.fillRoundedRect(-itemCfg.WIDTH / 2, -itemCfg.HEIGHT / 2, itemCfg.WIDTH, itemCfg.HEIGHT, itemCfg.CORNER_RADIUS);
        }
        itemBg.setPosition(0, y);
        container.add(itemBg);

        const label = scene.add.text(-itemCfg.WIDTH / 2 + 20, y, option.label, {
            fontFamily: itemCfg.FONT_FAMILY,
            fontSize: `${itemCfg.FONT_SIZE}px`,
            color: isSelected ? itemCfg.HOVER_COLOR : itemCfg.COLOR,
            stroke: itemCfg.STROKE,
            strokeThickness: itemCfg.STROKE_THICKNESS,
        });
        label.setOrigin(0, 0.5);
        container.add(label);

        const desc = scene.add.text(itemCfg.WIDTH / 2 - 20, y, option.desc, {
            fontFamily: itemCfg.FONT_FAMILY,
            fontSize: `${itemCfg.DESC_FONT_SIZE}px`,
            color: itemCfg.DESC_COLOR,
        });
        desc.setOrigin(1, 0.5);
        container.add(desc);

        const hitArea = scene.add.zone(0, y, itemCfg.WIDTH, itemCfg.HEIGHT)
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });
        container.add(hitArea);

        hitArea.on('pointerover', () => { if (!isSelected) label.setColor(itemCfg.HOVER_COLOR); });
        hitArea.on('pointerout', () => { if (!isSelected) label.setColor(itemCfg.COLOR); });
        hitArea.on('pointerdown', onClick);
    }

    /**
     * Confirm animation (scale pulse + slide up) when a selection is made.
     * @private
     */
    static _confirmAndDismiss(scene, onComplete) {
        const container = scene._botModeSelector;
        const blocker = scene._botModeSelectorBlocker;
        if (!container) { if (onComplete) onComplete(); return; }
        scene._botModeSelector = null;
        scene._botModeSelectorBlocker = null;

        // Blocker fades out
        if (blocker) {
            scene.tweens.add({
                targets: blocker,
                fillAlpha: 0,
                duration: 250,
                ease: 'Sine.easeIn',
                onComplete: () => blocker.destroy(),
            });
        }

        // Panel: brief scale-up pulse then slide up + fade
        scene.tweens.add({
            targets: container,
            scaleX: 1.03,
            scaleY: 1.03,
            duration: 100,
            ease: 'Sine.easeOut',
            onComplete: () => {
                scene.tweens.add({
                    targets: container,
                    alpha: 0,
                    y: container.y - 30,
                    scaleX: 0.95,
                    scaleY: 0.95,
                    duration: 200,
                    ease: 'Sine.easeIn',
                    onComplete: () => {
                        container.destroy();
                        if (onComplete) onComplete();
                    },
                });
            },
        });
    }

    /**
     * Close animation (just fade down) — used for close button / outside tap.
     * @private
     */
    static _close(scene) {
        const container = scene._botModeSelector;
        const blocker = scene._botModeSelectorBlocker;
        if (!container) return;
        scene._botModeSelector = null;
        scene._botModeSelectorBlocker = null;

        if (blocker) {
            scene.tweens.add({
                targets: blocker,
                fillAlpha: 0,
                duration: 180,
                ease: 'Sine.easeIn',
                onComplete: () => blocker.destroy(),
            });
        }

        scene.tweens.add({
            targets: container,
            alpha: 0,
            scaleX: 0.92,
            scaleY: 0.92,
            duration: 180,
            ease: 'Sine.easeIn',
            onComplete: () => container.destroy(),
        });
    }

    /** Alias kept for external callers (hamburger menu close, etc.) */
    static dismiss(scene) {
        this._close(scene);
    }

    static forceClear(scene) {
        if (scene._botModeSelectorBlocker) {
            scene.tweens.killTweensOf(scene._botModeSelectorBlocker);
            scene._botModeSelectorBlocker.destroy();
            scene._botModeSelectorBlocker = null;
        }
        if (scene._botModeSelector) {
            scene.tweens.killTweensOf(scene._botModeSelector);
            scene._botModeSelector.destroy();
            scene._botModeSelector = null;
        }
    }
}
