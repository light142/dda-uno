import { GAME_OVER } from '../config/settings.js';
import { Card } from '../entities/Card.js';

/**
 * GameOverOverlay — centered panel game-over sequence.
 *
 * Sequence:
 *  1. Cards drift off screen
 *  2. Dim backdrop + bordered panel scale in
 *  3. Winner avatar flies into panel with glowing ring
 *  4. Confetti burst (win) or embers (lose)
 *  5. Title text slams in ("YOU WIN!" / "YOU LOSE")
 *  6. "Play Again" button + countdown timer appear
 *  7. On dismiss → triggers restart
 */
export class GameOverOverlay {

    /**
     * @param {Phaser.Scene} scene
     * @param {number} winnerIndex - 0 = local player won, 1-3 = bot won
     * @param {Function} onRestart - callback when player wants to restart
     */
    static show(scene, winnerIndex, onRestart) {
        if (scene._gameOverContainer) return;

        const isWin = winnerIndex === 0;
        const cfg = GAME_OVER;
        const cam = scene.cameras.main;
        const cx = cam.width / 2;

        // Master container
        const container = scene.add.container(0, 0);
        container.setDepth(cfg.DEPTH);
        scene._gameOverContainer = container;
        scene._gameOverTimers = [];

        const scheduleTimer = (delay, cb) => {
            const t = scene.time.delayedCall(delay, cb);
            scene._gameOverTimers.push(t);
            return t;
        };

        // ─── Phase 1: Scatter cards ─────────────────────────────
        const scatterCfg = cfg.CARD_SCATTER;
        const allCards = scene.children.list.filter(c => c instanceof Card);
        allCards.forEach((card, i) => {
            const angle = Math.random() * Math.PI * 2;
            const dist = scatterCfg.SPREAD_X * 0.5 + Math.random() * scatterCfg.SPREAD_X * 0.5;
            const targetX = cx + Math.cos(angle) * dist;
            const targetY = cam.height / 2 + Math.sin(angle) * dist;
            const spinDir = Math.random() > 0.5 ? 1 : -1;

            scene.tweens.add({
                targets: card,
                x: targetX,
                y: targetY,
                angle: spinDir * scatterCfg.SPIN * (0.5 + Math.random() * 0.5),
                alpha: 0,
                duration: scatterCfg.DURATION,
                delay: scatterCfg.DELAY + i * scatterCfg.STAGGER,
                ease: scatterCfg.EASE,
            });
        });

        // ─── Phase 2: Dim backdrop + Panel ──────────────────────
        const dimCfg = cfg.DIM;
        const panelCfg = cfg.PANEL;

        // Full-screen dim
        const dim = scene.add.graphics();
        dim.fillStyle(dimCfg.COLOR, 1);
        dim.fillRect(0, 0, cam.width, cam.height);
        dim.setAlpha(0);
        container.add(dim);

        scene.tweens.add({
            targets: dim,
            alpha: dimCfg.ALPHA,
            duration: dimCfg.FADE_DURATION,
            ease: 'Sine.easeIn',
        });

        // Panel graphics (drawn at origin 0,0 so the wrapper can scale it)
        const pw = panelCfg.WIDTH;
        const ph = panelCfg.HEIGHT;
        const cr = panelCfg.CORNER_RADIUS;

        const panel = scene.add.graphics();

        // Main fill
        panel.fillStyle(panelCfg.BG_COLOR, panelCfg.BG_ALPHA);
        panel.fillRoundedRect(-pw / 2, -ph / 2, pw, ph, cr);

        // Outer gold border
        panel.lineStyle(panelCfg.BORDER_WIDTH, panelCfg.BORDER_COLOR, panelCfg.BORDER_ALPHA);
        panel.strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, cr);

        // Inner accent line
        const inset = panelCfg.INNER_INSET;
        panel.lineStyle(panelCfg.INNER_BORDER_WIDTH, panelCfg.INNER_BORDER_COLOR, panelCfg.INNER_BORDER_ALPHA);
        panel.strokeRoundedRect(-pw / 2 + inset, -ph / 2 + inset, pw - inset * 2, ph - inset * 2, cr - 4);

