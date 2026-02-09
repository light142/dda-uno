import { Card } from '../entities/Card.js';
import { ANIMATION, CARD_OFFSET_TO_CENTER, CARD_SPACING, LOCAL_PLAYER_HAND } from '../config/settings.js';

/**
 * CardDealer - handles dealing cards with animations
 */
export class CardDealer {
    constructor(scene, deckX = 360, deckY = 640, visualDeck = null) {
        this.scene = scene;
        this.deckX = deckX;
        this.deckY = deckY;
        this.visualDeck = visualDeck;
    }

    dealToPlayer(player, cardData, position, callback) {
        // Trigger visual deck animation if available
        if (this.visualDeck) {
            this.visualDeck.dealCardAnimation(() => {
                this.spawnAndSlideCard(player, cardData, position, callback);
            });
        } else {
            this.spawnAndSlideCard(player, cardData, position, callback);
        }
    }

    spawnAndSlideCard(player, cardData, position, callback) {
        const card = new Card(
            this.scene,
            this.deckX,
            this.deckY,
            cardData.suit,
            cardData.value,
            player.isLocal
        );

        this.scene.sound.stopByKey('place_card_sound');
        this.scene.sound.play('place_card_sound');

        card.slideTo(position.x, position.y, ANIMATION.SLIDE_DURATION, () => {
            player.addCard(card);
            if (callback) callback(card);
        });
    }

    /**
     * Get players in counterclockwise order starting from player after banker
     * @param {Array} players - All players
     * @param {number} bankerIndex - Index of the banker/dealer
     * @returns {Array} Players ordered counterclockwise, starting after banker
     */
    getCounterclockwiseOrder(players, bankerIndex) {
        const ordered = [];
        const count = players.length;
        // Counterclockwise means going backwards through indices (to the right)
        // Start from player to the right of banker (bankerIndex - 1, wrapping)
        for (let i = 1; i <= count; i++) {
            const idx = (bankerIndex - i + count) % count;
            ordered.push(players[idx]);
        }
        return ordered;
    }

    dealToMultiplePlayers(players, cardsPerPlayer, deck, onComplete, bankerIndex = 0) {
        // Get players in counterclockwise order starting after banker
        const orderedPlayers = this.getCounterclockwiseOrder(players, bankerIndex);
        const totalCards = cardsPerPlayer * orderedPlayers.length;
        let dealtCount = 0;

        // Deal round-robin in counterclockwise order
        for (let round = 0; round < cardsPerPlayer; round++) {
            orderedPlayers.forEach((player, playerIndex) => {
                const cardIndex = round * orderedPlayers.length + playerIndex;
                const cardData = deck.draw();
                const positions = this.calculatePositions(player, cardsPerPlayer, CARD_SPACING.OTHER_PLAYERS, CARD_SPACING.LOCAL_PLAYER);

                this.scene.time.delayedCall(cardIndex * ANIMATION.DEAL_DELAY, () => {
                    this.dealToPlayer(player, cardData, positions[round], () => {
                        dealtCount++;
                        if (dealtCount === totalCards && onComplete) {
                            onComplete();
                        }
                    });
                });
            });
        }
    }

    /**
     * Deal extra cards to players with 50% chance each, in counterclockwise order
     * @param {Array} players - All players
     * @param {number} bankerIndex - Index of the banker/dealer
     * @param {Deck} deck - The deck to draw from
     * @param {Function} onComplete - Callback when done
     */
    dealExtraCards(players, bankerIndex, deck, onComplete) {
        const orderedPlayers = this.getCounterclockwiseOrder(players, bankerIndex);
        const playersGettingExtra = orderedPlayers.filter(() => Math.random() < 0.5);

        if (playersGettingExtra.length === 0) {
            if (onComplete) onComplete();
            return;
        }

        let dealtCount = 0;
        playersGettingExtra.forEach((player, index) => {
            const cardData = deck.draw();
            const currentCardCount = player.cards.length;
            const newPositions = this.calculatePositions(player, currentCardCount + 1, CARD_SPACING.OTHER_PLAYERS, CARD_SPACING.LOCAL_PLAYER);

            this.scene.time.delayedCall(index * ANIMATION.DEAL_DELAY, () => {
                // Start dealing the new card immediately
                this.dealToPlayer(player, cardData, newPositions[currentCardCount], () => {
                    dealtCount++;
                    if (dealtCount === playersGettingExtra.length && onComplete) {
                        onComplete();
                    }
                });

                // Delay repositioning so existing cards move while new card is in flight
                // This creates a smoother "making room" effect
                this.scene.time.delayedCall(200, () => {
                    this.repositionExistingCards(player, newPositions);
                });
            });
        });
    }

