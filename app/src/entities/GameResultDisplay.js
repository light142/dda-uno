import { GAME_RESULT, CARD_OFFSET_TO_CENTER } from '../config/settings.js';

export class GameResultDisplay extends Phaser.GameObjects.Container {
    constructor(scene, player, result, playerPoints, bankerPoints) {
        const offset = CARD_OFFSET_TO_CENTER[player.position] || { x: 0, y: 0 };
        const startX = player.x + offset.x;
        const startY = player.y + offset.y + GAME_RESULT.OFFSET_Y;

        super(scene, startX, startY);
        this.scene = scene;
        this.player = player;
        this.result = result; // 'win', 'lose', 'tie'
        this.playerPoints = playerPoints;
        this.bankerPoints = bankerPoints;
        this.isLocal = player.isLocal;

        scene.add.existing(this);
        this.setDepth(150);
        this.create();
    }

    create() {
        const config = GAME_RESULT;
        const sizeConfig = this.isLocal ? config.LOCAL_PLAYER : config.OTHER_PLAYERS;
        const resultConfig = config[this.result.toUpperCase()];

        // Create curved result text (WIN/LOSE/TIE)
        this.createCurvedResultText(sizeConfig, resultConfig);

        // Create decorative elements based on result
        if (this.result === 'win') {
            this.createWinEffects(sizeConfig, resultConfig);
        } else if (this.result === 'lose') {
            this.createLoseEffects(sizeConfig);
        } else {
            this.createTieEffects(sizeConfig);
        }
    }

    createBackgroundGlow(sizeConfig, resultConfig) {
        // Create multiple glow layers for depth
        this.glowLayers = [];
        for (let i = 0; i < 3; i++) {
            const glowSize = (sizeConfig.GLOW_SIZE - i * 20);
            const glow = this.scene.add.circle(0, 0, glowSize, resultConfig.GLOW_COLOR, 0.2 - i * 0.05);
            this.addAt(glow, 0);
            this.glowLayers.push(glow);
        }
    }

    createCurvedResultText(sizeConfig, resultConfig) {
        const resultText = this.result === 'win' ? 'WIN' :
                          this.result === 'lose' ? 'LOSE' : 'TIE';

        const letters = resultText.split('');
        const letterCount = letters.length;

        // Curve parameters
        const arcRadius = sizeConfig.ARC_RADIUS || (this.isLocal ? 120 : 80);
        const arcSpan = sizeConfig.ARC_SPAN || 0.8; // Radians to span
        const startAngle = -arcSpan / 2;
        const angleStep = arcSpan / (letterCount - 1);

        this.resultLetters = [];
        const letterContainer = this.scene.add.container(0, 0);

        letters.forEach((letter, index) => {
            const angle = startAngle + (angleStep * index);

            // Position along arc (curved upward)
            const x = Math.sin(angle) * arcRadius;
            const y = -Math.cos(angle) * arcRadius + arcRadius;

            // Create letter
            const letterText = this.scene.add.text(x, y, letter, {
                fontSize: sizeConfig.RESULT_SIZE,
                fontFamily: 'Nunito, Quicksand, Varela Round, Arial Rounded MT Bold, Arial Black',
                fontStyle: 'bold',
                stroke: resultConfig.RESULT_STROKE,
                strokeThickness: sizeConfig.RESULT_STROKE_THICKNESS,
                shadow: {
                    offsetX: 4,
                    offsetY: 4,
                    color: '#000',
                    blur: 10,
                    stroke: true,
                    fill: false
                }
            });
            letterText.setOrigin(0.5);

            // Rotate letter to follow curve
            letterText.setAngle(angle * (180 / Math.PI));

            // Create gradient for letter
            const gradient = letterText.context.createLinearGradient(0, 0, 0, letterText.height);
            gradient.addColorStop(0, resultConfig.RESULT_COLOR_TOP);
            gradient.addColorStop(0.5, resultConfig.RESULT_COLOR_MID);
            gradient.addColorStop(1, resultConfig.RESULT_COLOR_BOTTOM);
            letterText.setFill(gradient);

            letterContainer.add(letterText);
            this.resultLetters.push(letterText);
        });

        this.add(letterContainer);
        this.letterContainer = letterContainer;
    }

