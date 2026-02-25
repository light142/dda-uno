# ADA UNO Engine — Pure Core Package

Multi-agent AI system for UNO where 3 AI bots play against 1 human player.
The bots dynamically adjust their play strength so the player's win rate
converges to a configurable target (e.g., 50%).

## Architecture

The engine is a **pure core package** — it contains only game logic, agents,
bots, and configuration. It has **no** training or simulation code.

```
ada-uno/
├── engine/        ← This package: pure core (game logic, agents, bots)
├── api/           ← FastAPI service (wraps engine for live play)
├── simulator/     ← Offline training & simulation (wraps engine)
└── app/           ← Phaser.js frontend (connects to api)
```

```
┌──────────────┐  ┌──────────────┐
│  simulator/  │  │     api/     │
│  (train/sim) │  │   (serve)    │
└──────┬───────┘  └──────┬───────┘
       │                 │
       ▼                 ▼
┌─────────────────────────────────────────────────┐
│              engine/ (this package)              │
│  game_logic/  config/  models/  data/           │
└─────────────────────────────────────────────────┘
```

### Package Structure

```
engine/
├── __init__.py               # Re-exports: UnoGame, AdaptiveAgent, WinRateController, etc.
├── controller.py             # Re-exports WinRateController for convenience
├── requirements.txt
├── README.md
├── config/
│   ├── __init__.py           # Re-exports all settings
│   ├── game.py               # NUM_PLAYERS, SEED, STATE_SHAPE, NUM_ACTIONS, etc.
│   └── controller.py         # TARGET_WIN_RATE, ADJUSTMENT_STEP, INITIAL_STRENGTH
├── game_logic/
│   ├── __init__.py           # Re-exports core classes
│   ├── game.py               # UnoGame: RLCard env wrapper (4-player UNO)
│   ├── controller.py         # WinRateController: proportional control
│   ├── store.py              # PlayerStore: SQLite player history backend
│   ├── agents/
│   │   ├── __init__.py       # Re-exports BaseAgent, RLAgent, AdaptiveAgent
│   │   ├── base.py           # BaseAgent ABC (shared interface)
│   │   ├── rl_agent.py       # RLAgent: DQN wrapper, train/save/load
│   │   └── adaptive.py       # AdaptiveAgent: blends strong + weak agents
│   └── bots/
│       ├── __init__.py       # get_bot("noob"|"casual"|"pro") factory
│       ├── noob.py           # NoobBot: random + color preference
│       ├── casual.py         # CasualBot: high-value first, save wilds
│       └── pro.py            # ProBot: tracks state, plays optimally
├── models/                   # Trained .pt weight files (gitignored)
└── data/                     # Runtime data: simulation results, SQLite DB (gitignored)
```

## Setup

```bash
cd engine
python -m venv venv
source venv/bin/activate        # Linux/Mac
# or: venv\Scripts\activate     # Windows
pip install -r requirements.txt
```

## Usage

The engine is imported by `api/` and `simulator/`:

```python
from engine import UnoGame, AdaptiveAgent, WinRateController, PlayerStore
from engine.config.game import NUM_PLAYERS, STATE_SHAPE
from engine.config.controller import TARGET_WIN_RATE
from engine.game_logic.bots import get_bot
```

## How It Works

### The Win Rate Controller

After each game, the controller adjusts bot strength:

```
error = actual_win_rate - target_win_rate
new_strength = current_strength + ADJUSTMENT_STEP * error
strength = clamp(new_strength, 0.0, 1.0)
```

- Player winning too much → increase strength → bots play harder
- Player losing too much → decrease strength → bots play softer

### The Adaptive Agent

Each bot at seats 1-3 blends a strong and weak RL agent:

```
if random() < strength:
    action = strong_agent.eval_step(state)   # play to win
else:
    action = weak_agent.eval_step(state)     # play to help seat 0
```

### Fixed Bots

Used as seat-0 stand-ins during simulation, or as fallbacks:

| Bot | Strategy |
|-----|----------|
| NoobBot | Random card selection with color preference |
| CasualBot | Plays high-value cards first, saves wilds |
| ProBot | Tracks game state, plays optimally |

## Config Reference

| Setting | File | Default | Description |
|---------|------|---------|-------------|
| `NUM_PLAYERS` | config/game.py | 4 | Players per game |
| `SEED` | config/game.py | None | Random seed |
| `STATE_SHAPE` | config/game.py | [4,4,15] | RLCard state tensor shape |
| `NUM_ACTIONS` | config/game.py | 61 | RLCard action space size |
| `TARGET_WIN_RATE` | config/controller.py | 0.50 | Target win rate |
| `ADJUSTMENT_STEP` | config/controller.py | 0.05 | Controller gain |
| `INITIAL_STRENGTH` | config/controller.py | 0.5 | Starting bot strength |

## Related Packages

- **[api/](../api/README.md)** — FastAPI service wrapping engine for live HTTP play
- **[simulator/](../simulator/)** — Offline training and simulation (produces model weights)
- **[app/](../app/)** — Phaser.js frontend connecting to the API
