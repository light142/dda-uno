from simulation.bots.noob import NoobBot
from simulation.bots.casual import CasualBot
from simulation.bots.pro import ProBot


def get_bot(name: str):
    """Factory to create a bot by name.

    Args:
        name: One of "noob", "casual", "pro".

    Returns:
        Bot instance implementing BaseAgent.
    """
    bots = {
        "noob": NoobBot,
        "casual": CasualBot,
        "pro": ProBot,
    }
    if name not in bots:
        raise ValueError(f"Unknown bot: {name}. Choose from: {list(bots.keys())}")
    return bots[name]()
