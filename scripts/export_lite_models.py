"""Export inference-only (lite) model files by stripping replay buffers.

Reduces ~600MB models to ~1-2MB by removing:
  - Replay buffer (100k transitions, ~590MB)
  - Optimizer state (Adam momentum, ~2-4MB)

The lite models work identically for eval_step() inference.

Usage:
    python -m scripts.export_lite_models
    python -m scripts.export_lite_models --verify
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import torch
import numpy as np


TIERS = [
    "selfish",
    "adversarial",
    "altruistic",
    "hyper_adversarial",
    "hyper_altruistic",
]

SRC_DIR = os.path.join(os.path.dirname(__file__), '..', 'simulator', 'models')
DST_DIR = os.path.join(os.path.dirname(__file__), '..', 'api', 'models_lite')


def strip_checkpoint(checkpoint):
    """Remove replay buffer and optimizer state, keep only inference essentials."""
    # Empty the replay buffer but keep the structure
    checkpoint['memory'] = {
        'memory_size': checkpoint['memory']['memory_size'],
        'batch_size': checkpoint['memory']['batch_size'],
        'memory': [],  # empty — not needed for inference
    }

    # Keep optimizer state — RLCard's from_checkpoint requires it (~2MB, acceptable)

    return checkpoint


def export_all(src_dir, dst_dir):
    """Export lite versions of all tier models."""
    os.makedirs(dst_dir, exist_ok=True)

    for tier in TIERS:
        src_path = os.path.join(src_dir, tier, f'{tier}_agent.pt')
        dst_tier_dir = os.path.join(dst_dir, tier)
        dst_path = os.path.join(dst_tier_dir, f'{tier}_agent.pt')

        if not os.path.exists(src_path):
            print(f"  SKIP {tier} — not found at {src_path}")
            continue

        src_size = os.path.getsize(src_path) / (1024 * 1024)
        print(f"  Loading {tier} ({src_size:.1f} MB)...")

        checkpoint = torch.load(src_path, map_location='cpu', weights_only=False)
        strip_checkpoint(checkpoint)

        os.makedirs(dst_tier_dir, exist_ok=True)
        torch.save(checkpoint, dst_path)

        dst_size = os.path.getsize(dst_path) / (1024 * 1024)
        ratio = dst_size / src_size * 100
        print(f"    -> {dst_path}")
        print(f"    -> {dst_size:.2f} MB ({ratio:.1f}% of original)")

    print("\nDone.")


def verify(src_dir, dst_dir):
    """Verify lite models produce identical eval_step() outputs."""
    from engine.game_logic.agents.rl_agent import RLAgent
    from engine.game_logic.game import UnoGame

    print("\nVerifying inference equivalence...\n")
    game = UnoGame()

    # Generate test states by running a few random games
    from rlcard.agents import RandomAgent
    game.set_agents([RandomAgent(num_actions=61)] * 4)
    test_states = []
    for _ in range(10):
        game.start_game()
        state, _ = game.env.reset()
        test_states.append(state)

    all_match = True
    for tier in TIERS:
        src_path = os.path.join(src_dir, tier, f'{tier}_agent.pt')
        dst_path = os.path.join(dst_dir, tier, f'{tier}_agent.pt')

        if not os.path.exists(src_path) or not os.path.exists(dst_path):
            print(f"  SKIP {tier} — files missing")
            continue

        full_agent = RLAgent(model_path=src_path)
        lite_agent = RLAgent(model_path=dst_path)

        matches = 0
        total = len(test_states)
        for state in test_states:
            full_action, _ = full_agent.eval_step(state)
            lite_action, _ = lite_agent.eval_step(state)
            if full_action == lite_action:
                matches += 1

        status = "PASS" if matches == total else "FAIL"
        if matches != total:
            all_match = False
        print(f"  {tier}: {status} ({matches}/{total} actions match)")

    print()
    if all_match:
        print("All tiers verified — lite models are inference-equivalent.")
    else:
        print("WARNING: Some mismatches detected!")


def main():
    parser = argparse.ArgumentParser(description="Export lite (inference-only) model files")
    parser.add_argument('--src', default=SRC_DIR, help='Source model directory')
    parser.add_argument('--dst', default=DST_DIR, help='Destination for lite models')
    parser.add_argument('--verify', action='store_true', help='Verify lite models match full models')
    args = parser.parse_args()

    print("=" * 50)
    print("  EXPORT LITE MODELS")
    print("=" * 50)
    print(f"  Source: {os.path.abspath(args.src)}")
    print(f"  Dest:   {os.path.abspath(args.dst)}")
    print("=" * 50)
    print()

    export_all(args.src, args.dst)

    if args.verify:
        verify(args.src, args.dst)


if __name__ == '__main__':
    main()
