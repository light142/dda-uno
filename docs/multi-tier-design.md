# Multi-Tier Agent Design for Win Rate Control

## Overview
Six-tier system with per-seat mixing for natural-feeling win rate control.
Replaces the old AdaptiveAgent coin-flip blending approach.

## The Six Tiers

| Tier | Name | Reward Structure | Training | Status |
|------|------|-----------------|----------|--------|
| 1 | **Hyper Adversarial** | Selfish (star) + Cooperative support (+2/+1/-2) | Joint training with frozen selfish | Trained |
| 2 | **Adversarial** | Team: +1 when ANY bot wins, -1 when seat 0 wins | `train_adversarial.py` | Trained |
| 3 | **Selfish** | Individual: +1 only when THIS bot wins | `train_selfish.py` | Trained |
| 4 | **Random** | None | RandomAgent, no training | Done |
| 5 | **Altruistic** | +1 when seat 0 wins, -1 self win, -1 other win | `train_altruistic.py` | Trained |
| 6 | **Hyper Altruistic** | +2 seat 0 wins, -1 self/other, -0.5 per pass | `train_hyper_altruistic.py` | Trained |

## Key Design Decisions

### Per-Game Tier Selection (not per-turn)
- Controller picks tier(s) BEFORE each game starts
- All bots play their assigned role consistently throughout the game
- No mid-game switching

### Per-Seat Mixing
- Independent tiers can mix in the same game (different bot = different tier)
- Example: seat 1 = selfish, seat 2 = random, seat 3 = altruistic
- Creates fine-grained win rate control through combinations
- Mixable tiers: selfish, random, altruistic, hyper altruistic, adversarial (operate independently)
- Non-mixable: hyper adversarial (requires support bots coordinating with star)
- Hyper altruistic is most impactful at seats 1 and 3 (adjacent to seat 0 in both turn directions)

### Baseline & Distribution
- **Selfish is the baseline** (most games) — feels like real UNO
- Soft adjustments (adversarial, altruistic, random) appear with varying probability based on win rate gap
- Hyper tiers are rare: ~5% chance, max 1 in 5-6 games, only when win rate is far from target

### Controller Logic (Future — Mixing Controller)
- Given win rate gap from target, decide how many bots to assign to each tier
- Small correction: 2 selfish + 1 altruistic (or 1 adversarial)
- Medium correction: 1 selfish + 2 altruistic (or 2 adversarial)
- Large correction: 3 altruistic (or 3 adversarial)
- Emergency: hyper altruistic or hyper adversarial (rate-limited)

## Why Not Q-Value Blending
- Q-value blending creates bots with no coherent personality
- A bot 50% trying to beat you and 50% trying to help makes incoherent decisions
- Per-seat mixing is more natural: each bot behaves like a real player
- Win rates are more predictable: simulate each combination, build lookup table
- Better for academic paper: distinct agent personalities with measurable effects

## Naturalness
- Selfish bots = competitive player trying to win (most common real UNO behavior)
- Random bots = casual player not paying attention
- Altruistic bots = friendly player making questionable moves
- If only 1 of 3 bots is altruistic, the helping is subtle and the player won't notice
- Hyper tiers (coordinated kill / strategic passing) feel more artificial — use sparingly

## Implementation Priority
1. ~~**Selfish** training~~ — done
2. ~~**Adversarial**, **altruistic**, **hyper altruistic**~~ — all trained
3. ~~**Hyper adversarial** (joint training: frozen selfish + cooperative support)~~ — trained
4. ~~**Simulate** all combinations to build win rate lookup table~~ — simulation tool done
5. **Mixing controller** (assign tiers to seats based on win rate) — next step

## Voluntary Draw Policy

Per-seat voluntary draw caps match each agent's training configuration. This prevents mismatches where an agent encounters voluntary draw options it was never trained on.

