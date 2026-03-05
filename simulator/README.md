# DDA UNO — Simulator

Offline training and simulation package that wraps the `engine/` core to train DQN agents and test adaptive difficulty convergence.

## Architecture

```
dda-uno/
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
│   ├── training.py          # NUM_EPISODES, LR, opponent pools, DQN hyperparams
│   └── tiers.py             # Re-export shim (delegates to engine/game_logic/tiers/)
├── simulation/
│   ├── simulate.py          # Run any tier combination
│   └── game_stats.py        # Rich per-game stats collector + plots
├── training/
│   ├── opponents.py           # Shared opponent pool + selfish checkpoint loading
│   ├── metrics.py             # TrainingLogger (CSV + matplotlib plots)
│   ├── train_selfish.py       # Selfish: individual reward, random seat assignment
│   ├── train_adversarial.py   # Adversarial: team reward, beat seat 0
│   ├── train_altruistic.py    # Altruistic: help seat 0 (human) win
│   ├── train_hyper_altruistic.py # Hyper Altruistic: strategic passing to help seat 0
│   └── train_hyper_adversarial.py # Hyper Adversarial: joint training (selfish star + cooperative support)
├── models/                  # Trained .pt weight files (output)
│   ├── selfish/               # selfish_agent.pt + checkpoints + metrics
│   ├── adversarial/           # adversarial_agent.pt + checkpoints + metrics
│   ├── altruistic/            # altruistic_agent.pt + checkpoints + metrics
│   ├── hyper_altruistic/      # hyper_altruistic_agent.pt + checkpoints + metrics
│   └── hyper_adversarial/     # hyper_adversarial_agent.pt + checkpoints + metrics
└── data/                    # Simulation result JSONs (output)
```

## Setup

```bash
pip install -r simulator/requirements.txt
pip install -r engine/requirements.txt
```

## Usage

**All commands must be run from the project root (`dda-uno/`)** so Python can find both `simulator` and `engine`:

```bash
cd dda-uno    # project root — NOT inside simulator/
```

### Step 1: Smoke Test (Before Overnight Training)

Run quick smoke tests to validate the full pipeline before committing to overnight training:

```bash
python -m simulator.training.train_selfish --test &
python -m simulator.training.train_adversarial --test &
python -m simulator.training.train_altruistic --test &
python -m simulator.training.train_hyper_altruistic --test &
```

Each runs 200 episodes in ~1-2 minutes. Validates: opponent loading, per-seat VD caps, checkpoint save/load, metrics CSV, training plots, selfish checkpoint pickup.

Hyper-adversarial requires a selfish checkpoint — run its smoke test after selfish:
```bash
python -m simulator.training.train_hyper_adversarial --test
```

### Step 2: Train Agents

**Phase 1** — Train 4 agents concurrently (overnight):

```bash
python -m simulator.training.train_selfish --fresh &
python -m simulator.training.train_adversarial --fresh &
python -m simulator.training.train_altruistic --fresh &
python -m simulator.training.train_hyper_altruistic --fresh &
```

All 4 use opponent pools from the start. After 20% of training, they automatically pick up selfish checkpoints as additional opponents (graceful fallback if none exist yet).

**Phase 2** — After selfish finishes:

```bash
python -m simulator.training.train_hyper_adversarial --fresh
```

Loads the frozen `selfish_agent.pt` from Phase 1 as the star agent.

All training scripts support:
- `--fresh` — start from scratch, ignore checkpoints
- `--test` — smoke test: 200 episodes with fast eval

Models are saved to `simulator/models/{tier}/`.
Training metrics are logged to `simulator/models/{tier}/metrics.csv`.
Training plots are saved to `simulator/models/{tier}/training_progress.png`.

### Step 3: Simulate Tier Combinations

Test any combination of agents across all 4 seats:

```bash
# Specific combo: 3 selfish bots vs rule-v1
python -m simulator.simulation.simulate --s0 rule-v1 --s1 selfish --s2 selfish --s3 selfish --games 10000

# Altruistic bots helping seat 0 win (target auto-set to seat 0)
python -m simulator.simulation.simulate --s0 casual --s1 altruistic --s2 altruistic --s3 altruistic --games 10000

# Hyper-altruistic bots helping seat 0 win (strategic passing enabled)
python -m simulator.simulation.simulate --s0 noob --s1 hyper_altruistic --s2 hyper_altruistic --s3 hyper_altruistic --games 10000

# Adversarial bots making seat 0 lose
python -m simulator.simulation.simulate --s0 pro --s1 adversarial --s2 adversarial --s3 adversarial --games 10000

# Hyper-adversarial team: support bots help selfish star at seat 2
python -m simulator.simulation.simulate --s0 rule-v1 --s1 hyper_adversarial --s2 selfish --s3 hyper_adversarial --target 2

# Mix tiers: 2 selfish + 1 altruistic (no --target needed)
python -m simulator.simulation.simulate --s0 rule-v1 --s1 selfish --s2 altruistic --s3 selfish

# Run ALL 125 tier combinations (builds lookup table)
python -m simulator.simulation.simulate --s0 rule-v1 --all --target 0 --games 200
```

