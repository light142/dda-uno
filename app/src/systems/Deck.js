import { COLORS, COLOR_CARD_VALUES, WILD_CARDS } from '../config/constants.js';

/**
 * Deck system - manages a UNO deck of cards
 */
export class Deck {
    constructor() {
        this.cards = [];
    }

    create() {
        this.cards = [];

        COLORS.forEach(color => {
            // One 0 card per color
            this.cards.push({ suit: color, value: '0' });
            // Two of each 1-9 and action cards per color
            COLOR_CARD_VALUES.forEach(value => {
                if (value === '0') return;
                this.cards.push({ suit: color, value });
                this.cards.push({ suit: color, value });
                // this.cards.push({ suit: color, value });
            });
        });

        // 4 wild cards and 4 wild draw-four cards
        for (let i = 0; i < 4; i++) {
            WILD_CARDS.forEach(card => {
                this.cards.push({ suit: null, value: card });
            });
        }

        return this.cards;
    }

    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    draw(count = 1) {
        const drawn = [];
        for (let i = 0; i < count && this.cards.length > 0; i++) {
            drawn.push(this.cards.pop());
        }
        return count === 1 ? drawn[0] : drawn;
    }

    remaining() {
        return this.cards.length;
    }

    reset() {
        this.create();
        this.shuffle();
    }
}
