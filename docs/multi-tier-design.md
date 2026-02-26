# Multi-Tier Agent Design for Win Rate Control

## Overview
Six-tier system with per-seat mixing for natural-feeling win rate control.
Replaces the old AdaptiveAgent coin-flip blending approach.

## The Six Tiers

| Tier | Name | Reward Structure | Training | Status |
|------|------|-----------------|----------|--------|
| 1 | **Hyper Adversarial** | Selfish (lucky bot) + Cooperative (support bots) | Bidding system needed | Future |
| 2 | **Adversarial** | Team: +1 when ANY bot wins, -1 when seat 0 wins | `train_adversarial.py` | Trained (100k episodes) |
| 3 | **Selfish** | Individual: +1 only when THIS bot wins | `train_selfish.py` | Trained (100k episodes) |
| 4 | **Random** | None | RandomAgent, no training | Done |
| 5 | **Altruistic** | +1 when seat 0 wins, -1 self win, -1 other win | `train_altruistic.py` | Trained (100k episodes) |
| 6 | **Hyper Altruistic** | +2 seat 0 wins, -1 self/other, -0.5 per pass | `train_hyper_altruistic.py` | Trained (100k episodes) |

### Training Results Summary

| Agent | Seat 0 Win Rate | Notes |
|-------|-----------------|-------|
| Adversarial | ~14% | Team coordination suppresses seat 0 |
| Selfish | ~18-22% | Individual play, high variance |
| Random | ~25% | Baseline (no intelligence) |
| Altruistic | ~31% | Actively helps seat 0 win |
| Cooperative | ~25% | Neutral (helps bot teammate, not seat 0) |
| Hyper Altruistic | ~34-40% | Strongest seat 0 boost, maxes voluntary draws |

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
- Non-mixable: hyper adversarial (requires all bots coordinating)
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
2. ~~**Adversarial**, **altruistic**, **cooperative**, **hyper altruistic**~~ — all trained (100k episodes each)
3. ~~**Simulate** all combinations to build win rate lookup table~~ — simulation tool done
4. **Mixing controller** (assign tiers to seats based on win rate) — next step
5. **Hyper adversarial** (bidding system, selfish + cooperative agents) — last priority

## Voluntary Draw Policy

Per-seat voluntary draw caps match each agent's training configuration. This prevents mismatches where an agent encounters voluntary draw options it was never trained on.

| Agent | Voluntary Draws | Cap | Training Config |
|-------|----------------|-----|-----------------|
| selfish | enabled | 5 per game | Trained with cap 5 |
| adversarial | enabled | 5 per game | Trained with cap 5 |
| hyper_altruistic | enabled | 5 per game | Trained with cap 5 |
| altruistic | **disabled** | 0 | Trained with draw off |
| cooperative | **disabled** | 0 | Trained with draw off |
| random | disabled | 0 | N/A (no training) |
| rule-v1 | disabled | 0 | N/A (heuristic) |
| noob/casual/pro | disabled | 0 | N/A (heuristic bots) |

Caps are set per-seat via a dict passed to `UnoGame.set_max_voluntary_draws()`:
```python
# Example: seat 0 = no draws, seats 1-3 = different caps per tier
game.set_max_voluntary_draws({0: 0, 1: 5, 2: 0, 3: 5})
```

## Hyper Adversarial Details (Future)
- Hand strength evaluation to determine "lucky" bot (most likely to win)
- Lucky bot uses selfish reward (+1 only if IT wins)
- Other bots use cooperative reward (+1 when lucky bot wins)
- Bidding: bots evaluate hand strength, controller picks lucky seat
- All 3 bots must coordinate — cannot mix with other tiers

