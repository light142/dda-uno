export const SEAT_POSITIONS = [
    { position: 'bottom', x: 250, y: 600 },
    { position: 'left', x: 100, y: 250 },
    { position: 'top', x: 640, y: 80 },
    { position: 'right', x: 1180, y: 250 },
];

export const CARD_OFFSET_TO_CENTER = {
    bottom: { x: 390, y: 0 },
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
    VERTICAL_LIFT: 15,
    MAX_HAND_WIDTH: 396
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

export const SHUFFLE = {
    // Phase 1 — Cut & Fan: split and spread each half
    SPLIT_DISTANCE: 45,
    CUT_DURATION: 160,
    CUT_LIFT: 6,
    FAN_SPREAD: 2,
    FAN_ROTATION: 0.012,
    // Phase 2 — Interleave: cards arc from each pile into center stack
    INTERLEAVE_DURATION: 90,
    INTERLEAVE_STAGGER: 25,
    INTERLEAVE_ARC: 12,
    // Phase 3 — Square up: snap back into neat stack
    SQUARE_UP_DURATION: 100,
    // General
    PASSES: 3,
    PAUSE_BETWEEN: 50,
    SPEED_RAMP: 0.15,
    // Final flourish
    BOUNCE_SCALE: 1.06,
    BOUNCE_DURATION: 120,
};

export const DECK_VISUAL = {
    ROTATION: 0,
    STACK_LAYERS: 20,
    LAYER_OFFSET_X: 0.1,
    LAYER_OFFSET_Y: 0.7,
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
        maxHandWidth: 222,      // (7-1) * 37 — keep same width as 7 cards
    },
    top: {
        spreadAngle: 0,         // almost horizontal to the right (toward center)
        spacing: 37,            // tight overlap between card centers
        arcAmount: 0,           // subtle downward arc bow at center
        baseRotation: 0,       // CW — card tops point upper-right, like reference
        fanAngle: 0,           // rotation spread: 24° to 36° across the fan
        maxHandWidth: 222,      // (7-1) * 37 — keep same width as 7 cards
    },
    right: {
        spreadAngle: 0,         // almost horizontal to the right (toward center)
        spacing: 37,            // tight overlap between card centers
        arcAmount: 0,           // subtle downward arc bow at center
        baseRotation: 0,       // CW — card tops point upper-right, like reference
        fanAngle: 0,           // rotation spread: 24° to 36° across the fan
        maxHandWidth: 222,      // (7-1) * 37 — keep same width as 7 cards
    }
};

export const DIRECTION_ARROW = {
    X: 640,
    Y: 335,
    DEPTH: 2,
    ALPHA: 1,
    IDLE_SPIN: {
        DURATION: 20000,
    },
    PULSE: {
        MIN_SCALE: 0.95,
        MAX_SCALE: 1.05,
        DURATION: 800,
    },
    TRANSITION: {
        SHRINK_DURATION: 1000,
        GROW_DURATION: 1500,
        SPIN_ANGLE: 3600,
        EASE_IN: 'Cubic.easeIn',
        EASE_OUT: 'Cubic.easeOut',
    },
};

export const PASS_BUTTON = {
    X: 1080,
    Y: 640,
    DEPTH: 10,
    PRESS: {
        DURATION: 20,
        EASE: 'Cubic.easeOut',
    },
    POP_BACK: {
        DURATION: 120,
        EASE: 'Back.easeOut',
    },
    HOVER: {
        SCALE: 1,
        DURATION: 150,
        EASE: 'Sine.easeOut',
    },
    RAISE: 4,
    SHADOW_ALPHA: 0.8,
    HIT_PADDING: 15,
};

export const UNO_BUTTON = {
    X: 930,
    Y: 455,
    DEPTH: 10,
    ALPHA: {
        ACTIVE: 1,
        DISABLED: 0.4,
    },
    PRESS: {
        DURATION: 20,
        EASE: 'Cubic.easeOut',
    },
    POP_BACK: {
        DURATION: 120,
        EASE: 'Back.easeOut',
    },
    HOVER: {
        SCALE: 1,
        DURATION: 150,
        EASE: 'Sine.easeOut',
    },
    RAISE: 4,
    SHADOW_ALPHA: 0.8,
    HIT_PADDING: 15,
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

