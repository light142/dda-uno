import { EMOTE_DISPLAY } from '../config/settings.js';

/**
 * EmoteSystem - manages emote animations for player avatars
 */
export class EmoteSystem {
    constructor(scene, playerManager) {
        this.scene = scene;
        this.playerManager = playerManager;
        this.activeEmotes = new Map(); // playerId -> emote sprite
    }

    /**
     * Play an emote animation on a player's avatar
     * @param {number} playerId - The player ID (0-3)
     * @param {string} emoteKey - The emote key (e.g., 'cry')
     * @param {object} options - Optional settings { scale, offsetY, onComplete }
     */
    playEmote(playerId, emoteKey, options = {}) {
        const player = this.playerManager.getPlayer(playerId);
        const avatar = this.playerManager.playerAvatars[playerId];
        if (!avatar || !player) {
            console.warn(`EmoteSystem: Avatar not found for player ${playerId}`);
            return;
        }

        // Get settings based on player type
        const config = player.isLocal ? EMOTE_DISPLAY.LOCAL_PLAYER : EMOTE_DISPLAY.OTHER_PLAYERS;

        const {
            scale = config.SCALE,
            offsetY = config.OFFSET_Y,
            onComplete = null
        } = options;

        // Skip if emote already playing for this player
        if (this.activeEmotes.has(playerId)) {
            return;
        }

        const animKey = `emote_${emoteKey}_anim`;

        // Check if animation exists
        if (!this.scene.anims.exists(animKey)) {
            console.warn(`EmoteSystem: Animation '${animKey}' not found`);
            return;
        }

        // Create sprite at avatar's world position (not inside container for proper depth)
        const emoteSprite = this.scene.add.sprite(avatar.x, avatar.y + offsetY, `emote_${emoteKey}`);
        emoteSprite.setScale(0); // Start at 0 for grow-in effect
        emoteSprite.setDepth(EMOTE_DISPLAY.DEPTH);

        // Store reference
        this.activeEmotes.set(playerId, emoteSprite);

        // Pop out: quickly overshoot, then settle to final scale
        this.scene.tweens.add({
            targets: emoteSprite,
            scale: scale * 1.1,
            duration: 120,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                // Settle back to normal scale
                this.scene.tweens.add({
                    targets: emoteSprite,
                    scale: scale,
                    duration: 80,
                    ease: 'Sine.easeInOut',
                    onComplete: () => {
                        // Play animation after pop-in
                        emoteSprite.play(animKey);

                        // When animation completes, shrink into the bottom
                        emoteSprite.on('animationcomplete', () => {
                            // Shift origin to bottom-center so it shrinks downward
                            const bottomY = emoteSprite.y + emoteSprite.displayHeight / 2;
                            emoteSprite.setOrigin(0.5, 1);
                            emoteSprite.y = bottomY;

                            this.scene.tweens.add({
                                targets: emoteSprite,
                                scale: 0,
                                alpha: 0.5,
                                duration: 300,
                                ease: 'Quad.easeIn',
                                onComplete: () => {
                                    this.stopEmote(playerId);
                                    if (onComplete) {
                                        onComplete();
                                    }
                                }
                            });
                        });
                    }
                });
            }
        });
    }

    /**
     * Stop and remove emote for a specific player
     * @param {number} playerId - The player ID
     */
    stopEmote(playerId) {
        const emote = this.activeEmotes.get(playerId);
        if (emote) {
            this.scene.tweens.killTweensOf(emote); // Kill any running tweens
            emote.off('animationcomplete');
            emote.destroy();
            this.activeEmotes.delete(playerId);
        }
    }

    /**
     * Stop all active emotes
     */
    stopAllEmotes() {
        this.activeEmotes.forEach((emote) => {
            this.scene.tweens.killTweensOf(emote);
            emote.off('animationcomplete');
            emote.destroy();
        });
        this.activeEmotes.clear();
    }

    /**
     * Play emote on local player
     * @param {string} emoteKey - The emote key
     * @param {object} options - Optional settings
     */
    playLocalEmote(emoteKey, options = {}) {
        const localPlayer = this.playerManager.getLocalPlayer();
        if (localPlayer) {
            this.playEmote(localPlayer.id, emoteKey, options);
        }
    }
}