        // Wrap panel in a container at the panel center for scaling
        const panelContainer = scene.add.container(panelCfg.X, panelCfg.Y);
        panelContainer.add(panel);
        panelContainer.setScale(0.85);
        panelContainer.setAlpha(0);
        container.add(panelContainer);

        scene.tweens.add({
            targets: panelContainer,
            scaleX: 1,
            scaleY: 1,
            alpha: 1,
            duration: panelCfg.ENTRANCE_DURATION,
            delay: 100,
            ease: panelCfg.EASE,
        });

        // ─── Phase 3: Winner avatar spotlight ───────────────────
        const avCfg = cfg.AVATAR_SPOTLIGHT;
        const winnerAvatar = scene.playerManager.playerAvatars[winnerIndex];
        const winnerName = scene.playerManager.getPlayer(winnerIndex).name || 'Player';

        if (winnerAvatar) {
            scheduleTimer(avCfg.DELAY, () => {
                // Hide nickname so it doesn't scale up
                if (winnerAvatar.nicknameBg) winnerAvatar.nicknameBg.setVisible(false);
                if (winnerAvatar.nicknameBorder) winnerAvatar.nicknameBorder.setVisible(false);
                if (winnerAvatar.nicknameText) winnerAvatar.nicknameText.setVisible(false);

                winnerAvatar.setDepth(cfg.DEPTH + 5);

                // Glowing ring
                const ring = scene.add.graphics();
                ring.setDepth(cfg.DEPTH + 4);
                const ringColor = isWin ? avCfg.RING.COLOR_WIN : avCfg.RING.COLOR_LOSE;

                for (let r = avCfg.RING.RADIUS + 18; r >= avCfg.RING.RADIUS - 4; r -= 3) {
                    const a = avCfg.RING.ALPHA * (1 - Math.abs(r - avCfg.RING.RADIUS) / 22);
                    ring.lineStyle(avCfg.RING.WIDTH, ringColor, a);
                    ring.strokeCircle(0, 0, r);
                }

                ring.setPosition(avCfg.TARGET_X, avCfg.TARGET_Y);
                ring.setScale(0);
                container.add(ring);
                scene._gameOverRing = ring;

                // Fly avatar into panel
                scene.tweens.add({
                    targets: winnerAvatar,
                    x: avCfg.TARGET_X,
                    y: avCfg.TARGET_Y,
                    scaleX: avCfg.TARGET_SCALE,
                    scaleY: avCfg.TARGET_SCALE,
                    duration: avCfg.FLY_DURATION,
                    ease: avCfg.EASE,
                });

                scene.tweens.add({
                    targets: ring,
                    scaleX: 1,
                    scaleY: 1,
                    duration: avCfg.FLY_DURATION,
                    ease: avCfg.EASE,
                });

                // Continuous spin
                scene.tweens.add({
                    targets: ring,
                    angle: 360,
                    duration: avCfg.RING.SPIN_DURATION,
                    repeat: -1,
                    ease: 'Linear',
                });

                // Pulse
                scene.tweens.add({
                    targets: ring,
                    scaleX: avCfg.PULSE.MAX,
                    scaleY: avCfg.PULSE.MAX,
                    duration: avCfg.PULSE.DURATION,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut',
                });
            });
        }

        // ─── Phase 4: Particles ─────────────────────────────────
        const pCfg = cfg.PARTICLES;
        const particleCfg = isWin ? pCfg.WIN : pCfg.LOSE;
        const panelTop = panelCfg.Y - ph / 2;

        scheduleTimer(pCfg.DELAY, () => {
            GameOverOverlay._spawnParticles(scene, container, cx, isWin ? panelTop : panelCfg.Y, particleCfg, isWin, cfg.DEPTH);
        });

        if (isWin) {
            scheduleTimer(pCfg.DELAY + 500, () => {
                GameOverOverlay._spawnParticles(scene, container, cx, panelTop, particleCfg, isWin, cfg.DEPTH);
            });
        }

