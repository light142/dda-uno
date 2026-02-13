import { GameLogic } from '../logic/GameLogic.js';
import { Card } from '../entities/Card.js';
import { DRAG_DROP, BOT_TURN, ANIMATION, COLOR_REPLACE } from '../config/settings.js';

/**
 * MoveExecutor — animates an array of bot moves sequentially.
 * Each move is a data object; this system translates them into Phaser animations.
 */
export class MoveExecutor {
    constructor(scene) {
        this.scene = scene;
        this.isExecuting = false;
    }

    /**
     * Execute an array of moves sequentially with animations.
     * @param {Array} moveset - array of move objects
     * @param {Function} onComplete - called when all moves are done
     */
    executeMoves(moveset, onComplete) {
        if (!moveset || moveset.length === 0) {
            if (onComplete) onComplete();
            return;
        }

        this.isExecuting = true;
        this._executeAtIndex(moveset, 0, () => {
            this.isExecuting = false;
            if (onComplete) onComplete();
        });
    }

    /**
     * Cancel current execution.
     */
    cancel() {
        this.isExecuting = false;
    }

    // ── Private ──

    /**
     * Execute the move at the given index, then recurse.
     * @private
     */
    _executeAtIndex(moveset, index, onComplete) {
        if (!this.isExecuting || index >= moveset.length) {
            onComplete();
            return;
        }

        const move = moveset[index];
        const delay = index === 0 ? BOT_TURN.THINK_DELAY : BOT_TURN.BETWEEN_BOTS;

        this.scene.scheduleTimer(delay, () => {
            if (!this.isExecuting) { onComplete(); return; }

            const advance = () => this._executeAtIndex(moveset, index + 1, onComplete);

            switch (move.action) {
                case 'play':
                    this._executePlayMove(move, null, advance);
                    break;
                case 'draw':
                    this._executeDrawMove(move, advance);
                    break;
                default:
                    advance();
            }
        });
    }

    /**
     * Animate a bot playing a card: lift → flip → fly to center.
     * @param {Function} onCardLanded - fires when card reaches center
     * @param {Function} onFullyDone  - fires after secondary animations (reverse arrow)
     * @private
     */
    _executePlayMove(move, onCardLanded, onFullyDone) {
        const player = this.scene.playerManager.getPlayer(move.playerIndex);
        if (!player || player.cards.length === 0) {
            if (onCardLanded) onCardLanded();
            if (onFullyDone) onFullyDone();
            return;
        }

        const card = this._findCardInHand(player, move.card);
        if (!card) {
            if (onCardLanded) onCardLanded();
            if (onFullyDone) onFullyDone();
            return;
        }

        // 1. Lift card from hand
        this.scene.tweens.add({
            targets: card,
            y: card.y - BOT_TURN.LIFT_OFFSET,
            duration: BOT_TURN.LIFT_DURATION,
            ease: 'Quad.easeOut',
            onComplete: () => {
                // 2. Flip face-up
                this.scene.scheduleTimer(BOT_TURN.LIFT_TO_FLIP_DELAY, () => {
                    card.flip(() => {
                        // 3. Fly to center
                        this.scene.scheduleTimer(BOT_TURN.FLIP_TO_FLY_DELAY, () => {
                            this._playCardToCenter(card, player, move, onCardLanded, onFullyDone);
                        });
                    });
                });
            }
        });
    }

    /**
     * Remove card from hand, animate to center, apply visual effects.
     * @param {Function} onCardLanded - fires when the card reaches center (before reverse arrow)
     * @param {Function} onFullyDone  - fires after all secondary animations (reverse arrow etc.)
     * @private
     */
    _playCardToCenter(card, player, move, onCardLanded, onFullyDone) {
        player.removeCard(card);
        this.scene.triggerPlayEmotes(move.playerIndex, move.card, player.cards.length);

        const effect = GameLogic.getCardEffect(move.card);

        const zone = DRAG_DROP.PLAY_ZONE;
        const scatter = DRAG_DROP.PLAY_SCATTER;
        const x = zone.X + Phaser.Math.FloatBetween(-scatter.OFFSET, scatter.OFFSET);
        const y = zone.Y + Phaser.Math.FloatBetween(-scatter.OFFSET, scatter.OFFSET);
        const rotation = Phaser.Math.FloatBetween(-scatter.ROTATION, scatter.ROTATION);

        card.playToCenter(x, y, rotation, () => {
            this.scene.discardPile.push(card);
            this.scene.playPowerCardEffect(card, move.card.value);

            if (move.chosenColor && (move.card.value === 'wild' || move.card.value === 'plus4')) {
                this.scene.scheduleTimer(COLOR_REPLACE.BOT_DELAY, () => {
                    this.scene._animateColorReplacement(card, move.card.value, move.chosenColor);
                });
            }
        });

        // Refan remaining bot cards
        this._refanBotCards(player);

        // Update scene state
        this.scene.topCard = { suit: move.card.suit, value: move.card.value };
        this.scene.activeColor = GameLogic.resolveActiveColor(
            move.card, move.chosenColor
        );

        if (onCardLanded) onCardLanded();

        // Wait for reverse animation before advancing to next move
        if (effect.type === 'reverse') {
            this.scene.isClockwise = !this.scene.isClockwise;
            this.scene.directionArrow.toggle(() => {
                if (onFullyDone) onFullyDone();
            });
        } else {
            if (onFullyDone) onFullyDone();
        }
    }

