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

    reorderCard(fromIndex, toIndex) {
        if (fromIndex === toIndex) return;
        if (fromIndex < 0 || fromIndex >= this.cards.length) return;
        if (toIndex < 0 || toIndex >= this.cards.length) return;
        const [card] = this.cards.splice(fromIndex, 1);
        this.cards.splice(toIndex, 0, card);
    }

    removeCard(card) {
        const index = this.cards.indexOf(card);
        if (index !== -1) {
            this.cards.splice(index, 1);
        }
        return index;
    }

    getCardData() {
        return this.cards.map(card => ({
            value: card.value,
            suit: card.suit
        }));
    }
}
