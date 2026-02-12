import { loadAssets } from '../utils/assetLoader.js';
import { PlayerManager } from '../systems/PlayerManager.js';
import { CardDealer } from '../systems/CardDealer.js';
import { VisualDeck } from '../entities/VisualDeck.js';
import { ASSET_DIMENSIONS } from '../config/assetDimensions.js';
import { DirectionArrow } from '../entities/DirectionArrow.js';
import { PassButton } from '../entities/PassButton.js';
import { UnoButton } from '../entities/UnoButton.js';
import { Card } from '../entities/Card.js';
import { CARD_OFFSET_TO_CENTER, DRAG_DROP, ANIMATION } from '../config/settings.js';
import { GameLogic } from '../logic/GameLogic.js';
import { MoveExecutor } from '../systems/MoveExecutor.js';
import { StateManager } from '../systems/StateManager.js';
import { LocalGameSimulator } from '../systems/LocalGameSimulator.js';

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.idx = 0;
        this.pendingTimers = [];
        this.discardPile = [];
        this.isPlayerTurn = false;
        this.currentPlayerIndex = 0;

        // Game state
        this.topCard = null;
        this.activeColor = null;
        this.isClockwise = true;
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

        this.playerManager = new PlayerManager(this);
        this.playerManager.setupPlayers(4);

        const deckPosition = VisualDeck.getDefaultPosition();
        this.visualDeck = new VisualDeck(this, deckPosition.x, deckPosition.y);
        this.dealer = new CardDealer(this, deckPosition.x, deckPosition.y, this.visualDeck);

        this.directionArrow = new DirectionArrow(this);
        this.passButton = new PassButton(this, () => this.handlePass());
        this.unoButton = new UnoButton(this);

        // Game logic systems
        this.moveExecutor = new MoveExecutor(this);
        this.stateManager = new StateManager(this);
        this.localSimulator = new LocalGameSimulator();

        // Setup UI via managers
        this.playerManager.createPlayerAvatars();
        this.playerManager.createPlayerLabels();
    }

    startDeal() {
        // Clean up discard pile from previous round
        this.discardPile.forEach(card => card.destroy());
        this.discardPile = [];

        // Reset game state
        this.topCard = null;
        this.activeColor = null;
        this.isClockwise = true;
        this.directionArrow.setDirection(true);

        // Cancel any pending timers from previous round
        this.cancelPendingTimers();

        // Ask simulator to start a new game
        const gameData = this.localSimulator.startGame(4, 7);

        this.deckTotal = gameData.deckTotal;
        this.topCard = gameData.starterCard;
        this.activeColor = gameData.starterCard ? gameData.starterCard.suit : null;

        this.dealer.syncWithVisualDeck();
        this.visualDeck.reset();

        // Shuffle animation, then deal with pre-determined cards
        this.visualDeck.shuffle(() => {
            const players = this.playerManager.getAllPlayers();

            this.dealer.dealToMultiplePlayers(players, gameData.playerHands, () => {
                this.onDealComplete(gameData.starterCard);
            });
        });
    }

    onDealComplete(starterCardData) {
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
                localPlayer.cards.forEach(card => {
                    card.makeInteractive();
                });

                // Animate the starter card to center
                this._animateStarterCard(starterCardData, () => {
                    this.passButton.enable();
                    this.enablePlayerTurn();
                });
            });
        });
    }

    /**
     * Animate the starter discard card from deck to play zone center.
     * Card data was already determined by the simulator.
     */
    _animateStarterCard(starterCardData, onComplete) {
        if (!starterCardData) {
            if (onComplete) onComplete();
            return;
        }

        this.dealer.syncWithVisualDeck();
        const zone = DRAG_DROP.PLAY_ZONE;
        const targetPos = { x: zone.X, y: zone.Y };

        this.dealer.dealToPlayer(
            { isLocal: false, addCard: () => {} },
            starterCardData,
            targetPos,
            (card) => {
                card.flip(() => {
                    this.discardPile.push(card);
                    if (onComplete) onComplete();
                });
            },
            { depth: 2, slideDuration: ANIMATION.SLIDE_DURATION }
        );
    }

    // ── Play Zone Visuals ────────────────────────────────

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

        gfx.fillStyle(cfg.FILL_COLOR, fillAlpha);
        gfx.fillCircle(zone.X, zone.Y, zone.RADIUS);

        gfx.lineStyle(cfg.RING_WIDTH, cfg.RING_COLOR, ringAlpha);
        gfx.strokeCircle(zone.X, zone.Y, zone.RADIUS);
    }

    showPlayZone() {
        const cfg = DRAG_DROP.PLAY_ZONE_VISUAL;
        this.tweens.killTweensOf(this.playZoneGfx);
        this.playZoneHovering = false;
        this.drawPlayZone(false);

        this.tweens.add({
            targets: this.playZoneGfx,
            alpha: 1,
            duration: cfg.FADE_IN,
            ease: 'Sine.easeOut',
        });

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

    // ── Drag and Drop ────────────────────────────────────

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
            if (this.isPlayerTurn) {
                if (this.playZoneGfx.alpha === 0) this.showPlayZone();
                this.updatePlayZoneHover(dragX, dragY);
            }

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

            // Snap card to its current fan position
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

    // ── Card Play ────────────────────────────────────────

    handlePlayCard(card, player) {
        const cardData = { suit: card.suit, value: card.value };

        // Pre-API validation — reject obviously invalid plays client-side
        if (this.topCard && !GameLogic.isValidPlay(cardData, this.topCard, this.activeColor)) {
            this._snapCardBack(card, player);
            return;
        }

        this.disablePlayerTurn();

        // Choose color for wilds
        let chosenColor = null;
        if (GameLogic.isWildCard(cardData)) {
            chosenColor = this._autoChooseColor(player);
        }

        // Ask simulator to process the play
        const result = this.localSimulator.playerPlay(cardData, chosenColor);

        if (!result.valid) {
            this._snapCardBack(card, player);
            this.enablePlayerTurn();
            return;
        }

        // Animate the play
        player.removeCard(card);
        this.updateUnoButton();

        const effect = GameLogic.getCardEffect(cardData);

        const zone = DRAG_DROP.PLAY_ZONE;
        const scatter = DRAG_DROP.PLAY_SCATTER;
        const x = zone.X + Phaser.Math.FloatBetween(-scatter.OFFSET, scatter.OFFSET);
        const y = zone.Y + Phaser.Math.FloatBetween(-scatter.OFFSET, scatter.OFFSET);
        const rotation = Phaser.Math.FloatBetween(-scatter.ROTATION, scatter.ROTATION);

        card.playToCenter(x, y, rotation, () => {
            this.discardPile.push(card);
            if (effect.type === 'reverse') {
                this.playReverseEffect(card);
            }
        });

        this.refanCards(player);

        // Sync scene state from simulator response
        this.topCard = result.newTopCard;
        this.activeColor = result.newActiveColor;

        const proceedAfterEffect = () => {
            // Check for win
            if (player.cards.length === 0) {
                this._handleGameOver(0);
                return;
            }

            // Execute bot moveset from simulator response
            this.scheduleTimer(400, () => {
                this.moveExecutor.executeMoves(result.botMoves, () => {
                    this.syncStateFromSimulator();
                    this.enablePlayerTurn();
                });
            });
        };

        if (effect.type === 'reverse') {
            this.isClockwise = result.isClockwise;
            this.directionArrow.toggle(() => {
                proceedAfterEffect();
            });
        } else {
            this.isClockwise = result.isClockwise;
            proceedAfterEffect();
        }
    }

    /**
     * Snap an invalid card back to its fan position.
     */
    _snapCardBack(card, player) {
        const currentIndex = player.cards.indexOf(card);
        if (currentIndex === -1) return;

        const fanPositions = this.dealer.calculateFanPositions(player);
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
    }

    // ── Fan Positioning ──────────────────────────────────

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
        this.passButton.enable();
    }

    disablePlayerTurn() {
        this.isPlayerTurn = false;
        this.passButton.disable();
    }

    updateUnoButton() {
        const localPlayer = this.playerManager.getLocalPlayer();
        if (localPlayer.cards.length === 1) {
            this.unoButton.enable();
        } else {
            this.unoButton.disable();
        }
    }

    syncStateFromSimulator() {
        this.topCard = this.localSimulator.getTopCard();
        this.activeColor = this.localSimulator.getActiveColor();
        this.isClockwise = this.localSimulator.getIsClockwise();
    }

    getNextPlayerIndex(fromIndex) {
        return GameLogic.getNextPlayerIndex(fromIndex, this.isClockwise);
    }

    // ── Pass (Draw) ──────────────────────────────────────

    handlePass() {
        if (!this.isPlayerTurn) return;
        this.disablePlayerTurn();

        const result = this.localSimulator.playerPass();
        const localPlayer = this.playerManager.getLocalPlayer();

        if (!result.drawnCard) {
            // Deck empty — execute bot moves and continue
            this.moveExecutor.executeMoves(result.botMoves, () => {
                this.syncStateFromSimulator();
                this.enablePlayerTurn();
            });
            return;
        }

        this.dealer.syncWithVisualDeck();

        const newCount = localPlayer.cards.length + 1;
        const positions = this.dealer.calculateFanPositions(localPlayer, newCount);
        const targetPos = positions[localPlayer.cards.length];
        const cardDepth = 3 + localPlayer.cards.length;

        // Shift existing cards to make room
        if (localPlayer.cards.length > 0) {
            this.scheduleTimer(100, () => {
                localPlayer.cards.forEach((card, i) => {
                    const newPos = positions[i];
                    this.tweens.add({
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

        this.dealer.dealToPlayer(localPlayer, result.drawnCard, targetPos, (card) => {
            card.flip(() => {
                card.makeInteractive();
                this.refanCards(localPlayer);
                this.updateUnoButton();
                this.scheduleTimer(300, () => {
                    this.moveExecutor.executeMoves(result.botMoves, () => {
                        this.syncStateFromSimulator();
                        this.enablePlayerTurn();
                    });
                });
            });
        }, { depth: cardDepth, slideDuration: ANIMATION.PENALTY_SLIDE_DURATION });
    }

    // ── Visual Effects ────────────────────────────────────

    /**
     * Phantom glow effect for reverse cards — a copy of the card
     * that scales up and fades out.
     * @param {Card} card - the reverse card that was just played
     */
    playReverseEffect(card) {
        const phantom = this.add.image(card.x, card.y, card.cardFaceKey);
        phantom.setDisplaySize(card.displayWidth, card.displayHeight);
        phantom.setRotation(card.rotation);
        phantom.setDepth(card.depth + 1);
        phantom.setAlpha(0.7);
        phantom.setTint(0xffffff);

        // Glow bloom via preFX if available
        if (phantom.preFX) {
            phantom.preFX.addGlow(0xffffff, 4, 0, false, 0.1, 16);
        }

        this.tweens.add({
            targets: phantom,
            scaleX: phantom.scaleX * 2.5,
            scaleY: phantom.scaleY * 2.5,
            alpha: 0,
            duration: 600,
            ease: 'Power2',
            onComplete: () => {
                phantom.destroy();
            }
        });
    }

    // ── Helpers ──────────────────────────────────────────

    /**
     * Auto-choose the best color for a wild card based on hand composition.
     */
    _autoChooseColor(player) {
        const colorCounts = { red: 0, blue: 0, green: 0, yellow: 0 };
        player.cards.forEach(c => {
            if (c.suit && colorCounts[c.suit] !== undefined) {
                colorCounts[c.suit]++;
            }
        });
        return Object.entries(colorCounts)
            .sort((a, b) => b[1] - a[1])[0][0];
    }

    /**
     * Handle game over state.
     */
    _handleGameOver(winnerIndex) {
        this.disablePlayerTurn();
        console.log(`Player ${winnerIndex} wins!`);
    }

    /**
     * Restore the game from a state snapshot (e.g., from backend on reconnect).
     * All positioning is static — no animations.
     */
    restoreGameState(state) {
        this.stateManager.restore(state);
    }

    update() {
        // Game loop
    }
}
