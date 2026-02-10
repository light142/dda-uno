import { ASSET_DIMENSIONS } from '../config/assetDimensions.js';
import { AVATAR_NICKNAME_DISPLAY } from '../config/settings.js';

/**
 * PlayerAvatar - displays player avatar with frame
 */
export class PlayerAvatar extends Phaser.GameObjects.Container {
    constructor(scene, player) {
        super(scene, player.x, player.y);
        this.scene = scene;
        this.player = player;
        this.isLocal = player.isLocal;
        scene.add.existing(this);
        this.createAvatar();
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
        const frameKey = this.player ? `player_frame_${this.player.position}` : 'player_frame_bottom';
        this.placeholder = this.scene.add.rectangle(0, 0, avatarSize, avatarSize, 0x333333);
        this.add(this.placeholder);
        this.frame = this.scene.add.sprite(0, 0, frameKey);
        this.frame.setDisplaySize(frameSize, frameSize);
        this.add(this.frame);
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
        super.destroy();
    }
}
