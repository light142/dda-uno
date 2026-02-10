export const SEAT_POSITIONS = [
    { position: 'bottom', x: 360, y: 1100 },
    { position: 'left', x: 100, y: 620 },
    { position: 'top', x: 360, y: 180 },
    { position: 'right', x: 620, y: 620 },
];

export const CARD_OFFSET_TO_CENTER = {
    bottom: { x: 0, y: -158 },
    left: { x: 120, y: 0 },
    top: { x: 0, y: 130 },
    right: { x: -120, y: 0 },
};

export const CARD_SPACING = {
    LOCAL_PLAYER: 70,
    OTHER_PLAYERS: 30
};

export const LOCAL_PLAYER_HAND = {
    MAX_ROTATION: 8,
    VERTICAL_LIFT: 15
};

export const DECK_OFFSET = {
    HORIZONTAL: 120,
    VERTICAL: 124
};

// Scale multipliers for card animations (relative to display size)
export const CARD_SCALE = {
    INITIAL: 1.0,
    HIGHLIGHT: 1.15,
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
    LAYER_OFFSET_X: 0.4,
    LAYER_OFFSET_Y: 1.6,
    CARD_POP_DURATION: 150,
    CARD_POP_LIFT: 8
};

export const AVATAR_NICKNAME_DISPLAY = {
    LOCAL_PLAYER: {
        WIDTH: 140,
        HEIGHT: 28,
        CORNER_RADIUS: 12,
        FONT_SIZE: 16,
        OFFSET_Y: 94
    },
    OTHER_PLAYERS: {
        WIDTH: 140,
        HEIGHT: 28,
        CORNER_RADIUS: 12,
        FONT_SIZE: 16,
        OFFSET_Y: 94
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
        spreadAngle: 5,         // almost horizontal to the right (toward center)
        spacing: 12,            // tight overlap between card centers
        arcAmount: 5,           // subtle downward arc bow at center
        baseRotation: 30,       // CW — card tops point upper-right, like reference
        fanAngle: 12,           // rotation spread: 24° to 36° across the fan
    },
    top: {
        spreadAngle: 0,         // horizontal
        spacing: 14,
        arcAmount: 5,
        baseRotation: 0,
        fanAngle: 14,
    },
    right: {
        spreadAngle: 175,       // almost horizontal to the left (toward center)
        spacing: 12,
        arcAmount: -5,          // negative for downward arc on right side
        baseRotation: -30,      // CCW — card tops point upper-left, like reference
        fanAngle: -12,
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

