# Core game settings

# Number of players in each UNO game (1 human/simulated + 3 bots)
NUM_PLAYERS = 4

# Seat assignment: seat 0 is always the player (human or simulated)
PLAYER_SEAT = 0
BOT_SEATS = [1, 2, 3]

# RLCard UNO environment constants
NUM_ACTIONS = 61          # Total action space (52 card plays + draw + wilds)
STATE_SHAPE = [4, 4, 15]  # Observation tensor shape per player

# Random seed (None for random, set int for reproducibility)
SEED = None
