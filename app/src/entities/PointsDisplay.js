import { POINTS_DISPLAY, CARD_OFFSET_TO_CENTER } from '../config/settings.js';

const toMyanmarNumber = (num) => {
    const myanmarDigits = ['ဘူ', '၁', '၂', '၃', '၄', '၅', '၆', '၇', '၈', '၉'];
    return num.toString().split('').map(digit => myanmarDigits[parseInt(digit)]).join('');
};

let _softGlowBaked = false;

export class PointsDisplay extends Phaser.GameObjects.Container {
    constructor(scene, player) {
        const config = POINTS_DISPLAY;
        const displayConfig = player.isLocal ? config.LOCAL_PLAYER : config.OTHER_PLAYERS;
        const offset = CARD_OFFSET_TO_CENTER[player.position] || { x: 0, y: 0 };
        const x = player.x + offset.x + displayConfig.OFFSET_X;
        const y = player.y + offset.y + displayConfig.OFFSET_Y;

        super(scene, x, y);
        this.scene = scene;
        this.player = player;
        this.points = player.calculatePoints();
        // this.points = 7;
        this.displayConfig = displayConfig;
        scene.add.existing(this);
        this.create();
    }

    create() {
        const config = POINTS_DISPLAY;
        const displayConfig = this.displayConfig;

        let colorConfig;
        if (this.points >= 8) {
            colorConfig = config.HIGH_POINTS;
            this.createHighPointsGlow();
        } else if (this.points <= 0) {
            colorConfig = config.LOW_POINTS;
        } else {
            colorConfig = config.NORMAL_POINTS;
        }

        this.createTextGlow();

        const digitX = this.points > 0 ? 0 : displayConfig.ZERO_OFFSET_X;
        const digitText = toMyanmarNumber(this.points);
        const fontFamily = 'Noto Sans Myanmar, Padauk, Nunito, Quicksand, Varela Round, Arial Rounded MT Bold, Arial Black';

        // Extrusion layer — dark copy offset down, creates the 3D raised edge
        const extrusionDigit = this.scene.add.text(digitX + displayConfig.DIGIT_EXTRUSION_OFFSET_X, displayConfig.DIGIT_EXTRUSION_OFFSET, digitText, {
            fontSize: displayConfig.DIGIT_SIZE,
            fontFamily,
            fontStyle: 'bold',
            stroke: colorConfig.EXTRUSION_COLOR,
            strokeThickness: displayConfig.DIGIT_EXTRUSION_THICKNESS,
            color: colorConfig.EXTRUSION_COLOR,
            padding: { x: 20, y: 20 }
        });
        extrusionDigit.setOrigin(0.5);
        this.add(extrusionDigit);
        this.extrusionDigit = extrusionDigit;

        const pointsDigit = this.scene.add.text(digitX, 0, digitText, {
            fontSize: displayConfig.DIGIT_SIZE,
            fontFamily,
            fontStyle: 'bold',
            stroke: colorConfig.DIGIT_STROKE,
            strokeThickness: displayConfig.DIGIT_STROKE_THICKNESS,
            padding: { x: 20, y: 20 }
        });

        const gradient = pointsDigit.context.createLinearGradient(0, 0, 0, pointsDigit.height);  // vertical gradient
        gradient.addColorStop(0,   colorConfig.DIGIT_GRADIENT[0]);   // top
        gradient.addColorStop(0.2,   colorConfig.DIGIT_GRADIENT[0]);   // top
        gradient.addColorStop(0.8, colorConfig.DIGIT_GRADIENT[1]);   // middle
        gradient.addColorStop(1,   colorConfig.DIGIT_GRADIENT[1]);   // bottom

        pointsDigit.setFill(gradient);     // ← this is how you apply it
        pointsDigit.setOrigin(0.5);

        this.add(pointsDigit);
        this.pointsDigit = pointsDigit;

        if (this.points > 0) {
            // Extrusion layer for label
            const extrusionLabel = this.scene.add.text(displayConfig.LABEL_OFFSET_X + displayConfig.LABEL_EXTRUSION_OFFSET_X, displayConfig.LABEL_OFFSET_Y + displayConfig.LABEL_EXTRUSION_OFFSET, 'ပေါက်', {
                fontSize: displayConfig.LABEL_SIZE,
                fontFamily,
                fontStyle: 'bold',
                stroke: colorConfig.EXTRUSION_COLOR,
                strokeThickness: displayConfig.LABEL_EXTRUSION_THICKNESS,
                color: colorConfig.EXTRUSION_COLOR,
                padding: { x: 13, y: 15 }
            });
            extrusionLabel.setOrigin(0, 0.5);
            this.add(extrusionLabel);

            const pointsLabel = this.scene.add.text(displayConfig.LABEL_OFFSET_X, displayConfig.LABEL_OFFSET_Y, 'ပေါက်', {
                fontSize: displayConfig.LABEL_SIZE,
                fontFamily,
                fontStyle: 'bold',
                stroke: colorConfig.LABEL_STROKE,
                strokeThickness: displayConfig.LABEL_STROKE_THICKNESS,
                fillGradientColors: colorConfig.LABEL_GRADIENT,
                fillGradientType: 0,
                padding: { x: 13, y: 15 }
            });
            pointsLabel.setOrigin(0, 0.5);

            const gradient = pointsLabel.context.createLinearGradient(0, 0, 0, pointsLabel.height);  // vertical gradient
            gradient.addColorStop(0,   colorConfig.LABEL_GRADIENT[0]);   // top
            gradient.addColorStop(1,   colorConfig.LABEL_GRADIENT[1]);   // bottom
            pointsLabel.setFill(gradient);

            this.add(pointsLabel);
            this.pointsLabel = pointsLabel;
        }
    }