        // ─── Phase 5: Title text ────────────────────────────────
        const tCfg = cfg.TITLE;
        scheduleTimer(tCfg.ENTRANCE_DELAY, () => {
            const titleText = isWin ? tCfg.WIN_TEXT : tCfg.LOSE_TEXT;
            const titleColor = isWin ? tCfg.WIN_COLOR : tCfg.LOSE_COLOR;

            // Glow layer
            const glow = scene.add.text(cx, tCfg.Y, titleText, {
                fontSize: tCfg.FONT_SIZE + 'px',
                fontFamily: tCfg.FONT_FAMILY,
                fontStyle: 'bold',
                color: titleColor,
                stroke: titleColor,
                strokeThickness: 14,
                shadow: { offsetX: 0, offsetY: 0, color: titleColor, blur: 24, fill: true },
            });
            glow.setOrigin(0.5);
            glow.setAlpha(0);
            glow.setDepth(cfg.DEPTH + 10);
            container.add(glow);

            // Main text
            const title = scene.add.text(cx, tCfg.Y, titleText, {
                fontSize: tCfg.FONT_SIZE + 'px',
                fontFamily: tCfg.FONT_FAMILY,
                fontStyle: 'bold',
                color: titleColor,
                stroke: tCfg.STROKE_COLOR,
                strokeThickness: tCfg.STROKE_THICKNESS,
                letterSpacing: 6,
            });
            title.setOrigin(0.5);
            title.setScale(0);
            title.setDepth(cfg.DEPTH + 11);
            container.add(title);

            scene.tweens.add({
                targets: title,
                scaleX: 1,
                scaleY: 1,
                duration: tCfg.ENTRANCE_DURATION,
                ease: tCfg.EASE,
            });

            scene.tweens.add({
                targets: glow,
                alpha: 0.2,
                duration: tCfg.ENTRANCE_DURATION + 200,
                ease: 'Sine.easeOut',
            });

            scene.tweens.add({
                targets: glow,
                alpha: { from: 0.12, to: 0.3 },
                duration: 1800,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
                delay: tCfg.ENTRANCE_DURATION + 200,
            });

            // Subtitle
            const nCfg = tCfg.NAME;
            const subtitle = isWin ? 'Congratulations!' : `${winnerName} wins this round`;
            const nameText = scene.add.text(cx, tCfg.Y + nCfg.OFFSET_Y, subtitle, {
                fontSize: nCfg.FONT_SIZE + 'px',
                fontFamily: tCfg.FONT_FAMILY,
                color: nCfg.COLOR,
            });
            nameText.setOrigin(0.5);
            nameText.setAlpha(0);
            nameText.setDepth(cfg.DEPTH + 10);
            container.add(nameText);

            scene.tweens.add({
                targets: nameText,
                alpha: nCfg.ALPHA,
                y: nameText.y - 6,
                duration: 400,
                delay: 200,
                ease: 'Sine.easeOut',
            });
        });

