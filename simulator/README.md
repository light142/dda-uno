# Ada UNO — Simulator

Offline training and simulation package that wraps the `engine/` core to train DQN agents and test adaptive difficulty convergence.

## Architecture

```
ada-uno/
├── engine/        ← Pure core package (game logic, agents, bots)
├── simulator/     ← This folder: training + simulation
├── api/           ← FastAPI service (live play)
└── app/           ← Phaser.js frontend
```

```
┌──────────────┐
│  simulator/  │  ← This package
│ (train/sim)  │
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
simulator/
├── requirements.txt
├── README.md
├── config/
│   ├── simulation.py        # NUM_GAMES, SEAT0_BOT, model/data paths
│   └── training.py          # NUM_EPISODES, LR, BATCH_SIZE, DQN hyperparams
├── simulation/
│   ├── simulate.py          # Run baseline or adaptive games
│   └── analyze.py           # Print stats, optional matplotlib plots
├── training/
│   ├── train_adversarial.py   # Adversarial: team reward, beat seat 0
│   ├── train_selfish.py       # Selfish: individual reward, each for itself
│   ├── train_altruistic.py    # Altruistic: help seat 0 (human) win
│   ├── train_cooperative.py     # Cooperative: help bot teammate win (hyper adversarial)
│   └── train_hyper_altruistic.py # Hyper Altruistic: strategic passing to help seat 0
├── models/                  # Trained .pt weight files (output)
└── data/                    # Simulation result JSONs (output)
```

## Setup

```bash
pip install -r simulator/requirements.txt
pip install -r engine/requirements.txt
```

## Usage

**All commands must be run from the project root (`ada-uno/`)** so Python can find both `simulator` and `engine`:

```bash
cd ada-uno    # project root — NOT inside simulator/
```

### Step 1: Train Agents

Train the adversarial agent (team reward — bots cooperate to beat seat 0):
```bash
python -m simulator.training.train_adversarial
```

Train the selfish agent (individual reward — each bot plays for itself):
```bash
python -m simulator.training.train_selfish
```

Train the altruistic agent (helps seat 0 / human player win):
```bash
python -m simulator.training.train_altruistic
```

Train the cooperative agent (helps bot teammates — for hyper adversarial tier):
```bash
python -m simulator.training.train_cooperative
```

Train the hyper altruistic agent (strategic passing — can draw with playable cards):
```bash
python -m simulator.training.train_hyper_altruistic
```

All training scripts support `--fresh` to ignore checkpoints and start over.

Train all 5 agents in parallel (background jobs):
```bash
python -m simulator.training.train_adversarial --fresh &
python -m simulator.training.train_selfish --fresh &
python -m simulator.training.train_altruistic --fresh &
python -m simulator.training.train_cooperative --fresh &
python -m simulator.training.train_hyper_altruistic --fresh &
```

Models are saved to `simulator/models/`.

### Step 2: Run Baseline (Verify Engine)

Run random agents to verify ~25% win rate per seat:
```bash
python -m simulator.simulation.simulate --baseline --games 100
```

### Step 3: Run Adaptive Simulation

Test the win rate controller with a fixed bot at seat 0:
```bash
python -m simulator.simulation.simulate --bot noob --games 1000
python -m simulator.simulation.simulate --bot casual --games 1000
python -m simulator.simulation.simulate --bot pro --games 1000
```

### Step 4: Analyze Results

```bash
python -m simulator.simulation.analyze
python -m simulator.simulation.analyze --plot    # requires matplotlib
```

## Training Details

### Adversarial Agent
Team reward: +1 when ANY bot wins (seat 0 loses), -1 when seat 0 wins.
Seat 0 opponent is configurable in `config/training.py`: `"random"`, `"rule-v1"`, or `"self-play"`.

### Selfish Agent
Standard individual reward: +1 when THIS bot wins, uses RLCard default payoffs.
Baseline tier — plays like a real competitive UNO player.

### Altruistic Agent
Helps seat 0 (human player) win. Target seat plane (plane 11) = seat 0.
Mixed seat 0 opponents (50% random + 50% rule-v1) for robust helping strategies.
Custom reward: +1 seat 0 wins, -1 self wins, -0.5 other bot wins.

### Cooperative Agent
Helps a designated bot teammate win. Target seat plane (plane 11) rotates among seats 1-3.
Used in hyper adversarial tier where support bots help the lucky bot.
Custom reward: +1 target wins, -1 self wins, -0.5 other wins.

### Hyper Altruistic Agent
Like altruistic but can draw (pass) even with playable cards. Learns WHEN passing helps seat 0.
Voluntary draw enabled: 'draw' is always a legal action.
Custom reward: +3 seat 0 wins, -1 self wins, -0.5 other wins, -1 per voluntary draw (cumulative).
Most impactful at seats 1 and 3 (adjacent to seat 0). Mixable with other tiers.

### Simulation Flow

```
1. Create UnoGame with RLCard env (4 players)
2. Seat 0 = fixed bot (NoobBot / CasualBot / ProBot)
3. Seats 1-3 = AdaptiveAgent (strong + weak blend)
4. Play game → determine winner
5. WinRateController adjusts bot strength based on win rate
6. Repeat for N games
7. Check if win rate converged to target
```

## Config Reference

| Setting | File | Default | Description |
|---------|------|---------|-------------|
| `NUM_GAMES` | config/simulation.py | 1,000 | Simulation games |
| `SEAT0_BOT` | config/simulation.py | "casual" | Bot type at seat 0 |
| `SEAT0_OPPONENT` | config/training.py | "rule-v1" | Training opponent type |
| `NUM_EPISODES` | config/training.py | 100,000 | Training episodes |
| `LEARNING_RATE` | config/training.py | 0.00005 | DQN learning rate |
| `BATCH_SIZE` | config/training.py | 32 | DQN batch size |
| `REPLAY_MEMORY_SIZE` | config/training.py | 20,000 | Experience replay buffer |
| `EVAL_EVERY` | config/training.py | 1,000 | Evaluate every N episodes |
| `SAVE_EVERY` | config/training.py | 10,000 | Checkpoint every N episodes |

## Engine Imports

The simulator imports from the shared engine package (no duplication):

```python
from engine.game_logic.game import UnoGame
from engine.game_logic.agents import RLAgent, AdaptiveAgent
from engine.game_logic.controller import WinRateController
from engine.game_logic.bots import get_bot
from engine.config.game import NUM_PLAYERS, STATE_SHAPE
from engine.config.controller import TARGET_WIN_RATE
```
