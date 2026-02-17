# Training settings

import os

# Seat 0 opponent during training: "random", "rule-v1", "self-play"
SEAT0_OPPONENT = "rule-v1"

# Training episodes
NUM_EPISODES = 100_000

# DQN hyperparameters
LEARNING_RATE = 0.00005
BATCH_SIZE = 32
REPLAY_MEMORY_SIZE = 20_000
REPLAY_MEMORY_INIT_SIZE = 1_000
UPDATE_TARGET_EVERY = 1_000
DISCOUNT_FACTOR = 0.99
EPSILON_START = 1.0
EPSILON_END = 0.1
EPSILON_DECAY_STEPS = 20_000
TRAIN_EVERY = 1

# Evaluation during training
EVAL_EVERY = 1_000        # Evaluate every N episodes
EVAL_NUM_GAMES = 100      # Games per evaluation

# Model save paths
MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")
SAVE_EVERY = 10_000       # Save checkpoint every N episodes
