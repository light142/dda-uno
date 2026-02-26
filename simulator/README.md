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
│   ├── simulation.py        # TIER_GAMES, data paths
│   ├── training.py          # NUM_EPISODES, LR, BATCH_SIZE, DQN hyperparams
│   └── tiers.py             # Tier registry, model resolution, voluntary draw policy
├── simulation/
│   └── simulate.py    # Run any tier combination
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

### Step 2: Simulate Tier Combinations

Test any combination of agents across all 4 seats:

```bash
# Specific combo: 3 selfish bots vs rule-v1
python -m simulator.simulation.simulate --s0 rule-v1 --s1 selfish --s2 selfish --s3 selfish --games 500

# Altruistic bots helping seat 0 win (target auto-set to seat 0)
python -m simulator.simulation.simulate --s0 casual --s1 altruistic --s2 altruistic --s3 altruistic

# Mix tiers: 2 selfish + 1 altruistic (no --target needed)
python -m simulator.simulation.simulate --s0 rule-v1 --s1 selfish --s2 altruistic --s3 selfish

# Mix altruistic + cooperative in the same game
python -m simulator.simulation.simulate --s0 casual --s1 altruistic --s2 cooperative --s3 selfish --target 1

# Cooperative bots helping seat 2
python -m simulator.simulation.simulate --s0 random --s1 cooperative --s2 selfish --s3 cooperative --target 2

# Run ALL 125 tier combinations (builds lookup table)
python -m simulator.simulation.simulate --s0 rule-v1 --all --games 200
```

**Agent choices** for any seat: `random`, `rule-v1`, `noob`, `casual`, `pro`, `selfish`, `adversarial`, `altruistic`, `cooperative`, `hyper_altruistic`

**Target seat (plane 11)** is resolved per-seat automatically:
- `altruistic` / `hyper_altruistic` — always target seat 0 (hardcoded, matches training)
- `cooperative` — requires `--target N` from CLI (which bot teammate to help)
- All others — no target (plane 11 all zeros)

**Voluntary draw** is automatically set per-seat to match each agent's training policy:

| Agent | Voluntary draws | Trained with |
|-------|----------------|--------------|
| selfish | 5 per game | cap 5 |
| adversarial | 5 per game | cap 5 |
| hyper_altruistic | 5 per game | cap 5 |
| altruistic | disabled | draw off |
| cooperative | disabled | draw off |
| random/rule-v1/bots | disabled | N/A |

Results are saved to `simulator/data/tier_results.json`.

### Step 3: Run Baseline (Verify Engine)

Run random agents to verify ~25% win rate per seat:
```bash
python -m simulator.simulation.simulate --s0 random --s1 random --s2 random --s3 random --games 100
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
Custom reward: +1 seat 0 wins, -1 self wins, -1 other bot wins.

### Cooperative Agent
Helps a designated bot teammate win. Target seat plane (plane 11) rotates among seats 1-3.
Used in hyper adversarial tier where support bots help the lucky bot.
Custom reward: +1 target wins, -1 self wins, -1 other wins.

### Hyper Altruistic Agent
Like altruistic but can draw (pass) even with playable cards. Learns WHEN passing helps seat 0.
Voluntary draw enabled: 'draw' is always a legal action.
Custom reward: +2 seat 0 wins, -1 self wins, -1 other wins, -0.5 per voluntary draw (cumulative).
Most impactful at seats 1 and 3 (adjacent to seat 0). Mixable with other tiers.

## Config Reference

| Setting | File | Default | Description |
|---------|------|---------|-------------|
| `TIER_GAMES` | config/simulation.py | 500 | Games per tier combination |
| `SEAT0_OPPONENT` | config/training.py | "rule-v1" | Training opponent type |
| `NUM_EPISODES` | config/training.py | 100,000 | Training episodes |
| `LEARNING_RATE` | config/training.py | 0.00005 | DQN learning rate |
| `BATCH_SIZE` | config/training.py | 32 | DQN batch size |
| `REPLAY_MEMORY_SIZE` | config/training.py | 20,000 | Experience replay buffer |
| `EVAL_EVERY` | config/training.py | 1,000 | Evaluate every N episodes |
| `SAVE_EVERY` | config/training.py | 10,000 | Checkpoint every N episodes |
