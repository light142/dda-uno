export const SEAT_POSITIONS = [
    { position: 'bottom', x: 250, y: 600 },
    { position: 'left', x: 100, y: 250 },
    { position: 'top', x: 640, y: 100 },
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
    BOUNCE_DURATION: 100,
    PENALTY_DEAL_DELAY: 150,
    PENALTY_SLIDE_DURATION: 200,
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

export const RESHUFFLE = {
    GATHER_DURATION: 250,
    GATHER_STAGGER: 25,
    FLY_COUNT: 5,
    FLY_DURATION: 400,
    FLY_STAGGER: 50,
    ARC_HEIGHT: 80,
    PAUSE_BEFORE_SHUFFLE: 100,
};

export const DECK_VISUAL = {
    ROTATION: 0,
    STACK_LAYERS: 20,
    MIN_LAYERS: 5,
    LAYER_OFFSET_X: 0.1,
    LAYER_OFFSET_Y: 0.7,
    CARD_POP_DURATION: 150,
    CARD_POP_LIFT: 8
};

export const AVATAR_NICKNAME_DISPLAY = {
    LOCAL_PLAYER: {
        WIDTH: 120,
        HEIGHT: 30,
        CORNER_RADIUS: 12,
        FONT_SIZE: 16,
        OFFSET_Y: 74
    },
    OTHER_PLAYERS: {
        WIDTH: 90,
        HEIGHT: 26,
        CORNER_RADIUS: 10,
        FONT_SIZE: 14,
        OFFSET_Y: 60
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
    Y: 630,
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
    Y: 440,
    DEPTH: 10,
    ALPHA: {
        ACTIVE: 1,
        DISABLED: 1,
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
    CTA: {
        ANGLE: 4,
        DURATION: 400,
        WOBBLE_SCALE: 1.03,
        WOBBLE_DURATION: 600,
    },
};

export const PLAYABLE_GLOW = {
    COLOR: 0xffcc00,
    STRENGTH: 40,
    QUALITY: 0.05,
    DISTANCE: 6,
};

export const UNPLAYABLE_GLOW = {
    COLOR: 0xffffff,
    STRENGTH: 3,
    QUALITY: 0.05,
    DISTANCE: 4,
};

export const POWER_CARD_FX = {
    REVERSE: {
        SCALE: 3.0,
        SPIN: Math.PI * 2,
        DURATION: 700,
        TINT: 0xffcc00,
    },
    BLOCK: {
        SCALE: 2.5,
        SHAKE: 12,
        DURATION: 500,
        TINT: 0xff3333,
    },
    PLUS2: {
        SCALE: 2.5,
        SPREAD: 60,
        DURATION: 600,
        TINT: 0xff8800,
    },
    WILD: {
        SCALE: 3.0,
        DURATION: 800,
        COLORS: [0xff3333, 0x3399ff, 0x33cc33, 0xffdd00],
    },
    PLUS4: {
        SCALE: 3.5,
        SPREAD: 80,
        DURATION: 700,
        COLORS: [0xff3333, 0x3399ff, 0x33cc33, 0xffdd00],
    },
};

export const COLOR_PICKER = {
    OVERLAY: {
        WIDTH: 560,
        HEIGHT: 260,
        CORNER_RADIUS: 24,
        BG_COLOR: 0x000000,
        BG_ALPHA: 0.85,
        BORDER_COLOR: 0xFFD700,
        BORDER_WIDTH: 2,
        BORDER_ALPHA: 0.5,
    },
    X: 640,
    Y: 335,
    DEPTH: 150,
    CARD_SPACING: 120,
    CARD_SCALE: 1.5,
    CARD_OFFSET_Y: 15,
    BOUNCE_IN_MS: 200,
    FADE_OUT_MS: 150,
    CARD_HOVER_SCALE: 1.12,
    CARD_HOVER_DURATION: 100,
    TITLE: {
        TEXT: 'Choose a color',
        FONT_SIZE: 20,
        COLOR: '#ECDABD',
        OFFSET_Y: -95,
    },
};

export const COLOR_REPLACE = {
    FADE_DURATION: 350,
    START_DELAY: 500,        // ms to wait before the shake + crossfade begins
    BOT_DELAY: 100,
    SHAKE: {
        INTENSITY: 3,        // max pixel offset per axis
        INTERVAL: 16,        // ms between jitter frames (~60 fps)
        RAMP_IN: 0.15,       // fraction of duration to ramp up intensity
        RAMP_OUT: 0.15,      // fraction of duration to ramp down at end
    },
};

export const MAIN_MENU = {
    LOGO: {
        X: 640,
        Y: 280,
        FLOAT: {
            DISTANCE: 0,
            DURATION: 1800,
            EASE: 'Sine.easeInOut',
        },
    },
    BUTTONS: {
        Y: 590,
        SCALE: 1,
        SPACING: 320,
        HOVER: {
            SCALE: 1.08,
            DURATION: 120,
            EASE: 'Sine.easeOut',
        },
        PRESS: {
            SCALE: 0.95,
        },
    },
    FLOATING_CARDS: {
        COUNT: 6,
        DEPTH: 1,
        ALPHA: { MIN: 0.6, MAX: 0.6 },
        MIN_DISTANCE: 130,
        DRIFT: {
            RANGE: 40,
            DURATION: { MIN: 4000, MAX: 7000 },
            EASE: 'Sine.easeInOut',
        },
        SPIN: { MIN: -8, MAX: 8 },
        ZONES: [
            { x: 30,  y: 100, w: 280, h: 440 },   // left side
            { x: 970, y: 100, w: 280, h: 440 },   // right side
            { x: 280, y: 30,  w: 100, h: 100 },   // top bar
            { x: 940, y: 30,  w: 100, h: 100 },   // right top bar
        ],
    },
    FORM: {
        OVERLAY_ALPHA: 0.4,
        ANIM: {
            MENU_OUT_DURATION: 400,
            MENU_OUT_OFFSET: 60,
            FORM_IN_DURATION: 400,
            FORM_OUT_DURATION: 250,
            MENU_IN_DURATION: 400,
            MENU_IN_OFFSET: 40,
            STAGGER: 60,
        },
    },
};

export const DRAG_DROP = {
    PLAY_ZONE: { X: 640, Y: 335, RADIUS: 150 },
    PLAY_ZONE_VISUAL: {
        DEPTH: 1,
        RING_COLOR: 0xFFD700,
        RING_ALPHA: 0.35,
        RING_WIDTH: 3,
        FILL_COLOR: 0xFFD700,
        FILL_ALPHA: 0.06,
        HOVER_RING_ALPHA: 0.8,
        HOVER_FILL_ALPHA: 0.15,
        FADE_IN: 200,
        FADE_OUT: 150,
        PULSE_MIN: 0.92,
        PULSE_MAX: 1.0,
        PULSE_DURATION: 900,
    },
    PLAY_SCATTER: {
        OFFSET: 20,
        ROTATION: 0.35,
    },
    DRAG_ALPHA: 0.85,
    DRAG_DEPTH: 100,
    SNAP_DURATION: 200,
    PLAY_DURATION: 300,
    DRAG_THRESHOLD: 10,
};

export const BOT_TURN = {
    THINK_DELAY: 100,
    BETWEEN_BOTS: 600,
    LIFT_OFFSET: 0,
    LIFT_DURATION: 150,
    LIFT_TO_FLIP_DELAY: 100,
    FLIP_TO_FLY_DELAY: 350,
};

export const EMOTE_DISPLAY = {
    LOCAL_PLAYER: {
        SCALE: 1,
        OFFSET_Y: -32
    },
    OTHER_PLAYERS: {
        SCALE: 0.9,
        OFFSET_Y: -32
    },
    FRAME_RATE: 6,
    DEPTH: 50
};

export const GAME_INTRO = {
    TAP_TEXT: {
        TEXT: 'Tap to Play',
        HINT: '',
        X: 640,
        Y: 280,
        FONT_SIZE: 42,
        FONT_FAMILY: 'Nunito, Arial',
        // Neon glow layers (back to front)
        GLOW: {
            COLOR: '#82F1ED',
            STROKE: '#82F1ED',
            STROKE_THICKNESS: 12,
            BLUR: 24,
            ALPHA: 0.25,
        },
        MAIN: {
            COLOR: '#E7FDF9',
            STROKE: '#82F1ED',
            STROKE_THICKNESS: 4,
            ALPHA: 0.92,
        },
        DEPTH: 20,
        HINT_STYLE: {
            FONT_SIZE: 13,
            COLOR: '#FFD700',
            ALPHA: 0.3,
            OFFSET_Y: 34,
        },
        FLOAT: { DISTANCE: 8, DURATION: 2200 },
        BOUNCE: { MAX: 1.07, DURATION: 1400 },
        GLOW_PULSE: { MIN: 0.15, MAX: 0.35, DURATION: 1800 },
        FADE_OUT: 180,
    },
    BOT_ENTRANCE: {
        OFFSET: 120,
        DURATION: 450,
        STAGGER: 200,
        EASE: 'Back.easeOut',
        SCALE_FROM: 0.6,
    },
    ARROW_ENTRANCE: {
        DURATION: 400,
        DELAY: 100,
    },
    BUTTON_ENTRANCE: {
        OFFSET_Y: 80,
        DURATION: 350,
        STAGGER: 120,
        EASE: 'Back.easeOut',
    },
    DEAL_DELAY: 300,
};

export const HAMBURGER_MENU = {
    X: 75,
    Y: 60,
    DEPTH: 120,
    PANEL: {
        WIDTH: 200,
        HEIGHT: 182,
        OFFSET_Y: 40,
        CORNER_RADIUS: 12,
        BG_COLOR: 0x0d0820,
        BG_ALPHA: 0.94,
        BORDER_COLOR: 0x82F1ED,
        BORDER_ALPHA: 0.25,
        BORDER_WIDTH: 1.5,
        SLIDE_DURATION: 180,
        EASE: 'Back.easeOut',
        DIVIDER: {
            COLOR: 0x82F1ED,
            ALPHA: 0.15,
            INSET: 16,
        },
    },
    ITEM: {
        FONT_SIZE: 26,
        FONT_FAMILY: 'Nunito, Arial',
        COLOR: '#E7FDF9',
        HOVER_COLOR: '#82F1ED',
        STROKE: '#000000',
        STROKE_THICKNESS: 1,
        HEIGHT: 80,
        PADDING_TOP: 11,
    },
    WIPE: {
        DURATION: 400,
        EASE: 'Power2',
    },
};

