# Training settings

import os

# Training episodes
NUM_EPISODES = 100_000

# DQN hyperparameters
LEARNING_RATE = 0.0001
BATCH_SIZE = 32
REPLAY_MEMORY_SIZE = 100_000
REPLAY_MEMORY_INIT_SIZE = 1_000
UPDATE_TARGET_EVERY = 500
DISCOUNT_FACTOR = 0.99
EPSILON_START = 1.0
EPSILON_END = 0.1
EPSILON_DECAY_STEPS = 1_000_000
TRAIN_EVERY = 8

# Evaluation during training
EVAL_EVERY = 1_000        # Evaluate every N episodes
EVAL_NUM_GAMES = 100      # Games per evaluation

# Model save paths
MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")
SAVE_EVERY = 10_000       # Save checkpoint every N episodes

# Opponent pools for training
OPPONENT_POOL = ["random", "rule-v1", "noob", "casual", "pro"]
ALTRUISTIC_POOL = ["random", "rule-v1", "noob", "casual", "pro", "random-vd"]

# Selfish random seat assignment weights {num_dqn_seats: weight}
SELFISH_SEAT_WEIGHTS = {1: 10, 2: 15, 3: 45, 4: 30}

# When to start including selfish checkpoints as opponents (fraction of NUM_EPISODES)
SELFISH_CHECKPOINT_START = 0.20