        // ─── Phase 6: Controls ──────────────────────────────────
        const cCfg = cfg.CONTROLS;
        scheduleTimer(cCfg.DELAY, () => {
            GameOverOverlay._createControls(scene, container, cx, cCfg, cfg.DEPTH, onRestart);
        });
    }

    /**
     * Spawn particle burst (graphics-based, no texture needed).
     */
    static _spawnParticles(scene, container, cx, originY, cfg, isWin, baseDepth) {
        for (let i = 0; i < cfg.COUNT; i++) {
            const color = cfg.COLORS[i % cfg.COLORS.length];
            const size = isWin ? (3 + Math.random() * 5) : (2 + Math.random() * 3);

            const particle = scene.add.graphics();
            particle.setDepth(baseDepth + 3);

            if (isWin && Math.random() > 0.5) {
                const w = size * (1 + Math.random() * 2);
                const h = size * 0.6;
                particle.fillStyle(color, 0.9);
                particle.fillRect(-w / 2, -h / 2, w, h);
            } else {
                particle.fillStyle(color, 0.85);
                particle.fillCircle(0, 0, size / 2);
            }

            particle.setPosition(cx + (Math.random() - 0.5) * 200, originY);
            container.add(particle);

            const angle = Phaser.Math.DegToRad(
                cfg.ANGLE.MIN + Math.random() * (cfg.ANGLE.MAX - cfg.ANGLE.MIN)
            );
            const speed = cfg.SPEED.MIN + Math.random() * (cfg.SPEED.MAX - cfg.SPEED.MIN);
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const targetX = particle.x + vx * (cfg.LIFESPAN / 1000);
            const targetY = particle.y + vy * (cfg.LIFESPAN / 1000) + cfg.GRAVITY_Y;

            scene.tweens.add({
                targets: particle,
                x: targetX,
                y: targetY,
                scaleX: { from: cfg.SCALE.START, to: cfg.SCALE.END },
                scaleY: { from: cfg.SCALE.START, to: cfg.SCALE.END },
                alpha: { from: 0.9, to: 0 },
                angle: isWin ? (Math.random() - 0.5) * 720 : (Math.random() - 0.5) * 180,
                duration: cfg.LIFESPAN * (0.7 + Math.random() * 0.6),
                ease: 'Sine.easeOut',
                onComplete: () => particle.destroy(),
            });
        }
    }

    /**
     * Create "Play Again" button and countdown timer.
     */
    static _createControls(scene, container, cx, cfg, baseDepth, onRestart) {
        const btnCfg = cfg.BUTTON;
        const controlGroup = scene.add.container(cx, cfg.Y);
        controlGroup.setDepth(baseDepth + 15);
        controlGroup.setScale(0);
        controlGroup.setAlpha(0);
        container.add(controlGroup);

        const btnBg = scene.add.graphics();
        btnBg.fillStyle(btnCfg.BG_COLOR, btnCfg.BG_ALPHA);
        btnBg.fillRoundedRect(
            -btnCfg.WIDTH / 2, -btnCfg.HEIGHT / 2,
            btnCfg.WIDTH, btnCfg.HEIGHT,
            btnCfg.CORNER_RADIUS
        );
        controlGroup.add(btnBg);

        const btnBorder = scene.add.graphics();
        btnBorder.lineStyle(1.5, 0xffffff, 0.12);
        btnBorder.strokeRoundedRect(
            -btnCfg.WIDTH / 2, -btnCfg.HEIGHT / 2,
            btnCfg.WIDTH, btnCfg.HEIGHT,
            btnCfg.CORNER_RADIUS
        );
        controlGroup.add(btnBorder);

        const btnText = scene.add.text(0, 0, btnCfg.TEXT, {
            fontSize: btnCfg.FONT_SIZE + 'px',
            fontFamily: 'Nunito, Arial',
            fontStyle: 'bold',
            color: btnCfg.TEXT_COLOR,
        });
        btnText.setOrigin(0.5);
        controlGroup.add(btnText);

        // Graphics-based hit area on the scene for reliable iOS touch
        const hitW = btnCfg.WIDTH + 60;
        const hitH = btnCfg.HEIGHT + 40;
        const hitArea = scene.add.graphics();
        hitArea.fillStyle(0x000000, 0.001); // nearly invisible but renderable
        hitArea.fillRect(-hitW / 2, -hitH / 2, hitW, hitH);
        hitArea.setPosition(cx, cfg.Y);
        hitArea.setDepth(baseDepth + 20);
        hitArea.setInteractive(
            new Phaser.Geom.Rectangle(-hitW / 2, -hitH / 2, hitW, hitH),
            Phaser.Geom.Rectangle.Contains
        );
        scene._gameOverHitZone = hitArea;

        hitArea.on('pointerdown', () => {
            scene.tweens.add({
                targets: controlGroup,
                scaleX: btnCfg.PRESS_SCALE,
                scaleY: btnCfg.PRESS_SCALE,
                duration: 60,
                ease: 'Sine.easeIn',
                onComplete: () => {
                    GameOverOverlay._triggerRestart(scene, onRestart);
                },
            });
        });

        // Countdown timer
        const tCfg = cfg.TIMER;
        let secondsLeft = cfg.COUNTDOWN_SECONDS;
        const timerText = scene.add.text(cx, cfg.Y + tCfg.OFFSET_Y, '', {
            fontSize: tCfg.FONT_SIZE + 'px',
            fontFamily: 'Quicksand, Arial',
            fontStyle: '600',
            color: tCfg.COLOR,
        });
        timerText.setOrigin(0.5);
        timerText.setDepth(baseDepth + 15);
        timerText.setAlpha(0);
        container.add(timerText);

        const updateTimerDisplay = () => {
            timerText.setText(`New game in ${secondsLeft}s`);
        };
        updateTimerDisplay();

        scene.tweens.add({
            targets: controlGroup,
            scaleX: 1,
            scaleY: 1,
            alpha: 1,
            duration: cfg.ENTRANCE_DURATION,
            ease: cfg.EASE,
        });

        scene.tweens.add({
            targets: timerText,
            alpha: 0.7,
            duration: cfg.ENTRANCE_DURATION,
            delay: 100,
            ease: 'Sine.easeOut',
        });

        const tickTimer = scene.time.addEvent({
            delay: 1000,
            repeat: secondsLeft - 1,
            callback: () => {
                secondsLeft--;
                updateTimerDisplay();

                if (secondsLeft <= 5 && secondsLeft > 0) {
                    scene.tweens.add({
                        targets: timerText,
                        scaleX: 1.15,
                        scaleY: 1.15,
                        duration: 150,
                        yoyo: true,
                        ease: 'Sine.easeOut',
                    });
                    timerText.setColor('#FFD700');
                }

                if (secondsLeft <= 0) {
                    GameOverOverlay._triggerRestart(scene, onRestart);
                }
            },
        });

        if (scene._gameOverTimers) {
            scene._gameOverTimers.push(tickTimer);
        }
    }

    /**
     * Animate out and trigger restart.
     */
    static _triggerRestart(scene, onRestart) {
        if (scene._gameOverRestarting) return;
        scene._gameOverRestarting = true;

        const container = scene._gameOverContainer;
        if (!container) {
            if (onRestart) onRestart();
            return;
        }

        scene.tweens.add({
            targets: container,
            alpha: 0,
            duration: GAME_OVER.EXIT.DURATION,
            ease: GAME_OVER.EXIT.EASE,
            onComplete: () => {
                GameOverOverlay.forceClear(scene);
                if (onRestart) onRestart();
            },
        });
    }

    /**
     * Force-clear without animation (safe before tweens.killAll).
     */
    static forceClear(scene) {
        if (scene._gameOverTimers) {
            scene._gameOverTimers.forEach(t => {
                if (t && !t.hasDispatched) t.remove(false);
            });
            scene._gameOverTimers = null;
        }

        if (scene._gameOverRing) {
            scene.tweens.killTweensOf(scene._gameOverRing);
            scene._gameOverRing.destroy();
            scene._gameOverRing = null;
        }

        // Reset ALL avatars back to seat position, scale, and visibility
        if (scene.playerManager?.playerAvatars) {
            scene.playerManager.playerAvatars.forEach(avatar => {
                if (!avatar) return;
                scene.tweens.killTweensOf(avatar);
                avatar.setDepth(0);
                avatar.setScale(1);
                avatar.setAlpha(1);
                avatar.x = avatar.player.x;
                avatar.y = avatar.player.y;
                if (avatar.nicknameBg) avatar.nicknameBg.setVisible(true);
                if (avatar.nicknameBorder) avatar.nicknameBorder.setVisible(true);
                if (avatar.nicknameText) avatar.nicknameText.setVisible(true);
            });
        }

        if (scene.visualDeck) {
            scene.visualDeck.setAlpha(1);
        }

        if (scene._gameOverHitZone) {
            scene._gameOverHitZone.destroy();
            scene._gameOverHitZone = null;
        }

        if (scene._gameOverContainer) {
            scene.tweens.killTweensOf(scene._gameOverContainer);
            scene._gameOverContainer.destroy();
            scene._gameOverContainer = null;
        }

        scene._gameOverRestarting = false;
    }
}