### Step 3.5: Simulate Adaptive Controller

Test the `AdaptiveTierController` in a session-based simulation. Seat 0 uses a fixed agent; seats 1-3 are dynamically assigned by the controller each game based on a running win rate.

```bash
# Adaptive controller with casual at seat 0, default target 25%
python -m simulator.simulation.simulate --s0 casual --adaptive --games 2000

# Adaptive controller with rule-v1 at seat 0, target 10%
python -m simulator.simulation.simulate --s0 rule-v1 --adaptive --adaptive-target 0.10 --games 5000

# Adaptive controller with pro at seat 0, target 50%
python -m simulator.simulation.simulate --s0 pro --adaptive --adaptive-target 0.50 --games 3000
```

The controller uses the same `AdaptiveTierController` as the API, but with a session running counter (wins/total) instead of a database. Output includes:
- Per-game tier selection and running win rate
- Tier usage distribution (how many games each tier was selected)
- Per-tier seat 0 win rates (how well seat 0 did against each tier)
- Final convergence: actual win rate vs target

**Agent choices** for any seat: `random`, `rule-v1`, `noob`, `casual`, `pro`, `selfish`, `adversarial`, `altruistic`, `hyper_altruistic`, `hyper_adversarial`

Backward compatibility: `cooperative` is an alias for `hyper_adversarial`.

**Target seat (plane 11)** is resolved per-seat automatically:
- `altruistic` / `hyper_altruistic` — always target seat 0 (hardcoded, matches training)
- `hyper_adversarial` — requires `--target N` from CLI (which bot teammate to help)
- All others — no target (plane 11 all zeros)

**Voluntary draw** is automatically set per-seat to match each agent's training policy (from `VOLUNTARY_DRAW_POLICY` in `engine/game_logic/tiers/tier_config.py`):

| Agent | VD Cap | Notes |
|-------|--------|-------|
| selfish | 0 | Trained with VD disabled |
| adversarial | 0 | Trained with VD disabled |
| hyper_altruistic | 5 | Learns strategic passing to help seat 0 |
| hyper_adversarial | 0 | Support bots help via card play, not drawing |
| altruistic | 0 | Helps via card play, no drawing |
| noob | 10 | Represents clueless players who draw randomly |
| random | 0 | Baseline random agent |
| rule-v1 | 0 | Always draws first if allowed — must stay at 0 |
| casual / pro | 0 | Filtered draw out |

**Statistics and plots** are collected by default for single-combo runs:
- Use `--no-stats` to skip stats collection (faster, no plot)
- Use `--stats` to enable stats for `--all` mode (off by default)

Plots are saved with descriptive names based on the seat agents:
```
simulator/data/sim_cas_halt_halt_halt_1000g_stats.png
simulator/data/sim_rv1_sel_sel_sel_500g_stats.png
```

Short names: `rnd`=random, `rv1`=rule-v1, `cas`=casual, `pro`=pro, `sel`=selfish, `adv`=adversarial, `alt`=altruistic, `halt`=hyper_altruistic, `hadv`=hyper_adversarial

Re-running the same combo renames the old plot with a timestamp instead of overwriting.

Simulation plots (`*_stats.png`) include 6 subplots:
1. **Win Rate Convergence** — per-seat win rate over games with 95% CI error bars
2. **End Hand Size** — box plot of cards remaining at game end per seat (0 = winner)
3. **Offensive Targeting Heatmap** — attacker × victim matrix (Blues colormap, diagonal masked)
4. **Attacks on Each Seat** — grouped bars showing adjacent attackers per victim (s0 first)
5. **Draws (Forced vs Voluntary)** — grouped bars comparing forced and voluntary draws per seat
6. **Play Efficiency** — cards played vs draws per game per seat

Results JSON is saved to `simulator/data/tier_results.json`.

### Step 4: Run Baseline (Verify Engine)

