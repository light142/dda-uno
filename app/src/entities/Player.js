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
        this.isBanker = false; // Track if this player is the banker/dealer
        this.cards = [];
        this.name = '';
        this.chips = 0;
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

    setChips(amount) {
        this.chips = amount;
    }

    setBanker(isBanker) {
        this.isBanker = isBanker;
    }

    isBankerRole() {
        return this.isBanker;
    }

    calculatePoints() {
        let total = 0;
        this.cards.forEach(card => {
            const value = parseInt(card.value);
            if (!isNaN(value)) {
                // Ace is 1, cards >= 10 (10, J, Q, K) count as 10
                total += value >= 10 ? 10 : value;
            }
        });
        return total % 10;
    }

    getCardData() {
        return this.cards.map(card => ({
            value: card.value,
            suit: card.suit
        }));
    }
}