    createWinEffects(sizeConfig, resultConfig) {
        const size = this.isLocal ? 1 : 0.7;
        // Create background glow
        this.createBackgroundGlow(sizeConfig, resultConfig);

        // Create coins flying outward
        this.coins = [];
        for (let i = 0; i < 8; i++) {
            const coin = this.createCoin(12 * size);
            const angle = (i * 45) * Math.PI / 180;
            coin.x = Math.cos(angle) * 30 * size;
            coin.y = Math.sin(angle) * 30 * size;
            coin.setAlpha(0);
            this.addAt(coin, 0);
            this.coins.push({ coin, angle });
        }

        // Create confetti falling from top
        this.confetti = [];
        for (let i = 0; i < 8; i++) {
            const ribbon = this.createConfetti(10 * size);
            ribbon.x = (Math.random() - 0.5) * 60 * size;
            ribbon.y = -60 * size;
            ribbon.setAlpha(0);
            this.addAt(ribbon, 0);
            this.confetti.push(ribbon);
        }

        // Create sparkles
        this.sparkles = [];
        for (let i = 0; i < 12; i++) {
            const sparkle = this.createSparkle(5 * size);
            sparkle.setAlpha(0);
            this.addAt(sparkle, 0);
            this.sparkles.push(sparkle);
        }

        // Create rays of light
        this.rays = [];
        for (let i = 0; i < 6; i++) {
            const ray = this.createRay(60 * size, (i * 60) * Math.PI / 180);
            this.addAt(ray, 0);
            this.rays.push(ray);
        }
    }

    createLoseEffects(sizeConfig) {
        const size = this.isLocal ? 1 : 0.7;

        // Create falling tear drops or smoke particles
        this.smokeParticles = [];
        for (let i = 0; i < 6; i++) {
            const smoke = this.createSmokeParticle(10 * size);
            smoke.x = (Math.random() - 0.5) * 40 * size;
            smoke.y = -20 * size;
            smoke.setAlpha(0);
            this.addAt(smoke, 0);
            this.smokeParticles.push(smoke);
        }
    }

    createTieEffects(sizeConfig) {
        const size = this.isLocal ? 1 : 0.7;

        // Create balanced scales or equilibrium symbols
        this.balanceParticles = [];
        for (let i = 0; i < 8; i++) {
            const particle = this.createBalanceParticle(8 * size);
            const angle = (i * 45) * Math.PI / 180;
            particle.x = Math.cos(angle) * 25 * size;
            particle.y = Math.sin(angle) * 25 * size;
            particle.setAlpha(0);
            this.addAt(particle, 0);
            this.balanceParticles.push({ particle, angle });
        }
    }