Run random agents to verify ~25% win rate per seat:
```bash
python -m simulator.simulation.simulate --s0 random --s1 random --s2 random --s3 random --games 100
```

## Training Details

### Selfish Agent
Standard individual reward: +1 when THIS bot wins, uses RLCard default payoffs.
Random seat assignment: DQN can sit at any seat (0-3) with weighted distribution {1:10%, 2:15%, 3:45%, 4:30%}.
Opponent pool: random, rule-v1, noob, casual, pro (+ selfish checkpoints after 20%).

### Adversarial Agent
Team reward: +1 when ANY bot wins (seat 0 loses), -1 when seat 0 wins.
Opponent pool weighted toward strong opponents (pro 30%, rule-v1 25%, casual 15%, noob 15%, random 10%).
After 20% of training, includes selfish checkpoints as opponents.

### Altruistic Agent
Helps seat 0 (human player) win. Target seat plane (plane 11) = seat 0.
Opponent pool: random, rule-v1, noob, casual, pro, random-vd (equal weights).
Custom reward: +1 seat 0 wins, -1 self wins, -1 other bot wins.
Bots have VD disabled (cap 0). Seat 0 VD follows opponent type.

### Hyper Altruistic Agent
Like altruistic but can draw (pass) even with playable cards. Learns WHEN passing helps seat 0.
Opponent pool: random, rule-v1, noob, casual, pro, random-vd (equal weights).
Custom reward: +2 seat 0 wins, -1 self wins, -1 other wins, -0.5 per voluntary draw.
Bots have VD cap 5. Seat 0 VD follows opponent type.

### Hyper-Adversarial Agent (replaces Cooperative)
Joint training: frozen selfish agent at star seat + cooperative DQN at support seats.
Star seat rotates among bot seats each episode. Opponent pool weighted toward strong.
Cooperative reward: +2 star wins, +1 other bot wins, -2 seat 0 wins.
Requires pre-trained `selfish_agent.pt` from Phase 1.

## DQN Hyperparameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Network | [256, 256] | 720-dim input needs wider layers |
| Learning rate | 0.0001 | Balanced for [256,256] capacity |
| Replay buffer | 100,000 | Diverse replay samples |
| Epsilon decay | 1,000,000 steps | ~44% of training for exploration |
| Train every | 8 steps | Reduces overfitting on recent data |
| Batch size | 32 | Standard |
| Target update | every 500 steps | Stable Q-targets |

## Config Reference

| Setting | File | Default | Description |
|---------|------|---------|-------------|
| `TIER_GAMES` | config/simulation.py | 500 | Games per tier combination |
| `OPPONENT_POOL` | config/training.py | [random, rule-v1, noob, casual, pro] | Standard opponent mix |
| `ALTRUISTIC_POOL` | config/training.py | [+ random-vd] | Includes VD-enabled random |
| `NUM_EPISODES` | config/training.py | 100,000 | Training episodes |
| `LEARNING_RATE` | config/training.py | 0.0001 | DQN learning rate |
| `BATCH_SIZE` | config/training.py | 32 | DQN batch size |
| `REPLAY_MEMORY_SIZE` | config/training.py | 100,000 | Experience replay buffer |
| `EVAL_EVERY` | config/training.py | 1,000 | Evaluate every N episodes |
| `SAVE_EVERY` | config/training.py | 10,000 | Checkpoint every N episodes |
| `SELFISH_SEAT_WEIGHTS` | config/training.py | {1:10, 2:15, 3:45, 4:30} | DQN seat count distribution |
| `SELFISH_CHECKPOINT_START` | config/training.py | 0.20 | Include selfish checkpoints after 20% |

## Training Monitoring

Each training script outputs formatted eval blocks every `EVAL_EVERY` episodes:

```
  ┌─ Episode 5,000/100,000 (5%) [█░░░░░░░░░░░░░░░░░░░]
  │  Seat 0 (opponent)   :  22/100  (22.0%)
  │  Bots (selfish)      :  78/100  (78.0%)
  │  Loss                : 0.0342
  │  Epsilon             : 0.891
  │  Avg game length     : 14.2 turns
  │  Avg VD per seat     : s0=0.0  s1=1.3  s2=0.8  s3=1.5
  │  Buffer              : 45,200 / 100,000
  └──────────────────────────────────────────────────
```

Training plots (`training_progress.png`) include 4 subplots:
1. Win rates over episodes (seat 0 vs bots)
2. DQN loss curve
3. Epsilon schedule
4. Average game length
