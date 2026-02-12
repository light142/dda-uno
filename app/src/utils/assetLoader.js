import { COLORS, NUMBER_VALUES, ACTION_VALUES, WILD_CARDS, COLOR_INITIALS, ACTION_FILE_CODES, WILD_FILE_CODES } from '../config/constants.js';

export function loadAssets(scene) {

    scene.load.image('background', 'assets/images/background/bg.png');

    scene.load.image('arrow', 'assets/images/arrows/arrow.png');
    scene.load.image('r_arrow', 'assets/images/arrows/r-arrow.png');

    scene.load.image('pass_btn', 'assets/images/buttons/pass.png');
    scene.load.image('pass_disabled_btn', 'assets/images/buttons/pass-disabled.png');
    scene.load.image('uno_btn', 'assets/images/buttons/uno.png');

    scene.load.spritesheet('emote_uno', 'assets/images/emotes/uno-emote.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.spritesheet('emote_gg', 'assets/images/emotes/gg-emote.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.spritesheet('emote_angry', 'assets/images/emotes/angry-emote.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.spritesheet('emote_eyes', 'assets/images/emotes/eyes-emote.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.spritesheet('emote_cry', 'assets/images/emotes/cry-emote.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.spritesheet('emote_sad', 'assets/images/emotes/sad-emote.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.spritesheet('emote_greet', 'assets/images/emotes/greet-emote.png', { frameWidth: 180, frameHeight: 180 });

    scene.load.image('player_frame_left', 'assets/images/frames/f.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.image('player_frame_top', 'assets/images/frames/f.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.image('player_frame_bottom', 'assets/images/frames/f.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.image('player_frame_right', 'assets/images/frames/f.png', { frameWidth: 180, frameHeight: 180 });

    const cardBackPath = 'assets/images/cards/card back/card_back.png';
    scene.load.image('card_back_deck', cardBackPath);
    scene.load.image('card_back', cardBackPath);
    scene.load.image('card_back_player', cardBackPath);

    scene.load.image('avatar_1', `assets/images/avatars/mini_p1.jpg`);
    scene.load.image('avatar_2', `assets/images/avatars/mini_p2.jpg`);
    scene.load.image('avatar_3', `assets/images/avatars/mini_p3.jpg`);
    scene.load.image('avatar_4', `assets/images/avatars/mini_p4.jpg`);
    scene.load.image('avatar_5', `assets/images/avatars/mini_p5.jpg`);
    scene.load.image('avatar_6', `assets/images/avatars/mini_p6.jpg`);
    scene.load.image('avatar_7', `assets/images/avatars/mini_p7.jpg`);
    scene.load.image('avatar_8', `assets/images/avatars/mini_p8.jpg`);

    // Load number cards (0-9 per color) — files: cards/numbers/{color}/{value}.png
    // Single texture per card; Card entity uses the same key for both player and non-player.
    COLORS.forEach(color => {
        NUMBER_VALUES.forEach(value => {
            const basePath = `assets/images/cards/numbers/${color}/${value}.png`;
            scene.load.image(`${value}_${color}`, basePath);
        });
    });

    // Load action cards (plus2, block, reverse per color) — files: cards/special/{colorInitial}{actionCode}.png
    COLORS.forEach(color => {
        const ci = COLOR_INITIALS[color];
        ACTION_VALUES.forEach(value => {
            const fileCode = ACTION_FILE_CODES[value];
            const basePath = `assets/images/cards/special/${ci}${fileCode}.png`;
            scene.load.image(`${value}_${color}`, basePath);
        });
    });

    // Load wild cards — files: cards/special/{fileCode}.png
    WILD_CARDS.forEach(card => {
        const fileCode = WILD_FILE_CODES[card];
        const basePath = `assets/images/cards/special/${fileCode}.png`;
        scene.load.image(card, basePath);
    });

    // Load colored wild card variants (for color selection display)
    COLORS.forEach(color => {
        const ci = COLOR_INITIALS[color];
        WILD_CARDS.forEach(card => {
            const fileCode = WILD_FILE_CODES[card];
            const basePath = `assets/images/cards/special/${ci}${fileCode}.png`;
            scene.load.image(`${card}_${color}`, basePath);
        });
    });
}

// Emote animation configs
const EMOTE_ANIMS = [
    { key: 'uno', frames: 36, frameRate: 13, repeat: 0 },
    { key: 'gg', frames: 36, frameRate: 9, repeat: 0 },
    { key: 'angry', frames: 36, frameRate: 13, repeat: 0 },
    { key: 'eyes', frames: 30, frameRate: 13, repeat: 0 },
    { key: 'cry', frames: 36, frameRate: 13, repeat: 0 },
    { key: 'sad', frames: 36, frameRate: 13, repeat: 0 },
    { key: 'greet', frames: 36, frameRate: 9, repeat: 0 },
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
