export const SEAT_POSITIONS = [
    { position: 'bottom', x: 290, y: 600 },
    { position: 'left', x: 100, y: 250 },
    { position: 'top', x: 640, y: 80 },
    { position: 'right', x: 1180, y: 250 },
];

export const CARD_OFFSET_TO_CENTER = {
    bottom: { x: 350, y: 0 },
    left: { x: 220, y: 5 },
    top: { x: 220, y: 5 },
    right: { x: -220, y: 5 },
};

export const CARD_SPACING = {
    LOCAL_PLAYER: 66,
    OTHER_PLAYERS: 37
};

export const LOCAL_PLAYER_HAND = {
    MAX_ROTATION: 8,
    VERTICAL_LIFT: 15
};

export const DECK_OFFSET = {
    X: 350,
    Y: 450
};

// Scale multipliers for card animations (relative to display size)
export const CARD_SCALE = {
    INITIAL: 0.9,
    HIGHLIGHT: 1,
    PLAYER_INITIAL: 1.0,
    PLAYER_HIGHLIGHT: 1.1,
};

export const ANIMATION = {
    DEAL_DELAY: 220,
    FLIP_DURATION: 100,
    SLIDE_DURATION: 300,
    BOUNCE_DURATION: 100
};

export const DECK_VISUAL = {
    ROTATION: 0,
    STACK_LAYERS: 6,
    LAYER_OFFSET_X: -0.5,
    LAYER_OFFSET_Y: 2.8,
    CARD_POP_DURATION: 150,
    CARD_POP_LIFT: 8
};

export const AVATAR_NICKNAME_DISPLAY = {
    LOCAL_PLAYER: {
        WIDTH: 130,
        HEIGHT: 30,
        CORNER_RADIUS: 12,
        FONT_SIZE: 16,
        OFFSET_Y: 88
    },
    OTHER_PLAYERS: {
        WIDTH: 100,
        HEIGHT: 26,
        CORNER_RADIUS: 12,
        FONT_SIZE: 14,
        OFFSET_Y: 73
    },
    COLORS: {
        BG: 0x1a0a0a,
        BG_ALPHA: 0.75,
        BORDER: 0xFFD700,
        BORDER_ALPHA: 0,
        BORDER_WIDTH: 2,
        TEXT: '#ECDABD',
        TEXT_STROKE: '#000',
        TEXT_STROKE_THICKNESS: 1
    }
};

// 3D-style fan layout for other players' cards
// spreadAngle: direction cards spread along (degrees, 0 = right, 90 = down)
// baseRotation: tilt of cards (positive = CW, negative = CCW)
export const OTHER_PLAYER_FAN = {
    left: {
        spreadAngle: 0,         // almost horizontal to the right (toward center)
        spacing: 37,            // tight overlap between card centers
        arcAmount: 0,           // subtle downward arc bow at center
        baseRotation: 0,       // CW — card tops point upper-right, like reference
        fanAngle: 0,           // rotation spread: 24° to 36° across the fan
    },
    top: {
        spreadAngle: 0,         // almost horizontal to the right (toward center)
        spacing: 37,            // tight overlap between card centers
        arcAmount: 0,           // subtle downward arc bow at center
        baseRotation: 0,       // CW — card tops point upper-right, like reference
        fanAngle: 0,           // rotation spread: 24° to 36° across the fan
    },
    right: {
        spreadAngle: 0,         // almost horizontal to the right (toward center)
        spacing: 37,            // tight overlap between card centers
        arcAmount: 0,           // subtle downward arc bow at center
        baseRotation: 0,       // CW — card tops point upper-right, like reference
        fanAngle: 0,           // rotation spread: 24° to 36° across the fan
    }
};

export const EMOTE_DISPLAY = {
    LOCAL_PLAYER: {
        SCALE: 1,
        OFFSET_Y: -35
    },
    OTHER_PLAYERS: {
        SCALE: 1,
        OFFSET_Y: -35
    },
    FRAME_RATE: 6,
    DEPTH: 50
};

