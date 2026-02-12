# UNO Backend API Design

Single-player UNO (1 human + 3 bots) with server-side game logic, Google OAuth, and persistent stats.

**Base URL:** `/api`
**Auth:** All endpoints (except auth) require `Authorization: Bearer <accessToken>`

---

## Table of Contents

- [Auth Endpoints](#auth-endpoints)
- [Game State Shape](#common-game-state-shape)
- [Game Endpoints](#game-endpoints)
- [UNO Callout](#uno-callout)
- [User Endpoints](#user-profile--stats-endpoints)
- [Data Models](#data-models)
- [Error Format](#error-response-format)

---

## Auth Endpoints

### `POST /api/auth/google`

Exchange Google OAuth token for app session. Creates account on first login, returns existing user on subsequent logins.

**Request:**
```json
{
  "idToken": "google-id-token..."
}
```

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "username": "LuckyTiger42",
    "email": "user@gmail.com",
    "avatarUrl": "https://...",
    "createdAt": "2026-02-12T10:00:00Z"
  },
  "accessToken": "jwt...",
  "refreshToken": "jwt..."
}
```

### `POST /api/auth/refresh`

**Request:**
```json
{
  "refreshToken": "jwt..."
}
```

**Response (200):**
```json
{
  "accessToken": "jwt...",
  "refreshToken": "jwt..."
}
```

### `POST /api/auth/logout`

**Response (204):** No content

---

## Common Game State Shape

All game endpoints return the same `gameState` structure. This is the single source of truth the client renders from.

```json
{
  "gameId": "uuid",
  "status": "in_progress",
  "playerHands": [
    [{ "suit": "red", "value": "5" }, { "suit": "blue", "value": "plus2" }],
    4,
    3,
    6
  ],
  "topCard": { "suit": "green", "value": "7" },
  "discardPile": [
    { "suit": "blue", "value": "3" },
    { "suit": "green", "value": "7" }
  ],
  "activeColor": "green",
  "isClockwise": true,
  "deckRemaining": 72,
  "winner": null,
  "unoPenalty": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| gameId | UUID | Game session ID |
| status | `"in_progress" \| "finished"` | Game status |
| playerHands | `[Card[], int, int, int]` | Human gets full card array, bots get card count only |
| topCard | Card | Current top card on discard pile |
| discardPile | Card[] | Full discard pile (newest last) |
| activeColor | string | Active color (may differ from topCard.suit for wilds) |
| isClockwise | boolean | Play direction |
| deckRemaining | int | Cards left in draw pile |
| winner | `int \| null` | Winning playerIndex when game ends, else null |
| unoPenalty | `UnoPenalty \| null` | Penalty info if someone failed to call UNO |

### UnoPenalty Object

Included when a player is caught not calling UNO.

```json
{
  "penalizedPlayer": 0,
  "calledOutBy": 2,
  "drawnCards": [{ "suit": "red", "value": "3" }, { "suit": "blue", "value": "8" }]
}
```

> For bot penalties, `drawnCards` is an `int` (count only, cards stay hidden).

---

## Game Endpoints

### `POST /api/games`

Start a new game. No request body — server uses defaults (4 players, 7 cards each).

**Response (201):**
```json
{
  "gameState": { "..." }
}
```

---

### `POST /api/games/:gameId/play`

Human plays a card. Server validates, processes effects, runs all bot turns, then returns updated state.

**Request:**
```json
{
  "card": { "suit": "red", "value": "5" },
  "chosenColor": null,
  "calledUno": false,
  "pendingCallouts": []
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| card | Card | Yes | The card to play |
| chosenColor | string \| null | For wild/plus4 | Color choice: `"red" \| "blue" \| "green" \| "yellow"` |
| calledUno | boolean | Yes | Whether the player pressed UNO before submitting |
| pendingCallouts | int[] | No | Bot playerIndexes that were called out but the `/callout` API failed (piggybacked here for reliability) |

**Response (200):**
```json
{
  "valid": true,
  "botTurns": [
    {
      "playerIndex": 1,
      "action": "play",
      "card": { "suit": "red", "value": "block" },
      "drawnCards": 0,
      "chosenColor": null,
      "forgotUno": false
    },
    {
      "playerIndex": 2,
      "action": "draw",
      "card": null,
      "drawnCards": 1,
      "chosenColor": null,
      "forgotUno": false
    },
    {
      "playerIndex": 3,
      "action": "play",
      "card": { "suit": "red", "value": "9" },
      "drawnCards": 0,
      "chosenColor": null,
      "forgotUno": true
    }
  ],
  "gameState": { "..." }
}
```

**Error (400):**
```json
{
  "valid": false,
  "error": "Card is not playable on current top card"
}
```

---

### `POST /api/games/:gameId/pass`

Human draws a card and passes.

**Request (optional):**
```json
{
  "pendingCallouts": []
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| pendingCallouts | int[] | No | Bot playerIndexes from failed `/callout` calls (piggybacked for reliability) |

**Response (200):**
```json
{
  "drawnCard": { "suit": "yellow", "value": "2" },
  "botTurns": [],
  "gameState": { "..." }
}
```

---

### `GET /api/games/:gameId`

Get current game state (for reconnection / page refresh).

**Response (200):**
```json
{
  "gameState": { "..." }
}
```

---

## Bot Turn Object

Each entry in `botTurns` represents one bot's complete turn.

```json
{
  "playerIndex": 1,
  "action": "play",
  "card": { "suit": "red", "value": "block" },
  "drawnCards": 0,
  "chosenColor": null,
  "forgotUno": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| playerIndex | int (1-3) | Which bot |
| action | `"play" \| "draw"` | What the bot did |
| card | `Card \| null` | Card played (null if draw) |
| drawnCards | int | Number of cards drawn (0 if played) |
| chosenColor | `string \| null` | Color chosen for wild/plus4 |
| forgotUno | boolean | True if bot has 1 card left and "forgot" to call UNO (callable by human) |

---

## UNO Callout

### `POST /api/games/:gameId/callout`

Human calls out a bot for not saying UNO. Must be sent within the callout timer window.

**Request:**
```json
{
  "playerIndex": 2
}
```

**Response (200):**
```json
{
  "success": true,
  "unoPenalty": {
    "penalizedPlayer": 2,
    "calledOutBy": 0,
    "drawnCards": 2
  },
  "gameState": { "..." }
}
```

**Error (400):**
```json
{
  "success": false,
  "error": "Callout window expired"
}
```

### Callout Flow

**Human forgets UNO (bot calls out human):**
1. Human plays a card via `/play` with `calledUno: false`
2. Server checks: if human has 1 card left and didn't call UNO, a random bot may call them out
3. If called out: server adds 2 penalty cards to human's hand, returns `unoPenalty` in gameState
4. Client animates: bot calls out "UNO!", human draws 2 cards
5. If `calledUno: true`: no penalty

**Bot forgets UNO (human calls out bot):**
1. Bot plays a card leaving it with 1 card — server randomly decides if the bot "forgot"
2. That bot's entry in `botTurns` has `forgotUno: true`
3. UNO button remains always visible (no special visual hint — player must notice)
4. Client tracks which bots are callable; window is valid until the next play/draw action
5. If player presses UNO button while a callable bot exists:
   - Client immediately plays a "stamp UNO" animation on the bot + deals 2 face-down cards (optimistic)
   - Client fires `POST /games/:gameId/callout` in the background (fire-and-forget)
6. If `/callout` API fails (network timeout): the callout is queued and piggybacked on the next `/play` or `/pass` request via `pendingCallouts` field
7. If player doesn't notice: opportunity lost, game continues normally

---

## User Profile & Stats Endpoints

### `GET /api/users/me`

**Response (200):**
```json
{
  "id": "uuid",
  "username": "LuckyTiger42",
  "email": "user@gmail.com",
  "avatarUrl": "https://...",
  "stats": {
    "gamesPlayed": 42,
    "gamesWon": 18,
    "winRate": 0.4286,
    "currentStreak": 3,
    "bestStreak": 7
  },
  "createdAt": "2026-02-12T10:00:00Z"
}
```

### `GET /api/users/me/history`

**Query params:** `?page=1&limit=10`

**Response (200):**
```json
{
  "games": [
    {
      "gameId": "uuid",
      "result": "win",
      "finishedAt": "2026-02-12T10:30:00Z",
      "turns": 23
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 42
  }
}
```

---

## Data Models

### User

| Field | Type |
|-------|------|
| id | UUID (PK) |
| googleId | string (unique) |
| username | string |
| email | string (unique) |
| avatarUrl | string |
| createdAt | datetime |

### Game

| Field | Type |
|-------|------|
| id | UUID (PK) |
| userId | UUID (FK → User) |
| status | enum: `in_progress`, `finished` |
| state | JSON (serialized game state) |
| winner | int or null (playerIndex) |
| turns | int |
| createdAt | datetime |
| finishedAt | datetime or null |

### Card

```json
{
  "suit": "red" | "blue" | "green" | "yellow" | null,
  "value": "0"-"9" | "plus2" | "block" | "reverse" | "wild" | "plus4"
}
```

`suit` is `null` for wild cards (`wild`, `plus4`).

---

## Error Response Format

```json
{
  "error": "Human-readable message",
  "code": "INVALID_PLAY"
}
```

| HTTP Code | Usage |
|-----------|-------|
| 200 | Success |
| 201 | Resource created (new game) |
| 204 | No content (logout) |
| 400 | Invalid request / play |
| 401 | Unauthorized (missing/expired token) |
| 403 | Forbidden (not your game) |
| 404 | Game not found |
| 409 | Conflict (e.g. game already finished) |
| 422 | Validation error |
| 500 | Server error |

---

## Endpoint Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/google` | Google OAuth login/register |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Logout |
| POST | `/api/games` | Start new game |
| GET | `/api/games/:gameId` | Get game state |
| POST | `/api/games/:gameId/play` | Play a card |
| POST | `/api/games/:gameId/pass` | Draw & pass |
| POST | `/api/games/:gameId/callout` | Call out a bot's UNO |
| GET | `/api/users/me` | Get profile & stats |
| GET | `/api/users/me/history` | Get game history |
