# Simulation settings

import os

# Number of games to simulate
NUM_GAMES = 1_000

# Seat 0 bot for simulation: "noob", "casual", "pro"
SEAT0_BOT = "casual"

# Model paths (trained agent weights)
MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")
STRONG_MODEL_PATH = os.path.join(MODEL_DIR, "strong_agent.pt")
WEAK_MODEL_PATH = os.path.join(MODEL_DIR, "weak_agent.pt")

# Simulation output
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
RESULTS_PATH = os.path.join(DATA_DIR, "simulation_results.json")