    /**
     * Animate dealing cards to a player (penalty or draw/pass).
     * Handles both local mode (drawnCards is Card[]) and API mode (drawnCards is int).
     * @private
     */
    _executeDrawMove(move, onComplete) {
        const player = this.scene.playerManager.getPlayer(move.playerIndex);
        const isCount = typeof move.drawnCards === 'number';
        const count = isCount ? move.drawnCards : (move.drawnCards?.length || 0);

        if (!player || count === 0) {
            onComplete();
            return;
        }

        // API mode: bot cards stay hidden — generate face-down placeholders
        const cardDataArray = isCount
            ? Array.from({ length: count }, () => ({ suit: null, value: 'back' }))
            : move.drawnCards;

        this._dealSpecificCards(player, cardDataArray, onComplete);
    }

    /**
     * Deal specific pre-determined cards to a player with animation.
     * @private
     */
    _dealSpecificCards(player, cardDataArray, onComplete) {
        let dealt = 0;
        const total = cardDataArray.length;

        const dealNext = () => {
            if (dealt >= total) {
                // After all dealt, refan
                this.scene.scheduleTimer(200, () => {
                    if (player.isLocal) {
                        this.scene.refanCards(player);
                        this.scene.updateUnoButton();
                        player.cards.forEach((c, i) => {
                            if (!c.isFaceUp) {
                                this.scene.scheduleTimer(i * 100, () => {
                                    c.flip(() => { c.makeInteractive(); });
                                });
                            } else {
                                c.setInteractive();
                            }
                        });
                        this.scene.scheduleTimer(total * 100 + 300, () => {
                            onComplete();
                        });
                    } else {
                        this._refanBotCards(player);
                        this.scene.scheduleTimer(300, () => {
                            onComplete();
                        });
                    }
                });
                return;
            }

            const cardData = cardDataArray[dealt];

            this.scene.dealer.syncWithVisualDeck();

            const newCount = player.cards.length + 1;
            const positions = player.isLocal
                ? this.scene.dealer.calculateFanPositions(player, newCount)
                : this.scene.dealer.calculateOtherPlayerFanPositions(player, newCount)
                    || this.scene.dealer.calculatePositions(player, newCount, 37, 66);

            const targetPos = positions[player.cards.length];

            // Shift existing cards
            if (player.cards.length > 0) {
                this.scene.scheduleTimer(100, () => {
                    player.cards.forEach((card, i) => {
                        const newPos = positions[i];
                        this.scene.tweens.add({
                            targets: card,
                            x: newPos.x,
                            y: newPos.y,
                            rotation: newPos.rotation !== undefined ? newPos.rotation : card.rotation,
                            duration: 150,
                            ease: 'Power2',
                        });
                    });
                });
            }

            const cardDepth = 3 + player.cards.length;
            this.scene.dealer.dealToPlayer(player, cardData, targetPos, () => {
                dealt++;
                this.scene.scheduleTimer(ANIMATION.PENALTY_DEAL_DELAY, () => {
                    dealNext();
                });
            }, { depth: cardDepth, slideDuration: ANIMATION.PENALTY_SLIDE_DURATION });
        };

        // If dealing to local player, disable interaction first
        if (player.isLocal) {
            this.scene.hidePlayZone();
            player.cards.forEach(card => {
                if (card.isDragging) {
                    card.isDragging = false;
                    this.scene.tweens.killTweensOf(card);
                }
                card.disableInteractive();
            });
        }

        dealNext();
    }

    /**
     * Find a Card entity in a player's hand matching suit+value.
     * For face-down bot cards, picks any card and updates its identity.
     * @private
     */
    _findCardInHand(player, cardData) {
        // Exact match (local player cards or cards with known data)
        const exact = player.cards.find(c =>
            c.suit === cardData.suit && c.value === cardData.value
        );
        if (exact) return exact;

        // Face-down card (bot): pick any and update its identity for the flip
        const faceDown = player.cards.find(c => !c.isFaceUp);
        if (faceDown) {
            faceDown.updateCardData(cardData.suit, cardData.value);
            return faceDown;
        }

        return player.cards[0] || null;
    }

    /**
     * Refan bot cards after a card is played/removed.
     * @private
     */
    _refanBotCards(player) {
        if (player.cards.length === 0) return;
        const positions = this.scene.dealer.calculateOtherPlayerFanPositions(player);
        if (!positions) return;

        player.cards.forEach((c, index) => {
            const pos = positions[index];
            this.scene.tweens.killTweensOf(c);
            c.setDepth(3 + index);
            this.scene.tweens.add({
                targets: c,
                x: pos.x,
                y: pos.y,
                rotation: pos.rotation,
                duration: DRAG_DROP.SNAP_DURATION,
                ease: 'Back.easeOut',
            });
        });
    }
}
