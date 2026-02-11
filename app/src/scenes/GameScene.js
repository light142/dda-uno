import { loadAssets } from '../utils/assetLoader.js';
import { PlayerManager } from '../systems/PlayerManager.js';
import { CardDealer } from '../systems/CardDealer.js';
import { Deck } from '../systems/Deck.js';
import { VisualDeck } from '../entities/VisualDeck.js';
import { ASSET_DIMENSIONS } from '../config/assetDimensions.js';
import { DirectionArrow } from '../entities/DirectionArrow.js';
import { PassButton } from '../entities/PassButton.js';
import { UnoButton } from '../entities/UnoButton.js';
import { Card } from '../entities/Card.js';
import { CARD_OFFSET_TO_CENTER, DRAG_DROP, BOT_TURN, ANIMATION } from '../config/settings.js';

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.idx = 0;
        this.pendingTimers = [];
        this.discardPile = [];
        this.isPlayerTurn = false;
        this.currentPlayerIndex = 0;
    }

    /**
     * Schedule a delayedCall and track it for cleanup
     */
    scheduleTimer(delay, callback) {
        const timer = this.time.delayedCall(delay, callback);
        this.pendingTimers.push(timer);
        return timer;
    }

    /**
     * Cancel all pending timers from previous rounds
     */
    cancelPendingTimers() {
        this.pendingTimers.forEach(timer => {
            if (timer && !timer.hasDispatched) {
                timer.remove(false);
            }
        });
        this.pendingTimers = [];
    }

    preload() {
        loadAssets(this);
    }

    create() {
        this.setupBackground();
        this.setupSystems();
        this.setupDragAndDrop();
        this.startDeal();
    }

    setupBackground() {
        this.background = this.add.image(ASSET_DIMENSIONS.BACKGROUND.WIDTH / 2, ASSET_DIMENSIONS.BACKGROUND.HEIGHT / 2, 'background');
        this.background.setDisplaySize(ASSET_DIMENSIONS.BACKGROUND.WIDTH, ASSET_DIMENSIONS.BACKGROUND.HEIGHT);
    }

    setupSystems() {
        this.createPlayZoneVisual();

        // PlayerManager now takes scene reference
        this.playerManager = new PlayerManager(this);
        this.playerManager.setupPlayers(4);

        this.deck = new Deck();

        // Place deck at center of the table
        const deckPosition = VisualDeck.getDefaultPosition();
        this.visualDeck = new VisualDeck(this, deckPosition.x, deckPosition.y);

        // Create card dealer
        this.dealer = new CardDealer(this, deckPosition.x, deckPosition.y, this.visualDeck);

        this.directionArrow = new DirectionArrow(this);
        this.passButton = new PassButton(this);
        this.unoButton = new UnoButton(this);

        // Setup UI via managers
        this.playerManager.createPlayerAvatars();
        this.playerManager.createPlayerLabels();
    }

    startDeal() {
        // Clean up discard pile from previous round
        this.discardPile.forEach(card => card.destroy());
        this.discardPile = [];

        // Cancel any pending timers from previous round
        this.cancelPendingTimers();

        this.directionArrow.toggle();

        this.deck.reset();

        // Sync dealer position with visual deck before dealing
        this.dealer.syncWithVisualDeck();

        // Reset visual deck
        this.visualDeck.reset();

        // Shuffle animation, then deal
        this.visualDeck.shuffle(() => {
            const players = this.playerManager.getAllPlayers();

            // Deal 7 cards to each player
            this.dealer.dealToMultiplePlayers(players, 7, this.deck, () => {
                this.onDealComplete();
            });
        });
    }

    onDealComplete() {
        const localPlayer = this.playerManager.getLocalPlayer();

        // Fan out other players' cards into 3D arrangement
        this.playerManager.getAllPlayers().forEach(player => {
            if (!player.isLocal) {
                this.dealer.fanOutOtherPlayerCards(player);
            }
        });

        // Flip local player cards first
        localPlayer.cards.forEach((card, index) => {
            this.scheduleTimer(index * 150, () => {
                card.flip();
            });
        });

        // After flip, fan out local player cards with animation
        this.scheduleTimer(500, () => {
            this.dealer.fanOutLocalPlayerCards(localPlayer, () => {
                // Make cards interactive after fan animation
                localPlayer.cards.forEach(card => {
                    card.makeInteractive();
                });
                this.passButton.enable();
                this.enablePlayerTurn();
            });
        });
    }

    createPlayZoneVisual() {
        const cfg = DRAG_DROP.PLAY_ZONE_VISUAL;

        this.playZoneGfx = this.add.graphics();
        this.playZoneGfx.setDepth(cfg.DEPTH);
        this.playZoneGfx.setAlpha(0);
        this.playZoneHovering = false;
        this.drawPlayZone(false);
    }

    drawPlayZone(hovering) {
        const zone = DRAG_DROP.PLAY_ZONE;
        const cfg = DRAG_DROP.PLAY_ZONE_VISUAL;
        const gfx = this.playZoneGfx;

        gfx.clear();

        const fillAlpha = hovering ? cfg.HOVER_FILL_ALPHA : cfg.FILL_ALPHA;
        const ringAlpha = hovering ? cfg.HOVER_RING_ALPHA : cfg.RING_ALPHA;

        // Soft filled circle
        gfx.fillStyle(cfg.FILL_COLOR, fillAlpha);
        gfx.fillCircle(zone.X, zone.Y, zone.RADIUS);

        // Ring outline
        gfx.lineStyle(cfg.RING_WIDTH, cfg.RING_COLOR, ringAlpha);
        gfx.strokeCircle(zone.X, zone.Y, zone.RADIUS);
    }

    showPlayZone() {
        const cfg = DRAG_DROP.PLAY_ZONE_VISUAL;
        this.tweens.killTweensOf(this.playZoneGfx);
        this.playZoneHovering = false;
        this.drawPlayZone(false);

        // Fade in
        this.tweens.add({
            targets: this.playZoneGfx,
            alpha: 1,
            duration: cfg.FADE_IN,
            ease: 'Sine.easeOut',
        });

        // Gentle pulse
        this.playZonePulse = this.tweens.add({
            targets: this.playZoneGfx,
            scaleX: cfg.PULSE_MAX,
            scaleY: cfg.PULSE_MAX,
            duration: cfg.PULSE_DURATION,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    hidePlayZone() {
        const cfg = DRAG_DROP.PLAY_ZONE_VISUAL;
        if (this.playZonePulse) {
            this.playZonePulse.stop();
            this.playZonePulse = null;
        }
        this.tweens.killTweensOf(this.playZoneGfx);
        this.tweens.add({
            targets: this.playZoneGfx,
            alpha: 0,
            duration: cfg.FADE_OUT,
            ease: 'Sine.easeIn',
            onComplete: () => {
                this.playZoneGfx.setScale(1);
            }
        });
        this.playZoneHovering = false;
    }

    updatePlayZoneHover(cardX, cardY) {
        const hovering = this.isInPlayZone(cardX, cardY);
        if (hovering !== this.playZoneHovering) {
            this.playZoneHovering = hovering;
            this.drawPlayZone(hovering);
        }
    }

    setupDragAndDrop() {
        this.input.dragDistanceThreshold = DRAG_DROP.DRAG_THRESHOLD;

        this.input.on('dragstart', (_pointer, gameObject) => {
            if (!(gameObject instanceof Card)) return;
            gameObject.startDrag();
            if (this.isPlayerTurn) this.showPlayZone();
        });

        this.input.on('drag', (_pointer, gameObject, dragX, dragY) => {
            if (!(gameObject instanceof Card)) return;
            gameObject.updateDrag(dragX, dragY);
            if (this.isPlayerTurn) this.updatePlayZoneHover(dragX, dragY);

            // Live reorder while dragging
            const localPlayer = this.playerManager.getLocalPlayer();
            const currentIndex = localPlayer.cards.indexOf(gameObject);
            if (currentIndex === -1) return;

            const newIndex = this.calculateDropIndex(gameObject, localPlayer);
            if (newIndex !== -1 && newIndex !== currentIndex) {
                localPlayer.reorderCard(currentIndex, newIndex);
                this.refanOtherCards(localPlayer, gameObject);
            }
        });

        this.input.on('dragend', (_pointer, gameObject) => {
            if (!(gameObject instanceof Card)) return;
            if (!gameObject.isDragging) return;
            this.hidePlayZone();

            const card = gameObject;
            const localPlayer = this.playerManager.getLocalPlayer();

            if (this.isPlayerTurn && this.isInPlayZone(card.x, card.y)) {
                this.handlePlayCard(card, localPlayer);
                return;
            }

            // Snap card to its current fan position (already reordered live)
            const currentIndex = localPlayer.cards.indexOf(card);
            if (currentIndex !== -1) {
                const fanPositions = this.dealer.calculateFanPositions(localPlayer);
                const pos = fanPositions[currentIndex];
                this.tweens.killTweensOf(card);
                card.setDepth(2 + currentIndex);
                card.originalX = pos.x;
                card.originalY = pos.y;
                card.originalRotation = pos.rotation;
                this.tweens.add({
                    targets: card,
                    x: pos.x,
                    y: pos.y,
                    rotation: pos.rotation,
                    alpha: 1,
                    duration: DRAG_DROP.SNAP_DURATION,
                    ease: 'Back.easeOut',
                    onComplete: () => {
                        card.isDragging = false;
                    }
                });
            } else {
                card.snapBack();
            }
        });
    }

    isInPlayZone(x, y) {
        const zone = DRAG_DROP.PLAY_ZONE;
        const dx = x - zone.X;
        const dy = y - zone.Y;
        return (dx * dx + dy * dy) <= (zone.RADIUS * zone.RADIUS);
    }

    calculateDropIndex(card, player) {
        const cards = player.cards;
        if (cards.length <= 1) return -1;

        const handY = player.y + (CARD_OFFSET_TO_CENTER.bottom?.y || 0);
        const yTolerance = 120;
        if (Math.abs(card.y - handY) > yTolerance) {
            return -1;
        }

        const fanPositions = this.dealer.calculateFanPositions(player);
        let closestIndex = 0;
        let closestDist = Infinity;
        for (let i = 0; i < fanPositions.length; i++) {
            const dist = Math.abs(card.x - fanPositions[i].x);
            if (dist < closestDist) {
                closestDist = dist;
                closestIndex = i;
            }
        }
        return closestIndex;
    }

    handlePlayCard(card, player) {
        this.disablePlayerTurn();
        player.removeCard(card);

        const zone = DRAG_DROP.PLAY_ZONE;
        const scatter = DRAG_DROP.PLAY_SCATTER;
        const x = zone.X + Phaser.Math.FloatBetween(-scatter.OFFSET, scatter.OFFSET);
        const y = zone.Y + Phaser.Math.FloatBetween(-scatter.OFFSET, scatter.OFFSET);
        const rotation = Phaser.Math.FloatBetween(-scatter.ROTATION, scatter.ROTATION);

        card.playToCenter(x, y, rotation, () => {
            this.discardPile.push(card);
        });

        this.refanCards(player);

        // Apply draw effects then schedule bot turns
        const localPlayerIndex = this.playerManager.getAllPlayers().indexOf(player);
        this.applyCardEffect(card, localPlayerIndex, () => {
            this.scheduleBotTurns();
        });
    }

    refanCards(player) {
        if (player.cards.length === 0) return;
        const newPositions = this.dealer.calculateFanPositions(player);
        player.cards.forEach((c, index) => {
            const pos = newPositions[index];
            this.tweens.killTweensOf(c);
            c.isDragging = false;
            c.setDepth(2 + index);
            this.tweens.add({
                targets: c,
                x: pos.x,
                y: pos.y,
                rotation: pos.rotation,
                alpha: 1,
                duration: DRAG_DROP.SNAP_DURATION,
                ease: 'Back.easeOut',
                onComplete: () => {
                    c.originalX = pos.x;
                    c.originalY = pos.y;
                    c.originalRotation = pos.rotation;
                }
            });
        });
    }

    refanOtherCards(player, excludeCard) {
        if (player.cards.length === 0) return;
        const newPositions = this.dealer.calculateFanPositions(player);
        player.cards.forEach((c, index) => {
            if (c === excludeCard) return;
            const pos = newPositions[index];
            this.tweens.killTweensOf(c);
            c.isDragging = false;
            c.setDepth(2 + index);
            c.originalX = pos.x;
            c.originalY = pos.y;
            c.originalRotation = pos.rotation;
            this.tweens.add({
                targets: c,
                x: pos.x,
                y: pos.y,
                rotation: pos.rotation,
                alpha: 1,
                duration: 100,
                ease: 'Power2',
            });
        });
    }

    // ── Turn Management ──────────────────────────────────

    enablePlayerTurn() {
        this.isPlayerTurn = true;
        this.currentPlayerIndex = 0;
    }

    disablePlayerTurn() {
        this.isPlayerTurn = false;
    }

    getNextPlayerIndex(fromIndex) {
        const total = this.playerManager.getAllPlayers().length;
        return this.directionArrow.isClockwise
            ? (fromIndex - 1 + total) % total
            : (fromIndex + 1) % total;
    }

    scheduleBotTurns() {
        const players = this.playerManager.getAllPlayers();
        const botOrder = [];
        let idx = 0; // local player index

        // Collect the 3 bots in turn order
        for (let i = 0; i < players.length - 1; i++) {
            idx = this.getNextPlayerIndex(idx);
            botOrder.push(idx);
        }

        let cumulativeDelay = BOT_TURN.THINK_DELAY;

        const playNext = (i) => {
            if (i >= botOrder.length) {
                // All bots done — re-enable player
                this.scheduleTimer(400, () => {
                    this.enablePlayerTurn();
                });
                return;
            }

            this.scheduleTimer(cumulativeDelay, () => {
                this.handleBotTurn(botOrder[i], () => {
                    playNext(i + 1);
                });
            });

            cumulativeDelay += BOT_TURN.BETWEEN_BOTS;
        };

        playNext(0);
    }

    handleBotTurn(playerIndex, onComplete) {
        const player = this.playerManager.getPlayer(playerIndex);
        if (!player || player.cards.length === 0) {
            if (onComplete) onComplete();
            return;
        }

        // Pick a random card
        const cardIndex = Phaser.Math.Between(0, player.cards.length - 1);
        const card = player.cards[cardIndex];

        // Flip face-up first
        card.flip(() => {
            this.scheduleTimer(BOT_TURN.FLIP_TO_PLAY_DELAY, () => {
                this.botPlayCard(card, player, playerIndex, onComplete);
            });
        });
    }

    botPlayCard(card, player, playerIndex, onComplete) {
        player.removeCard(card);

        const zone = DRAG_DROP.PLAY_ZONE;
        const scatter = DRAG_DROP.PLAY_SCATTER;
        const x = zone.X + Phaser.Math.FloatBetween(-scatter.OFFSET, scatter.OFFSET);
        const y = zone.Y + Phaser.Math.FloatBetween(-scatter.OFFSET, scatter.OFFSET);
        const rotation = Phaser.Math.FloatBetween(-scatter.ROTATION, scatter.ROTATION);

        card.playToCenter(x, y, rotation, () => {
            this.discardPile.push(card);
        });

        this.refanBotCards(player);

        // Apply draw effects, then continue
        this.applyCardEffect(card, playerIndex, () => {
            if (onComplete) onComplete();
        });
    }

    refanBotCards(player) {
        if (player.cards.length === 0) return;
        const positions = this.dealer.calculateOtherPlayerFanPositions(player);
        if (!positions) return;

        player.cards.forEach((c, index) => {
            const pos = positions[index];
            this.tweens.killTweensOf(c);
            c.setDepth(3 + index);
            this.tweens.add({
                targets: c,
                x: pos.x,
                y: pos.y,
                rotation: pos.rotation,
                duration: DRAG_DROP.SNAP_DURATION,
                ease: 'Back.easeOut',
            });
        });
    }

    // ── Card Effects ────────────────────────────────────

    applyCardEffect(card, fromPlayerIndex, onComplete) {
        const nextIndex = this.getNextPlayerIndex(fromPlayerIndex);
        const nextPlayer = this.playerManager.getPlayer(nextIndex);

        let drawCount = 0;
        if (card.value === 'plus2') drawCount = 2;
        else if (card.value === 'plus4') drawCount = 4;

        if (drawCount === 0 || !nextPlayer) {
            if (onComplete) onComplete();
            return;
        }

        // Deal extra cards to the next player
        this.dealPenaltyCards(nextPlayer, drawCount, onComplete);
    }

    dealPenaltyCards(player, count, onComplete) {
        let dealt = 0;

        const dealNext = () => {
            if (dealt >= count) {
                // After all penalty cards dealt, refan
                this.scheduleTimer(200, () => {
                    if (player.isLocal) {
                        this.refanCards(player);
                        // Flip and make new cards interactive
                        player.cards.forEach((c, i) => {
                            if (!c.isFaceUp) {
                                this.scheduleTimer(i * 100, () => {
                                    c.flip(() => {
                                        c.makeInteractive();
                                    });
                                });
                            }
                        });
                        this.scheduleTimer(count * 100 + 300, () => {
                            if (onComplete) onComplete();
                        });
                    } else {
                        this.refanBotCards(player);
                        this.scheduleTimer(300, () => {
                            if (onComplete) onComplete();
                        });
                    }
                });
                return;
            }

            const cardData = this.deck.draw();
            if (!cardData) {
                if (onComplete) onComplete();
                return;
            }

            // Sync dealer with visual deck for correct spawn position
            this.dealer.syncWithVisualDeck();

            const positions = this.dealer.calculatePositions(player, player.cards.length + 1, 37, 66);

            const targetPos = positions[player.cards.length];

            this.dealer.dealToPlayer(player, cardData, targetPos, () => {
                dealt++;
                this.scheduleTimer(ANIMATION.DEAL_DELAY, () => {
                    dealNext();
                });
            });
        };

        dealNext();
    }

    update() {
        // Game loop
    }
}