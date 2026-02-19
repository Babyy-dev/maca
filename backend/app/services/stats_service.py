from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Friendship, RoundLog, User

PERIOD_VALUES = {"all", "weekly", "monthly"}
SORT_VALUES = {"win_rate", "balance", "games", "blackjacks"}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_period(period: str) -> str:
    normalized = period.strip().lower()
    return normalized if normalized in PERIOD_VALUES else "all"


def _normalize_sort(sort_by: str) -> str:
    normalized = sort_by.strip().lower()
    return normalized if normalized in SORT_VALUES else "win_rate"


def _period_start(period: str) -> datetime | None:
    normalized = _normalize_period(period)
    if normalized == "weekly":
        return _utc_now() - timedelta(days=7)
    if normalized == "monthly":
        return _utc_now() - timedelta(days=30)
    return None


def _empty_aggregate() -> dict:
    return {
        "total_games": 0,
        "wins": 0,
        "losses": 0,
        "pushes": 0,
        "blackjacks": 0,
        "win_rate": 0.0,
    }


def _compute_aggregates(rows: list[RoundLog]) -> dict[str, dict]:
    by_user: dict[str, dict] = {}
    for row in rows:
        agg = by_user.setdefault(row.user_id, _empty_aggregate())
        agg["total_games"] += 1

        result = (row.result or "").strip().lower()
        if result in {"win", "blackjack"}:
            agg["wins"] += 1
        elif result == "lose":
            agg["losses"] += 1
        elif result == "push":
            agg["pushes"] += 1

        if result == "blackjack":
            agg["blackjacks"] += 1

    for agg in by_user.values():
        total_games = max(0, int(agg["total_games"]))
        if total_games > 0:
            agg["win_rate"] = round((float(agg["wins"]) / float(total_games)) * 100.0, 2)
        else:
            agg["win_rate"] = 0.0
    return by_user


def _query_round_logs(
    db: Session,
    user_ids: list[str] | None = None,
    period: str = "all",
) -> list[RoundLog]:
    stmt = select(RoundLog)
    if user_ids is not None:
        if len(user_ids) == 0:
            return []
        stmt = stmt.where(RoundLog.user_id.in_(user_ids))

    start = _period_start(period)
    if start is not None:
        stmt = stmt.where(RoundLog.created_at >= start)

    return db.scalars(stmt).all()


def _user_stats_period(db: Session, user: User, period: str) -> dict:
    normalized_period = _normalize_period(period)
    rows = _query_round_logs(db, user_ids=[user.id], period=normalized_period)
    aggregate = _compute_aggregates(rows).get(user.id, _empty_aggregate())
    return {
        "period": normalized_period,
        "total_games": int(aggregate["total_games"]),
        "wins": int(aggregate["wins"]),
        "losses": int(aggregate["losses"]),
        "pushes": int(aggregate["pushes"]),
        "blackjacks": int(aggregate["blackjacks"]),
        "win_rate": float(aggregate["win_rate"]),
        "balance": float(user.balance),
    }


def get_user_stats_bundle(db: Session, user: User) -> dict:
    return {
        "user_id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "all_time": _user_stats_period(db, user, "all"),
        "weekly": _user_stats_period(db, user, "weekly"),
        "monthly": _user_stats_period(db, user, "monthly"),
    }


def _friend_scope_user_ids(db: Session, user_id: str) -> list[str]:
    outgoing = db.scalars(select(Friendship.friend_id).where(Friendship.user_id == user_id)).all()
    incoming = db.scalars(select(Friendship.user_id).where(Friendship.friend_id == user_id)).all()
    scoped_ids = set(outgoing) | set(incoming) | {user_id}
    return list(scoped_ids)


def _sort_entries(entries: list[dict], sort_by: str) -> list[dict]:
    normalized_sort = _normalize_sort(sort_by)

    def tie_breaker(entry: dict) -> tuple:
        return (
            float(entry["win_rate"]),
            int(entry["wins"]),
            int(entry["total_games"]),
            float(entry["balance"]),
            entry["username"].lower(),
        )

    if normalized_sort == "balance":
        entries.sort(
            key=lambda item: (
                float(item["balance"]),
                float(item["win_rate"]),
                int(item["wins"]),
                item["username"].lower(),
            ),
            reverse=True,
        )
    elif normalized_sort == "games":
        entries.sort(
            key=lambda item: (
                int(item["total_games"]),
                float(item["win_rate"]),
                float(item["balance"]),
                item["username"].lower(),
            ),
            reverse=True,
        )
    elif normalized_sort == "blackjacks":
        entries.sort(
            key=lambda item: (
                int(item["blackjacks"]),
                float(item["win_rate"]),
                int(item["total_games"]),
                item["username"].lower(),
            ),
            reverse=True,
        )
    else:
        entries.sort(key=tie_breaker, reverse=True)
    return entries


def build_leaderboard(
    db: Session,
    period: str = "all",
    sort_by: str = "win_rate",
    limit: int = 50,
    scope_user_id: str | None = None,
) -> dict:
    normalized_period = _normalize_period(period)
    normalized_sort = _normalize_sort(sort_by)
    clamped_limit = max(1, min(200, int(limit)))

    if scope_user_id:
        user_ids = _friend_scope_user_ids(db, scope_user_id)
        scope = "friends"
        users = db.scalars(select(User).where(User.id.in_(user_ids))).all() if user_ids else []
    else:
        scope = "global"
        users = db.scalars(select(User)).all()

    if len(users) == 0:
        return {
            "scope": scope,
            "period": normalized_period,
            "sort_by": normalized_sort,
            "generated_at": _utc_now(),
            "entries": [],
        }

    user_ids = [user.id for user in users]
    rows = _query_round_logs(db, user_ids=user_ids, period=normalized_period)
    aggregates = _compute_aggregates(rows)

    entries: list[dict] = []
    for user in users:
        aggregate = aggregates.get(user.id, _empty_aggregate())
        entries.append(
            {
                "rank": 0,
                "user_id": user.id,
                "username": user.username,
                "display_name": user.display_name,
                "avatar_url": user.avatar_url,
                "balance": float(user.balance),
                "total_games": int(aggregate["total_games"]),
                "wins": int(aggregate["wins"]),
                "losses": int(aggregate["losses"]),
                "pushes": int(aggregate["pushes"]),
                "blackjacks": int(aggregate["blackjacks"]),
                "win_rate": float(aggregate["win_rate"]),
            }
        )

    ranked = _sort_entries(entries, normalized_sort)[:clamped_limit]
    for index, entry in enumerate(ranked, start=1):
        entry["rank"] = index

    return {
        "scope": scope,
        "period": normalized_period,
        "sort_by": normalized_sort,
        "generated_at": _utc_now(),
        "entries": ranked,
    }
