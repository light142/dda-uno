"""
Player router — profile, stats, and game history.
"""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select, func, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models import User, Game
from .schemas import (
    PlayerStatsSchema,
    PlayerProfileResponse,
    GameHistoryItem,
    GameHistoryResponse,
    PaginationSchema,
)

router = APIRouter(prefix="/api/users", tags=["Users"])


# ── GET /api/users/me ────────────────────────────────────────────────────


@router.get(
    "/me",
    response_model=PlayerProfileResponse,
    summary="Get player profile and stats",
    description="Returns the authenticated user's profile with gameplay statistics.",
)
async def get_profile(user: User = Depends(get_current_user)):
    games = user.games_played or 0
    wins = user.wins or 0
    win_rate = wins / games if games > 0 else 0.0

    return PlayerProfileResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        stats=PlayerStatsSchema(
            gamesPlayed=games,
            gamesWon=wins,
            winRate=round(win_rate, 4),
            currentBotStrength=user.bot_strength,
            targetWinRate=user.target_win_rate,
        ),
    )


# ── GET /api/users/me/history ────────────────────────────────────────────


@router.get(
    "/me/history",
    response_model=GameHistoryResponse,
    summary="Get game history",
    description="Returns a paginated list of the player's past games with per-game analytics.",
)
async def get_history(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Count total games
    count_result = await db.execute(
        select(func.count(Game.id)).where(Game.user_id == user.id)
    )
    total = count_result.scalar() or 0

    # Fetch page
    offset = (page - 1) * limit
    result = await db.execute(
        select(Game)
        .where(Game.user_id == user.id)
        .order_by(Game.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    games = result.scalars().all()

    items = []
    for g in games:
        if g.status == "finished" and g.winner is not None:
            result_str = "win" if g.winner == 0 else "loss"
        else:
            result_str = None

        items.append(GameHistoryItem(
            gameId=g.id,
            status=g.status,
            result=result_str,
            botStrengthStart=g.bot_strength_start,
            botStrengthEnd=g.bot_strength_end,
            playerWinRate=g.player_win_rate_at_game,
            turns=g.turns,
            modelVersion=g.model_version,
            finishedAt=g.finished_at,
            createdAt=g.created_at,
        ))

    return GameHistoryResponse(
        games=items,
        pagination=PaginationSchema(page=page, limit=limit, total=total),
    )


# ── DELETE /api/users/me/history ─────────────────────────────────────────


@router.delete(
    "/me/history",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Clear game history and reset stats",
    description=(
        "Deletes all game records for the player and resets stats "
        "(games_played, wins, bot_strength) to defaults."
    ),
)
async def clear_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Delete all games for this user
    await db.execute(delete(Game).where(Game.user_id == user.id))

    # Reset user stats
    user.games_played = 0
    user.wins = 0
    user.bot_strength = 0.5

    await db.commit()
    return None
