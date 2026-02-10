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
