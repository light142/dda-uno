# UNO Backend API Design

Single-player UNO (1 human + 3 bots) with server-side game logic, email/password auth, and persistent stats.

**Base URL:** `/api`
**Auth:** All endpoints (except auth) require `Authorization: Bearer <accessToken>`

---

## Table of Contents

- [Auth Endpoints](#auth-endpoints)
- [Game State Shape](#common-game-state-shape)
- [Game Endpoints](#game-endpoints)
- [User Endpoints](#user-profile--stats-endpoints)
- [Data Models](#data-models)
- [Error Format](#error-response-format)

---

## Auth Endpoints

### `POST /api/auth/register`

Create a new account with email, password, and username. Returns tokens and user profile.

**Request:**
```json
{
  "email": "player@example.com",
  "password": "secret123",
  "username": "PlayerOne"
}
```

**Response (201):**
```json
{
  "tokens": {
    "access_token": "jwt...",
    "refresh_token": "jwt...",
    "token_type": "bearer"
  },
  "user": {
    "id": "uuid",
    "email": "player@example.com",
    "username": "PlayerOne",
    "games_played": 0,
    "wins": 0,
    "win_rate": 0.0,
    "bot_strength": 0.5,
    "created_at": "2026-02-12T10:00:00Z"
  }
}
```

### `POST /api/auth/login`

Authenticate with email and password.

**Request:**
```json
{
  "email": "player@example.com",
  "password": "secret123"
}
```

**Response (200):** Same shape as register response.

### `POST /api/auth/refresh`

**Request:**
```json
{
  "refresh_token": "jwt..."
}
```

**Response (200):**
```json
{
  "access_token": "jwt...",
  "refresh_token": "jwt...",
  "token_type": "bearer"
}
```

### `POST /api/auth/logout`

Stateless logout — client should discard its tokens.

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
  "currentPlayer": 0,
  "winner": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| gameId | UUID | Game session ID |
| status | `"in_progress" \| "finished" \| "abandoned"` | Game status |
| playerHands | `[Card[], int, int, int]` | Human gets full card array, bots get card count only |
| topCard | Card \| null | Current top card on discard pile |
| discardPile | Card[] | Full discard pile (newest last) |
| activeColor | string \| null | Active color (may differ from topCard.suit for wilds) |
| isClockwise | boolean | Play direction |
| deckRemaining | int | Cards left in draw pile |
| currentPlayer | int | Seat index of the current player (0-3) |
| winner | `int \| null` | Winning seat index when game ends, else null |

---

## Game Endpoints

### `POST /api/games`

Start a new game. No request body — server uses defaults (4 players, 7 cards each). The server selects a bot tier based on the player's win rate and bot mode setting.

**Response (201):**
```json
{
  "gameState": { "..." },
  "botTier": "selfish",
  "modelInfo": { "version": "1.0.0", "trainedAt": "2026-02-24T10:00:00Z" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| gameState | GameState | Initial game state |
| botTier | string | Agent tier used for all 3 bots in this game |
| modelInfo | object | Model version and training metadata |

---

### `GET /api/games/active`

Check for an in-progress game (for reconnection after page reload).

**Response (200):**
```json
{
  "hasActiveGame": true,
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

### `POST /api/games/:gameId/play`

Human plays a card. Server validates, processes effects, runs all bot turns, then returns updated state.

**Request:**
```json
{
  "card": { "suit": "red", "value": "5" },
  "chosenColor": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| card | Card | Yes | The card to play |
| chosenColor | string \| null | For wild/plus4 | Color choice: `"red" \| "blue" \| "green" \| "yellow"` |

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
      "chosenColor": null
    },
    {
      "playerIndex": 2,
      "action": "draw",
      "card": null,
      "drawnCards": 1,
      "chosenColor": null
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

Human draws a card and passes. If the drawn card matches, RLCard may auto-play it.

**Response (200):**
```json
{
  "drawnCard": { "suit": "yellow", "value": "2" },
  "autoPlayed": false,
  "chosenColor": null,
  "botTurns": [],
  "gameState": { "..." }
}
```

| Field | Type | Description |
|-------|------|-------------|
| drawnCard | Card \| null | The card drawn from the deck |
| autoPlayed | boolean | Whether the drawn card was auto-played (RLCard draw quirk) |
| chosenColor | string \| null | Color chosen if an auto-played wild |
| botTurns | BotTurn[] | Bot turns that follow |
| gameState | GameState | Updated game state |

---

## Bot Turn Object

Each entry in `botTurns` represents one bot's complete turn.

```json
{
  "playerIndex": 1,
  "action": "play",
  "card": { "suit": "red", "value": "block" },
  "drawnCards": 0,
  "chosenColor": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| playerIndex | int (0-3) | Which player (0 for human penalty draws) |
| action | `"play" \| "draw"` | What the bot did |
| card | `Card \| null` | Card played (null if draw) |
| drawnCards | `int \| Card[]` | Count for bots, card array for human penalty draws |
| chosenColor | `string \| null` | Color chosen for wild/plus4 |

---

## Debug Endpoints (Testing Only)

### `PUT /api/games/debug/cards`

Set fixed cards for testing (starter card, active color, player hands).

### `GET /api/games/debug/cards`

Retrieve current debug card configuration.

### `DELETE /api/games/debug/cards`

Clear debug card overrides.

---

## Other Endpoints

### `GET /api/models/info`

Get model version and training metadata from `models/manifest.json`.

**Response (200):**
```json
{
  "version": "1.0.0",
  "trainedAt": "2026-02-24T10:00:00Z"
}
```

### `GET /health`

Health check endpoint.

---

## User Profile & Stats Endpoints

### `GET /api/users/me`

**Response (200):**
```json
{
  "id": "uuid",
  "username": "PlayerOne",
  "email": "player@example.com",
  "stats": {
    "gamesPlayed": 42,
    "gamesWon": 18,
    "winRate": 0.4286,
    "currentBotStrength": 0.63,
    "targetWinRate": 0.25,
    "botMode": "adaptive"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| botMode | string | Current bot difficulty mode: `"adaptive"` or a tier name |

### `GET /api/users/me/history`

**Query params:** `?page=1&limit=10`

**Response (200):**
```json
{
  "games": [
    {
      "gameId": "uuid",
      "status": "finished",
      "result": "win",
      "botTier": "selfish",
      "botStrengthStart": null,
      "botStrengthEnd": null,
      "playerWinRate": 0.52,
      "turns": 23,
      "modelVersion": "1.0.0",
      "finishedAt": "2026-02-24T10:30:00",
      "createdAt": "2026-02-24T10:25:00"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 42
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| botTier | string or null | Agent tier used for this game |
| botStrengthStart | float or null | Legacy bot strength (deprecated) |
| botStrengthEnd | float or null | Legacy bot strength (deprecated) |

### `PUT /api/users/me/bot-mode`

Set the bot difficulty mode for future games.

**Request:**
```json
{
  "mode": "adaptive"
}
```

| Field | Type | Description |
|-------|------|-------------|
| mode | string | `"adaptive"` for automatic tier selection, or a tier name to fix all bots to that tier |

Valid modes: `adaptive`, `hyper_adversarial`, `adversarial`, `selfish`, `random`, `altruistic`, `hyper_altruistic`

**Response (200):**
```json
{
  "botMode": "adaptive"
}
```

**Error (400):** Invalid mode name.

### `DELETE /api/users/me/history`

Reset all game stats, history, and bot mode for the current user.

**Response (204):** No content

---

## Data Models

### User

| Field | Type |
|-------|------|
| id | CHAR(36) (PK, UUID) |
| email | string (unique) |
| username | string |
| password_hash | string |
| games_played | int (default 0) |
| wins | int (default 0) |
| bot_strength | float (default 0.5) |
| target_win_rate | float (default 0.25) |
| bot_mode | string (default "adaptive") |
| created_at | datetime |

`bot_mode`: `"adaptive"` uses the AdaptiveTierController to pick a tier per-game based on win rate. Any tier name (e.g. `"selfish"`, `"altruistic"`) forces all bots to that tier.

### Game

| Field | Type |
|-------|------|
| id | CHAR(36) (PK, UUID) |
| user_id | CHAR(36) (FK -> User) |
| status | string: `in_progress`, `finished`, `abandoned` |
| state_json | text (serialized game state) |
| winner | int or null (seat index 0-3) |
| turns | int |
| bot_tier | string or null |
| bot_strength_start | float or null (legacy) |
| bot_strength_end | float or null (legacy) |
| player_win_rate_at_game | float or null |
| model_version | string or null |
| created_at | datetime |
| finished_at | datetime or null |

`bot_tier`: the agent tier used for all 3 bot seats during this game (e.g. `"selfish"`, `"altruistic"`).

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
  "detail": "Human-readable message"
}
```

| HTTP Code | Usage |
|-----------|-------|
| 200 | Success |
| 201 | Resource created (register, new game) |
| 204 | No content (logout) |
| 400 | Invalid request / play |
| 401 | Unauthorized (missing/expired token) |
| 404 | Game not found |
| 409 | Conflict (duplicate email) |
| 422 | Validation error (Pydantic) |
| 500 | Server error |

---

## Endpoint Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register with email + password |
| POST | `/api/auth/login` | Login with email + password |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Logout (stateless) |
| POST | `/api/games` | Start new game |
| GET | `/api/games/active` | Check for in-progress game |
| GET | `/api/games/:gameId` | Get game state |
| POST | `/api/games/:gameId/play` | Play a card |
| POST | `/api/games/:gameId/pass` | Draw & pass |
| PUT | `/api/games/debug/cards` | Set debug cards (testing) |
| GET | `/api/games/debug/cards` | Get debug card config |
| DELETE | `/api/games/debug/cards` | Clear debug cards |
| GET | `/api/users/me` | Get profile & stats |
| GET | `/api/users/me/history` | Get game history |
| PUT | `/api/users/me/bot-mode` | Set bot difficulty mode |
| DELETE | `/api/users/me/history` | Reset stats, history & bot mode |
| GET | `/api/models/info` | Model version info |
| GET | `/health` | Health check |
