import { Player } from '../entities/Player.js';
import { PlayerAvatar } from '../entities/PlayerAvatar.js';
import { SEAT_POSITIONS } from '../config/settings.js';

/**
 * PlayerManager - manages players at the table
 */
export class PlayerManager {
    constructor(scene = null) {
        this.players = [];
        this.currentBankerId = null;
        this.scene = scene;
        this.playerLabels = [];
        this.playerAvatars = [];
    }

    setupPlayers(playerCount) {
        this.players = [];
        const positions = SEAT_POSITIONS;

        if (!positions) {
            console.error(`Invalid player count: ${playerCount}`);
            return this.players;
        }

        positions.forEach((pos, index) => {
            const isLocal = pos.position === 'bottom';
            const player = new Player(index, pos.position, pos.x, pos.y, isLocal);

            // Assign name and random chips
            // Local player gets a readable nickname, others get masked names
            player.setName(isLocal ? this.generateNickname() : this.generateMaskedName());
            player.setChips(this.generateRandomChips());

            this.players.push(player);
        });

        return this.players;
    }

    /**
     * Generate a readable nickname for local player
     */
    generateNickname() {
        const adjectives = ['Lucky', 'Cool', 'Pro', 'Golden', 'Swift', 'Bold', 'Ace', 'King'];
        const nouns = ['Tiger', 'Dragon', 'Star', 'Phoenix', 'Lion', 'Hawk', 'Wolf', 'Bear'];
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const num = Math.floor(Math.random() * 100);
        return `${adj}${noun}${num}`;
    }

    /**
     * Generate a masked username like "u****b4a"
     */
    generateMaskedName() {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        const firstChar = chars[Math.floor(Math.random() * 26)]; // letter only
        const lastChars = Array.from({ length: 3 }, () =>
            chars[Math.floor(Math.random() * chars.length)]
        ).join('');
        return `${firstChar}****${lastChars}`;
    }

    generateRandomChips() {
        if (Math.random() < 0.5) {
            return Math.floor(100 + Math.random() * 8000);
        } else {
            return Math.floor(100 + Math.random() * 5000000);
        }
    }

    getPlayer(id) {
        return this.players[id];
    }

    getLocalPlayer() {
        return this.players.find(p => p.isLocal);
    }

    getAllPlayers() {
        return this.players;
    }

    clearAllCards() {
        this.players.forEach(player => player.clearCards());
    }

    /**
     * Set a player as the banker
     * @param {number} playerId - The player ID to set as banker
     */
    setBanker(playerId) {
        // Remove banker status from all players
        this.players.forEach(player => player.setBanker(false));

        // Set new banker
        const player = this.getPlayer(playerId);
        if (player) {
            player.setBanker(true);
            this.currentBankerId = playerId;
        }
    }

    /**
     * Get the current banker player
     * @returns {Player|null} The banker player or null
     */
    getBanker() {
        return this.players.find(p => p.isBanker);
    }

    /**
     * Rotate banker to next player in sequence
     * Rotation order: 0 -> 1 -> 2 -> 3 -> 0
     * @returns {Player} The new banker player
     */
    rotateBanker() {
        const nextBankerId = (this.currentBankerId + 1) % this.players.length;
        this.setBanker(nextBankerId);
        return this.getBanker();
    }

    /**
     * Get current banker ID
     * @returns {number|null} The current banker's ID
     */
    getCurrentBankerId() {
        return this.currentBankerId;
    }

    /**
     * Create visual labels for all players
     * Shows player names/identifiers above their position
     */
    createPlayerLabels() {
        // Destroy existing labels first
        this.playerLabels.forEach(label => label.destroy());
        this.playerLabels = [];

        if (!this.scene) {
            console.warn('PlayerManager: No scene set, cannot create labels');
            return;
        }
    }

    /**
     * Destroy all player labels
     */
    destroyPlayerLabels() {
        this.playerLabels.forEach(label => label.destroy());
        this.playerLabels = [];
    }

    /**
     * Create avatar frames for all players
     * Avatars are linked to player entities and reflect player.isBanker
     */
    createPlayerAvatars() {
        // Destroy existing avatars first
        this.playerAvatars.forEach(avatar => avatar.destroy());
        this.playerAvatars = [];

        if (!this.scene) {
            console.warn('PlayerManager: No scene set, cannot create avatars');
            return;
        }

        const avatarPool = [
            'avatar_1', 'avatar_5',
            'avatar_2', 'avatar_6',
            'avatar_3', 'avatar_7',
            'avatar_4', 'avatar_8'
        ];
        const shuffledPool = [...avatarPool].sort(() => Math.random() - 0.5);

        this.players.forEach((player, index) => {
            const avatar = new PlayerAvatar(this.scene, player);
            avatar.setAvatarImage(shuffledPool[index]);
            avatar.updateBankerDisplay();
            this.playerAvatars.push(avatar);
        });
    }

    /**
     * Update all avatars to reflect current player banker status
     */
    updateAvatarBankerStatus() {
        this.playerAvatars.forEach(avatar => avatar.updateBankerDisplay());
    }

    /**
     * Update all avatar chips displays
     */
    updateAvatarChips() {
        this.playerAvatars.forEach(avatar => avatar.updateChipsDisplay());
    }

    /**
     * Destroy all player avatars
     */
    destroyPlayerAvatars() {
        this.playerAvatars.forEach(avatar => avatar.destroy());
        this.playerAvatars = [];
    }
}
