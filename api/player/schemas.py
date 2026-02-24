"""
Pydantic schemas for player profile, stats, and game history.
"""

from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field


class PlayerStatsSchema(BaseModel):
    gamesPlayed: int
    gamesWon: int
    winRate: float
    currentBotStrength: float
    targetWinRate: float

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "gamesPlayed": 42,
                    "gamesWon": 18,
                    "winRate": 0.4286,
                    "currentBotStrength": 0.63,
                    "targetWinRate": 0.50,
                }
            ]
        }
    }


class PlayerProfileResponse(BaseModel):
    id: str
    username: str
    email: str
    stats: PlayerStatsSchema

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                    "username": "PlayerOne",
                    "email": "player@example.com",
                    "stats": {
                        "gamesPlayed": 42,
                        "gamesWon": 18,
                        "winRate": 0.4286,
                        "currentBotStrength": 0.63,
                        "targetWinRate": 0.50,
                    },
                }
            ]
        }
    }


class GameHistoryItem(BaseModel):
    gameId: str
    status: str
    result: Optional[str] = Field(None, description="'win', 'loss', or null for abandoned")
    botStrengthStart: float
    botStrengthEnd: Optional[float] = None
    playerWinRate: Optional[float] = None
    turns: int
    modelVersion: Optional[str] = None
    finishedAt: Optional[datetime] = None
    createdAt: datetime

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "gameId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                    "status": "finished",
                    "result": "win",
                    "botStrengthStart": 0.55,
                    "botStrengthEnd": 0.58,
                    "playerWinRate": 0.52,
                    "turns": 23,
                    "modelVersion": "1.0.0",
                    "finishedAt": "2026-02-24T10:30:00",
                    "createdAt": "2026-02-24T10:25:00",
                }
            ]
        }
    }


class PaginationSchema(BaseModel):
    page: int
    limit: int
    total: int


class GameHistoryResponse(BaseModel):
    games: list[GameHistoryItem]
    pagination: PaginationSchema
