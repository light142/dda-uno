# Simulation settings

import os

# Simulation output
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")

# Default games per combination in the tier simulator
TIER_GAMES = 500

# Default output for tier simulation results
TIER_RESULTS_PATH = os.path.join(DATA_DIR, "tier_results.json")