| Agent | Voluntary Draws | Cap | Training Config |
|-------|----------------|-----|-----------------|
| selfish | enabled | 5 per game | Trained with cap 5 |
| adversarial | enabled | 5 per game | Trained with cap 5 |
| hyper_altruistic | enabled | 5 per game | Trained with cap 5 |
| altruistic | **disabled** | 0 | Trained with draw off |
| hyper_adversarial | **disabled** | 0 | Support bots help via card play, not drawing |
| noob | enabled | 10 per game | Clueless players who draw randomly |
| random | disabled | 0 | N/A (baseline) |
| random-vd | enabled | 5 per game | Random agent with VD enabled (training opponent) |
| rule-v1 | disabled | 0 | Always draws first if allowed — must stay at 0 |
| casual/pro | disabled | 0 | N/A (heuristic bots) |

Caps are set per-seat via a dict passed to `UnoGame.set_max_voluntary_draws()`:
```python
# Example: seat 0 VD per opponent type, seats 1-3 per agent type
game.set_max_voluntary_draws({0: 0, 1: 5, 2: 0, 3: 5})
```

## Hyper Adversarial Details
- Joint training: frozen selfish agent at star seat + cooperative DQN at support seats
- Star seat rotates among bot seats (1, 2, 3) each training episode
- Cooperative reward: +2 when star wins, +1 when other bot wins, -2 when seat 0 wins
- Support bots learn to play cards that help the star win (VD disabled for support)
- Star uses frozen `selfish_agent.pt` from Phase 1 training (not training, just playing)
- At runtime: `--target N` specifies which seat is the star (selfish agent sits there)
- All support bots coordinate — cannot mix with other tiers

## Hyper Altruistic Details
- Voluntary draw enabled with cap 5: 'draw' is always a legal action (up to 5 times per game)
- Reward: +2 seat 0 wins, -1 self wins, -1 other wins, -0.5 per voluntary draw (cumulative)
- Slightly stronger help signal than altruistic + voluntary draw available
- Pass penalty prevents spam; DQN learns optimal pass frequency
- Mixable with other tiers — most effective at seats 1 and 3 (adjacent to seat 0)
- Opponent pool: random, rule-v1, noob, casual, pro, random-vd (equal weights)
- Target seat plane = seat 0 (same as altruistic)

## DQN Hyperparameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Network | [256, 256] | 720-dim input needs wider layers (~266K params) |
| Learning rate | 0.0001 | Balanced for [256,256] capacity |
| Replay buffer | 100,000 | Diverse replay, ~45x turnover |
| Epsilon decay | 1,000,000 steps | ~44% of training for exploration |
| Train every | 8 steps | Reduces overfitting on recent data |
| Batch size | 32 | Standard |
| Target update | every 500 steps | Stable Q-targets |

## Training Setup

### Opponent Pools
All training scripts use varied opponent pools at seat 0 instead of a single fixed opponent:

| Script | Opponent Pool | Weighting |
|--------|-------------|-----------|
| Selfish | random, rule-v1, noob, casual, pro | Equal (random seat assignment) |
| Adversarial | random, rule-v1, noob, casual, pro | Weighted strong (pro 30%) |
| Altruistic | random, rule-v1, noob, casual, pro, random-vd | Equal |
| Hyper Altruistic | random, rule-v1, noob, casual, pro, random-vd | Equal |
| Hyper Adversarial | random, rule-v1, noob, casual, pro | Weighted strong (pro 25%) |

After 20% of training, all scripts can pick up selfish checkpoints as additional opponents. This is graceful — returns None if no checkpoint exists yet.

### Selfish Random Seat Assignment
Selfish training uses random DQN seat placement. Each episode:
1. Pick DQN seat count from weights: {1:10%, 2:15%, 3:45%, 4:30%}
2. Randomly assign DQN to those seats
3. Fill remaining seats with opponents from pool
4. Per-seat VD caps follow bot type

### Training Order
```
Phase 1 (concurrent — overnight):
  Terminal 1: python -m simulator.training.train_selfish --fresh
  Terminal 2: python -m simulator.training.train_adversarial --fresh
  Terminal 3: python -m simulator.training.train_altruistic --fresh
  Terminal 4: python -m simulator.training.train_hyper_altruistic --fresh

Phase 2 (after selfish finishes):
  Terminal 5: python -m simulator.training.train_hyper_adversarial --fresh
```

