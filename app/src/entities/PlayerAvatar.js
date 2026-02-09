import { ASSET_DIMENSIONS } from '../config/assetDimensions.js';
import { AVATAR_CHIPS_DISPLAY, AVATAR_NICKNAME_DISPLAY } from '../config/settings.js';

/**
 * PlayerAvatar - displays player avatar with frame
 * Linked to Player entity to reflect banker status
 */
export class PlayerAvatar extends Phaser.GameObjects.Container {
    constructor(scene, player) {
        super(scene, player.x, player.y);
        this.scene = scene;
        this.player = player;
        this.isLocal = player.isLocal;
        scene.add.existing(this);
        this.createAvatar();
        this.createChipsDisplay();
        this.createNicknameDisplay();
    }

    getAvatarSize() {
        const dims = this.isLocal ? ASSET_DIMENSIONS.AVATAR_LOCAL : ASSET_DIMENSIONS.AVATAR;
        return dims.WIDTH;
    }

    getFrameSize() {
        const dims = this.isLocal ? ASSET_DIMENSIONS.FRAME_LOCAL : ASSET_DIMENSIONS.FRAME;
        return dims.WIDTH;
    }

    createAvatar() {
        const avatarSize = this.getAvatarSize();
        const frameSize = this.getFrameSize();
        const frameKey = this.isLocal ? 'player_frame_local' : 'player_frame';
        this.placeholder = this.scene.add.rectangle(0, 0, avatarSize, avatarSize, 0x333333);
        this.add(this.placeholder);
        this.frame = this.scene.add.image(0, 0, frameKey);
        this.frame.setDisplaySize(frameSize, frameSize);
        this.add(this.frame);
    }

    clearBankerEffects() {
        if (this.bankerTween) {
            this.bankerTween.stop();
            this.bankerTween = null;
        }
        if (this.bankerGlow) {
            this.bankerGlow.destroy();
            this.bankerGlow = null;
        }
    }

    createBankerEffects() {
        const avatarSize = this.getAvatarSize();
        this.bankerGlow = this.scene.add.rectangle(0, 0, avatarSize, avatarSize, 0xffd700, 1);
        this.addAt(this.bankerGlow, 0);
        this.bankerTween = this.scene.tweens.add({
            targets: this.bankerGlow,
            scale: 1.8,
            alpha: 0,
            duration: 2000,
            ease: 'Linear',
            repeat: -1,
            onRepeat: () => {
                this.bankerGlow.setScale(1);
                this.bankerGlow.setAlpha(0.6);
            }
        });
    }

    /**
     * Update avatar display to reflect player's banker status
     */
    updateBankerDisplay() {
        const isBanker = this.player.isBanker;
        const frameSize = this.getFrameSize();
        const bankerKey = this.isLocal ? 'banker_frame_local' : 'banker_frame';
        const playerKey = this.isLocal ? 'player_frame_local' : 'player_frame';
        this.frame.setTexture(isBanker ? bankerKey : playerKey);
        this.frame.setDisplaySize(frameSize, frameSize);
        this.clearBankerEffects();
        if (isBanker) {
            this.createBankerEffects();
        }
    }

    setAvatarImage(textureKey) {
        if (this.avatarImg) {
            this.avatarImg.destroy();
        }

        const avatarSize = this.getAvatarSize();
        this.avatarImg = this.scene.add.image(0, 0, textureKey);

        const imgWidth = this.avatarImg.width;
        const imgHeight = this.avatarImg.height;

        // Scale uniformly so smallest dimension fills avatarSize
        const minDimension = Math.min(imgWidth, imgHeight);
        const scale = avatarSize / minDimension;
        this.avatarImg.setScale(scale);

        // Crop center to avatarSize x avatarSize
        const cropSize = avatarSize / scale;
        const cropX = (imgWidth - cropSize) / 2;
        const cropY = (imgHeight - cropSize) / 2;

        this.avatarImg.setCrop(cropX, cropY, cropSize, cropSize);

        this.addAt(this.avatarImg, 1);
    }

    createChipsDisplay() {
        const avatarSize = this.getAvatarSize();
        const config = this.isLocal ? AVATAR_CHIPS_DISPLAY.LOCAL_PLAYER : AVATAR_CHIPS_DISPLAY.OTHER_PLAYERS;
        const colors = AVATAR_CHIPS_DISPLAY.COLORS;
        const yPos = avatarSize / 2 - config.BG_HEIGHT / 2;

        // Dark transparent background (under frame)
        this.chipsBg = this.scene.add.graphics();
        this.chipsBg.fillStyle(colors.BG, colors.BG_ALPHA);
        const r = AVATAR_CHIPS_DISPLAY.BG_CORNER_RADIUS;
        this.chipsBg.fillRoundedRect(
            -avatarSize / 2,
            yPos - config.BG_HEIGHT / 2,
            avatarSize,
            config.BG_HEIGHT,
            { tl: 0, tr: 0, bl: r, br: r }
        );
        this.addAt(this.chipsBg, 2);

        // Spinning coin on left
        const coinX = -avatarSize / 2 + config.COIN_SIZE / 2 + config.COIN_PADDING_LEFT;
        this.createSpinningCoin(coinX, yPos, config.COIN_SIZE);

        // Chips text (right-aligned so suffix stays in fixed position)
        const formattedChips = this.formatChips(this.player.chips);
        const hasSuffix = /[KMBT]$/.test(formattedChips);
        const extraPadding = hasSuffix ? 0 : (config.NO_SUFFIX_EXTRA_PADDING || 12);
        const textX = avatarSize / 2 - config.TEXT_PADDING_RIGHT - extraPadding;
        this.chipsText = this.scene.add.text(textX, yPos, formattedChips, {
            fontSize: config.FONT_SIZE + 'px',
            fontFamily: 'Nunito, Arial',
            fontStyle: 'bold',
            color: colors.TEXT,
            stroke: colors.TEXT_STROKE,
            strokeThickness: colors.TEXT_STROKE_THICKNESS
        });
        this.chipsText.setOrigin(1, 0.5);
        this.chipsTextConfig = { avatarSize, config }; // Store for updates
        this.add(this.chipsText);
    }