    createCoin(size) {
        const coin = this.scene.add.graphics();

        // Deep shadow base
        coin.fillStyle(0x8B6914, 1);
        coin.fillCircle(size * 0.05, size * 0.05, size);

        // Base coin body (rich gold)
        coin.fillStyle(0xD4AF37, 1);
        coin.fillCircle(0, 0, size);

        // Ridged edge with metallic shine
        for (let i = 0; i < 4; i++) {
            const edgeSize = size - i * 0.8;
            const brightness = 0xFF - (i * 0x22);
            coin.lineStyle(1, (brightness << 16) | 0x8F00, 0.9);
            coin.strokeCircle(0, 0, edgeSize);
        }

        // Main face (brilliant gold)
        coin.fillStyle(0xFFD700, 1);
        coin.fillCircle(0, 0, size * 0.88);

        // Metallic bands
        coin.lineStyle(2, 0xFFF4A3, 0.8);
        coin.strokeCircle(0, 0, size * 0.75);
        coin.lineStyle(1.5, 0xCC9900, 0.7);
        coin.strokeCircle(0, 0, size * 0.68);

        // Myanmar lotus petals (refined)
        const petalCount = 8;
        for (let i = 0; i < petalCount; i++) {
            const angle = (i * 45) * Math.PI / 180;
            const petalRadius = size * 0.52;
            const petalSize = size * 0.16;

            coin.fillStyle(0xFFC04D, 0.85);
            coin.fillEllipse(
                Math.cos(angle) * petalRadius,
                Math.sin(angle) * petalRadius,
                petalSize * 0.5,
                petalSize
            );
        }

        // Center medallion
        coin.fillStyle(0xFFD700, 1);
        coin.fillCircle(0, 0, size * 0.32);
        coin.lineStyle(1.5, 0xD4AF37, 1);
        coin.strokeCircle(0, 0, size * 0.32);

        // Strong metallic highlight (top-left)
        coin.fillStyle(0xFFFFFF, 0.7);
        coin.fillEllipse(-size * 0.3, -size * 0.3, size * 0.35, size * 0.25);

        // Secondary highlight
        coin.fillStyle(0xFFF8DC, 0.5);
        coin.fillEllipse(-size * 0.2, -size * 0.35, size * 0.25, size * 0.15);

        // Metallic shine streak
        coin.fillStyle(0xFFFFFF, 0.4);
        coin.fillEllipse(-size * 0.15, -size * 0.15, size * 0.5, size * 0.08);

        // Shadow for depth (bottom-right)
        coin.fillStyle(0x8B6914, 0.4);
        coin.fillEllipse(size * 0.25, size * 0.25, size * 0.35, size * 0.28);

        return coin;
    }

    createSparkle(size) {
        const sparkle = this.scene.add.graphics();
        sparkle.fillStyle(0xFFFFFF, 1);
        // 4-pointed star
        sparkle.beginPath();
        for (let i = 0; i < 4; i++) {
            const angle = (i * 90) * Math.PI / 180;
            sparkle.lineTo(Math.cos(angle) * size, Math.sin(angle) * size);
            const midAngle = ((i * 90) + 45) * Math.PI / 180;
            sparkle.lineTo(Math.cos(midAngle) * size * 0.3, Math.sin(midAngle) * size * 0.3);
        }
        sparkle.closePath();
        sparkle.fillPath();
        return sparkle;
    }

    createRay(length, angle) {
        const ray = this.scene.add.graphics();
        ray.fillStyle(0xFFFF00, 0.4);
        // Create triangular ray
        ray.beginPath();
        ray.moveTo(0, 0);
        ray.lineTo(Math.cos(angle - 0.1) * length, Math.sin(angle - 0.1) * length);
        ray.lineTo(Math.cos(angle + 0.1) * length, Math.sin(angle + 0.1) * length);
        ray.closePath();
        ray.fillPath();
        return ray;
    }

    createSmokeParticle(size) {
        const smoke = this.scene.add.graphics();
        smoke.fillStyle(0x666666, 0.6);
        smoke.fillCircle(0, 0, size);
        // Add darker center
        smoke.fillStyle(0x333333, 0.4);
        smoke.fillCircle(0, 0, size * 0.6);
        return smoke;
    }

    createBalanceParticle(size) {
        const particle = this.scene.add.graphics();
        particle.fillStyle(0xFFA500, 0.8);
        // Create diamond shape
        particle.beginPath();
        particle.moveTo(0, -size);
        particle.lineTo(size, 0);
        particle.lineTo(0, size);
        particle.lineTo(-size, 0);
        particle.closePath();
        particle.fillPath();
        return particle;
    }

    createConfetti(size) {
        const confetti = this.scene.add.graphics();
        const colors = [0xFFD700, 0xFF6B6B, 0x4ECDC4, 0xFFA500, 0xFF69B4, 0x98D8C8];
        const color = colors[Math.floor(Math.random() * colors.length)];

        // Create ribbon shape
        confetti.fillStyle(color, 0.8);
        confetti.fillRect(-size * 0.15, 0, size * 0.3, size);

        // Add shine
        confetti.fillStyle(0xFFFFFF, 0.4);
        confetti.fillRect(-size * 0.1, 0, size * 0.1, size * 0.4);

        return confetti;
    }

