import { loadAssets, createEmoteAnimations } from '../utils/assetLoader.js';
import { PlayerManager } from '../systems/PlayerManager.js';
import { CardDealer } from '../systems/CardDealer.js';
import { Deck } from '../systems/Deck.js';
import { VisualDeck } from '../entities/VisualDeck.js';
import { EmoteSystem } from '../systems/EmoteSystem.js';
import { ASSET_DIMENSIONS } from '../config/assetDimensions.js';

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.idx = 0;
        this.pendingTimers = [];
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
        createEmoteAnimations(this);
        this.setupBackground();
        this.setupSystems();
        this.startDeal();
    }

    setupBackground() {
        this.background = this.add.image(360, 640, 'background');
        this.background.setDisplaySize(ASSET_DIMENSIONS.BACKGROUND.WIDTH, ASSET_DIMENSIONS.BACKGROUND.HEIGHT);
    }

    setupSystems() {
        // PlayerManager now takes scene reference
        this.playerManager = new PlayerManager(this);
        this.playerManager.setupPlayers(4);

        this.deck = new Deck();

        // Place deck at center of the table
        const deckPosition = VisualDeck.getDefaultPosition();
        this.visualDeck = new VisualDeck(this, deckPosition.x, deckPosition.y);

        // Create card dealer
        this.dealer = new CardDealer(this, deckPosition.x, deckPosition.y, this.visualDeck);

        // Create EmoteSystem for avatar emotes
        this.emoteSystem = new EmoteSystem(this, this.playerManager);

        // Setup UI via managers
        this.playerManager.createPlayerAvatars();
        this.playerManager.createPlayerLabels();
    }

    startDeal() {

        this.emoteSystem.playEmote(1, 'phoenix');
        // Cancel any pending timers from previous round
        this.cancelPendingTimers();

        this.deck.reset();

        // Sync dealer position with visual deck before dealing
        this.dealer.syncWithVisualDeck();

        // Reset visual deck
        this.visualDeck.reset();

        const players = this.playerManager.getAllPlayers();

        // Deal 7 cards to each player
        this.dealer.dealToMultiplePlayers(players, 7, this.deck, () => {
            this.onDealComplete();
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
                    card.makeInteractive((clickedCard) => {
                        clickedCard.toggleSelect();
                    });
                });
            });
        });

        this.scheduleTimer(9500, () => {
            this.playerManager.clearAllCards();
        });

        this.scheduleTimer(10000, () => {
            this.idx = (this.idx + 1) % 3;
            this.startDeal();
        });
    }

    update() {
        // Game loop
    }
}