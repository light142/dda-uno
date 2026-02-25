# Ada UNO — API

Deployable FastAPI service that wraps the `engine/` package to serve the UNO game over HTTP.

## Architecture

```
ada-uno/
├── engine/       ← Pure core package (game logic, agents, bots)
├── api/          ← This folder: FastAPI service
├── simulator/    ← Offline training & simulation
└── app/          ← Phaser.js frontend (connects here)
```

```
┌──────────────┐
│    app/      │  ← Phaser.js frontend
│  (browser)   │
└──────┬───────┘
       │ HTTP / JSON
       ▼
┌──────────────┐
│    api/      │  ← FastAPI (this folder)
│  (serve)     │
└──────┬───────┘
       │ imports
       ▼
┌──────────────┐
│   engine/    │
│  game_logic/ │  ← Core game logic, agents, controller, store
└──────────────┘
```

## Structure

```
api/
├── main.py                  # FastAPI app entry point, CORS, health check
├── config.py                # Pydantic Settings (env vars: DB_URL, MODEL_DIR, CORS)
├── database.py              # SQLAlchemy async engine + session factory
├── models.py                # ORM models: User, Game
├── dependencies.py          # FastAPI deps: get_current_user (JWT)
├── requirements.txt
├── .env.example
│
├── auth/                    # Authentication
│   ├── router.py            # POST /register, /login, /refresh, /logout
│   ├── schemas.py           # RegisterRequest, LoginRequest, TokenResponse, etc.
│   └── service.py           # Password hashing, JWT create/decode
│
├── game/                    # Game endpoints + engine bridge
│   ├── router.py            # POST /games, /games/{id}/play, /games/{id}/pass, GET /games/active
│   ├── schemas.py           # CardSchema, GameStateSchema, PlayRequest, PlayResponse, etc.
│   ├── service.py           # Orchestrates GameSession + BotManager + DB
│   ├── session.py           # RLCard-backed GameSession (serialize/deserialize)
│   ├── bot_manager.py       # Loads AdaptiveAgent, queries decisions, adjusts strength
│   ├── cards.py             # Card dataclass, validation helpers
│   └── rlcard_bridge.py     # Translates API Card <-> RLCard action IDs
│
├── player/                  # Player profile & history
│   ├── router.py            # GET /me, GET /me/history, DELETE /me/history
│   └── schemas.py           # PlayerStatsSchema, GameHistoryItem, etc.
│
├── models/                  # Model metadata
│   └── manifest.json        # Trained model version info
│
└── data/                    # Runtime data
    └── ada_uno.db           # SQLite database (gitignored)
```

## Endpoints

### Auth (`/api/auth`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Create account (email + password) |
| POST | `/login` | Login, returns access + refresh tokens |
| POST | `/refresh` | Refresh access token |
| POST | `/logout` | Invalidate refresh token |

### Game (`/api/games`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Start a new game |
| GET | `/active` | Check for in-progress game |
| GET | `/{gameId}` | Get current game state |
| POST | `/{gameId}/play` | Play a card (bots respond) |
| POST | `/{gameId}/pass` | Draw + pass turn (bots respond) |

### Player (`/api/users`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/me` | Player profile + stats |
| GET | `/me/history` | Paginated game history |
| DELETE | `/me/history` | Reset stats and history |

### Other

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/models/info` | Model version + training metadata |

## Tech Stack

- **FastAPI** — async HTTP framework
- **SQLAlchemy** (async) — ORM + database layer
- **Pydantic** — request/response schemas + settings
- **SQLite** (dev) → **Postgres** (production)
- **Uvicorn** — ASGI server
- **JWT** — access + refresh token auth

## Running

```bash
cd api
pip install -r requirements.txt
uvicorn main:app --reload
```

Or via Docker from the project root:

```bash
docker build -t ada-uno-api .
docker run -p 8000:8000 ada-uno-api
```

## Engine Imports

The API imports from the shared engine package (no duplication):

```python
from engine import AdaptiveAgent, WinRateController
from engine.game_logic.game import UnoGame
from engine.config.game import NUM_PLAYERS, PLAYER_SEAT
```
