# Multi-Tier Agent Design for Win Rate Control

## Overview
Six-tier system with per-seat mixing for natural-feeling win rate control.
Replaces the old AdaptiveAgent coin-flip blending approach.

## The Six Tiers

| Tier | Name | Reward Structure | Training | Status |
|------|------|-----------------|----------|--------|
| 1 | **Hyper Adversarial** | Coordinated + role bidding (lucky/support) | New architecture needed | Not started |
| 2 | **Adversarial** | Team: +1 when ANY bot wins, -1 when seat 0 wins | `train_adversarial.py` (team reward) | Training script done |
| 3 | **Selfish** | Individual: +1 only when THIS bot wins | `train_selfish.py` | Training script done |
| 4 | **Random** | None | RandomAgent, no training | Done |
| 5 | **Altruistic** | +1 when seat 0 wins, -1 self win, -1 other win | `train_altruistic.py` (target=0, mixed opponents) | Training script done |
| 6 | **Hyper Altruistic** | +2 seat 0 wins, -0.5 per voluntary draw | `train_hyper_altruistic.py` (voluntary draw enabled) | Training script done |

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

### Controller Logic
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
2. ~~**Adversarial**, **altruistic**, **cooperative**, **hyper altruistic**~~ — all training scripts done
3. **Simulate** all combinations to build win rate lookup table
4. **Mixing controller** (assign tiers to seats based on win rate)
5. **Hyper adversarial** (bidding system, selfish + cooperative agents) — last priority

## Hyper Adversarial Details (Future)
- Hand strength evaluation to determine "lucky" bot (most likely to win)
- Lucky bot uses selfish reward (+1 only if IT wins)
- Other bots use support reward (+1 when lucky bot wins)
- Bidding: bots evaluate hand strength, controller picks lucky seat
- All 3 bots must coordinate — cannot mix with other tiers

## Hyper Altruistic Details
- Voluntary draw is on by default; altruistic/cooperative explicitly disable it during training
- Reward: +2 seat 0 wins, -1 self wins, -1 other wins, -0.5 per voluntary draw (cumulative)
- Slightly stronger help signal than altruistic + voluntary draw available
- Pass penalty prevents spam; DQN learns optimal pass frequency
- Mixable with other tiers — most effective at seats 1 and 3 (adjacent to seat 0)
- Mixed seat 0 opponents (50% random + 50% rule-v1) for robustness
- Target seat plane = seat 0 (same as altruistic)

## Voluntary Draw Policy
- Default: draw always legal (realistic UNO — `_allow_voluntary_draw = True`)
- **Selfish, Adversarial**: draw allowed — reward naturally prevents abuse (passing = not winning)
- **Altruistic, Cooperative**: draw DISABLED during training — forces helping by smart card play
- **Hyper Altruistic**: draw allowed + cumulative -1 per pass penalty — learns selective passing
- Deployment: always True globally. Altruistic/cooperative models have untrained Q-values for voluntary draw so they almost never pick it.

## Technical Notes
- All tiers share same DQN architecture and [12,4,15] enriched state
- Seat identity plane (plane 4) tells each agent which seat it occupies
- Target seat plane (plane 11) tells support agents which seat to help win (all zeros for adversarial/selfish)
- Different tiers = different model weights loaded per seat at runtime
- RLCard patch: wild_draw_4 always legal (no color restriction)
- RLCard patch: voluntary draw always legal (draw added to legal actions even with playable cards)
- Two support models: altruistic (helps human) and cooperative (helps bot teammate)

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
- `train_adversarial.py` — team reward, target plane zeros
- `train_selfish.py` — individual reward, target plane zeros
- `train_altruistic.py` — helps seat 0 win, mixed seat 0 opponents (50% random + 50% rule-v1)
- `train_cooperative.py` — helps bot teammates win, rotates target among seats 1-3
- `train_hyper_altruistic.py` — strategic passing, +2 win / -0.5 per pass, voluntary draw enabled
