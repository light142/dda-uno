# Ada UNO — API

Deployable FastAPI service that wraps the `engine/` package to serve the UNO game over HTTP.

## Architecture

```
ada-uno/
├── engine/       ← Game engine (game_logic, training, simulation, models)
├── api/          ← This folder: deployable FastAPI service
└── app/          ← Phaser.js frontend
```

```
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

## Planned Endpoints

```
POST /game/start        → Start a new game, returns initial hand + game state
POST /game/play-card    → Play a card, bots respond, returns new state
POST /game/draw         → Draw a card from the deck
GET  /player/{id}/stats → Get player win rate history and stats
```

## Key Engine Methods (already built)

- `UnoGame.start_game()` — returns initial hand and game state
- `UnoGame.player_step(action)` — applies player move, runs all bot turns, returns new state
- `WinRateController.adjust()` — called after each game to tune bot strength
- `PlayerStore.record_game()` — persists game result + updated strength
- `PlayerStore` uses repository pattern — swap SQLite to Postgres by implementing `BasePlayerStore`

## Tech Stack

- **FastAPI** — async HTTP framework
- **Pydantic** — request/response schemas
- **SQLite** (dev) → **Postgres** (production)
- **Uvicorn** — ASGI server

## Planned Structure

```
api/
├── README.md
├── requirements.txt
├── Dockerfile
├── main.py              # FastAPI app entry point
├── routes/
│   ├── game.py          # /game/* endpoints
│   └── player.py        # /player/* endpoints
└── schemas/
    ├── game.py          # GameState, PlayCardRequest, etc.
    └── player.py        # PlayerStats, etc.
```
