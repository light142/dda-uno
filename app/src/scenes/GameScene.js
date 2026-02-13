import { loadGameAssets, createEmoteAnimations } from '../utils/assetLoader.js';
import { PlayerManager } from '../systems/PlayerManager.js';
import { CardDealer } from '../systems/CardDealer.js';
import { VisualDeck } from '../entities/VisualDeck.js';
import { ASSET_DIMENSIONS } from '../config/assetDimensions.js';
import { DirectionArrow } from '../entities/DirectionArrow.js';
import { PassButton } from '../entities/PassButton.js';
import { UnoButton } from '../entities/UnoButton.js';
import { Card } from '../entities/Card.js';
import { CARD_OFFSET_TO_CENTER, DRAG_DROP, ANIMATION, POWER_CARD_FX, COLOR_REPLACE, RESHUFFLE, DECK_VISUAL, GAME_INTRO, HAMBURGER_MENU } from '../config/settings.js';
import { GameLogic } from '../logic/GameLogic.js';
import { MoveExecutor } from '../systems/MoveExecutor.js';
import { StateManager } from '../systems/StateManager.js';
import { LocalGameSimulator } from '../systems/LocalGameSimulator.js';
import { EmoteSystem } from '../systems/EmoteSystem.js';
import { ApiClient } from '../api/ApiClient.js';
import { GameApiAdapter } from '../api/GameApiAdapter.js';
import { ErrorPopup } from '../ui/ErrorPopup.js';
import { ColorPicker } from '../ui/ColorPicker.js';

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.idx = 0;
        this.pendingTimers = [];
        this.discardPile = [];
        this.phantoms = [];
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
        loadGameAssets(this);
    }

    create() {
        createEmoteAnimations(this);
        this.setupBackground();
        this.setupSystems();
        this.setupHamburgerMenu();
        this.hideBotAvatars();
        this.hideGameUI();
        this.showTapToStart();
    }

    setupBackground() {
        this.background = this.add.image(ASSET_DIMENSIONS.BACKGROUND.WIDTH / 2, ASSET_DIMENSIONS.BACKGROUND.HEIGHT / 2, 'background');
        this.background.setDisplaySize(ASSET_DIMENSIONS.BACKGROUND.WIDTH, ASSET_DIMENSIONS.BACKGROUND.HEIGHT);
    }

    // ── Intro Sequence ──────────────────────────────────

    hideBotAvatars() {
        this.playerManager.playerAvatars.forEach((avatar, i) => {
            if (i === 0) return; // local player stays visible
            avatar.setAlpha(0);
        });
    }

    hideGameUI() {
        // Hide direction arrow — cache its target scale before hiding
        this.directionArrow.stopIdle();
        this._arrowTargetScaleX = this.directionArrow.sprite.scaleX;
        this._arrowTargetScaleY = this.directionArrow.sprite.scaleY;
        this.directionArrow.sprite.setAlpha(0);

        // Hide pass button
        this.passButton.sprite.setAlpha(0);
        this.passButton.shadow.setAlpha(0);

        // Hide uno button
        this.unoButton.sprite.setAlpha(0);
        this.unoButton.shadow.setAlpha(0);
    }

    showTapToStart() {
        const cfg = GAME_INTRO.TAP_TEXT;
        const glow = cfg.GLOW;
        const main = cfg.MAIN;

        this.tapGroup = this.add.container(cfg.X, cfg.Y);
        this.tapGroup.setDepth(cfg.DEPTH);

        // Back layer — soft neon glow halo
        this.tapGlowText = this.add.text(0, 0, cfg.TEXT, {
            fontSize: cfg.FONT_SIZE + 'px',
            fontFamily: cfg.FONT_FAMILY,
            fontStyle: 'bold',
            color: glow.COLOR,
            stroke: glow.STROKE,
            strokeThickness: glow.STROKE_THICKNESS,
            shadow: { offsetX: 0, offsetY: 0, color: glow.COLOR, blur: glow.BLUR, fill: true },
            letterSpacing: 4,
        });
        this.tapGlowText.setOrigin(0.5);
        this.tapGlowText.setAlpha(glow.ALPHA);
        this.tapGroup.add(this.tapGlowText);

        // Front layer — crisp main text
        this.tapText = this.add.text(0, 0, cfg.TEXT, {
            fontSize: cfg.FONT_SIZE + 'px',
            fontFamily: cfg.FONT_FAMILY,
            fontStyle: 'bold',
            color: main.COLOR,
            stroke: main.STROKE,
            strokeThickness: main.STROKE_THICKNESS,
            letterSpacing: 4,
        });
        this.tapText.setOrigin(0.5);
        this.tapText.setAlpha(main.ALPHA);
        this.tapGroup.add(this.tapText);

        // Hint text
        const hint = cfg.HINT_STYLE;
        this.tapHint = this.add.text(0, hint.OFFSET_Y, cfg.HINT, {
            fontSize: hint.FONT_SIZE + 'px',
            fontFamily: cfg.FONT_FAMILY,
            color: hint.COLOR,
            letterSpacing: 3,
        });
        this.tapHint.setOrigin(0.5);
        this.tapHint.setAlpha(hint.ALPHA);
        this.tapGroup.add(this.tapHint);

        // Gentle float
        this.tweens.add({
            targets: this.tapGroup,
            y: cfg.Y - cfg.FLOAT.DISTANCE,
            duration: cfg.FLOAT.DURATION,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        // Bouncy breathing
        this.tweens.add({
            targets: this.tapGroup,
            scaleX: cfg.BOUNCE.MAX,
            scaleY: cfg.BOUNCE.MAX,
            duration: cfg.BOUNCE.DURATION,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        // Pulsing neon glow intensity
        this.tweens.add({
            targets: this.tapGlowText,
            alpha: { from: cfg.GLOW_PULSE.MIN, to: cfg.GLOW_PULSE.MAX },
            duration: cfg.GLOW_PULSE.DURATION,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        // Full-screen tap zone (below hamburger menu depth)
        this.tapZone = this.add.zone(640, 360, 1280, 720);
        this.tapZone.setDepth(cfg.DEPTH - 1);
        this.tapZone.setInteractive();
        this.tapZone.once('pointerdown', () => {
            this.tapZone.destroy();
            this.tapZone = null;
            this.startIntroSequence();
        });
    }

    startIntroSequence() {
        const cfg = GAME_INTRO;

        if (this.tapGroup) {
            this.tweens.killTweensOf(this.tapGroup);
            this.tweens.add({
                targets: this.tapGroup,
                alpha: 0,
                scaleX: 1.2,
                scaleY: 1.2,
                duration: cfg.TAP_TEXT.FADE_OUT,
                ease: 'Power2',
                onComplete: () => {
                    if (this.tapGroup) { this.tapGroup.destroy(); this.tapGroup = null; }
                    this.tapText = null;
                    this.tapGlowText = null;
                    this.tapHint = null;
                }
            });
        }

        // Animate bot avatars in with stagger
        const botAvatars = this.playerManager.playerAvatars.filter((_, i) => i !== 0);
        const botCfg = cfg.BOT_ENTRANCE;

        botAvatars.forEach((avatar, i) => {
            // Start offset away from center
            const player = avatar.player;
            let offsetX = 0, offsetY = 0;
            if (player.position === 'left') offsetX = -botCfg.OFFSET;
            else if (player.position === 'right') offsetX = botCfg.OFFSET;
            else if (player.position === 'top') offsetY = -botCfg.OFFSET;

            const targetX = avatar.x;
            const targetY = avatar.y;
            avatar.x = targetX + offsetX;
            avatar.y = targetY + offsetY;
            avatar.setScale(botCfg.SCALE_FROM);

            this.tweens.add({
                targets: avatar,
                x: targetX,
                y: targetY,
                alpha: 1,
                scaleX: 1,
                scaleY: 1,
                duration: botCfg.DURATION,
                delay: i * botCfg.STAGGER,
                ease: botCfg.EASE,
            });
        });

        const botsLandedDelay = botAvatars.length * botCfg.STAGGER + botCfg.DURATION;

        // Animate direction arrow in
        const arrowCfg = cfg.ARROW_ENTRANCE;
        this.scheduleTimer(botsLandedDelay + arrowCfg.DELAY, () => {
            const sprite = this.directionArrow.sprite;
            const targetScaleX = this._arrowTargetScaleX;
            const targetScaleY = this._arrowTargetScaleY;
            sprite.setAngle(0);
            sprite.setScale(0);
            this.tweens.add({
                targets: sprite,
                alpha: 1,
                scaleX: targetScaleX,
                scaleY: targetScaleY,
                duration: arrowCfg.DURATION,
                ease: 'Back.easeOut',
                onComplete: () => {
                    this.directionArrow.startIdle();
                }
            });
        });

        // Animate buttons in (slide up from below)
        const btnCfg = cfg.BUTTON_ENTRANCE;
        const buttons = [
            { sprite: this.passButton.sprite, shadow: this.passButton.shadow },
            { sprite: this.unoButton.sprite, shadow: this.unoButton.shadow },
        ];

        const btnDelay = botsLandedDelay + arrowCfg.DELAY + arrowCfg.DURATION * 0.5;

        buttons.forEach((btn, i) => {
            const targetY = btn.sprite.y;
            const shadowTargetY = btn.shadow.y;
            btn.sprite.y = targetY + btnCfg.OFFSET_Y;
            btn.shadow.y = shadowTargetY + btnCfg.OFFSET_Y;

            this.scheduleTimer(btnDelay + i * btnCfg.STAGGER, () => {
                this.tweens.add({
                    targets: btn.sprite,
                    y: targetY,
                    alpha: 1,
                    duration: btnCfg.DURATION,
                    ease: btnCfg.EASE,
                });
                this.tweens.add({
                    targets: btn.shadow,
                    y: shadowTargetY,
                    alpha: 0.8,
                    duration: btnCfg.DURATION,
                    ease: btnCfg.EASE,
                });
            });
        });

        // Start dealing after all UI is in
        const totalIntroTime = btnDelay + buttons.length * btnCfg.STAGGER + btnCfg.DURATION + cfg.DEAL_DELAY;
        this.scheduleTimer(totalIntroTime, () => {
            this.setupDragAndDrop();
            this.startDeal();
        });
    }

    // ── Hamburger Menu ────────────────────────────────────

    setupHamburgerMenu() {
        const cfg = HAMBURGER_MENU;
        const { WIDTH, HEIGHT } = ASSET_DIMENSIONS.MENU_ICON;

        this.menuIcon = this.add.image(cfg.X, cfg.Y, 'menu_btn');
        this.menuIcon.setDisplaySize(WIDTH, HEIGHT);
        this.menuIcon.setDepth(cfg.DEPTH);
        this.menuIcon.setInteractive({ useHandCursor: true });

        this._menuBaseScaleX = this.menuIcon.scaleX;
        this._menuBaseScaleY = this.menuIcon.scaleY;

        this.menuIcon.on('pointerover', () => {
            this.tweens.killTweensOf(this.menuIcon);
            this.tweens.add({
                targets: this.menuIcon,
                scaleX: this._menuBaseScaleX * 1.12,
                scaleY: this._menuBaseScaleY * 1.12,
                duration: 150,
                ease: 'Back.easeOut',
            });
        });

        this.menuIcon.on('pointerout', () => {
            this.tweens.killTweensOf(this.menuIcon);
            this.tweens.add({
                targets: this.menuIcon,
                scaleX: this._menuBaseScaleX,
                scaleY: this._menuBaseScaleY,
                duration: 200,
                ease: 'Sine.easeOut',
            });
        });

        this.menuIcon.on('pointerdown', () => {
            this.tweens.killTweensOf(this.menuIcon);
            this.tweens.add({
                targets: this.menuIcon,
                scaleX: this._menuBaseScaleX * 0.88,
                scaleY: this._menuBaseScaleY * 0.88,
                duration: 80,
                ease: 'Sine.easeIn',
                onComplete: () => {
                    this.tweens.add({
                        targets: this.menuIcon,
                        scaleX: this._menuBaseScaleX,
                        scaleY: this._menuBaseScaleY,
                        duration: 200,
                        ease: 'Back.easeOut',
                    });
                },
            });
            this.toggleMenu();
        });

        this.menuOpen = false;
        this.menuPanel = null;
        this.menuItems = [];
        this.menuCloseZone = null;
    }

    toggleMenu() {
        if (this.menuOpen) {
            this.closeMenu();
        } else {
            this.openMenu();
        }
    }

    openMenu() {
        if (this.menuOpen) return;
        this.menuOpen = true;

        const cfg = HAMBURGER_MENU;
        const panelCfg = cfg.PANEL;
        const itemCfg = cfg.ITEM;

        const px = cfg.X - ASSET_DIMENSIONS.MENU_ICON.WIDTH / 2;
        const py = cfg.Y + panelCfg.OFFSET_Y;

        // Close zone (click outside to close)
        this.menuCloseZone = this.add.zone(640, 360, 1280, 720);
        this.menuCloseZone.setDepth(cfg.DEPTH - 1);
        this.menuCloseZone.setInteractive();
        this.menuCloseZone.on('pointerdown', () => this.closeMenu());

        // Panel container
        this.menuPanel = this.add.container(px, py);
        this.menuPanel.setDepth(cfg.DEPTH);

        // Background
        const bg = this.add.graphics();
        bg.fillStyle(panelCfg.BG_COLOR, panelCfg.BG_ALPHA);
        bg.fillRoundedRect(0, 0, panelCfg.WIDTH, panelCfg.HEIGHT, panelCfg.CORNER_RADIUS);
        bg.lineStyle(panelCfg.BORDER_WIDTH, panelCfg.BORDER_COLOR, panelCfg.BORDER_ALPHA);
        bg.strokeRoundedRect(0, 0, panelCfg.WIDTH, panelCfg.HEIGHT, panelCfg.CORNER_RADIUS);
        this.menuPanel.add(bg);

        // Menu items
        const items = [
            { label: 'Restart', action: () => this.handleRestart() },
            { label: 'Logout', action: () => this.handleLogout() },
        ];

        const centerX = panelCfg.WIDTH / 2;

        items.forEach((item, i) => {
            const y = itemCfg.PADDING_TOP + i * itemCfg.HEIGHT + itemCfg.HEIGHT / 2;

            // ── 1. Create invisible background rectangle (the hit area) ─────────────
            const bg = this.add.rectangle(
                centerX, 
                y, 
                panelCfg.WIDTH - 20,          // ← make it almost as wide as panel
                itemCfg.HEIGHT - 4,           // ← almost full item height
                0xffffff, 0                   // transparent
            );
            
            bg.setOrigin(0.5);
            
            // Make the **rectangle** interactive (much bigger hit area)
            bg.setInteractive({ useHandCursor: true })
            .on('pointerdown', () => item.action());

            const text = this.add.text(centerX, y, item.label, {
                fontSize: itemCfg.FONT_SIZE + 'px',
                fontFamily: itemCfg.FONT_FAMILY,
                fontStyle: 'bold',
                color: itemCfg.COLOR,
                stroke: itemCfg.STROKE,
                strokeThickness: itemCfg.STROKE_THICKNESS,
            });
            text.setOrigin(0.5);    
            text.setInteractive({ useHandCursor: true });
            text.on('pointerover', () => text.setColor(itemCfg.HOVER_COLOR));
            text.on('pointerout', () => text.setColor(itemCfg.COLOR));
            bg.on('pointerover', () => text.setColor(itemCfg.HOVER_COLOR));
            bg.on('pointerout', () => text.setColor(itemCfg.COLOR));
            text.on('pointerdown', () => item.action());
            this.menuPanel.add(bg);
            this.menuPanel.add(text);
            this.menuItems.push(text);

            // Divider between items (not after last)
            if (i < items.length - 1) {
                const div = panelCfg.DIVIDER;
                const divY = itemCfg.PADDING_TOP + (i + 1) * itemCfg.HEIGHT;
                const divGfx = this.add.graphics();
                divGfx.lineStyle(1, div.COLOR, div.ALPHA);
                divGfx.lineBetween(div.INSET, divY, panelCfg.WIDTH - div.INSET, divY);
                this.menuPanel.add(divGfx);
            }
        });

        // Animate in
        this.menuPanel.setScale(0.85, 0);
        this.menuPanel.setAlpha(0);
        this.tweens.add({
            targets: this.menuPanel,
            scaleX: 1,
            scaleY: 1,
            alpha: 1,
            duration: panelCfg.SLIDE_DURATION,
            ease: panelCfg.EASE,
        });
    }

    closeMenu() {
        if (!this.menuOpen) return;
        this.menuOpen = false;

        if (this.menuCloseZone) {
            this.menuCloseZone.destroy();
            this.menuCloseZone = null;
        }

        if (this.menuPanel) {
            this.tweens.add({
                targets: this.menuPanel,
                scaleY: 0,
                alpha: 0,
                duration: 120,
                ease: 'Power2',
                onComplete: () => {
                    this.menuPanel.destroy();
                    this.menuPanel = null;
                    this.menuItems = [];
                }
            });
        }
    }

    // ── Restart / Logout ──────────────────────────────────

    handleRestart() {
        this.closeMenu();

        const cfg = HAMBURGER_MENU.WIPE;

        // ── Nuclear cleanup: halt ALL in-flight animations and timers ──
        // This catches CardDealer's untracked delayedCalls, visual deck shuffles, etc.
        this.time.removeAllEvents();
        this.pendingTimers = [];
        this.tweens.killAll();

        // Force-clean menu panel if closeMenu's tween was killed before onComplete
        if (this.menuPanel) { this.menuPanel.destroy(); this.menuPanel = null; this.menuItems = []; }

        // Destroy any orphaned power-card phantoms (copy array since destroy listener splices it)
        [...this.phantoms].forEach(p => p.destroy());
        this.phantoms = [];

        this.moveExecutor.cancel();
        this.isPlayerTurn = false;
        if (this.emoteSystem) this.emoteSystem.stopAllEmotes();

        // Clean up tap-to-start if still showing
        if (this.tapGroup) { this.tapGroup.destroy(); this.tapGroup = null; }
        this.tapText = null;
        this.tapGlowText = null;
        this.tapHint = null;
        if (this.tapZone) { this.tapZone.destroy(); this.tapZone = null; }

        // Clear player hand arrays first (so clearCards doesn't double-destroy)
        this.playerManager.getAllPlayers().forEach(player => { player.cards = []; });
        this.discardPile = [];

        // Now destroy ALL Card objects in the scene (including mid-flight ones)
        const allCards = this.children.list.filter(child => child instanceof Card);
        allCards.forEach(card => card.destroy());

        // Collect non-card objects to wipe
        const targets = [];

        this.playerManager.playerAvatars.forEach((avatar, i) => {
            if (i !== 0) targets.push(avatar);
        });
        targets.push(this.directionArrow.sprite);
        targets.push(this.passButton.sprite, this.passButton.shadow);
        targets.push(this.unoButton.sprite, this.unoButton.shadow);

        // Wipe remaining UI out
        this.tweens.add({
            targets,
            alpha: 0,
            scaleX: '*=0.7',
            scaleY: '*=0.7',
            duration: cfg.DURATION,
            ease: cfg.EASE,
            onComplete: () => this._finishRestart(),
        });
    }

    _finishRestart() {
        // Reset buttons
        this.passButton.disable();
        this.passButton.sprite.setScale(this.passButton.baseScaleX, this.passButton.baseScaleY);
        this.passButton.sprite.setAlpha(0);
        this.passButton.shadow.setAlpha(0);
        this.passButton.shadow.setScale(this.passButton.baseScaleX, this.passButton.baseScaleY);
        this.passButton.sprite.y = this.passButton.raisedY;
        this.passButton.shadow.y = this.passButton.baseY;

        this.unoButton.disable();
        this.unoButton.sprite.setScale(this.unoButton.baseScaleX, this.unoButton.baseScaleY);
        this.unoButton.sprite.setAlpha(0);
        this.unoButton.shadow.setAlpha(0);
        this.unoButton.shadow.setScale(this.unoButton.baseScaleX, this.unoButton.baseScaleY);
        this.unoButton.sprite.y = this.unoButton.raisedY;
        this.unoButton.shadow.y = this.unoButton.baseY;

        // Reset arrow
        this.directionArrow.sprite.setAlpha(0);
        this.directionArrow.sprite.setScale(this._arrowTargetScaleX, this._arrowTargetScaleY);
        this.directionArrow.sprite.setAngle(0);

        // Reset bot avatars
        this.playerManager.playerAvatars.forEach((avatar, i) => {
            if (i !== 0) {
                avatar.setAlpha(0);
                avatar.setScale(1);
                avatar.x = avatar.player.x;
                avatar.y = avatar.player.y;
            }
        });

        // Reset visual deck
        this.visualDeck.reset();

        // Reset game state
        this.topCard = null;
        this.activeColor = null;
        this.isClockwise = true;
        this.isR = true;

        // Remove drag listeners and re-add on next intro
        this.input.off('dragstart');
        this.input.off('drag');
        this.input.off('dragend');

        // Show tap to start again
        this.showTapToStart();
    }

    handleLogout() {
        this.closeMenu();
        this.time.removeAllEvents();
        this.pendingTimers = [];
        this.tweens.killAll();
        if (this.menuPanel) { this.menuPanel.destroy(); this.menuPanel = null; this.menuItems = []; }
        this.moveExecutor.cancel();
        if (this.emoteSystem) this.emoteSystem.stopAllEmotes();
        this.scene.start('MainMenuScene');
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
    async _animateStarterCard(starterCardData, onComplete) {
        if (!starterCardData) {
            if (onComplete) onComplete();
            return;
        }

        this.dealer.syncWithVisualDeck();
        const zone = DRAG_DROP.PLAY_ZONE;
        const targetPos = { x: zone.X, y: zone.Y };

        const card = await new Promise(resolve => {
            this.dealer.dealToPlayer(
                { isLocal: false, addCard: () => {} },
                starterCardData,
                targetPos,
                (c) => {
                    const dims = ASSET_DIMENSIONS.CARD;
                    c.setDisplaySize(dims.WIDTH, dims.HEIGHT);
                    c.baseScaleX = c.scaleX;
                    c.baseScaleY = c.scaleY;

                    c.flip(() => {
                        this.discardPile.push(c);
                        resolve(c);
                    });
                },
                { depth: 2, slideDuration: ANIMATION.SLIDE_DURATION }
            );
        });

        // If starter is a wild, let the player choose a color
        if (GameLogic.isWildCard(starterCardData)) {
            const chosenColor = await ColorPicker.show(this, starterCardData.value);
            this.activeColor = chosenColor;
            await this._animateColorReplacement(card, starterCardData.value, chosenColor);
        }

        if (onComplete) onComplete();
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

        // If wild card, show color picker before animating
        let chosenColor = null;
        if (GameLogic.isWildCard(cardData)) {
            chosenColor = await ColorPicker.show(this, cardData.value);
        }

        // Animate card to center
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

        // Wait for card to land at center
        await new Promise(resolve => {
            card.playToCenter(x, y, rotation, () => {
                this.discardPile.push(card);
                this.playPowerCardEffect(card, cardData.value);
                resolve();
            });
        });

        this.refanCards(player);

        // If wild card, flip to colored version after landing
        if (chosenColor) {
            await this._animateColorReplacement(card, cardData.value, chosenColor);
        }

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

                const continueWithBotTurns = () => {
                    this.scheduleTimer(400, () => {
                        this.moveExecutor.executeMoves(botTurns, () => {
                            this.syncState();
                            this._checkBotWin(result);
                            this.enablePlayerTurn();
                        });
                    });
                };

                if (result.reshuffled) {
                    this._animateReshuffle(result.deckCountAfterReshuffle).then(continueWithBotTurns);
                } else {
                    continueWithBotTurns();
                }
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
                card.addUnplayableTint();
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

                const proceedToBotTurns = () => {
                    this.scheduleTimer(300, () => {
                        this.moveExecutor.executeMoves(botTurns, () => {
                            this.syncState();
                            this._checkBotWin(result);
                            this.enablePlayerTurn();
                        });
                    });
                };

                // Reshuffle animation plays after the draw that emptied the deck
                if (result.reshuffled) {
                    this.scheduleTimer(200, () => {
                        this._animateReshuffle(result.deckCountAfterReshuffle)
                            .then(proceedToBotTurns);
                    });
                } else {
                    proceedToBotTurns();
                }
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

        // Wild (not plus4) → eyes emote on the player who played it
        if (cardData.value === 'wild') {
            this.emoteSystem.playEmote(playerIndex, 'eyes');
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
     * Play a dramatic visual effect when a power card lands.
     */
    playPowerCardEffect(card, cardValue) {
        switch (cardValue) {
            case 'reverse': this._fxReverse(card); break;
            case 'block':   this._fxBlock(card);   break;
            case 'plus2':   this._fxPlus2(card);   break;
            case 'wild':    this._fxWild(card);     break;
            case 'plus4':   this._fxPlus4(card);    break;
        }
    }

    /** @deprecated alias kept for external callers */
    playReverseEffect(card) { this.playPowerCardEffect(card, 'reverse'); }

    // ── Power-card FX helpers ────────────────────────────

    _createPhantom(card, tint) {
        const p = this.add.image(card.x, card.y, card.cardFaceKey);
        p.setDisplaySize(card.displayWidth, card.displayHeight);
        p.setRotation(card.rotation);
        p.setDepth(card.depth + 1);
        p.setAlpha(0.8);
        if (tint != null) p.setTint(tint);
        this.phantoms.push(p);
        p.once('destroy', () => {
            const idx = this.phantoms.indexOf(p);
            if (idx !== -1) this.phantoms.splice(idx, 1);
        });
        return p;
    }

    /** Reverse — spin + scale up + fade */
    _fxReverse(card) {
        const cfg = POWER_CARD_FX.REVERSE;
        const p = this._createPhantom(card, cfg.TINT);
        this.tweens.add({
            targets: p,
            scaleX: p.scaleX * cfg.SCALE,
            scaleY: p.scaleY * cfg.SCALE,
            rotation: p.rotation + cfg.SPIN,
            alpha: 0,
            duration: cfg.DURATION,
            ease: 'Power2',
            onComplete: () => p.destroy(),
        });
    }

    /** Block/Skip — shake + red flash + fade */
    _fxBlock(card) {
        const cfg = POWER_CARD_FX.BLOCK;
        const p = this._createPhantom(card, cfg.TINT);
        const originX = p.x;
        // rapid shake then fade
        this.tweens.add({
            targets: p,
            x: originX + cfg.SHAKE,
            duration: 50,
            yoyo: true,
            repeat: 5,
            ease: 'Sine.easeInOut',
        });
        this.tweens.add({
            targets: p,
            scaleX: p.scaleX * cfg.SCALE,
            scaleY: p.scaleY * cfg.SCALE,
            alpha: 0,
            duration: cfg.DURATION,
            ease: 'Power2',
            onComplete: () => p.destroy(),
        });
    }

    /** Plus2 — two phantoms burst diagonally */
    _fxPlus2(card) {
        const cfg = POWER_CARD_FX.PLUS2;
        for (let i = 0; i < 2; i++) {
            const p = this._createPhantom(card, cfg.TINT);
            const dir = i === 0 ? -1 : 1;
            this.tweens.add({
                targets: p,
                x: p.x + cfg.SPREAD * dir,
                y: p.y - cfg.SPREAD,
                scaleX: p.scaleX * cfg.SCALE,
                scaleY: p.scaleY * cfg.SCALE,
                alpha: 0,
                duration: cfg.DURATION,
                ease: 'Power2',
                onComplete: () => p.destroy(),
            });
        }
    }

    /** Wild — single phantom cycles through all 4 UNO colors */
    _fxWild(card) {
        const cfg = POWER_CARD_FX.WILD;
        const p = this._createPhantom(card, cfg.COLORS[0]);
        let step = 0;
        const colorTimer = this.time.addEvent({
            delay: cfg.DURATION / (cfg.COLORS.length * 2),
            repeat: cfg.COLORS.length * 2 - 1,
            callback: () => { step++; p.setTint(cfg.COLORS[step % cfg.COLORS.length]); },
        });
        this.tweens.add({
            targets: p,
            scaleX: p.scaleX * cfg.SCALE,
            scaleY: p.scaleY * cfg.SCALE,
            alpha: 0,
            duration: cfg.DURATION,
            ease: 'Power2',
            onComplete: () => { colorTimer.destroy(); p.destroy(); },
        });
    }

    /** Plus4 — four phantoms burst in cardinal directions, each a different UNO color */
    _fxPlus4(card) {
        const cfg = POWER_CARD_FX.PLUS4;
        const dirs = [
            { x: -1, y: -1 }, { x: 1, y: -1 },
            { x: -1, y: 1 },  { x: 1, y: 1 },
        ];
        dirs.forEach((d, i) => {
            const p = this._createPhantom(card, cfg.COLORS[i]);
            this.tweens.add({
                targets: p,
                x: p.x + cfg.SPREAD * d.x,
                y: p.y + cfg.SPREAD * d.y,
                scaleX: p.scaleX * cfg.SCALE,
                scaleY: p.scaleY * cfg.SCALE,
                alpha: 0,
                duration: cfg.DURATION,
                ease: 'Power2',
                onComplete: () => p.destroy(),
            });
        });
    }

    /**
     * Cross-fade the discard pile card to the colored wild variant
     * with a high-frequency Matrix-style shake.
     */
    _animateColorReplacement(card, cardValue, chosenColor) {
        return new Promise((resolve) => {
            this.scheduleTimer(COLOR_REPLACE.START_DELAY, () => {
                const textureKey = `${cardValue}_${chosenColor}`;
                const cfg = COLOR_REPLACE.SHAKE;
                const duration = COLOR_REPLACE.FADE_DURATION;

                const originX = card.x;
                const originY = card.y;

                // Place colored version on top, fade it in
                const overlay = this.add.image(card.x, card.y, textureKey);
                overlay.setDisplaySize(card.displayWidth, card.displayHeight);
                overlay.setRotation(card.rotation);
                overlay.setDepth(card.depth + 0.5);
                overlay.setAlpha(0);

                // High-frequency jitter — rapid random offsets like Agent Smith
                const startTime = this.time.now;
                const shakeTimer = this.time.addEvent({
                    delay: cfg.INTERVAL,
                    loop: true,
                    callback: () => {
                        const elapsed = this.time.now - startTime;
                        const progress = Math.min(elapsed / duration, 1);

                        // Ramp intensity up then down for a smooth envelope
                        let envelope = 1;
                        if (progress < cfg.RAMP_IN) {
                            envelope = progress / cfg.RAMP_IN;
                        } else if (progress > 1 - cfg.RAMP_OUT) {
                            envelope = (1 - progress) / cfg.RAMP_OUT;
                        }

                        const intensity = cfg.INTENSITY * envelope;
                        const dx = (Math.random() - 0.5) * 2 * intensity;
                        const dy = (Math.random() - 0.5) * 2 * intensity;

                        card.x = originX + dx;
                        card.y = originY + dy;
                        overlay.x = originX + dx;
                        overlay.y = originY + dy;
                    },
                });

                this.tweens.add({
                    targets: overlay,
                    alpha: 1,
                    duration,
                    ease: 'Sine.easeInOut',
                    onComplete: () => {
                        shakeTimer.destroy();
                        card.x = originX;
                        card.y = originY;
                        card.setTexture(textureKey);
                        card.cardFaceKey = textureKey;
                        overlay.destroy();
                        resolve();
                    }
                });
            });
        });
    }

    // ── Deck Reshuffle ────────────────────────────────────

    /**
     * Animate the discard pile being reshuffled into the draw pile.
     * The top discard card stays in place; all others fly to the deck.
     */
    _animateReshuffle(deckCountAfterReshuffle) {
        return new Promise(resolve => {
            const zone = DRAG_DROP.PLAY_ZONE;
            const deckPos = this.visualDeck.getDeckPosition();
            const cfg = RESHUFFLE;

            // Keep the top discard card; gather the rest
            const topDiscardCard = this.discardPile[this.discardPile.length - 1];
            const recyclableCards = this.discardPile.slice(0, -1);
            this.discardPile = topDiscardCard ? [topDiscardCard] : [];

            if (recyclableCards.length === 0) {
                this._replenishVisualDeck(deckCountAfterReshuffle);
                this.visualDeck.shuffle(() => resolve());
                return;
            }

            // Phase 1: Gather discard cards toward center and shrink
            let gathered = 0;
            recyclableCards.forEach((card, i) => {
                this.tweens.add({
                    targets: card,
                    x: zone.X,
                    y: zone.Y,
                    scaleX: card.scaleX * 0.3,
                    scaleY: card.scaleY * 0.3,
                    alpha: 0.4,
                    rotation: 0,
                    duration: cfg.GATHER_DURATION,
                    delay: Math.min(i, 8) * cfg.GATHER_STAGGER,
                    ease: 'Power3',
                    onComplete: () => {
                        card.destroy();
                        gathered++;
                        if (gathered >= recyclableCards.length) {
                            // Phase 2: Fly card-backs from discard to deck
                            this._flyCardsToDeck(zone, deckPos, cfg, () => {
                                this._replenishVisualDeck(deckCountAfterReshuffle);
                                // Phase 3: Shuffle animation
                                this.visualDeck.shuffle(() => resolve());
                            });
                        }
                    }
                });
            });
        });
    }

    /**
     * Create card-back sprites that arc from the discard pile to the deck.
     * @private
     */
    _flyCardsToDeck(fromZone, deckPos, cfg, callback) {
        let completed = 0;
        const startX = fromZone.X;
        const startY = fromZone.Y;
        const endX = deckPos.x;
        const endY = deckPos.y;

        for (let i = 0; i < cfg.FLY_COUNT; i++) {
            const card = this.add.image(startX, startY, 'card_back_deck');
            card.setDisplaySize(
                ASSET_DIMENSIONS.CARD_DECK.WIDTH,
                ASSET_DIMENSIONS.CARD_DECK.HEIGHT
            );
            card.setDepth(10 + i);
            card.setAlpha(0.9);

            const startRot = Phaser.Math.FloatBetween(-0.3, 0.3);
            card.setRotation(startRot);

            // Rotation tween
            this.tweens.add({
                targets: card,
                rotation: 0,
                duration: cfg.FLY_DURATION,
                delay: i * cfg.FLY_STAGGER,
                ease: 'Sine.easeInOut',
            });

            // Position tween with arc
            const tweenObj = { t: 0 };
            this.tweens.add({
                targets: tweenObj,
                t: 1,
                duration: cfg.FLY_DURATION,
                delay: i * cfg.FLY_STAGGER,
                ease: 'Sine.easeInOut',
                onUpdate: () => {
                    const p = tweenObj.t;
                    card.x = Phaser.Math.Linear(startX, endX, p);
                    card.y = Phaser.Math.Linear(startY, endY, p)
                        - Math.sin(p * Math.PI) * cfg.ARC_HEIGHT;
                },
                onComplete: () => {
                    card.destroy();
                    completed++;
                    if (completed >= cfg.FLY_COUNT) {
                        this.scheduleTimer(cfg.PAUSE_BEFORE_SHUFFLE, callback);
                    }
                }
            });
        }
    }

    /**
     * Replenish the visual deck after a reshuffle.
     * @param {number} deckCount - actual number of cards now in the deck
     * @private
     */
    _replenishVisualDeck(deckCount) {
        this.visualDeck.stackLayers.forEach(layer => {
            layer.setAlpha(1);
        });
        this.visualDeck.visualRemaining = deckCount || DECK_VISUAL.STACK_LAYERS;
        this.visualDeck.updateLayers(this.visualDeck.visualRemaining, this.deckTotal);
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
