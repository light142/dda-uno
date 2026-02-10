import { COLORS, NUMBER_VALUES, ACTION_VALUES, WILD_CARDS, COLOR_INITIALS, ACTION_FILE_CODES, WILD_FILE_CODES } from '../config/constants.js';

export function loadAssets(scene) {

    scene.load.image('background', 'assets/images/background/bg.png');

    scene.load.image('player_frame_left', 'assets/images/frames/f1.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.image('player_frame_top', 'assets/images/frames/f2.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.image('player_frame_bottom', 'assets/images/frames/f3.png', { frameWidth: 180, frameHeight: 180 });
    scene.load.image('player_frame_right', 'assets/images/frames/f4.png', { frameWidth: 180, frameHeight: 180 });

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

    scene.load.audio('place_card_sound', 'assets/audio/place-card.m4a');

    // Load number cards (0-9 per color) — files: cards/numbers/{color}/{value}.png
    COLORS.forEach(color => {
        NUMBER_VALUES.forEach(value => {
            const basePath = `assets/images/cards/numbers/${color}/${value}.png`;
            scene.load.image(`${value}_${color}`, basePath);
            scene.load.image(`${value}_${color}_player`, basePath);
        });
    });

    // Load action cards (plus2, block, reverse per color) — files: cards/special/{colorInitial}{actionCode}.png
    COLORS.forEach(color => {
        const ci = COLOR_INITIALS[color];
        ACTION_VALUES.forEach(value => {
            const fileCode = ACTION_FILE_CODES[value];
            const basePath = `assets/images/cards/special/${ci}${fileCode}.png`;
            scene.load.image(`${value}_${color}`, basePath);
            scene.load.image(`${value}_${color}_player`, basePath);
        });
    });

    // Load wild cards — files: cards/special/{fileCode}.png
    WILD_CARDS.forEach(card => {
        const fileCode = WILD_FILE_CODES[card];
        const basePath = `assets/images/cards/special/${fileCode}.png`;
        scene.load.image(card, basePath);
        scene.load.image(`${card}_player`, basePath);
    });
}