    /**
     * Reposition existing cards to new positions with animation
     * @param {Player} player - The player whose cards to reposition
     * @param {Array} newPositions - Array of new positions for all cards
     * @param {Function} callback - Called when repositioning is complete
     */
    repositionExistingCards(player, newPositions, callback) {
        const cards = player.cards;
        if (cards.length === 0) {
            if (callback) callback();
            return;
        }

        let repositioned = 0;
        cards.forEach((card, index) => {
            const pos = newPositions[index];
            this.scene.tweens.add({
                targets: card,
                x: pos.x,
                y: pos.y,
                duration: 150,
                ease: 'Power2',
                onComplete: () => {
                    card.originalY = pos.y;
                    repositioned++;
                    if (repositioned === cards.length && callback) {
                        callback();
                    }
                }
            });
        });
    }

    calculatePositions(player, cardCount, defaultSpacing, localPlayerSpacing) {
        const positions = [];

        // Get offset toward center based on player position
        const offset = CARD_OFFSET_TO_CENTER[player.position] || { x: 0, y: 0 };
        const centerX = player.x + offset.x;
        const centerY = player.y + offset.y;
        const spacing = player.isLocal ? localPlayerSpacing : defaultSpacing;

        // Simple horizontal layout for dealing
        const totalWidth = (cardCount - 1) * spacing;
        const startX = centerX - totalWidth / 2;

        for (let i = 0; i < cardCount; i++) {
            positions.push({
                x: startX + i * spacing,
                y: centerY
            });
        }

        return positions;
    }

    /**
     * Calculate fan positions for local player cards
     * @param {Player} player - The local player
     * @returns {Array} Array of {x, y, rotation} for fan layout
     */
    calculateFanPositions(player) {
        const cardCount = player.cards.length;
        const positions = [];

        const offset = CARD_OFFSET_TO_CENTER[player.position] || { x: 0, y: 0 };
        const centerX = player.x + offset.x;
        const centerY = player.y + offset.y;
        const spacing = CARD_SPACING.LOCAL_PLAYER;
        const maxRotation = LOCAL_PLAYER_HAND.MAX_ROTATION;
        const verticalLift = LOCAL_PLAYER_HAND.VERTICAL_LIFT;

        const totalWidth = (cardCount - 1) * spacing;
        const startX = centerX - totalWidth / 2;

        for (let i = 0; i < cardCount; i++) {
            const t = cardCount > 1 ? (i / (cardCount - 1)) - 0.5 : 0;
            const x = startX + i * spacing;
            const arcOffset = Math.cos(t * Math.PI) * verticalLift;
            const y = centerY - arcOffset;
            const rotation = t * maxRotation * 2 * (Math.PI / 180);

            positions.push({ x, y, rotation });
        }

        return positions;
    }

    /**
     * Animate local player cards into fan layout
     * @param {Player} player - The local player
     * @param {Function} onComplete - Called when animation completes
     */
    fanOutLocalPlayerCards(player, onComplete) {
        const fanPositions = this.calculateFanPositions(player);
        const cards = player.cards;
        let completed = 0;

        cards.forEach((card, index) => {
            const pos = fanPositions[index];
            const delay = index * 100;

            card.animateToFanPosition(pos.x, pos.y, pos.rotation, delay, () => {
                completed++;
                if (completed === cards.length && onComplete) {
                    onComplete();
                }
            });
        });
    }

    revealPlayerCards(player, callback) {
        player.cards.forEach((card, index) => {
            this.scene.time.delayedCall(index * 150, () => {
                card.flip(() => {
                    if (index === player.cards.length - 1 && callback) {
                        callback();
                    }
                });
            });
        });
    }

    /**
     * Update deck position for dealing
     * @param {number} x - New deck X position
     * @param {number} y - New deck Y position
     */
    updateDeckPosition(x, y) {
        this.deckX = x;
        this.deckY = y;
    }

    /**
     * Sync deck position with visual deck
     */
    syncWithVisualDeck() {
        if (this.visualDeck) {
            const pos = this.visualDeck.getDeckPosition();
            this.updateDeckPosition(pos.x, pos.y);
        }
    }
}
