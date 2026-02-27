"""Adaptive tier controller: maps player win rate to agent tier.

Replaces the legacy WinRateController (proportional float adjustment)
with a discrete tier selection system. Compares the player's current
win rate against a configurable target and deterministically selects
a tier based on the error (how far from target).
"""


class AdaptiveTierController:
    """Selects which agent tier to use based on player win rate vs target.

    All 3 bot seats use the same tier for a given game. The controller
    computes error = current_win_rate - target_win_rate and maps it to
    a tier using fixed offset bands.

    Thresholds (to be tuned with simulation data):
        error < -0.10  ->  hyper_altruistic   (below target by 10%+, max help)
        error < -0.05  ->  altruistic         (below target, moderate help)
        error < -0.02  ->  random             (slightly below, easy opponents)
        error <  0.05  ->  selfish            (near target, neutral baseline)
        error <  0.10  ->  adversarial        (above target, push back)
        error >= 0.10  ->  hyper_adversarial  (above target by 10%+, max difficulty)
    """

    # Default error bands: (upper_error_bound, tier_name)
    # Checked top-to-bottom; first matching range wins.
    # Hyper tiers trigger at +/- 10% from target.
    DEFAULT_BANDS = [
        (-0.10, "hyper_altruistic"),
        (-0.05, "altruistic"),
        (-0.02, "random"),
        ( 0.05, "selfish"),
        ( 0.10, "adversarial"),
    ]
    # Anything >= 0.10 falls through to hyper_adversarial

    DEFAULT_FALLBACK = "hyper_adversarial"
    DEFAULT_NO_HISTORY = "selfish"

    def __init__(self, target_win_rate: float = 0.25):
        """Initialize the controller.

        Args:
            target_win_rate: Desired win rate for seat 0 (0.0 to 1.0).
        """
        self.target_win_rate = target_win_rate

    def select_tier(self, current_win_rate: float, games_played: int = 0) -> str:
        """Choose the agent tier based on the player's current win rate.

        Args:
            current_win_rate: Player's accumulated win rate (0.0 to 1.0).
            games_played: Number of games played. If 0, returns neutral baseline.

        Returns:
            Tier name string (one of TIER_ORDER).
        """
        if games_played == 0:
            return self.DEFAULT_NO_HISTORY

        error = current_win_rate - self.target_win_rate

        for upper_bound, tier in self.DEFAULT_BANDS:
            if error < upper_bound:
                return tier

        return self.DEFAULT_FALLBACK
