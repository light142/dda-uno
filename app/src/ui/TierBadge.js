import { TIER_BADGE } from '../config/settings.js';

const TIER_DISPLAY = {
    'hyper_adversarial': 'Hyper Aversarial',
    'adversarial':       'Aversarial',
    'selfish':           'Selfish',
    'random':            'Random',
    'altruistic':        'Altruistic',
    'hyper_altruistic':  'Hyper Altruistic',
};

/**
 * TierBadge — two right-aligned pills in the top-right corner:
 *   1. Current game tier   (e.g. "SELFISH · adaptive")
 *   2. Settings badge      (e.g. the current bot-mode setting)
 *
 * Tapping either pill opens the BotModeSelector.
 *
 * Usage:
 *   TierBadge.show(scene, 'selfish', 'adaptive', onTap);
 */
export class TierBadge {
    /**
     * @param {Phaser.Scene} scene
     * @param {string} tier      - current game's tier (e.g. 'selfish')
     * @param {string} gameMode  - mode the current game was started with ('adaptive' or tier name)
     * @param {string} [nextMode] - if set and different from gameMode, show "Next Game" pill
     * @param {Function} [onTap] - called when either badge is tapped
     */
    static show(scene, tier, gameMode, nextMode, onTap) {
        this.forceClear(scene);

        const cfg = TIER_BADGE;
        const children = [];
        let yOffset = cfg.Y;

        // ── "Now Playing" pill (only when a game is in progress) ──
        if (tier && gameMode) {
            const isAdaptive = gameMode === 'adaptive';
            const tierLabel = TIER_DISPLAY[tier] || tier.toUpperCase();
            const currentLabel = isAdaptive
                ? tierLabel + ' · Adaptive'
                : tierLabel + ' · Fixed';
            const currentColor = cfg.MODE_FONT.COLOR_ADAPTIVE;
            const gamePill = this._createDualPill(scene, 'Now Playing', currentLabel, currentColor, cfg);
            gamePill.container.setPosition(cfg.X + gamePill.width / 2, yOffset);
            children.push(gamePill.container);
            if (onTap) gamePill.hitArea.on('pointerdown', onTap);
            yOffset += gamePill.height + 3;
        }

        // ── "Next Game" pill ──
        const effectiveNext = nextMode || gameMode;
        if (effectiveNext) {
            const nextIsFixed = effectiveNext !== 'adaptive';
            const showNext = !gameMode || nextIsFixed || effectiveNext !== gameMode;
            if (showNext) {
                const nextIsAdaptive = effectiveNext === 'adaptive';
                const nextTierLabel = nextIsAdaptive
                    ? 'Adaptive'
                    : (TIER_DISPLAY[effectiveNext] || effectiveNext) + ' · Fixed';
                const nextColor = cfg.MODE_FONT.COLOR_ADAPTIVE;
                const settingsPill = this._createDualPill(scene, 'Next Game', nextTierLabel, nextColor, cfg);
                settingsPill.container.setPosition(cfg.X + settingsPill.width / 2, yOffset);
                children.push(settingsPill.container);
                if (onTap) settingsPill.hitArea.on('pointerdown', onTap);
            }
        }

        if (children.length === 0) return;

        // Wrapper container
        const wrapper = scene.add.container(0, 0, children);
        wrapper.setDepth(cfg.DEPTH);
        wrapper.setAlpha(0);

        scene._tierBadge = wrapper;

        scene.tweens.add({
            targets: wrapper,
            alpha: 1,
            duration: cfg.FADE_IN_MS,
            ease: 'Sine.easeOut',
        });
    }


    /** @private — pill with dimmer prefix + bright value */
    static _createDualPill(scene, prefix, value, valueColor, cfg) {
        const prefixLabel = scene.add.text(0, 0, prefix, {
            fontFamily: cfg.TIER_FONT.FAMILY,
            fontSize: `${cfg.TIER_FONT.SIZE - 1}px`,
            color: '#A0998E',
        });
        prefixLabel.setOrigin(0, 0.5);

        const valueLabel = scene.add.text(prefixLabel.width + 5, 0, value, {
            fontFamily: cfg.TIER_FONT.FAMILY,
            fontSize: `${cfg.TIER_FONT.SIZE}px`,
            color: valueColor,
        });
        valueLabel.setOrigin(0, 0.5);

        const totalW = prefixLabel.width + 5 + valueLabel.width;
        const pillW = totalW + cfg.PADDING_H * 2;
        const pillH = Math.max(prefixLabel.height, valueLabel.height) + cfg.PADDING_V * 2;

        // Center both labels within the pill
        prefixLabel.setPosition(-totalW / 2, 0);
        valueLabel.setPosition(-totalW / 2 + prefixLabel.width + 5, 0);

        const bg = scene.add.graphics();
        bg.fillStyle(cfg.BG_COLOR, cfg.BG_ALPHA);
        bg.fillRoundedRect(-pillW / 2, -pillH / 2, pillW, pillH, cfg.CORNER_RADIUS);
        bg.lineStyle(cfg.BORDER_WIDTH, cfg.BORDER_COLOR, cfg.BORDER_ALPHA);
        bg.strokeRoundedRect(-pillW / 2, -pillH / 2, pillW, pillH, cfg.CORNER_RADIUS);

        const hitArea = scene.add.zone(0, 0, pillW, pillH)
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        const container = scene.add.container(0, 0, [bg, prefixLabel, valueLabel, hitArea]);
        return { container, hitArea, width: pillW, height: pillH };
    }

    static dismiss(scene) {
        const w = scene._tierBadge;
        if (!w) return;
        const cfg = TIER_BADGE;
        scene.tweens.add({
            targets: w,
            alpha: 0,
            duration: cfg.FADE_OUT_MS,
            ease: 'Sine.easeIn',
            onComplete: () => {
                w.destroy();
                if (scene._tierBadge === w) scene._tierBadge = null;
            },
        });
    }

    static forceClear(scene) {
        if (scene._tierBadge) {
            scene.tweens.killTweensOf(scene._tierBadge);
            scene._tierBadge.destroy();
            scene._tierBadge = null;
        }
    }
}
