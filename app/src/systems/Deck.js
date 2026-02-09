import { SUITS } from '../config/constants.js';

/**
 * Deck system - manages a deck of cards
 */
export class Deck {
    constructor() {
        this.cards = [];
    }

    create() {
        this.cards = [];
        
        SUITS.forEach(suit => {
            for (let value = 1; value <= 13; value++) {
                this.cards.push({ suit, value });
            }
        });
        
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
