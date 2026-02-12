const dim = (width, [rw, rh]) => ({ WIDTH: width, HEIGHT: width * (rh / rw) });

export const ASSET_DIMENSIONS = {
    BACKGROUND: { WIDTH: 1280, HEIGHT: 720 },
    CARD: dim(65, [100, 156]),
    CARD_PLAYER: dim(120, [100, 156]),
    CARD_DECK: dim(70, [100, 156]),
    FRAME: dim(83, [1, 1]),
    FRAME_LOCAL: dim(101, [1, 1]),
    AVATAR: dim(74, [1, 1]),
    AVATAR_LOCAL: dim(88, [1, 1]),
    ARROW: dim(280, [1, 1]),
    PASS_BUTTON: dim(220, [400, 140]),
    UNO_BUTTON: dim(160, [400, 210]),
};
