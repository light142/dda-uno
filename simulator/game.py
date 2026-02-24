"""UNO game engine wrapping RLCard's UNO environment.

Provides a clean interface for running UNO games with configurable agents
at each seat. Used by training, simulation, and the API layer.
"""

import rlcard
from rlcard.games.uno.game import UnoGame as RLCardUnoGame
from rlcard.utils import reorganize

from engine.config.game import NUM_PLAYERS, PLAYER_SEAT, NUM_ACTIONS, SEED


class UnoGame:
    """Wrapper around RLCard's UNO environment.

    Manages game creation, agent assignment, and game execution.
    Supports both full-game mode (training/simulation) and step-by-step
    mode (API layer where a human plays at seat 0).
    """

    def __init__(self, seed: int = SEED):
        """Create a new UNO game environment.

        Args:
            seed: Random seed for reproducibility. None for random.
        """
        config = {}
        if seed is not None:
            config['seed'] = seed

        self.env = rlcard.make('uno', config=config)

        # RLCard's UNO env ignores game_num_players config (only supported
        # for blackjack/holdem). Manually replace the game object to get
        # the correct player count.
        if NUM_PLAYERS != 2:
            self.env.game = RLCardUnoGame(num_players=NUM_PLAYERS)
            self.env.num_players = NUM_PLAYERS
            self.env.state_shape = [[4, 4, 15] for _ in range(NUM_PLAYERS)]
            self.env.action_shape = [None for _ in range(NUM_PLAYERS)]
        self._agents = None

    def set_agents(self, agents: list) -> None:
        """Assign agents to seats.

        Args:
            agents: List of agents, one per seat. Length must equal NUM_PLAYERS.
                Each agent must implement step() and eval_step() methods
                (BaseAgent interface or RLCard-compatible agent).
        """
        if len(agents) != NUM_PLAYERS:
            raise ValueError(f"Expected {NUM_PLAYERS} agents, got {len(agents)}")
        self._agents = agents
        self.env.set_agents(agents)

    def run_game(self, is_training: bool = False) -> dict:
        """Run a complete game from start to finish.

        All seats are controlled by their assigned agents (no human input).
        Used by training and simulation.

        Args:
            is_training: If True, agents use step() (with exploration).
                If False, agents use eval_step() (greedy).

        Returns:
            dict with:
                - 'winner': seat index of the winner (int)
                - 'payoffs': list of payoffs per seat
                - 'trajectories': raw trajectory data (for training)
        """
        if self._agents is None:
            raise RuntimeError("Agents not set. Call set_agents() first.")

        trajectories, payoffs = self.env.run(is_training=is_training)

        # Determine winner: seat with highest payoff
        winner = max(range(NUM_PLAYERS), key=lambda i: payoffs[i])

        return {
            'winner': winner,
            'payoffs': list(payoffs),
            'trajectories': trajectories,
        }

    def get_training_data(self, trajectories: list, payoffs: list) -> list:
        """Reorganize raw trajectories into per-agent training transitions.

        Args:
            trajectories: Raw trajectory data from run_game().
            payoffs: Payoff list from run_game().

        Returns:
            List of per-agent transition lists. Each transition is
            [state, action, reward, next_state, done].
        """
        return reorganize(trajectories, payoffs)

    def get_training_data_custom_reward(
        self, trajectories: list, payoffs: list, seat: int, reward_fn
    ) -> list:
        """Reorganize trajectories with a custom reward function.

        Used for training weak agents where the reward depends on
        whether seat 0 won, not whether the agent's own seat won.

        Args:
            trajectories: Raw trajectory data from run_game().
            payoffs: Original payoff list from run_game().
            seat: Which seat's transitions to extract.
            reward_fn: Function(payoffs, seat) -> float that computes
                the custom reward for this seat.

        Returns:
            List of transitions for the given seat with modified rewards.
        """
        custom_payoffs = list(payoffs)
        custom_payoffs[seat] = reward_fn(payoffs, seat)
        reorganized = reorganize(trajectories, custom_payoffs)
        return reorganized[seat]

    # --- Step-by-step mode for API layer (Phase 2) ---

    def start_game(self) -> dict:
        """Start a new game and return the initial state for seat 0.

        Returns:
            dict with:
                - 'state': game state for seat 0
                - 'current_player': seat index of who plays first
        """
        state, player_id = self.env.reset()
        return {
            'state': state,
            'current_player': player_id,
        }

    def player_step(self, action: int) -> dict:
        """Apply the human player's action and run all bot turns.

        Applies the player's chosen action, then automatically runs
        all bot turns until it's the player's turn again (or game ends).

        Args:
            action: Action ID chosen by the player (0-60).

        Returns:
            dict with:
                - 'bot_moves': list of {seat, action} for each bot turn
                - 'state': new game state for seat 0
                - 'current_player': seat index of next player
                - 'game_over': bool
                - 'winner': seat index if game_over, else None
                - 'payoffs': payoff list if game_over, else None
        """
        bot_moves = []

        # Apply player's action
        state, player_id = self.env.step(action)

        # Check if game ended after player's move
        if self.env.is_over():
            payoffs = self.env.get_payoffs()
            winner = max(range(NUM_PLAYERS), key=lambda i: payoffs[i])
            return {
                'bot_moves': bot_moves,
                'state': state,
                'current_player': player_id,
                'game_over': True,
                'winner': winner,
                'payoffs': list(payoffs),
            }

        # Run bot turns until it's seat 0's turn again or game ends
        while player_id != PLAYER_SEAT and not self.env.is_over():
            bot_agent = self._agents[player_id]
            bot_action, _ = bot_agent.eval_step(state)
            bot_moves.append({'seat': player_id, 'action': bot_action})
            state, player_id = self.env.step(bot_action)

        game_over = self.env.is_over()
        payoffs = list(self.env.get_payoffs()) if game_over else None
        winner = max(range(NUM_PLAYERS), key=lambda i: payoffs[i]) if game_over else None

        return {
            'bot_moves': bot_moves,
            'state': state,
            'current_player': player_id,
            'game_over': game_over,
            'winner': winner,
            'payoffs': payoffs,
        }
