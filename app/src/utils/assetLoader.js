import { SUITS } from '../config/constants.js';

const CARD_BACK = 'mini_card_back_1';
const FRAME = 'f5';
const BANKER_FRAME = 'f2-b';

export function loadAssets(scene) {

    scene.load.image('background', 'assets/images/background/bg-2.png');

    // Load emote spritesheets
    scene.load.spritesheet('emote_cry', 'assets/images/emotes/cry-emote.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.spritesheet('emote_happy', 'assets/images/emotes/happy-emote.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.spritesheet('emote_money', 'assets/images/emotes/money-emote.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.spritesheet('emote_angry', 'assets/images/emotes/angry-emote.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.spritesheet('emote_gg', 'assets/images/emotes/gg-emote.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.spritesheet('emote_beg', 'assets/images/emotes/beg-emote.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.spritesheet('emote_rich', 'assets/images/emotes/rich-emote.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.spritesheet('emote_kiss', 'assets/images/emotes/kiss-emote.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.spritesheet('emote_card_tear', 'assets/images/emotes/card-tear-emote.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.spritesheet('emote_bad_card', 'assets/images/emotes/bad-card-emote.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.spritesheet('emote_good_card', 'assets/images/emotes/good-card-emote.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.spritesheet('emote_nine_card', 'assets/images/emotes/nine-card-emote.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.spritesheet('emote_extra_card', 'assets/images/emotes/extra-card-emote.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.spritesheet('emote_gray_card', 'assets/images/emotes/gray-card-emote.png', { frameWidth: 180, frameHeight: 180 });

    scene.load.image('player_frame', `assets/images/frames/${FRAME}.png`);
    scene.load.image('player_frame_local', `assets/images/frames/${FRAME}.png`);
    scene.load.image('banker_frame', `assets/images/frames/${BANKER_FRAME}.png`);
    scene.load.image('banker_frame_local', `assets/images/frames/${BANKER_FRAME}.png`);

    scene.load.image('card_back_deck', `assets/images/cards/card back/${CARD_BACK}.png`);
    scene.load.image('card_back', `assets/images/cards/card back/${CARD_BACK}.png`);
    scene.load.image('card_back_player', `assets/images/cards/card back/${CARD_BACK}.png`);

    scene.load.image('avatar_1', `assets/images/avatars/mini_p1.jpg`);
    scene.load.image('avatar_2', `assets/images/avatars/mini_p2.jpg`);
    scene.load.image('avatar_3', `assets/images/avatars/mini_p3.jpg`);
    scene.load.image('avatar_4', `assets/images/avatars/mini_p4.jpg`);
    scene.load.image('avatar_5', `assets/images/avatars/mini_p5.jpg`);
    scene.load.image('avatar_6', `assets/images/avatars/mini_p6.jpg`);
    scene.load.image('avatar_7', `assets/images/avatars/mini_p7.jpg`);
    scene.load.image('avatar_8', `assets/images/avatars/mini_p8.jpg`);

    scene.load.audio('place_card_sound', 'assets/audio/place-card.m4a');

    SUITS.forEach(suit => {
        for (let i = 1; i <= 13; i++) {
            const basePath = `assets/images/cards/${suit}/${i}_${suit}.png`;
            scene.load.image(`${i}_${suit}`, basePath);
            scene.load.image(`${i}_${suit}_player`, basePath);
        }
    });
}

// Emote animation configs
const EMOTE_ANIMS = [
    { key: 'cry', frames: 30, frameRate: 8, repeat: 0 },
    { key: 'happy', frames: 30, frameRate: 8, repeat: 0 },
    { key: 'money', frames: 30, frameRate: 8, repeat: 0 },
    { key: 'angry', frames: 30, frameRate: 8, repeat: 0 },
    { key: 'gg', frames: 30, frameRate: 8, repeat: 0 },
    { key: 'beg', frames: 36, frameRate: 8, repeat: 0 },
    { key: 'rich', frames: 36, frameRate: 8, repeat: 0 },
    { key: 'kiss', frames: 30, frameRate: 8, repeat: 0 },
    { key: 'card_tear', frames: 36, frameRate: 11, repeat: 0 },
    { key: 'bad_card', frames: 36, frameRate: 8, repeat: 0 },
    { key: 'good_card', frames: 36, frameRate: 8, repeat: 0 },
    { key: 'nine_card', frames: 36, frameRate: 8, repeat: 0 },
    { key: 'extra_card', frames: 36, frameRate: 8, repeat: 0 },
    { key: 'gray_card', frames: 36, frameRate: 8, repeat: 0 },
];

/**
 * Create emote animations - call this in scene's create() method
 */
export function createEmoteAnimations(scene) {
    EMOTE_ANIMS.forEach(({ key, frames, frameRate, repeat }) => {
        const animKey = `emote_${key}_anim`;
        if (!scene.anims.exists(animKey)) {
            scene.anims.create({
                key: animKey,
                frames: scene.anims.generateFrameNumbers(`emote_${key}`, { start: 0, end: frames - 1 }),
                frameRate,
                repeat
            });
        }
    });
}
