# ADA UNO (Adaptive Difficulty Adjustment) — AI Bot System with Win Rate Control

Multi-agent AI system for UNO where 3 AI bots play against 1 human player.
The bots dynamically adjust their play strength so the player's win rate
converges to a configurable target (e.g., 50%).

## Architecture

```
config/        ← SETTINGS: centralized configurables for all layers
game_logic/    ← CORE layer: shared by everything
simulation/    ← TEST layer: uses game_logic + config (fixed bots, analysis)
training/      ← TRAIN layer: uses game_logic + config (produces model weights)
models/        ← BRIDGE: training writes .pt files, simulation + api read
data/          ← STORAGE: SQLite DB, simulation logs
```

The FastAPI layer lives in `../api/` and imports from this package.

### Layered Design

```
┌──────────────┐  ┌──────────────┐
│  simulation/ │  │  training/   │
│  (test)      │  │  (train)     │
└──────┬───────┘  └──────┬───────┘
       │                 │
       ▼                 ▼
┌─────────────────────────────────────────────────┐
│              game_logic/ (core)                  │
│  agents/  game.py  controller.py  store.py      │
└─────────────────────────────────────────────────┘
```

Rule: if both simulation and API need it → `game_logic/`. Otherwise → own layer.

### Project Structure

```
engine/
├── requirements.txt
├── README.md
├── config/
│   ├── __init__.py            # Re-exports all settings
│   ├── game.py                # NUM_PLAYERS, SEED, STATE_SHAPE, etc.
│   ├── training.py            # SEAT0_OPPONENT, NUM_EPISODES, LR, etc.
│   ├── simulation.py          # NUM_GAMES, SEAT0_BOT, model paths
│   └── controller.py          # TARGET_WIN_RATE, ADJUSTMENT_STEP, etc.
├── game_logic/
│   ├── __init__.py
│   ├── game.py                # UnoGame: RLCard env wrapper
│   ├── controller.py          # WinRateController: proportional control
│   ├── store.py               # PlayerStore: SQLite (swap to Postgres later)
│   └── agents/
│       ├── __init__.py
│       ├── base.py            # BaseAgent ABC (shared interface)
│       ├── rl_agent.py        # RLAgent: DQN wrapper, train/save/load
│       └── adaptive.py        # AdaptiveAgent: blends strong + weak
├── training/
│   ├── __init__.py
│   ├── train_strong.py        # Train agent to WIN (reward: +1 on win)
│   └── train_weak.py          # Train agent to HELP seat 0 (custom reward)
├── simulation/
│   ├── __init__.py
│   ├── bots/
│   │   ├── __init__.py        # get_bot("noob"|"casual"|"pro") factory
│   │   ├── noob.py            # NoobBot: random + color preference
│   │   ├── casual.py          # CasualBot: high-value first, save wilds
│   │   └── pro.py             # ProBot: tracks state, plays optimally
│   ├── simulate.py            # Run N games, test controller convergence
│   └── analyze.py             # Print stats, optional plots
├── models/                    # Trained .pt weight files
└── data/                      # SQLite DB, simulation result JSONs
```

## Setup

```bash
cd engine
python -m venv venv
source venv/bin/activate        # Linux/Mac
# or: venv\Scripts\activate     # Windows
pip install -r requirements.txt
```

## How to Use

### Step 1: Verify Game Engine (Baseline)

Run random agents to verify ~25% win rate per seat:

```bash
python -m simulation.simulate --baseline --games 100
```

### Step 2: Train Agents

Train the strong agent (learns to win):
```bash
python -m training.train_strong
```

Train the weak agent (learns to help seat 0 win):
```bash
python -m training.train_weak
```

Models saved to `models/strong/strong_agent.pt` and `models/weak/weak_agent.pt`.

### Step 3: Run Adaptive Simulation

Test the win rate controller with a fixed bot at seat 0:

```bash
python -m simulation.simulate --bot noob --games 1000
python -m simulation.simulate --bot casual --games 1000
python -m simulation.simulate --bot pro --games 1000
```

### Step 4: Analyze Results

```bash
python -m simulation.analyze
python -m simulation.analyze --plot    # requires matplotlib
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

### Game Flow (Simulation)

```
1. Create UnoGame with RLCard env (4 players)
2. Seat 0 = fixed bot (NoobBot/CasualBot/ProBot)
3. Seats 1-3 = AdaptiveAgent (strong + weak blend)
4. Play game → determine winner
5. Controller adjusts bot strength based on win rate
6. Repeat for N games
7. Check if win rate converged to target
```

### Training

- **Strong agent**: Standard DQN training. Reward = +1 when agent wins.
  Seat 0 uses RLCard's rule-based agent (configurable in config/training.py).
- **Weak agent**: Custom reward. +1 when seat 0 wins, -1 when agent
  itself wins, -0.5 otherwise.

Training opponent at seat 0 is configurable: `"random"`, `"rule-v1"`, `"self-play"`.

## Config Reference

| Setting | File | Default | Description |
|---------|------|---------|-------------|
| `NUM_PLAYERS` | config/game.py | 4 | Players per game |
| `SEED` | config/game.py | None | Random seed |
| `SEAT0_OPPONENT` | config/training.py | "rule-v1" | Training opponent type |
| `NUM_EPISODES` | config/training.py | 100,000 | Training episodes |
| `LEARNING_RATE` | config/training.py | 0.00005 | DQN learning rate |
| `NUM_GAMES` | config/simulation.py | 1,000 | Simulation games |
| `SEAT0_BOT` | config/simulation.py | "casual" | Simulation bot type |
| `TARGET_WIN_RATE` | config/controller.py | 0.50 | Target win rate |
| `ADJUSTMENT_STEP` | config/controller.py | 0.05 | Controller gain |
| `INITIAL_STRENGTH` | config/controller.py | 0.5 | Starting bot strength |

## API Layer

The FastAPI API layer lives in `../api/` and imports from this package.
See [api/README.md](../api/README.md) for details.
