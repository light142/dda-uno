/**
 * Player entity - represents a player at the table
 */
export class Player {
    constructor(id, position, x, y, isLocal = false) {
        this.id = id;
        this.position = position; // 'bottom', 'top', 'left', 'right'
        this.x = x;
        this.y = y;
        this.isLocal = isLocal;
        this.cards = [];
        this.name = '';
    }

    addCard(card) {
        this.cards.push(card);
    }

    clearCards() {
        this.cards.forEach(card => card.destroy());
        this.cards = [];
    }

    getCards() {
        return this.cards;
    }

    setName(name) {
        this.name = name;
    }

    getCardData() {
        return this.cards.map(card => ({
            value: card.value,
            suit: card.suit
        }));
    }
}