## Hyper Altruistic Details
- Voluntary draw enabled with cap 5: 'draw' is always a legal action (up to 5 times per game)
- Reward: +2 seat 0 wins, -1 self wins, -1 other wins, -0.5 per voluntary draw (cumulative)
- Slightly stronger help signal than altruistic + voluntary draw available
- Pass penalty prevents spam; DQN learns optimal pass frequency
- Mixable with other tiers — most effective at seats 1 and 3 (adjacent to seat 0)
- Mixed seat 0 opponents (50% random + 50% rule-v1) for robustness
- Target seat plane = seat 0 (same as altruistic)
- Training observation: agent consistently maxes voluntary draws at 5.0/game

## Technical Notes
- All tiers share same DQN architecture and [12,4,15] enriched state
- Seat identity plane (plane 4) tells each agent which seat it occupies
- Target seat plane (plane 11) tells support agents which seat to help win (all zeros for adversarial/selfish)
- Different tiers = different model weights loaded per seat at runtime
- RLCard patch: wild_draw_4 always legal (no color restriction)
- RLCard patch: voluntary draw always legal (draw added to legal actions even with playable cards)
- Two support models: altruistic (helps human) and cooperative (helps bot teammate)
- Per-seat voluntary draw caps via dict-based `_max_voluntary_draws` in `UnoGame`
- Models loaded once at startup via `TierModelPool` — no per-game disk I/O

## Reward Table

| Agent | Target wins | Self wins | Other wins | Extra |
|-------|-------------|-----------|------------|-------|
| **Adversarial** | -1 (seat 0) | +1 | +1 | — |
| **Selfish** | — | +1 | -1 | — |
| **Random** | — | — | — | No reward |
| **Altruistic** | +1 (seat 0) | -1 | -1 | voluntary draw disabled |
| **Cooperative** | +1 (rotating) | -1 | -1 | voluntary draw disabled |
| **Hyper Altruistic** | +2 (seat 0) | -1 | -1 | -0.5 per voluntary draw |

## Training Scripts
- `train_adversarial.py` — team reward, target plane zeros, voluntary draw cap 5
- `train_selfish.py` — individual reward, target plane zeros, voluntary draw cap 5
- `train_altruistic.py` — helps seat 0 win, mixed seat 0 opponents (50% random + 50% rule-v1), voluntary draw disabled
- `train_cooperative.py` — helps bot teammates win, rotates target among seats 1-3, voluntary draw disabled
- `train_hyper_altruistic.py` — strategic passing, +2 win / -0.5 per pass, voluntary draw cap 5

## Simulation Tool

Test any combination of agents across all 4 seats using the simulator CLI.

**All commands run from project root (`ada-uno/`):**

```bash
# Specific combo: 3 selfish bots vs rule-v1
python -m simulator.simulation.simulate --s0 rule-v1 --s1 selfish --s2 selfish --s3 selfish --games 500

# Altruistic bots helping seat 0 win (target auto-set to seat 0)
python -m simulator.simulation.simulate --s0 casual --s1 altruistic --s2 altruistic --s3 altruistic

# Mix altruistic + cooperative in the same game
python -m simulator.simulation.simulate --s0 casual --s1 altruistic --s2 cooperative --s3 selfish --target 1

# Cooperative bots helping seat 2
python -m simulator.simulation.simulate --s0 random --s1 cooperative --s2 selfish --s3 cooperative --target 2

# Run ALL 125 tier combinations (builds lookup table)
python -m simulator.simulation.simulate --s0 rule-v1 --all --games 200

# Baseline sanity check (expect ~25% per seat)
python -m simulator.simulation.simulate --baseline --games 100
```

**Agent choices:** `random`, `rule-v1`, `noob`, `casual`, `pro`, `selfish`, `adversarial`, `altruistic`, `cooperative`, `hyper_altruistic`

**Target seat (plane 11)** is resolved per-seat automatically:
- `altruistic` / `hyper_altruistic` — always target seat 0 (hardcoded, matches training)
- `cooperative` — requires `--target N` from CLI (which bot teammate to help)
- All others — no target (plane 11 all zeros)

Voluntary draw caps are automatically applied per-seat to match each agent's training policy.

Results saved to `simulator/data/tier_results.json`.
