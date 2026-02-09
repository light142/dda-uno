import { loadAssets, createEmoteAnimations } from '../utils/assetLoader.js';
import { PlayerManager } from '../systems/PlayerManager.js';
import { CardDealer } from '../systems/CardDealer.js';
import { Deck } from '../systems/Deck.js';
import { VisualDeck } from '../entities/VisualDeck.js';
import { BankerManager } from '../systems/BankerManager.js';
import { EmoteSystem } from '../systems/EmoteSystem.js';
import { PointsDisplay } from '../entities/PointsDisplay.js';
import { GameResultDisplay } from '../entities/GameResultDisplay.js';
import { ASSET_DIMENSIONS } from '../config/assetDimensions.js';

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.idx = 0;
        this.emotes = ['beg', 'cry', 'happy', 'kiss', 'money', 'angry', 'gg', 'rich'];
        this.cardEmotes = ['extra_card', 'gray_card', 'nine_card', 'card_tear', 'bad_card', 'good_card'];
        this.emoteIndex = 0;
        this.pendingTimers = [];
        this.pointsDisplays = [];
        this.gameResultDisplays = [];
    }

    getNextCardEmote() {
        const emote = this.cardEmotes[this.emoteIndex];
        this.emoteIndex = (this.emoteIndex + 1) % this.cardEmotes.length;
        return emote;
    }

    getNextEmote() {
        const emote = this.emotes[this.emoteIndex];
        this.emoteIndex = (this.emoteIndex + 1) % this.emotes.length;
        return emote;
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
        this.playerManager.setBanker(0);

        this.deck = new Deck();

        // Use VisualDeck's static method for position calculation
        const initialBanker = this.playerManager.getBanker();
        const deckPosition = VisualDeck.calculatePositionForBanker(initialBanker);

        // Create visual deck at banker's position
        this.visualDeck = new VisualDeck(this, deckPosition.x, deckPosition.y);

        // Create card dealer
        this.dealer = new CardDealer(this, deckPosition.x, deckPosition.y, this.visualDeck);

        // Create BankerManager to orchestrate banker operations
        this.bankerManager = new BankerManager(
            this,
            this.playerManager,
            this.visualDeck,
            this.dealer
        );

        // Create EmoteSystem for avatar emotes
        this.emoteSystem = new EmoteSystem(this, this.playerManager);

        // Setup UI via managers
        this.playerManager.createPlayerAvatars();
        this.playerManager.createPlayerLabels();

        // Initialize avatar banker status (reads from player.isBanker)
        this.playerManager.updateAvatarBankerStatus();
    }

    startDeal() {
        this.emoteSystem.playEmote(0, this.getNextEmote());

        // Cancel any pending timers from previous round
        this.cancelPendingTimers();

        this.deck.reset();

        // Sync dealer position with visual deck before dealing
        this.dealer.syncWithVisualDeck();

        // Reset visual deck
        this.visualDeck.reset();

        const players = this.playerManager.getAllPlayers();
        const bankerIndex = this.playerManager.getCurrentBankerId();

        // Deal 2 cards to each player in counterclockwise order
        this.dealer.dealToMultiplePlayers(players, 2, this.deck, () => {
            // After initial deal, deal extra cards (50% chance per player)
            this.scheduleTimer(1000, () => {
                this.dealer.dealExtraCards(players, bankerIndex, this.deck, () => {
                    this.onDealComplete();
                });
            });
        }, bankerIndex);
    }

    onDealComplete() {
        // this.emoteSystem.playEmote(Math.floor(Math.random() * 8), this.getNextEmote());
        const localPlayer = this.playerManager.getLocalPlayer();

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

        // Flip other players' cards
        this.scheduleTimer(1500, () => {
            let delay = 200;
            this.playerManager.getAllPlayers().forEach(player => {
                if (!player.isLocal) {
                    player.cards.forEach((card, index) => {
                        this.scheduleTimer(delay * index, () => {
                            card.flip();
                        });
                    });
                }
            });
        });

        this.scheduleTimer(2500, () => {
            this.showPointsForAllPlayers();
            this.emoteSystem.playEmote(0, this.getNextCardEmote());
            this.emoteSystem.playEmote(1, this.getNextCardEmote());
            this.emoteSystem.playEmote(2, this.getNextCardEmote());
            this.emoteSystem.playEmote(3, this.getNextCardEmote());
            this.emoteSystem.playEmote(4, this.getNextCardEmote());
            this.emoteSystem.playEmote(5, this.getNextCardEmote());
            this.emoteSystem.playEmote(6, this.getNextCardEmote());
            this.emoteSystem.playEmote(7, this.getNextCardEmote());
        });

        this.scheduleTimer(4000, () => {
            this.showGameResults();
        });

        this.scheduleTimer(9000, () => {
            this.clearPointsDisplays();
            this.clearGameResults();
            this.emoteSystem.playEmote(Math.floor(Math.random() * 8), this.getNextEmote());
        });

        this.scheduleTimer(9500, () => {
            this.playerManager.clearAllCards();
        });

        this.scheduleTimer(10000, () => {
            this.bankerManager.rotateBankerRole();
        });

        this.scheduleTimer(10500, () => {
            this.idx = (this.idx + 1) % 3;
            this.startDeal();
            this.emoteSystem.playEmote(Math.floor(Math.random() * 8), this.getNextEmote());
        });
    }

    showPointsForAllPlayers() {
        // Clean up any existing displays before creating new ones
        this.clearPointsDisplays();
        const players = this.playerManager.getAllPlayers();

        players.forEach((player) => {
            if (player.cards.length > 0) {
                const display = new PointsDisplay(this, player);
                display.setDepth(100);
                display.animate();
                this.pointsDisplays.push(display);
            }
        });
    }

    clearPointsDisplays() {
        if (this.pointsDisplays) {
            this.pointsDisplays.forEach(display => {
                display.fadeOut();
            });
            this.pointsDisplays = [];
        }
    }

    showGameResults() {
        // Clean up any existing displays before creating new ones
        this.clearGameResults();
        const players = this.playerManager.getAllPlayers();
        const banker = this.playerManager.getBanker();
        const bankerPoints = banker.calculatePoints();

        players.forEach((player) => {
            if (player.cards.length > 0) {
                const playerPoints = player.calculatePoints();
                let result;

                if (player.id === banker.id) {
                    // Banker doesn't compete against themselves, skip or show special display
                    return;
                }

                // Determine win/lose/tie
                if (playerPoints > bankerPoints) {
                    result = 'win';
                } else if (playerPoints < bankerPoints) {
                    result = 'lose';
                } else {
                    result = 'tie';
                }

                const display = new GameResultDisplay(this, player, result, playerPoints, bankerPoints);
                display.animate();
                this.gameResultDisplays.push(display);
            }
        });
    }

    clearGameResults() {
        if (this.gameResultDisplays) {
            this.gameResultDisplays.forEach(display => {
                display.fadeOut();
            });
            this.gameResultDisplays = [];
        }
    }

    update() {
        // Game loop
    }
}