    createTextGlow() {
        // One-time: bake a radial-gradient circle onto a canvas texture.
        // White centre fading to transparent edge — tint + scale per puff.
        if (!_softGlowBaked) {
            const size = 128;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            const mid = size / 2;
            const grad = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
            grad.addColorStop(0,    'rgba(255,255,255,1)');
            grad.addColorStop(0.35, 'rgba(255,255,255,0.85)');
            grad.addColorStop(0.65, 'rgba(255,255,255,0.4)');
            grad.addColorStop(1,    'rgba(255,255,255,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, size, size);
            this.scene.textures.addCanvas('__softGlow', canvas);
            _softGlowBaked = true;
        }

        const isLocal   = this.player.isLocal;
        const scale     = isLocal ? 1 : 0.6;
        const centerX   = (isLocal ? 75 : 55);
        const texHalf   = 64; // gradient radius inside the 128px texture

        // Puff layout — organic cloud shape
        const puffDefs = [
            { x: -60, y:   0, r: 56, a: 0.50 },
            { x: -20, y:  -6, r: 64, a: 0.55 },
            { x:  20, y:   3, r: 64, a: 0.55 },
            { x:  60, y:  -4, r: 56, a: 0.50 },
            { x: -40, y:  14, r: 44, a: 0.38 },
            { x:  40, y: -13, r: 44, a: 0.38 },
            { x: -82, y:  -2, r: 34, a: 0.28 },
            { x:  82, y:   6, r: 34, a: 0.28 }
        ];

        const puffs = puffDefs.map(p => ({
            x: (centerX + p.x) * scale,
            y: p.y * scale,
            r: p.r * scale,
            a: p.a
        }));

        const layer     = this.scene.add.container(0, 0);
        const glowColor = 0x66EE66;

        puffs.forEach(({ x, y, r, a }) => {
            const img = this.scene.add.image(x, y, '__softGlow');
            img.setScale(r / texHalf);
            img.setTint(glowColor);
            img.setAlpha(a);
            layer.add(img);
        });

        const xAmp = 2.5 * scale;
        const yAmp = 2   * scale;
        layer.x = -xAmp;
        layer.y = -yAmp;
        layer.setAlpha(0.55);
        this.addAt(layer, 0);

        this.scene.tweens.add({
            targets: layer,
            alpha: 0.8,
            duration: 1800,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });

        this.scene.tweens.add({
            targets: layer,
            x: xAmp,
            duration: 2200,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });

        this.scene.tweens.add({
            targets: layer,
            y: yAmp,
            duration: 1900,
            delay: 200,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });
    }

    createHighPointsGlow() {
        const size = this.player.isLocal ? 1.4 : 1.2;

        // Create rotating rays container
        this.raysContainer = this.scene.add.container(0, 0);
        this.addAt(this.raysContainer, 0);

        // Create golden rays
        for (let i = 0; i < 8; i++) {
            const angle = (i * 45) * Math.PI / 180;
            const ray = this.createCurvedRay(30 * size, angle, 0xFFD700);
            this.raysContainer.add(ray);
        }

        // Create lotus petals container
        this.petalsContainer = this.scene.add.container(0, 0);
        this.addAt(this.petalsContainer, 0);

        // Create lotus petals
        this.petals = [];
        for (let i = 0; i < 30; i++) {
            const petal = this.createLotusPetal(15 * size, 0xFFB6C1);
            const orbitRadius = 60 * size;
            const angle = (i * 30) * Math.PI / 180;
            petal.x = Math.cos(angle) * orbitRadius;
            petal.y = Math.sin(angle) * orbitRadius;
            petal.angle = (i * 30);
            petal.setAlpha(0); // Start invisible
            this.petalsContainer.add(petal);
            this.petals.push({ petal, angle, initialRadius: orbitRadius });
        }

        // Create firework sparkle bursts
        this.fireworkBursts = [];
        for (let i = 0; i < 4; i++) {
            const burst = this.createFireworkBurst(10 * size);
            const angle = (i * 90) * Math.PI / 180;
            const distance = 35 * size;
            burst.x = Math.cos(angle) * distance;
            burst.y = Math.sin(angle) * distance;
            this.addAt(burst, 0);
            this.fireworkBursts.push(burst);
        }

        // Create golden sparkles
        this.sparkles = [];
        for (let i = 0; i < 6; i++) {
            const sparkle = this.createGoldSparkle(6 * size, 0xFFD700);
            const angle = (i * 60 + 30) * Math.PI / 180;
            const distance = 25 * size;
            sparkle.x = Math.cos(angle) * distance;
            sparkle.y = Math.sin(angle) * distance;
            this.addAt(sparkle, 0);
            this.sparkles.push(sparkle);
        }

        // Create central golden glow
        this.centralGlow = this.scene.add.circle(0, 0, 25 * size, 0xFFD700, 0.25);
        this.addAt(this.centralGlow, 0);
    }

    createCurvedRay(length, angle, color) {
        const ray = this.scene.add.graphics();
        ray.lineStyle(2, color, 0.5);
        ray.beginPath();
        // Create curved line (traditional Myanmar art style)
        for (let i = 0; i <= 10; i++) {
            const t = i / 10;
            const dist = length * t;
            const curve = Math.sin(t * Math.PI) * 5; // Slight curve
            const x = Math.cos(angle) * dist + Math.cos(angle + Math.PI/2) * curve;
            const y = Math.sin(angle) * dist + Math.sin(angle + Math.PI/2) * curve;
            if (i === 0) ray.moveTo(x, y);
            else ray.lineTo(x, y);
        }
        ray.strokePath();
        return ray;
    }

    createLotusPetal(size, color) {
        const petal = this.scene.add.graphics();
        // Create petal shape using ellipse (teardrop shape)
        petal.fillStyle(color, 0.8);
        petal.fillEllipse(0, -size/2, size/2, size);
        // Add lighter center for depth
        petal.fillStyle(0xFFFFFF, 0.3);
        petal.fillEllipse(0, -size/3, size/4, size/2);
        return petal;
    }

    createFireworkBurst(size) {
        const burst = this.scene.add.graphics();
        // Create starburst shape
        burst.fillStyle(0xFFD700, 0.8);
        for (let i = 0; i < 8; i++) {
            const angle = (i * 45) * Math.PI / 180;
            burst.beginPath();
            burst.moveTo(0, 0);
            burst.lineTo(Math.cos(angle) * size, Math.sin(angle) * size);
            burst.lineTo(Math.cos(angle + Math.PI/8) * size * 0.5, Math.sin(angle + Math.PI/8) * size * 0.5);
            burst.closePath();
            burst.fillPath();
        }
        // Add bright center
        burst.fillStyle(0xFFFFFF, 0.9);
        burst.fillCircle(0, 0, size * 0.3);
        return burst;
    }

    createGoldSparkle(size, color) {
        const sparkle = this.scene.add.graphics();
        sparkle.fillStyle(color, 0.9);
        // Create 4-pointed star (traditional shwe sparkle)
        sparkle.beginPath();
        for (let i = 0; i < 4; i++) {
            const angle = (i * 90) * Math.PI / 180;
            const x = Math.cos(angle) * size;
            const y = Math.sin(angle) * size;
            sparkle.lineTo(x, y);
            const midAngle = ((i * 90) + 45) * Math.PI / 180;
            const mx = Math.cos(midAngle) * size * 0.3;
            const my = Math.sin(midAngle) * size * 0.3;
            sparkle.lineTo(mx, my);
        }
        sparkle.closePath();
        sparkle.fillPath();
        return sparkle;
    }

    animate() {
        const config = POINTS_DISPLAY;
        this.setScale(0.3);
        this.setAlpha(0);

        this.scene.tweens.add({
            targets: this,
            scale: 1.1,
            alpha: 1,
            duration: config.ANIMATION_DURATION,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.scene.tweens.add({
                    targets: this,
                    scale: 1,
                    duration: 200,
                    ease: 'Power2.easeOut'
                });
            }
        });

        this.scene.tweens.add({
            targets: this.pointsDigit,
            scaleX: 1.15,
            scaleY: 1.15,
            duration: config.PULSE_DURATION,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        if (this.extrusionDigit) {
            this.scene.tweens.add({
                targets: this.extrusionDigit,
                scaleX: 1.15,
                scaleY: 1.15,
                duration: config.PULSE_DURATION,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }

        // Animate celebration effects for high points
        if (this.raysContainer) {
            const size = this.player.isLocal ? 1 : 0.7;

            // Rotate rays
            this.scene.tweens.add({
                targets: this.raysContainer,
                angle: 360,
                duration: 4000,
                repeat: -1,
                ease: 'Linear'
            });

            // Pulse rays
            this.scene.tweens.add({
                targets: this.raysContainer,
                alpha: 0.7,
                scale: 1.1,
                duration: 1200,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });

            // Petals flying outwards with random timing
            this.petals.forEach((petalData) => {
                const randomDelay = Math.random() * 1500; // Random delay 0-1000ms
                const randomDuration = 1500 + Math.random() * 1000; // Random duration 1500-2500ms
                const randomAngleOffset = (Math.random() - 0.5) * 30; // Random angle variation
                const flyDistance = this.player.isLocal ? 300 * size : 200 * size;

                // Fade in first
                this.scene.tweens.add({
                    targets: petalData.petal,
                    alpha: 1,
                    duration: 0,
                    delay: randomDelay,
                    ease: 'Sine.easeOut'
                });

                // Fly outwards and fade out
                this.scene.tweens.add({
                    targets: petalData.petal,
                    x: Math.cos((petalData.angle + randomAngleOffset) * Math.PI / 180) * flyDistance,
                    y: Math.sin((petalData.angle + randomAngleOffset) * Math.PI / 180) * flyDistance,
                    alpha: 0,
                    duration: randomDuration,
                    delay: randomDelay + 30,
                    ease: 'Quad.easeOut',
                    onComplete: () => {
                        // Reset and repeat
                        petalData.petal.x = Math.cos(petalData.angle * Math.PI / 180) * petalData.initialRadius;
                        petalData.petal.y = Math.sin(petalData.angle * Math.PI / 180) * petalData.initialRadius;
                        petalData.petal.alpha = 0;
                    },
                    repeat: -1
                });

                // Gentle rotation while flying
                this.scene.tweens.add({
                    targets: petalData.petal,
                    angle: petalData.petal.angle + 360,
                    duration: randomDuration,
                    delay: randomDelay + 30,
                    ease: 'Linear',
                    repeat: -1
                });
            });

            // Firework bursts pulsing and rotating
            this.fireworkBursts.forEach((burst, index) => {
                this.scene.tweens.add({
                    targets: burst,
                    scaleX: 1.4,
                    scaleY: 1.4,
                    alpha: 0.3,
                    duration: 500 + index * 120,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });

                this.scene.tweens.add({
                    targets: burst,
                    angle: 360,
                    duration: 2000 + index * 400,
                    repeat: -1,
                    ease: 'Linear'
                });
            });

            // Golden sparkles twinkling
            this.sparkles.forEach((sparkle, index) => {
                this.scene.tweens.add({
                    targets: sparkle,
                    alpha: 0.2,
                    scale: 1.5,
                    duration: 450,
                    delay: index * 75,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });

                this.scene.tweens.add({
                    targets: sparkle,
                    angle: 180,
                    duration: 900 + index * 150,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
            });

            // Central glow pulsing
            this.scene.tweens.add({
                targets: this.centralGlow,
                scaleX: 1.6,
                scaleY: 1.6,
                alpha: 0.4,
                duration: 1000,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }
    }

    fadeOut(callback) {
        this.scene.tweens.add({
            targets: this,
            alpha: 0,
            y: '-=30',
            duration: 400,
            ease: 'Power2.easeIn',
            onComplete: () => {
                // Kill all tweens to prevent memory leaks
                this.scene.tweens.killTweensOf(this);
                if (this.pointsDigit) this.scene.tweens.killTweensOf(this.pointsDigit);
                if (this.extrusionDigit) this.scene.tweens.killTweensOf(this.extrusionDigit);
                if (this.raysContainer) this.scene.tweens.killTweensOf(this.raysContainer);
                if (this.centralGlow) this.scene.tweens.killTweensOf(this.centralGlow);
                if (this.petals) {
                    this.petals.forEach(p => this.scene.tweens.killTweensOf(p.petal));
                }
                if (this.fireworkBursts) {
                    this.fireworkBursts.forEach(b => this.scene.tweens.killTweensOf(b));
                }
                if (this.sparkles) {
                    this.sparkles.forEach(s => this.scene.tweens.killTweensOf(s));
                }
                // Kill tweens for glow layer container
                this.list.forEach(child => {
                    if (child.type === 'Container') {
                        this.scene.tweens.killTweensOf(child);
                    }
                });

                this.destroy();
                if (callback) callback();
            }
        });
    }
}