    createSpinningCoin(x, y, size) {
        const radius = size / 2;
        const colors = AVATAR_CHIPS_DISPLAY.COLORS;
        this.coin = this.scene.add.graphics();
        this.coin.setPosition(x, y);

        // Coin shadow
        this.coin.fillStyle(colors.COIN_SHADOW, 0.3);
        this.coin.fillCircle(1, 1, radius);

        // Outer ring
        this.coin.fillStyle(colors.COIN_OUTER, 1);
        this.coin.fillCircle(0, 0, radius);

        // Inner face
        this.coin.fillStyle(colors.COIN_INNER, 1);
        this.coin.fillCircle(0, 0, radius * 0.75);

        // Shine
        this.coin.fillStyle(colors.COIN_SHINE, 0.4);
        this.coin.fillCircle(-radius * 0.25, -radius * 0.25, radius * 0.2);

        // Center dot
        this.coin.fillStyle(colors.COIN_CENTER, 1);
        this.coin.fillCircle(0, 0, radius * 0.2);

        this.add(this.coin);

        // Spin animation
        this.coinTween = this.scene.tweens.add({
            targets: this.coin,
            scaleX: 0.1,
            duration: 800,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });
    }

    formatChips(amount) {
        if (amount < 10000) {
            // Under 10K: show raw number
            return amount.toString();
        } else if (amount < 10000000) {
            // 10K - 9.999M: show in K with 1 decimal (e.g., 12.1K, 1350.3K)
            const kValue = amount / 1000;
            const formatted = kValue.toFixed(1);
            const [intPart, decPart] = formatted.split('.');
            return intPart + '.' + decPart + 'K';
        } else if (amount < 10000000000) {
            // 10M - 9.999B: show in M with 3 decimals (e.g., 12.352M)
            return (amount / 1000000).toFixed(3) + 'M';
        } else if (amount < 10000000000000) {
            // 10B - 9.999T: show in B with 3 decimals
            return (amount / 1000000000).toFixed(3) + 'B';
        } else {
            // 10T+: show in T with 3 decimals
            return (amount / 1000000000000).toFixed(3) + 'T';
        }
    }

    updateChipsDisplay() {
        if (this.chipsText && this.chipsTextConfig) {
            const formattedChips = this.formatChips(this.player.chips);
            const hasSuffix = /[KMBT]$/.test(formattedChips);
            const { avatarSize, config } = this.chipsTextConfig;
            const extraPadding = hasSuffix ? 0 : (config.NO_SUFFIX_EXTRA_PADDING || 12);
            const textX = avatarSize / 2 - config.TEXT_PADDING_RIGHT - extraPadding;
            this.chipsText.setX(textX);
            this.chipsText.setText(formattedChips);
        }
    }

    createNicknameDisplay() {
        const config = this.isLocal ? AVATAR_NICKNAME_DISPLAY.LOCAL_PLAYER : AVATAR_NICKNAME_DISPLAY.OTHER_PLAYERS;
        const colors = AVATAR_NICKNAME_DISPLAY.COLORS;
        const w = config.WIDTH;
        const h = config.HEIGHT;
        const r = config.CORNER_RADIUS;
        const yPos = config.OFFSET_Y;

        // Dark background
        this.nicknameBg = this.scene.add.graphics();
        this.nicknameBg.fillStyle(colors.BG, colors.BG_ALPHA);
        this.nicknameBg.fillRoundedRect(-w / 2, yPos - h / 2, w, h, r);
        this.add(this.nicknameBg);

        // Gold border
        this.nicknameBorder = this.scene.add.graphics();
        this.nicknameBorder.lineStyle(colors.BORDER_WIDTH, colors.BORDER, colors.BORDER_ALPHA);
        this.nicknameBorder.strokeRoundedRect(-w / 2, yPos - h / 2, w, h, r);
        this.add(this.nicknameBorder);

        // Nickname text (centered, truncated if too long)
        const fullName = this.player.name || `Player ${this.player.id + 1}`;
        const displayName = this.truncateName(fullName, w - 16, config.FONT_SIZE);
        this.nicknameText = this.scene.add.text(0, yPos, displayName, {
            fontSize: config.FONT_SIZE + 'px',
            fontFamily: 'Nunito, Arial',
            fontStyle: 'bold',
            color: colors.TEXT,
            stroke: colors.TEXT_STROKE,
            strokeThickness: colors.TEXT_STROKE_THICKNESS
        });
        this.nicknameText.setOrigin(0.5);
        this.add(this.nicknameText);
    }

    truncateName(name, maxWidth, fontSize) {
        // Approximate character width (bold Nunito is roughly 0.6x font size)
        const charWidth = fontSize * 0.6;
        const maxChars = Math.floor(maxWidth / charWidth);

        if (name.length <= maxChars) {
            return name;
        }
        return name.substring(0, maxChars - 2) + '..'
    }

    updateNicknameDisplay() {
        if (this.nicknameText) {
            const displayName = this.player.name || `Player ${this.player.id + 1}`;
            this.nicknameText.setText(displayName);
        }
    }

    destroy() {
        if (this.coinTween) {
            this.coinTween.stop();
            this.coinTween = null;
        }
        this.clearBankerEffects();
        super.destroy();
    }
}
