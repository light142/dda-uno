import { GameScene } from './scenes/GameScene.js';

const config = {
    type: Phaser.AUTO,
    title: 'Shan Koe Mee',
    description: '',
    parent: 'game-container',
    width: 720,
    height: 1280,
    backgroundColor: '#000000',
    pixelArt: false,
    scene: [
        GameScene
    ],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
}

new Phaser.Game(config);
            