    animate() {
        const config = GAME_RESULT;
        const sizeConfig = this.isLocal ? config.LOCAL_PLAYER : config.OTHER_PLAYERS;
        const size = this.isLocal ? 1 : 0.7;

        // Start invisible and small
        this.setScale(0);
        this.setAlpha(0);

        // Main entrance animation - pop up from cards position
        this.scene.tweens.add({
            targets: this,
            y: this.y - sizeConfig.RISE_DISTANCE,
            scale: 1.2,
            alpha: 1,
            duration: config.ENTRANCE_DURATION,
            ease: 'Back.easeOut',
            onComplete: () => {
                // Settle to final scale
                this.scene.tweens.add({
                    targets: this,
                    scale: 1,
                    duration: 200,
                    ease: 'Power2.easeOut'
                });
            }
        });

        // Animate result letters with wave effect
        this.resultLetters.forEach((letter, index) => {
            this.scene.tweens.add({
                targets: letter,
                scaleX: 1.15,
                scaleY: 1.15,
                duration: 400,
                delay: index * 100,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        });

        // Result-specific animations
        if (this.result === 'win') {
            this.animateWinEffects(size);
        } else if (this.result === 'lose') {
            this.animateLoseEffects(size);
        } else {
            this.animateTieEffects(size);
        }
    }

    animateWinEffects(size) {
        // Pulse glow layers
        this.glowLayers.forEach((glow, index) => {
            this.scene.tweens.add({
                targets: glow,
                scale: 1.3,
                alpha: 0,
                duration: 1000 + index * 150,
                repeat: -1,
                ease: 'Power2.easeOut',
                onRepeat: () => {
                    glow.setScale(1);
                    glow.setAlpha(0.2 - index * 0.05);
                }
            });
        });

        // Coins flying outward
        this.coins.forEach(({ coin, angle }, index) => {
            const delay = index * 80;
            const distance = 120 * size; // Wider spread

            this.scene.tweens.add({
                targets: coin,
                alpha: 1,
                duration: 200,
                delay: delay
            });

            this.scene.tweens.add({
                targets: coin,
                x: Math.cos(angle) * distance,
                y: Math.sin(angle) * distance,
                alpha: 0,
                duration: 800, // Faster movement
                delay: delay + 200,
                ease: 'Power2.easeOut',
                onComplete: () => {
                    coin.x = Math.cos(angle) * 30 * size;
                    coin.y = Math.sin(angle) * 30 * size;
                    coin.alpha = 0;
                },
                repeat: -1,
                repeatDelay: 200 // Minimal pause for continuous flow
            });

            this.scene.tweens.add({
                targets: coin,
                angle: 360,
                duration: 800, // Faster rotation to match
                delay: delay + 200,
                ease: 'Linear',
                repeat: -1
            });
        });

        // Confetti falling
        this.confetti.forEach((ribbon, index) => {
            const delay = index * 150;
            const fallDistance = 130 * size;
            const drift = (Math.random() - 0.5) * 30 * size;

            this.scene.tweens.add({
                targets: ribbon,
                alpha: 0.8,
                y: ribbon.y + fallDistance,
                x: ribbon.x + drift,
                duration: 2000,
                delay: delay,
                ease: 'Sine.easeIn',
                onComplete: () => {
                    ribbon.y = -60 * size;
                    ribbon.alpha = 0;
                    ribbon.x = (Math.random() - 0.5) * 60 * size;
                },
                repeat: -1,
                repeatDelay: 1500
            });

            this.scene.tweens.add({
                targets: ribbon,
                angle: (Math.random() - 0.5) * 120,
                duration: 1200,
                delay: delay,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        });

        // Sparkles twinkling
        this.sparkles.forEach((sparkle, index) => {
            const randomX = (Math.random() - 0.5) * 60 * size;
            const randomY = (Math.random() - 0.5) * 60 * size;
            sparkle.x = randomX;
            sparkle.y = randomY;

            this.scene.tweens.add({
                targets: sparkle,
                alpha: 0.9,
                scale: 1.5,
                duration: 300,
                delay: Math.random() * 800,
                yoyo: true,
                repeat: -1,
                repeatDelay: Math.random() * 400,
                ease: 'Sine.easeInOut'
            });
        });

        // Rotating rays
        this.rays.forEach((ray, index) => {
            this.scene.tweens.add({
                targets: ray,
                angle: 360,
                duration: 3000,
                delay: index * 100,
                repeat: -1,
                ease: 'Linear'
            });

            this.scene.tweens.add({
                targets: ray,
                alpha: 0.5,
                duration: 600,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        });
    }

    animateLoseEffects(size) {
        // Smoke particles drifting down
        this.smokeParticles.forEach((smoke, index) => {
            this.scene.tweens.add({
                targets: smoke,
                alpha: 0.6,
                y: 60 * size,
                x: smoke.x + (Math.random() - 0.5) * 30 * size,
                duration: 2000,
                delay: index * 200,
                ease: 'Power1.easeIn',
                onComplete: () => {
                    smoke.y = -20 * size;
                    smoke.alpha = 0;
                },
                repeat: -1,
                repeatDelay: 1000
            });

            // Fade and expand
            this.scene.tweens.add({
                targets: smoke,
                scaleX: 1.5,
                scaleY: 1.5,
                duration: 2000,
                delay: index * 200,
                ease: 'Power1.easeOut',
                repeat: -1,
                repeatDelay: 1000
            });
        });
    }

    animateTieEffects(size) {
        // Balance particles oscillating
        this.balanceParticles.forEach(({ particle, angle }, index) => {
            const distance = 40 * size;

            this.scene.tweens.add({
                targets: particle,
                alpha: 0.8,
                duration: 300,
                delay: index * 80
            });

            // Oscillate inward and outward
            this.scene.tweens.add({
                targets: particle,
                x: Math.cos(angle) * distance,
                y: Math.sin(angle) * distance,
                duration: 1000,
                delay: index * 80,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });

            // Gentle rotation
            this.scene.tweens.add({
                targets: particle,
                angle: 90,
                duration: 1500,
                delay: index * 80,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        });
    }

    fadeOut(callback) {
        this.scene.tweens.add({
            targets: this,
            alpha: 0,
            y: this.y - 20,
            duration: 500,
            ease: 'Power2.easeIn',
            onComplete: () => {
                // Kill all tweens for this container and its children before destroying
                this.scene.tweens.killTweensOf(this);

                // Kill tweens for child objects
                if (this.coins) {
                    this.coins.forEach(({ coin }) => this.scene.tweens.killTweensOf(coin));
                }
                if (this.confetti) {
                    this.confetti.forEach(ribbon => this.scene.tweens.killTweensOf(ribbon));
                }
                if (this.sparkles) {
                    this.sparkles.forEach(sparkle => this.scene.tweens.killTweensOf(sparkle));
                }
                if (this.rays) {
                    this.rays.forEach(ray => this.scene.tweens.killTweensOf(ray));
                }
                if (this.glowLayers) {
                    this.glowLayers.forEach(glow => this.scene.tweens.killTweensOf(glow));
                }
                if (this.resultLetters) {
                    this.resultLetters.forEach(letter => this.scene.tweens.killTweensOf(letter));
                }
                if (this.smokeParticles) {
                    this.smokeParticles.forEach(smoke => this.scene.tweens.killTweensOf(smoke));
                }
                if (this.balanceParticles) {
                    this.balanceParticles.forEach(({ particle }) => this.scene.tweens.killTweensOf(particle));
                }

                this.destroy();
                if (callback) callback();
            }
        });
    }
}
