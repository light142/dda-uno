import { loadAssets, createEmoteAnimations } from '../utils/assetLoader.js';
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
import { EmoteSystem } from '../systems/EmoteSystem.js';
import { ApiClient } from '../api/ApiClient.js';
import { GameApiAdapter } from '../api/GameApiAdapter.js';
import { ErrorPopup } from '../ui/ErrorPopup.js';

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
        this.isR = true;
    }

    /**
     * Schedule a delayedCall and track it for cleanup
     */
    scheduleTimer(delay, callback) {
        // Prune dispatched timers to prevent unbounded array growth
        if (this.pendingTimers.length > 50) {
            this.pendingTimers = this.pendingTimers.filter(t => t && !t.hasDispatched);
        }
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
        createEmoteAnimations(this);
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
        this.unoButton = new UnoButton(this, () => this.handleUnoPress());

        // Game logic systems
        this.moveExecutor = new MoveExecutor(this);
        this.stateManager = new StateManager(this);
        this.localSimulator = new LocalGameSimulator();

        // Choose backend: API if authenticated, otherwise local simulator
        // Both share the same interface — GameScene uses a single code path.
        if (ApiClient.isAuthenticated()) {
            this.gameAdapter = new GameApiAdapter();
        } else {
            this.gameAdapter = this.localSimulator;
        }

        // Setup UI via managers
        this.playerManager.createPlayerAvatars();
        this.playerManager.createPlayerLabels();

        this.emoteSystem = new EmoteSystem(this, this.playerManager);
    }

    async startDeal() {
        // Clean up discard pile from previous round
        this.discardPile.forEach(card => card.destroy());
        this.discardPile = [];

        // Destroy all player cards from previous round
        this.playerManager.clearAllCards();

        // Reset game state
        this.topCard = null;
        this.activeColor = null;
        this.isClockwise = true;
        this.isR = true;
        this.directionArrow.setDirection(true);

        // Cancel any pending timers from previous round
        this.cancelPendingTimers();

        // Stop any lingering emotes
        if (this.emoteSystem) this.emoteSystem.stopAllEmotes();

        // 2 random bots play greet/gg emotes (after cancel so they aren't wiped)
        const botIndices = Phaser.Utils.Array.Shuffle([1, 3]);
        this.scheduleTimer(3000, () => this.emoteSystem.playEmote(botIndices[0], 'greet'));
        this.scheduleTimer(7000, () => this.emoteSystem.playEmote(botIndices[1], 'gg'));

        // Start a new game via the active backend
        let gameData;
        try {
            gameData = await this.gameAdapter.startGame();
        } catch (err) {
            ErrorPopup.show(this, "Couldn't start a new game. Playing offline!");
            this.gameAdapter = this.localSimulator;
            gameData = await this.gameAdapter.startGame();
        }

        this.deckTotal = gameData.deckTotal;
        this.topCard = gameData.starterCard;
        this.activeColor = gameData.activeColor ?? (gameData.starterCard ? gameData.starterCard.suit : null);

        this.dealer.syncWithVisualDeck();
        this.visualDeck.reset();

        // Expand integer bot hands to face-down card arrays for CardDealer
        const expandedHands = gameData.playerHands.map(hand =>
            Array.isArray(hand)
                ? hand
                : Array.from({ length: hand }, () => ({ suit: null, value: 'back' }))
        );

        // Shuffle animation, then deal with pre-determined cards
        this.visualDeck.shuffle(() => {
            const players = this.playerManager.getAllPlayers();

            this.dealer.dealToMultiplePlayers(players, expandedHands, () => {
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
                // Match discard pile size (slideTo uses CARD_SCALE.INITIAL which is smaller)
                const dims = ASSET_DIMENSIONS.CARD;
                card.setDisplaySize(dims.WIDTH, dims.HEIGHT);
                card.baseScaleX = card.scaleX;
                card.baseScaleY = card.scaleY;

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
        this._cachedFanPositions = null;

        this.input.on('dragstart', (_pointer, gameObject) => {
            if (!(gameObject instanceof Card)) return;
            gameObject.startDrag();
            // Cache fan positions at drag start so we don't recalculate every frame
            const localPlayer = this.playerManager.getLocalPlayer();
            this._cachedFanPositions = this.dealer.calculateFanPositions(localPlayer);
            if (this.isPlayerTurn) this.showPlayZone();
        });

        this.input.on('drag', (_pointer, gameObject, dragX, dragY) => {
            if (!(gameObject instanceof Card)) return;
            gameObject.updateDrag(dragX, dragY);
            if (this.isPlayerTurn) {
                if (this.playZoneGfx.alpha === 0) this.showPlayZone();
                this.updatePlayZoneHover(dragX, dragY);
            }

            // Live reorder while dragging (use cached positions)
            const localPlayer = this.playerManager.getLocalPlayer();
            const currentIndex = localPlayer.cards.indexOf(gameObject);
            if (currentIndex === -1) return;

            const newIndex = this._calculateDropIndexCached(gameObject, localPlayer);
            if (newIndex !== -1 && newIndex !== currentIndex) {
                localPlayer.reorderCard(currentIndex, newIndex);
                // Recache after reorder
                this._cachedFanPositions = this.dealer.calculateFanPositions(localPlayer);
                this.refanOtherCards(localPlayer, gameObject);
            }
        });

        this.input.on('dragend', (_pointer, gameObject) => {
            if (!(gameObject instanceof Card)) return;
            if (!gameObject.isDragging) return;
            this._cachedFanPositions = null;
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

    _calculateDropIndexCached(card, player) {
        const cards = player.cards;
        if (cards.length <= 1) return -1;

        const handY = player.y + (CARD_OFFSET_TO_CENTER.bottom?.y || 0);
        const yTolerance = 120;
        if (Math.abs(card.y - handY) > yTolerance) {
            return -1;
        }

        const fanPositions = this._cachedFanPositions || this.dealer.calculateFanPositions(player);
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

    async handlePlayCard(card, player) {
        const cardData = { suit: card.suit, value: card.value };

        // Client-side pre-validation — reject obviously invalid plays immediately
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

        // OPTIMISTIC: Animate card to center immediately
        player.removeCard(card);
        if (player.cards.length === 1 && player.isLocal) {
            this.unoButton.enable();
        }
        this.triggerPlayEmotes(0, cardData, player.cards.length);

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

        try {
            const result = await this.gameAdapter.playerPlay(cardData, chosenColor);

            if (!result.valid) {
                this._reversePlayedCard(card, player);
                ErrorPopup.show(this, "Nice try! That card doesn't match.");
                this.enablePlayerTurn();
                return;
            }

            // Sync state from response
            this.topCard = result.topCard;
            this.activeColor = result.activeColor;

            // Process bot turns with effects
            const botTurns = result.botTurns;

            const proceedAfterEffect = () => {
                if (player.cards.length === 0) {
                    this._handleGameOver(result.winner ?? 0);
                    return;
                }

                this.scheduleTimer(400, () => {
                    this.moveExecutor.executeMoves(botTurns, () => {
                        this.syncState();
                        this._checkBotWin(result);
                        this.enablePlayerTurn();
                    });
                });
            };

            if (effect.type === 'reverse') {
                this.isClockwise = result.isClockwise;
                this.directionArrow.toggle(() => proceedAfterEffect());
            } else {
                this.isClockwise = result.isClockwise;
                proceedAfterEffect();
            }
        } catch (err) {
            this._reversePlayedCard(card, player);
            ErrorPopup.show(this, ErrorPopup.friendlyMessage(err));
            this.enablePlayerTurn();
        }
    }

    /**
     * Reverse a played card back to the player's hand with a shake animation.
     * Used when the server rejects a play or a network error occurs.
     */
    _reversePlayedCard(card, player) {
        // Remove from discard pile if it was added
        const discardIdx = this.discardPile.indexOf(card);
        if (discardIdx !== -1) this.discardPile.splice(discardIdx, 1);

        // Re-add to player hand
        player.addCard(card);

        // Quick shake at current position, then refan to correct slot
        this.tweens.killTweensOf(card);
        this.tweens.add({
            targets: card,
            x: card.x + 8,
            duration: 40,
            yoyo: true,
            repeat: 2,
            onComplete: () => {
                this.refanCards(player);
            }
        });
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
        this.highlightPlayableCards();
    }

    disablePlayerTurn() {
        this.isPlayerTurn = false;
        this.passButton.disable();
        this.clearPlayableHighlights();
    }

    highlightPlayableCards() {
        if (!this.topCard) return;
        const localPlayer = this.playerManager.getLocalPlayer();
        localPlayer.cards.forEach(card => {
            if (GameLogic.isValidPlay(card, this.topCard, this.activeColor)) {
                card.addPlayableGlow();
            } else {
                card.removePlayableGlow();
            }
        });
    }

    clearPlayableHighlights() {
        const localPlayer = this.playerManager.getLocalPlayer();
        localPlayer.cards.forEach(card => card.removePlayableGlow());
    }

    handleUnoPress() {
        const localPlayer = this.playerManager.getLocalPlayer();
        if (localPlayer.cards.length === 1) {
            this.emoteSystem.playLocalEmote('uno');
        }
    }

    updateUnoButton() {
        // Stub for MoveExecutor compatibility
    }

    /**
     * Sync scene state from the active game adapter's cached state.
     */
    syncState() {
        this.topCard = this.gameAdapter.getTopCard();
        this.activeColor = this.gameAdapter.getActiveColor();
        this.isClockwise = this.gameAdapter.getIsClockwise();
    }

    getNextPlayerIndex(fromIndex) {
        return GameLogic.getNextPlayerIndex(fromIndex, this.isClockwise);
    }

    // ── Pass (Draw) ──────────────────────────────────────

    async handlePass() {
        if (!this.isPlayerTurn) return;

        this.disablePlayerTurn();

        let result;
        try {
            result = await this.gameAdapter.playerPass();
        } catch (err) {
            ErrorPopup.show(this, ErrorPopup.friendlyMessage(err));
            this.enablePlayerTurn();
            return;
        }

        const localPlayer = this.playerManager.getLocalPlayer();
        const botTurns = result.botTurns;

        if (!result.drawnCard) {
            // Deck empty — execute bot turns and continue
            this.moveExecutor.executeMoves(botTurns, () => {
                this.syncState();
                this._checkBotWin(result);
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
                this.scheduleTimer(300, () => {
                    this.moveExecutor.executeMoves(botTurns, () => {
                        this.syncState();
                        this._checkBotWin(result);
                        this.enablePlayerTurn();
                    });
                });
            });
        }, { depth: cardDepth, slideDuration: ANIMATION.PENALTY_SLIDE_DURATION });
    }


    /**
     * Check if a bot won from the response.
     * @private
     */
    _checkBotWin(result) {
        if (result.winner !== null && result.winner !== undefined && result.winner !== 0) {
            this._handleGameOver(result.winner);
        }
    }

    // ── Emote Triggers ────────────────────────────────────

    /**
     * Trigger emotes in response to a card being played.
     * @param {number} playerIndex - who played the card
     * @param {{ suit, value }} cardData - the card that was played
     * @param {number} cardsRemaining - cards left in that player's hand after playing
     */
    triggerPlayEmotes(playerIndex, cardData, cardsRemaining) {
        const effect = GameLogic.getCardEffect(cardData);
        const NEG_EMOTES = ['angry', 'cry', 'sad'];
        const randomNeg = () => NEG_EMOTES[Math.floor(Math.random() * NEG_EMOTES.length)];

        // Bot down to 1 card → UNO emote
        if (cardsRemaining === 1 && playerIndex !== 0) {
            this.emoteSystem.playEmote(playerIndex, 'uno');
        }

        // Wild (not plus4) → evil emote on the player who played it
        if (cardData.value === 'wild') {
            this.emoteSystem.playEmote(playerIndex, 'evil');
        }
        // Penalty cards → victim reacts with angry/cry/sad
        if (effect.type === 'reverse') {
            this.isR = !this.isR;
            // Reverse: the player who would have been next (before direction flipped)
            const prev = GameLogic.getNextPlayerIndex(playerIndex, !this.isR);
            this.emoteSystem.playEmote(prev, randomNeg());
        } else if (effect.type !== 'none') {
            // Plus2, plus4, skip: next player reacts
            const next = GameLogic.getNextPlayerIndex(playerIndex, this.isR);
            this.emoteSystem.playEmote(next, randomNeg());
        }
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
