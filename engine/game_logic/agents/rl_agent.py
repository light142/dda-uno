"""DQN-based RL agent wrapping RLCard's DQNAgent with custom reward support."""

import os
import torch
from rlcard.agents import DQNAgent

from game_logic.agents.base import BaseAgent
from config.game import NUM_ACTIONS, STATE_SHAPE
from config.training import (
    LEARNING_RATE, BATCH_SIZE, REPLAY_MEMORY_SIZE, REPLAY_MEMORY_INIT_SIZE,
    UPDATE_TARGET_EVERY, DISCOUNT_FACTOR, EPSILON_START, EPSILON_END,
    EPSILON_DECAY_STEPS, TRAIN_EVERY, MODEL_DIR, SAVE_EVERY,
)


class RLAgent(BaseAgent):
    """RL agent that wraps RLCard's DQNAgent.

    Used for both strong agents (trained to win) and weak agents
    (trained to help seat 0 win). The difference is in the reward
    function used during training, not in the agent architecture.
    """

    def __init__(self, model_path: str = None, device: str = None):
        """Initialize the RL agent.

        Args:
            model_path: Path to load pre-trained weights from. If None,
                creates a fresh agent for training.
            device: PyTorch device ('cpu', 'cuda'). Auto-detected if None.
        """
        super().__init__()

        if model_path and os.path.exists(model_path):
            checkpoint = torch.load(model_path, map_location=device)
            self._agent = DQNAgent.from_checkpoint(checkpoint)
        else:
            self._agent = DQNAgent(
                num_actions=NUM_ACTIONS,
                state_shape=STATE_SHAPE,
                replay_memory_size=REPLAY_MEMORY_SIZE,
                replay_memory_init_size=REPLAY_MEMORY_INIT_SIZE,
                update_target_estimator_every=UPDATE_TARGET_EVERY,
                discount_factor=DISCOUNT_FACTOR,
                epsilon_start=EPSILON_START,
                epsilon_end=EPSILON_END,
                epsilon_decay_steps=EPSILON_DECAY_STEPS,
                batch_size=BATCH_SIZE,
                train_every=TRAIN_EVERY,
                learning_rate=LEARNING_RATE,
                device=device,
                save_path=MODEL_DIR,
                save_every=SAVE_EVERY,
            )

        self.use_raw = self._agent.use_raw

    def step(self, state: dict) -> int:
        """Choose action with epsilon-greedy exploration (training mode)."""
        return self._agent.step(state)

    def eval_step(self, state: dict) -> tuple:
        """Choose action greedily (evaluation mode)."""
        return self._agent.eval_step(state)

    def feed(self, transition: list) -> None:
        """Feed a training transition to update the Q-network."""
        self._agent.feed(transition)

    def save(self, path: str, filename: str = "agent.pt") -> None:
        """Save model weights to disk.

        Args:
            path: Directory to save the checkpoint.
            filename: Checkpoint filename.
        """
        os.makedirs(path, exist_ok=True)
        self._agent.save_checkpoint(path, filename)

    def load(self, filepath: str, device: str = None) -> None:
        """Load model weights from disk.

        Args:
            filepath: Full path to the .pt checkpoint file.
            device: PyTorch device to load onto.
        """
        checkpoint = torch.load(filepath, map_location=device)
        self._agent = DQNAgent.from_checkpoint(checkpoint)
        self.use_raw = self._agent.use_raw

    @property
    def agent(self) -> DQNAgent:
        """Access the underlying RLCard DQNAgent (for advanced use)."""
        return self._agent
