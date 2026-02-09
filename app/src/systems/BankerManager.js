/**
 * BankerManager - Orchestrates banker role rotation and visual indicators
 * Coordinates between PlayerManager, VisualDeck, and CardDealer
 */
export class BankerManager {
    constructor(scene, playerManager, visualDeck, cardDealer) {
        this.scene = scene;
        this.playerManager = playerManager;
        this.visualDeck = visualDeck;
        this.cardDealer = cardDealer;
    }

    /**
     * Rotate banker role to next player
     * Orchestrates: state rotation -> deck animation -> badge update -> dealer sync
     * @param {Function} onComplete - Called when rotation completes
     */
    rotateBankerRole(onComplete) {
        // 1. Rotate banker state
        const newBanker = this.playerManager.rotateBanker();

        // 2. Calculate new deck position using VisualDeck's static logic
        const newDeckPosition = this.visualDeck.constructor.calculatePositionForBanker(newBanker);

        // 3. Animate deck to new position
        this.visualDeck.repositionDeck(
            newDeckPosition.x,
            newDeckPosition.y,
            true, // Animate
            () => {
                // 4. Sync dealer with new deck position
                this.cardDealer.syncWithVisualDeck();
                if (onComplete) onComplete();
            }
        );

        // 5. Update visual indicators (avatars read from player.isBanker)
        this.playerManager.updateAvatarBankerStatus();
    }

    /**
     * Destroy banker indicator (cleanup)
     */
    destroy() {
    }
}
