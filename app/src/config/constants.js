export const COLORS = ['blue', 'green', 'red', 'yellow'];
export const NUMBER_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
export const ACTION_VALUES = ['plus2', 'block', 'reverse'];
export const WILD_CARDS = ['wild', 'plus4'];

// All values that belong to a color suit
export const COLOR_CARD_VALUES = [...NUMBER_VALUES, ...ACTION_VALUES];

// Mapping from color name to file-name initial
export const COLOR_INITIALS = { blue: 'b', green: 'g', red: 'r', yellow: 'y' };

// Mapping from action value to file-name code
export const ACTION_FILE_CODES = { plus2: 'p2', block: 'b', reverse: 'r' };

// Mapping from wild card value to file-name code
export const WILD_FILE_CODES = { wild: 'w', plus4: 'p4' };

// Legacy alias
export const SUITS = COLORS;

// Card effect mapping for game logic
export const CARD_EFFECTS = {
    'reverse': { type: 'reverse', drawCount: 0 },
    'block':   { type: 'skip',    drawCount: 0 },
    'plus2':   { type: 'draw2',   drawCount: 2 },
    'plus4':   { type: 'draw4',   drawCount: 4 },
};

// Color sort order for hand sorting
export const COLOR_ORDER = { 'red': 0, 'yellow': 1, 'green': 2, 'blue': 3 };

// Value sort order (numbers first, then actions, then wilds)
export const VALUE_ORDER = {
    '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    'plus2': 10, 'block': 11, 'reverse': 12, 'wild': 13, 'plus4': 14
};
