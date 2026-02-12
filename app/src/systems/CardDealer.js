import { Card } from '../entities/Card.js';
import { ANIMATION, CARD_OFFSET_TO_CENTER, CARD_SPACING, LOCAL_PLAYER_HAND, OTHER_PLAYER_FAN } from '../config/settings.js';

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

    dealToPlayer(player, cardData, position, callback, { depth, slideDuration } = {}) {
        // Trigger visual deck animation if available
        if (this.visualDeck) {
            this.visualDeck.dealCardAnimation(() => {
                this.spawnAndSlideCard(player, cardData, position, callback, { depth, slideDuration });
            });
        } else {
            this.spawnAndSlideCard(player, cardData, position, callback, { depth, slideDuration });
        }
    }

    spawnAndSlideCard(player, cardData, position, callback, { depth, slideDuration } = {}) {
        const card = new Card(
            this.scene,
            this.deckX,
            this.deckY,
            cardData.suit,
            cardData.value,
            player.isLocal
        );

        if (depth !== undefined) card.setDepth(depth);

        const duration = slideDuration || ANIMATION.SLIDE_DURATION;

        this.scene.sound.stopByKey('place_card_sound');
        this.scene.sound.play('place_card_sound');

        card.slideTo(position.x, position.y, duration, () => {
            player.addCard(card);
            if (callback) callback(card);
        }, position.rotation || 0);
    }

    /**
     * Deal pre-determined cards to all players with animations.
     * @param {Array<Player>} players
     * @param {Array<Array<{suit, value}>>} playerHands - playerHands[i] = cards for player i
     * @param {Function} onComplete
     */
    dealToMultiplePlayers(players, playerHands, onComplete) {
        const cardsPerPlayer = playerHands[0]?.length || 0;
        const totalCards = cardsPerPlayer * players.length;
        let dealtCount = 0;

        for (let round = 0; round < cardsPerPlayer; round++) {
            players.forEach((player, playerIndex) => {
                const cardIndex = round * players.length + playerIndex;
                const cardData = playerHands[playerIndex][round];
                const positions = this.calculatePositions(player, cardsPerPlayer, CARD_SPACING.OTHER_PLAYERS, CARD_SPACING.LOCAL_PLAYER);

                const targetPos = player.position === 'right'
                    ? positions[cardsPerPlayer - 1]
                    : positions[round];

                this.scene.time.delayedCall(cardIndex * ANIMATION.DEAL_DELAY, () => {
                    if (player.position === 'right' && player.cards.length > 0) {
                        const existingCount = player.cards.length;
                        this.scene.time.delayedCall(200, () => {
                            player.cards.forEach((card, i) => {
                                const newPos = positions[cardsPerPlayer - 1 - existingCount + i];
                                this.scene.tweens.add({
                                    targets: card,
                                    x: newPos.x,
                                    y: newPos.y,
                                    duration: 200,
                                    ease: 'Power2',
                                });
                            });
                        });
                    }

                    this.dealToPlayer(player, cardData, targetPos, () => {
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
     * Deal extra cards to players with 50% chance each
     * @param {Array} players - All players
     * @param {Deck} deck - The deck to draw from
     * @param {Function} onComplete - Callback when done
     */
    dealExtraCards(players, deck, onComplete) {
        const playersGettingExtra = players.filter(() => Math.random() < 0.5);

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
        let spacing = player.isLocal ? localPlayerSpacing : defaultSpacing;

        // Cap hand width so cards overlap more instead of overflowing
        if (cardCount > 1) {
            const idealWidth = (cardCount - 1) * spacing;
            let maxWidth;
            if (player.isLocal) {
                maxWidth = LOCAL_PLAYER_HAND.MAX_HAND_WIDTH;
            } else {
                const fanConfig = OTHER_PLAYER_FAN[player.position];
                maxWidth = fanConfig && fanConfig.maxHandWidth;
            }
            if (maxWidth && idealWidth > maxWidth) {
                spacing = maxWidth / (cardCount - 1);
            }
        }

        // Horizontal layout for dealing
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
    calculateFanPositions(player, overrideCount) {
        const cardCount = overrideCount || player.cards.length;
        const positions = [];

        const offset = CARD_OFFSET_TO_CENTER[player.position] || { x: 0, y: 0 };
        const centerX = player.x + offset.x;
        const centerY = player.y + offset.y;
        const maxRotation = LOCAL_PLAYER_HAND.MAX_ROTATION;
        const verticalLift = LOCAL_PLAYER_HAND.VERTICAL_LIFT;

        // Shrink spacing when hand exceeds max width so cards overlap more
        const idealWidth = (cardCount - 1) * CARD_SPACING.LOCAL_PLAYER;
        const spacing = idealWidth > LOCAL_PLAYER_HAND.MAX_HAND_WIDTH && cardCount > 1
            ? LOCAL_PLAYER_HAND.MAX_HAND_WIDTH / (cardCount - 1)
            : CARD_SPACING.LOCAL_PLAYER;

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

    /**
     * Calculate fan positions for other players' cards (3D-style arrangement)
     */
    calculateOtherPlayerFanPositions(player, overrideCount) {
        const config = OTHER_PLAYER_FAN[player.position];
        if (!config) return null;

        const cardCount = overrideCount || player.cards.length;
        const offset = CARD_OFFSET_TO_CENTER[player.position] || { x: 0, y: 0 };
        let centerX = player.x + offset.x;
        const centerY = player.y + offset.y;

        // Shrink spacing when hand exceeds max width
        let spacing = config.spacing;
        if (config.maxHandWidth && cardCount > 1) {
            const idealWidth = (cardCount - 1) * spacing;
            if (idealWidth > config.maxHandWidth) {
                spacing = config.maxHandWidth / (cardCount - 1);
            }
        }
        const totalSpread = (cardCount - 1) * spacing;

        // Anchor the avatar-nearest edge so fewer cards stay close to the avatar
        const maxSpread = (7 - 1) * config.spacing;
        const anchorShift = (totalSpread - maxSpread) / 2 * Math.sign(offset.x);
        centerX += anchorShift;

        // Spread direction vector
        const spreadRad = Phaser.Math.DegToRad(config.spreadAngle);
        const dirX = Math.cos(spreadRad);
        const dirY = Math.sin(spreadRad);
        // Perpendicular for arc curvature
        const perpX = -dirY;
        const perpY = dirX;

        const positions = [];

        for (let i = 0; i < cardCount; i++) {
            const t = cardCount > 1 ? (i / (cardCount - 1)) - 0.5 : 0;
            const spread = t * totalSpread;
            const arc = Math.cos(t * Math.PI) * config.arcAmount;

            const x = centerX + spread * dirX + arc * perpX;
            const y = centerY + spread * dirY + arc * perpY;

            const rotation = Phaser.Math.DegToRad(config.baseRotation + t * config.fanAngle);
            positions.push({ x, y, rotation });
        }

        return positions;
    }

    /**
     * Animate other players' cards into a 3D-style fan layout
     */
    fanOutOtherPlayerCards(player, callback) {
        const fanPositions = this.calculateOtherPlayerFanPositions(player);
        if (!fanPositions) {
            if (callback) callback();
            return;
        }

        const cards = player.cards;
        let completed = 0;

        cards.forEach((card, index) => {
            card.setDepth(3 + index);
            const pos = fanPositions[index];
            const delay = index * 60;

            card.animateToFanPosition(pos.x, pos.y, pos.rotation, delay, () => {
                completed++;
                if (completed === cards.length && callback) callback();
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