### Smoke Test
All scripts accept `--test` for quick validation (200 episodes, ~1-2 min):
```bash
python -m simulator.training.train_selfish --test
```

## Technical Notes
- All tiers share same DQN architecture and [12,4,15] enriched state
- Seat identity plane (plane 4) tells each agent which seat it occupies
- Target seat plane (plane 11) tells support agents which seat to help win (all zeros for adversarial/selfish)
- Different tiers = different model weights loaded per seat at runtime
- RLCard patch: wild_draw_4 always legal (no color restriction)
- RLCard patch: voluntary draw always legal (draw added to legal actions even with playable cards)
- Two support models: altruistic (helps human) and hyper_adversarial (helps bot teammate)
- Per-seat voluntary draw caps via dict-based `_max_voluntary_draws` in `UnoGame`
- Models loaded once at startup via `TierModelPool` — no per-game disk I/O
- Training metrics logged to CSV + matplotlib plots (training_progress.png)

## Reward Table

| Agent | Target wins | Self wins | Other wins | Extra |
|-------|-------------|-----------|------------|-------|
| **Adversarial** | -1 (seat 0) | +1 | +1 | — |
| **Selfish** | — | +1 | -1 | — |
| **Random** | — | — | — | No reward |
| **Altruistic** | +1 (seat 0) | -1 | -1 | VD disabled |
| **Hyper Adversarial** (support) | +2 (star seat) | — | +1 (bot) / -2 (seat 0) | VD disabled |
| **Hyper Altruistic** | +2 (seat 0) | -1 | -1 | -0.5 per voluntary draw |

## Training Scripts
- `train_selfish.py` — individual reward, random seat assignment, opponent pool, VD cap 5
- `train_adversarial.py` — team reward, weighted opponents (strong bias), VD cap 5
- `train_altruistic.py` — helps seat 0 win, opponent pool + random-vd, VD disabled
- `train_hyper_altruistic.py` — strategic passing, opponent pool + random-vd, VD cap 5
- `train_hyper_adversarial.py` — joint training (frozen selfish star + cooperative support), VD: star=5, support=0

## Simulation Tool

Test any combination of agents across all 4 seats using the simulator CLI.

**All commands run from project root (`ada-uno/`):**

```bash
# Specific combo: 3 selfish bots vs rule-v1
python -m simulator.simulation.simulate --s0 rule-v1 --s1 selfish --s2 selfish --s3 selfish --games 500

# Altruistic bots helping seat 0 win (target auto-set to seat 0)
python -m simulator.simulation.simulate --s0 casual --s1 altruistic --s2 altruistic --s3 altruistic

# Hyper-adversarial team: support bots help selfish star at seat 2
python -m simulator.simulation.simulate --s0 rule-v1 --s1 hyper_adversarial --s2 selfish --s3 hyper_adversarial --target 2

# Run ALL 125 tier combinations (builds lookup table)
python -m simulator.simulation.simulate --s0 rule-v1 --all --target 0 --games 200

# Baseline sanity check (expect ~25% per seat)
python -m simulator.simulation.simulate --baseline --games 100
```

**Agent choices:** `random`, `rule-v1`, `noob`, `casual`, `pro`, `selfish`, `adversarial`, `altruistic`, `hyper_altruistic`, `hyper_adversarial`

Backward compatibility: `cooperative` is an alias for `hyper_adversarial`.

**Target seat (plane 11)** is resolved per-seat automatically:
- `altruistic` / `hyper_altruistic` — always target seat 0 (hardcoded, matches training)
- `hyper_adversarial` — requires `--target N` from CLI (which bot teammate to help)
- All others — no target (plane 11 all zeros)

Voluntary draw caps are automatically applied per-seat to match each agent's training policy.

Results saved to `simulator/data/tier_results.json`.
