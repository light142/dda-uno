export const SEAT_POSITIONS = [
    { position: 'bottom', x: 360, y: 1170 },
    { position: 'left_bottom', x: 80, y: 880 },
    { position: 'left_center', x: 80, y: 620 },
    { position: 'left_top', x: 80, y: 370 },
    { position: 'top', x: 360, y: 120 },
    { position: 'right_top', x: 640, y: 370 },
    { position: 'right_center', x: 640, y: 620 },
    { position: 'right_bottom', x: 640, y: 880 }
];

export const CARD_OFFSET_TO_CENTER = {
    bottom: { x: 0, y: -158 },
    left_bottom: { x: 120, y: 0 },
    left_center: { x: 120, y: 0 },
    left_top: { x: 120, y: 0 },
    top: { x: 0, y: 130 },
    right_top: { x: -120, y: 0 },
    right_center: { x: -120, y: 0 },
    right_bottom: { x: -120, y: 0 },
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

export const POINTS_DISPLAY = {
    LOCAL_PLAYER: {
        DIGIT_SIZE: '72px',
        LABEL_SIZE: '48px',
        LABEL_OFFSET_X: 20,
        LABEL_OFFSET_Y: 0,
        OFFSET_X: -65,
        OFFSET_Y: 0,
        ZERO_OFFSET_X: 66,
        DIGIT_EXTRUSION_OFFSET: 4,
        DIGIT_EXTRUSION_OFFSET_X: 4,
        LABEL_EXTRUSION_OFFSET: 3,
        LABEL_EXTRUSION_OFFSET_X: 1,
        DIGIT_STROKE_THICKNESS: 2,
        LABEL_STROKE_THICKNESS: 2,
        DIGIT_EXTRUSION_THICKNESS: 6,
        LABEL_EXTRUSION_THICKNESS: 6
    },
    OTHER_PLAYERS: {
        DIGIT_SIZE: '48px',
        LABEL_SIZE: '28px',
        LABEL_OFFSET_X: 8,
        LABEL_OFFSET_Y: 0,
        OFFSET_X: -40,
        OFFSET_Y: 0,
        ZERO_OFFSET_X: 33,
        DIGIT_EXTRUSION_OFFSET: 2,
        DIGIT_EXTRUSION_OFFSET_X: 2,
        LABEL_EXTRUSION_OFFSET: 3,
        LABEL_EXTRUSION_OFFSET_X: 1,
        DIGIT_STROKE_THICKNESS: 1,
        LABEL_STROKE_THICKNESS: 1,
        DIGIT_EXTRUSION_THICKNESS: 5,
        LABEL_EXTRUSION_THICKNESS: 4
    },
    HIGH_POINTS: {
        DIGIT_GRADIENT: ['#FDFF94', '#F0A442'],
        DIGIT_STROKE: '#7A5A1A',                              
        EXTRUSION_COLOR: '#3D2B0A',
        LABEL_GRADIENT: ['#FDFF94', '#F0A442'],
        LABEL_STROKE: '#7A5A1A'
    },
    LOW_POINTS: {
        DIGIT_GRADIENT: ['#D8D8D8', '#8A8A8A'],
        DIGIT_STROKE: '#1A1A1A',
        EXTRUSION_COLOR: '#1A1A1A',
        LABEL_GRADIENT: ['#D8D8D8', '#8A8A8A'],
        LABEL_STROKE: '#1A1A1A'
    },
    NORMAL_POINTS: {
        DIGIT_GRADIENT: ['#FDFF94', '#F0A442'],
        DIGIT_STROKE: '#7A5A1A',                              
        EXTRUSION_COLOR: '#3D2B0A',
        LABEL_GRADIENT: ['#FDFF94', '#F0A442'],
        LABEL_STROKE: '#7A5A1A'
    },
    ANIMATION_DURATION: 300,
    PULSE_DURATION: 600
};

export const AVATAR_CHIPS_DISPLAY = {
    LOCAL_PLAYER: {
        FONT_SIZE: 18,
        COIN_SIZE: 14,
        BG_HEIGHT: 22,
        COIN_PADDING_LEFT: 12,
        TEXT_PADDING_RIGHT: 8,
        NO_SUFFIX_EXTRA_PADDING: 26
    },
    OTHER_PLAYERS: {
        FONT_SIZE: 14,
        COIN_SIZE: 12,
        BG_HEIGHT: 18,
        COIN_PADDING_LEFT: 8,
        TEXT_PADDING_RIGHT: 6,
        NO_SUFFIX_EXTRA_PADDING: 18
    },
    COLORS: {
        BG: 0x000000,
        BG_ALPHA: 0.5,
        TEXT: '#FFD700',
        TEXT_STROKE: '#000000',
        TEXT_STROKE_THICKNESS: 1,
        COIN_SHADOW: 0x000000,
        COIN_OUTER: 0xFFD700,
        COIN_INNER: 0xDAA520,
        COIN_SHINE: 0xFFFFFF,
        COIN_CENTER: 0xB8860B
    },
    BG_CORNER_RADIUS: 10
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
        WIDTH: 90,
        HEIGHT: 24,
        CORNER_RADIUS: 10,
        FONT_SIZE: 14,
        OFFSET_Y: 70
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

export const EMOTE_DISPLAY = {
    LOCAL_PLAYER: {
        SCALE: 1,
        OFFSET_Y: -35
    },
    OTHER_PLAYERS: {
        SCALE: 0.8,
        OFFSET_Y: -33
    },
    FRAME_RATE: 6,
    DEPTH: 50  // Above cards (2), below points (100) and results (150)
};

export const GAME_RESULT = {
    OFFSET_Y: -20,
    LOCAL_PLAYER: {
        RESULT_SIZE: '64px',
        GLOW_SIZE: 100,
        RESULT_STROKE_THICKNESS: 8,
        RISE_DISTANCE: 80,
        ARC_RADIUS: 120,
        ARC_SPAN: 0.8
    },
    OTHER_PLAYERS: {
        RESULT_SIZE: '42px',
        GLOW_SIZE: 70,
        RESULT_STROKE_THICKNESS: 6,
        RISE_DISTANCE: 60,
        ARC_RADIUS: 80,
        ARC_SPAN: 0.8
    },
    WIN: {
        RESULT_COLOR_TOP: '#FFFFFF',     // Bright white metallic shine
        RESULT_COLOR_MID: '#FFD700',      // Pure gold (Shwedagon Pagoda)
        RESULT_COLOR_BOTTOM: '#CC8800',   // Deep gold
        RESULT_STROKE: '#8B4513',         // Saddle brown stroke
        POINTS_COLOR: '#FFFACD',
        POINTS_STROKE: '#996515',
        GLOW_COLOR: 0xFFD700              // Golden glow
    },
    LOSE: {
        RESULT_COLOR_TOP: '#FFB3BA',     // Soft pink shine
        RESULT_COLOR_MID: '#C41E3A',      // Ruby red (monk robe)
        RESULT_COLOR_BOTTOM: '#8B1538',   // Deep ruby
        RESULT_STROKE: '#5C0F29',         // Dark burgundy stroke
        POINTS_COLOR: '#FFD6DD',
        POINTS_STROKE: '#8B1538',
        GLOW_COLOR: 0xC41E3A              // Ruby red glow
    },
    TIE: {
        RESULT_COLOR_TOP: '#B4E5D4',     // Light jade/mint shine
        RESULT_COLOR_MID: '#2E8B57',      // Sea green (jade stone)
        RESULT_COLOR_BOTTOM: '#1B5E3C',   // Deep forest green
        RESULT_STROKE: '#0F3D26',         // Dark green stroke
        POINTS_COLOR: '#D4F1E8',
        POINTS_STROKE: '#1B5E3C',
        GLOW_COLOR: 0x2E8B57              // Jade green glow
    },
    ENTRANCE_DURATION: 600
};
