import asyncio
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
import re
import shlex
from urllib.parse import parse_qs
from uuid import uuid4

import socketio
from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import decode_access_token_payload
from app.db.models import User
from app.db.session import SessionLocal
from app.schemas.lobby import TableCreateRequest
from app.services.admin_service import (
    adjust_user_balance,
    has_role_at_least,
    normalize_role,
    set_user_role,
    write_audit_log,
)
from app.services.auth_service import get_active_user_session_by_id, get_user_by_email
from app.services.lobby_service import LobbyTable, lobby_service
from app.services.profanity_service import MAX_CHAT_MESSAGE_LENGTH, sanitize_chat_message
from app.services.rate_limit_service import rate_limit_service

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

settings = get_settings()
TURN_SECONDS = max(5, settings.multiplayer_turn_seconds)
TIMER_TICK_SECONDS = max(0.5, settings.multiplayer_timer_tick_seconds)
RECONNECT_GRACE_SECONDS = max(5, settings.multiplayer_reconnect_grace_seconds)
MAX_ACTION_LOG_ITEMS = 80
MAX_ACTION_IDS_PER_TABLE = 300
MAX_CHAT_HISTORY_ITEMS = 120
MAX_REACTION_EMOJI_LENGTH = 16
REACTION_RATE_LIMIT_SECONDS = 0.3
MUTE_DEFAULT_SECONDS = 300
MUTE_MAX_SECONDS = 60 * 60 * 6
MAX_ADMIN_COMMAND_LENGTH = 500
MAX_ACTION_ID_LENGTH = 64
ACTION_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


@dataclass
class ConnectionIdentity:
    user_id: str
    username: str
    role: str


@dataclass
class TableTurnState:
    table_id: str
    players: list[str]
    turn_index: int
    turn_seconds: int
    turn_deadline: datetime
    status: str = "active"
    hand_number: int = 1
    last_action: dict | None = None
    action_log: list[dict] = field(default_factory=list)
    processed_action_ids: dict[str, datetime] = field(default_factory=dict)
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class ChatMessage:
    id: str
    table_id: str
    user_id: str
    username: str
    message: str
    filtered: bool
    created_at: datetime


_sid_to_identity: dict[str, ConnectionIdentity] = {}
_user_to_sids: dict[str, set[str]] = {}
_table_ready: dict[str, set[str]] = {}
_table_turn_states: dict[str, TableTurnState] = {}
_reconnect_deadlines: dict[str, datetime] = {}
_sid_spectator_table: dict[str, str] = {}
_table_spectators: dict[str, set[str]] = {}
_table_chat_messages: dict[str, list[ChatMessage]] = {}
_table_chat_muted_until: dict[str, dict[str, datetime]] = {}
_table_chat_banned: dict[str, set[str]] = {}
_sid_last_reaction_at: dict[str, datetime] = {}
_sid_client_ip: dict[str, str] = {}
_locked_tables: set[str] = set()
_turn_timer_task: asyncio.Task | None = None


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _table_room(table_id: str) -> str:
    return f"table:{table_id}"


def _next_deadline(seconds: int) -> datetime:
    return _utc_now() + timedelta(seconds=seconds)


def _session_string(session: dict, key: str) -> str:
    value = session.get(key)
    return value.strip() if isinstance(value, str) else ""


def _serialize_chat_message(entry: ChatMessage) -> dict:
    return {
        "id": entry.id,
        "table_id": entry.table_id,
        "user_id": entry.user_id,
        "username": entry.username,
        "message": entry.message,
        "filtered": entry.filtered,
        "created_at": entry.created_at.isoformat(),
    }


def _table_message_list(table_id: str) -> list[ChatMessage]:
    return _table_chat_messages.setdefault(table_id, [])


def _table_chat_membership_table_ids(session: dict) -> set[str]:
    ids = {
        _session_string(session, "table_id"),
        _session_string(session, "spectator_table_id"),
    }
    return {value for value in ids if value}


def _is_user_muted(table_id: str, user_id: str) -> tuple[bool, int]:
    table_muted = _table_chat_muted_until.get(table_id, {})
    mute_until = table_muted.get(user_id)
    if not mute_until:
        return False, 0
    now = _utc_now()
    if now >= mute_until:
        table_muted.pop(user_id, None)
        if len(table_muted) == 0:
            _table_chat_muted_until.pop(table_id, None)
        return False, 0
    remaining = int((mute_until - now).total_seconds() + 0.999)
    return True, max(1, remaining)


def _is_user_banned(table_id: str, user_id: str) -> bool:
    return user_id in _table_chat_banned.get(table_id, set())


def _is_user_chat_blocked(table_id: str, user_id: str) -> tuple[bool, str]:
    if _is_user_banned(table_id, user_id):
        return True, "banned"
    muted, remaining = _is_user_muted(table_id, user_id)
    if muted:
        return True, f"muted for {remaining}s"
    return False, ""


def _resolve_target_table_id_for_interaction(
    session: dict,
    payload_table_id: str | None = None,
) -> str:
    candidate_ids = _table_chat_membership_table_ids(session)
    requested = payload_table_id.strip() if isinstance(payload_table_id, str) else ""
    if requested and requested in candidate_ids:
        return requested
    participant_table_id = _session_string(session, "table_id")
    if participant_table_id:
        return participant_table_id
    spectator_table_id = _session_string(session, "spectator_table_id")
    if spectator_table_id:
        return spectator_table_id
    return ""


def _can_manage_table(identity: ConnectionIdentity, table: LobbyTable | None) -> bool:
    return bool(
        table
        and (
            table.owner_id == identity.user_id
            or has_role_at_least(identity.role, "mod")
        )
    )


def _remove_table_social_state(table_id: str) -> None:
    _table_chat_messages.pop(table_id, None)
    _table_chat_muted_until.pop(table_id, None)
    _table_chat_banned.pop(table_id, None)
    _locked_tables.discard(table_id)


def _extract_client_ip_from_environ(environ: dict) -> str:
    forwarded_for = environ.get("HTTP_X_FORWARDED_FOR", "")
    if isinstance(forwarded_for, str) and forwarded_for.strip():
        return forwarded_for.split(",")[0].strip()
    real_ip = environ.get("HTTP_X_REAL_IP", "")
    if isinstance(real_ip, str) and real_ip.strip():
        return real_ip.strip()
    remote = environ.get("REMOTE_ADDR", "")
    if isinstance(remote, str) and remote.strip():
        return remote.strip()
    return "unknown"


def _extract_user_agent_from_environ(environ: dict) -> str:
    user_agent = environ.get("HTTP_USER_AGENT", "")
    return user_agent.strip()[:500] if isinstance(user_agent, str) else ""


def _socket_rate_limit_key(scope: str, identifier: str) -> str:
    safe_identifier = identifier or "unknown"
    return f"ws:{scope}:{safe_identifier}"


def _is_socket_connect_allowed(client_ip: str) -> bool:
    if not settings.rate_limit_enabled:
        return True
    decision = rate_limit_service.check(
        _socket_rate_limit_key("connect", client_ip),
        limit=settings.websocket_connect_limit,
        window_seconds=settings.websocket_connect_window_seconds,
    )
    return decision.allowed


def _is_socket_event_allowed(sid: str, event_name: str) -> bool:
    if not settings.rate_limit_enabled:
        return True
    identity = _sid_to_identity.get(sid)
    if not identity:
        return False
    decision = rate_limit_service.check(
        _socket_rate_limit_key(f"event:{event_name}", identity.user_id),
        limit=settings.websocket_event_limit,
        window_seconds=settings.websocket_event_window_seconds,
    )
    return decision.allowed


async def _socket_rate_limited_payload(sid: str, event_name: str) -> dict:
    payload = {"ok": False, "error": "rate limit exceeded"}
    await sio.emit(
        "rate_limited",
        {"event": event_name, "message": "Too many requests. Slow down."},
        room=sid,
    )
    return payload


def _is_valid_action_id(action_id: str | None) -> bool:
    if action_id is None:
        return True
    normalized = action_id.strip()
    if not normalized:
        return False
    if len(normalized) > MAX_ACTION_ID_LENGTH:
        return False
    return bool(ACTION_ID_PATTERN.match(normalized))


def _resolve_token(auth: dict | None, environ: dict) -> str | None:
    token = auth.get("token") if isinstance(auth, dict) else None
    if (
        not token
        and settings.websocket_allow_query_token
        and not settings.websocket_require_auth_payload_token
    ):
        query_token = parse_qs(environ.get("QUERY_STRING", "")).get("token", [None])[0]
        token = query_token
    if settings.websocket_require_auth_payload_token and not token:
        return None
    if isinstance(token, str) and token.lower().startswith("bearer "):
        token = token.split(" ", 1)[1]
    return token if isinstance(token, str) and token.strip() else None


def _load_identity_from_token(token: str | None) -> tuple[ConnectionIdentity | None, str | None]:
    if not token:
        return None, None
    payload = decode_access_token_payload(token)
    if not payload:
        return None, None
    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject.strip():
        return None, None
    session_id = payload.get("sid")
    if session_id is not None and not isinstance(session_id, str):
        return None, None

    db = SessionLocal()
    try:
        user = get_user_by_email(db, subject)
        if not user:
            return None, None

        if settings.security_track_sessions:
            if not isinstance(session_id, str) or not session_id.strip():
                return None, None
            active_session = get_active_user_session_by_id(
                db,
                user_id=user.id,
                session_id=session_id.strip(),
            )
            if not active_session:
                return None, None

        return ConnectionIdentity(
            user_id=user.id,
            username=user.username,
            role=normalize_role(getattr(user, "role", "player")),
        ), session_id.strip() if isinstance(session_id, str) else None
    finally:
        db.close()


def _current_turn_user_id(state: TableTurnState) -> str | None:
    if state.status != "active" or len(state.players) == 0:
        return None
    index = state.turn_index % len(state.players)
    return state.players[index]


def _remaining_seconds(deadline: datetime) -> int:
    return max(0, int((deadline - _utc_now()).total_seconds() + 0.999))


def _record_turn_action(
    state: TableTurnState,
    action: str,
    user_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    entry = {
        "user_id": user_id,
        "action": action,
        "at": _utc_now().isoformat(),
    }
    if metadata:
        entry["meta"] = metadata
    state.last_action = entry
    state.action_log.append(entry)
    if len(state.action_log) > MAX_ACTION_LOG_ITEMS:
        state.action_log = state.action_log[-MAX_ACTION_LOG_ITEMS:]
    state.updated_at = _utc_now()


def _track_turn_action_id(state: TableTurnState, action_id: str | None) -> bool:
    if action_id is None:
        return False
    normalized = action_id.strip()
    if not normalized:
        return False
    if normalized in state.processed_action_ids:
        return True
    state.processed_action_ids[normalized] = _utc_now()
    if len(state.processed_action_ids) > MAX_ACTION_IDS_PER_TABLE:
        oldest = next(iter(state.processed_action_ids))
        state.processed_action_ids.pop(oldest, None)
    return False


def _serialize_turn_state(state: TableTurnState) -> dict:
    return {
        "table_id": state.table_id,
        "status": state.status,
        "players": state.players,
        "turn_index": state.turn_index if state.status == "active" else None,
        "current_turn_user_id": _current_turn_user_id(state),
        "turn_seconds": state.turn_seconds,
        "turn_deadline": state.turn_deadline.isoformat() if state.status == "active" else None,
        "turn_remaining_seconds": _remaining_seconds(state.turn_deadline)
        if state.status == "active"
        else 0,
        "hand_number": state.hand_number,
        "last_action": state.last_action,
        "action_count": len(state.action_log),
        "started_at": state.started_at.isoformat(),
        "updated_at": state.updated_at.isoformat(),
    }


def _idle_turn_state_payload(table_id: str) -> dict:
    return {
        "table_id": table_id,
        "status": "idle",
        "players": [],
        "turn_index": None,
        "current_turn_user_id": None,
        "turn_seconds": TURN_SECONDS,
        "turn_deadline": None,
        "turn_remaining_seconds": 0,
        "hand_number": 0,
        "last_action": None,
        "action_count": 0,
    }


def _serialize_table(table: LobbyTable) -> dict:
    payload = asdict(table)
    players = payload["players"]
    ready_players = [player_id for player_id in players if player_id in _table_ready.get(table.id, set())]
    online_players = [player_id for player_id in players if player_id in _user_to_sids]
    turn_state = _table_turn_states.get(table.id)
    has_active_turn = bool(turn_state and turn_state.status == "active")

    payload["ready_players"] = ready_players
    payload["online_players"] = online_players
    payload["is_ready_to_start"] = (
        len(players) >= 2
        and all(player_id in _table_ready.get(table.id, set()) for player_id in players)
        and not has_active_turn
    )
    payload["has_active_turn"] = has_active_turn
    payload["spectator_count"] = len(_table_spectators.get(table.id, set()))
    payload["is_locked"] = table.id in _locked_tables
    payload["current_turn_user_id"] = _current_turn_user_id(turn_state) if turn_state else None
    payload["turn_deadline"] = turn_state.turn_deadline.isoformat() if has_active_turn else None
    payload["turn_remaining_seconds"] = (
        _remaining_seconds(turn_state.turn_deadline) if has_active_turn else None
    )
    return payload


def _register_presence(sid: str, identity: ConnectionIdentity) -> None:
    _sid_to_identity[sid] = identity
    _user_to_sids.setdefault(identity.user_id, set()).add(sid)


def _unregister_presence(sid: str) -> ConnectionIdentity | None:
    identity = _sid_to_identity.pop(sid, None)
    if not identity:
        return None
    user_sids = _user_to_sids.get(identity.user_id)
    if user_sids:
        user_sids.discard(sid)
        if len(user_sids) == 0:
            _user_to_sids.pop(identity.user_id, None)
    return identity


def _clear_user_ready(user_id: str) -> list[str]:
    touched_table_ids: list[str] = []
    for table_id, ready_players in list(_table_ready.items()):
        if user_id in ready_players:
            ready_players.discard(user_id)
            touched_table_ids.append(table_id)
        if len(ready_players) == 0:
            _table_ready.pop(table_id, None)
    return touched_table_ids


def _can_user_spectate_table(user_id: str, table: LobbyTable) -> bool:
    return (not table.is_private) or (user_id in table.players)


def _rebuild_table_spectators(table_id: str) -> None:
    spectator_user_ids: set[str] = set()
    for sid, spectator_table_id in _sid_spectator_table.items():
        if spectator_table_id != table_id:
            continue
        identity = _sid_to_identity.get(sid)
        if identity:
            spectator_user_ids.add(identity.user_id)

    if spectator_user_ids:
        _table_spectators[table_id] = spectator_user_ids
    else:
        _table_spectators.pop(table_id, None)


async def _set_sid_spectator_table(sid: str, table_id: str | None) -> str | None:
    previous_table_id = _sid_spectator_table.get(sid)
    if previous_table_id and previous_table_id != table_id:
        await sio.leave_room(sid, _table_room(previous_table_id))
        _sid_spectator_table.pop(sid, None)
        _rebuild_table_spectators(previous_table_id)

    if table_id:
        await sio.enter_room(sid, _table_room(table_id))
        _sid_spectator_table[sid] = table_id
        _rebuild_table_spectators(table_id)
    elif previous_table_id:
        _sid_spectator_table.pop(sid, None)
        _rebuild_table_spectators(previous_table_id)

    try:
        session = await sio.get_session(sid)
    except KeyError:
        return previous_table_id
    session["spectator_table_id"] = table_id
    await sio.save_session(sid, session)
    return previous_table_id


async def _clear_all_spectators_for_table(table_id: str) -> None:
    spectator_sids = [
        sid for sid, spectator_table_id in _sid_spectator_table.items() if spectator_table_id == table_id
    ]
    for sid in spectator_sids:
        await _set_sid_spectator_table(sid, None)
        await sio.emit("spectator_left", {"table_id": table_id}, room=sid)
    _table_spectators.pop(table_id, None)


def _set_reconnect_deadline(user_id: str) -> None:
    _reconnect_deadlines[user_id] = _next_deadline(RECONNECT_GRACE_SECONDS)


def _clear_reconnect_deadline(user_id: str) -> None:
    _reconnect_deadlines.pop(user_id, None)


def _start_table_game(table: LobbyTable) -> TableTurnState | None:
    if len(table.players) < 2:
        return None
    state = TableTurnState(
        table_id=table.id,
        players=list(table.players),
        turn_index=0,
        turn_seconds=TURN_SECONDS,
        turn_deadline=_next_deadline(TURN_SECONDS),
        hand_number=1,
    )
    _record_turn_action(state, action="table_game_started", metadata={"players": len(table.players)})
    _table_turn_states[table.id] = state
    _table_ready.pop(table.id, None)
    return state


def _advance_turn(state: TableTurnState) -> bool:
    if len(state.players) < 2:
        state.status = "ended"
        state.updated_at = _utc_now()
        return False
    state.turn_index = (state.turn_index + 1) % len(state.players)
    state.turn_deadline = _next_deadline(state.turn_seconds)
    state.updated_at = _utc_now()
    return True


async def _emit_lobby_snapshot_for_sid(sid: str) -> None:
    identity = _sid_to_identity.get(sid)
    if not identity:
        return
    tables = lobby_service.visible_tables_for_user(identity.user_id)
    await sio.emit(
        "lobby_snapshot",
        {
            "tables": [_serialize_table(table) for table in tables],
            "online_users": len(_user_to_sids),
        },
        room=sid,
    )


async def _broadcast_lobby_snapshots() -> None:
    for sid in list(_sid_to_identity):
        await _emit_lobby_snapshot_for_sid(sid)


async def _emit_table_game_state(table_id: str) -> None:
    state = _table_turn_states.get(table_id)
    payload = _serialize_turn_state(state) if state else _idle_turn_state_payload(table_id)
    await sio.emit("table_game_state", payload, room=_table_room(table_id))


async def _emit_table_chat_history(sid: str, table_id: str) -> None:
    entries = _table_chat_messages.get(table_id, [])
    await sio.emit(
        "table_chat_history",
        {
            "table_id": table_id,
            "messages": [_serialize_chat_message(entry) for entry in entries],
        },
        room=sid,
    )


def _append_chat_message(entry: ChatMessage) -> None:
    messages = _table_message_list(entry.table_id)
    messages.append(entry)
    if len(messages) > MAX_CHAT_HISTORY_ITEMS:
        _table_chat_messages[entry.table_id] = messages[-MAX_CHAT_HISTORY_ITEMS:]


async def _emit_table_moderation_state(table_id: str) -> None:
    now = _utc_now()
    muted_entries: dict[str, int] = {}
    for user_id, mute_until in list(_table_chat_muted_until.get(table_id, {}).items()):
        if now >= mute_until:
            _table_chat_muted_until[table_id].pop(user_id, None)
            continue
        muted_entries[user_id] = int((mute_until - now).total_seconds() + 0.999)

    if table_id in _table_chat_muted_until and len(_table_chat_muted_until[table_id]) == 0:
        _table_chat_muted_until.pop(table_id, None)

    await sio.emit(
        "table_moderation_updated",
        {
            "table_id": table_id,
            "muted_users": muted_entries,
            "banned_users": sorted(list(_table_chat_banned.get(table_id, set()))),
        },
        room=_table_room(table_id),
    )


async def _remove_user_from_table_for_moderation(table_id: str, user_id: str) -> None:
    table = lobby_service.get_table(table_id)
    if not table or user_id not in table.players:
        return

    lobby_service.leave_table(table_id, user_id)
    _clear_user_ready(user_id)
    await _handle_player_removed_from_turn_state(table_id, user_id)

    for sid, identity in list(_sid_to_identity.items()):
        if identity.user_id != user_id:
            continue
        try:
            session = await sio.get_session(sid)
        except KeyError:
            continue

        if _session_string(session, "table_id") == table_id:
            await sio.leave_room(sid, _table_room(table_id))
            session["table_id"] = None
            await sio.save_session(sid, session)
            await sio.emit("table_left", {"table_id": table_id}, room=sid)

        if _sid_spectator_table.get(sid) == table_id:
            await _set_sid_spectator_table(sid, None)
            await sio.emit("spectator_left", {"table_id": table_id}, room=sid)


async def _stop_table_game(table_id: str, reason: str) -> None:
    if table_id not in _table_turn_states:
        return
    _table_turn_states.pop(table_id, None)
    await sio.emit("table_game_ended", {"table_id": table_id, "reason": reason}, room=_table_room(table_id))
    await _emit_table_game_state(table_id)


async def _handle_player_removed_from_turn_state(table_id: str, user_id: str) -> None:
    state = _table_turn_states.get(table_id)
    if not state or user_id not in state.players:
        return

    removed_index = state.players.index(user_id)
    state.players.pop(removed_index)
    _record_turn_action(
        state,
        action="player_left_turn_cycle",
        user_id=user_id,
        metadata={"table_id": table_id},
    )

    if len(state.players) < 2:
        await _stop_table_game(table_id, reason="not_enough_players")
        return

    if removed_index < state.turn_index:
        state.turn_index -= 1
    elif removed_index == state.turn_index:
        if state.turn_index >= len(state.players):
            state.turn_index = 0
        state.turn_deadline = _next_deadline(state.turn_seconds)
        await sio.emit(
            "turn_skipped",
            {"table_id": table_id, "user_id": user_id, "reason": "player_left"},
            room=_table_room(table_id),
        )

    state.turn_index %= len(state.players)
    state.updated_at = _utc_now()
    await _emit_table_game_state(table_id)


async def _emit_table_snapshot(table_id: str) -> None:
    table = lobby_service.get_table(table_id)
    if not table:
        _table_ready.pop(table_id, None)
        _remove_table_social_state(table_id)
        await _clear_all_spectators_for_table(table_id)
        await _stop_table_game(table_id, reason="table_closed")
        await sio.emit("table_closed", {"table_id": table_id}, room=_table_room(table_id))
        return
    await sio.emit("table_snapshot", _serialize_table(table), room=_table_room(table_id))


async def _attach_sid_to_table_room(sid: str, table_id: str | None) -> str | None:
    try:
        session = await sio.get_session(sid)
    except KeyError:
        return None

    previous_table_id = session.get("table_id")
    if previous_table_id and previous_table_id != table_id:
        await sio.leave_room(sid, _table_room(previous_table_id))

    if table_id:
        await sio.enter_room(sid, _table_room(table_id))
    session["table_id"] = table_id
    await sio.save_session(sid, session)
    return previous_table_id


async def _restore_sid_table_membership(sid: str, user_id: str) -> str | None:
    table_ids = lobby_service.table_ids_for_user(user_id)
    restored_table_id = table_ids[0] if table_ids else None
    await _attach_sid_to_table_room(sid, restored_table_id)
    return restored_table_id


async def _evict_offline_user(user_id: str) -> None:
    touched_table_ids = set(_clear_user_ready(user_id))
    table_ids = set(lobby_service.table_ids_for_user(user_id))

    for table_id in table_ids:
        lobby_service.leave_table(table_id, user_id)
        touched_table_ids.add(table_id)
        await _handle_player_removed_from_turn_state(table_id, user_id)
        await sio.emit(
            "player_auto_removed",
            {
                "table_id": table_id,
                "user_id": user_id,
                "reason": "disconnect_grace_expired",
            },
            room=_table_room(table_id),
        )

    for table_id in touched_table_ids:
        await _emit_table_snapshot(table_id)
        await _emit_table_game_state(table_id)

    await _broadcast_lobby_snapshots()


async def _process_reconnect_deadlines() -> None:
    now = _utc_now()
    expired_user_ids = [
        user_id
        for user_id, deadline in _reconnect_deadlines.items()
        if now >= deadline and user_id not in _user_to_sids
    ]
    for user_id in expired_user_ids:
        _reconnect_deadlines.pop(user_id, None)
        await _evict_offline_user(user_id)


async def _process_turn_timeouts() -> None:
    now = _utc_now()
    for table_id, state in list(_table_turn_states.items()):
        table = lobby_service.get_table(table_id)
        if not table or len(table.players) < 2 or len(state.players) < 2:
            await _stop_table_game(table_id, reason="not_enough_players")
            continue
        if state.status != "active" or now < state.turn_deadline:
            continue

        safety = 0
        while state.status == "active" and _utc_now() >= state.turn_deadline and safety < 8:
            timed_out_user = _current_turn_user_id(state)
            if not timed_out_user:
                break
            _record_turn_action(state, action="turn_timeout_auto_pass", user_id=timed_out_user)
            advanced = _advance_turn(state)
            await sio.emit(
                "turn_timeout",
                {"table_id": table_id, "user_id": timed_out_user},
                room=_table_room(table_id),
            )
            if not advanced:
                await _stop_table_game(table_id, reason="not_enough_players")
                break
            await _emit_table_game_state(table_id)
            safety += 1


async def _turn_timer_loop() -> None:
    while True:
        await asyncio.sleep(TIMER_TICK_SECONDS)
        try:
            await _process_reconnect_deadlines()
            await _process_turn_timeouts()
        except Exception:
            continue


def _ensure_turn_timer_task() -> None:
    global _turn_timer_task
    if _turn_timer_task and not _turn_timer_task.done():
        return
    _turn_timer_task = sio.start_background_task(_turn_timer_loop)


def _resolve_user_reference(db, user_ref: str) -> User | None:
    normalized = user_ref.strip()
    if not normalized:
        return None
    by_id = db.scalar(select(User).where(User.id == normalized))
    if by_id:
        return by_id
    return db.scalar(select(User).where(User.username == normalized))


def _resolve_table_for_target_user(target_user_id: str, explicit_table_id: str | None = None) -> str:
    table_id = explicit_table_id.strip() if isinstance(explicit_table_id, str) else ""
    if table_id:
        return table_id
    table_ids = lobby_service.table_ids_for_user(target_user_id)
    return table_ids[0] if table_ids else ""


async def _emit_admin_moderation_notice(table_id: str, payload: dict, target_user_id: str) -> None:
    await sio.emit("table_moderation_notice", payload, room=_table_room(table_id))
    for user_sid, user_identity in list(_sid_to_identity.items()):
        if user_identity.user_id != target_user_id:
            continue
        await sio.emit("table_moderation_notice", payload, room=user_sid)


async def _execute_admin_command(identity: ConnectionIdentity, command_text: str) -> dict:
    normalized_command = command_text.strip()
    if not normalized_command:
        return {"ok": False, "message": "command is required"}
    if len(normalized_command) > MAX_ADMIN_COMMAND_LENGTH:
        return {"ok": False, "message": "command is too long"}

    try:
        tokens = shlex.split(normalized_command)
    except ValueError:
        return {"ok": False, "message": "invalid command syntax"}

    if len(tokens) == 0:
        return {"ok": False, "message": "command is required"}

    command_name = tokens[0].lstrip("/").strip().lower()
    args = tokens[1:]
    aliases = {
        "lock": "lock_table",
        "unlock": "unlock_table",
        "end_round": "end_table_round",
    }
    command_name = aliases.get(command_name, command_name)

    command_min_role = {
        "kick": "mod",
        "mute": "mod",
        "unmute": "mod",
        "ban": "mod",
        "unban": "mod",
        "spectate": "mod",
        "lock_table": "admin",
        "unlock_table": "admin",
        "end_table_round": "admin",
        "close_table": "admin",
        "add_balance": "admin",
        "remove_balance": "admin",
        "set_balance": "super",
        "set_role": "super",
    }

    minimum_role = command_min_role.get(command_name)
    if not minimum_role:
        result = {"ok": False, "message": "unknown admin command"}
        db = SessionLocal()
        try:
            write_audit_log(
                db,
                actor_user_id=identity.user_id,
                actor_role=identity.role,
                command_text=normalized_command,
                status="error",
                message=result["message"],
            )
        finally:
            db.close()
        return result

    if not has_role_at_least(identity.role, minimum_role):
        result = {"ok": False, "message": f"requires {minimum_role} role"}
        db = SessionLocal()
        try:
            write_audit_log(
                db,
                actor_user_id=identity.user_id,
                actor_role=identity.role,
                command_text=normalized_command,
                status="error",
                message=result["message"],
            )
        finally:
            db.close()
        return result

    status = "success"
    message = "command executed"
    data: dict = {}
    target_user_id: str | None = None
    target_table_id: str | None = None

    try:
        if command_name == "kick":
            if len(args) < 1:
                raise ValueError("usage: /kick <user_id_or_username> [table_id]")
            db = SessionLocal()
            try:
                target_user = _resolve_user_reference(db, args[0])
                target_user_id_value = target_user.id if target_user else ""
                target_username_value = target_user.username if target_user else ""
            finally:
                db.close()
            if not target_user:
                raise ValueError("target user not found")

            table_id = _resolve_table_for_target_user(
                target_user_id_value,
                args[1] if len(args) > 1 else None,
            )
            if not table_id or not lobby_service.get_table(table_id):
                raise ValueError("table not found for target user")

            target_user_id = target_user_id_value
            target_table_id = table_id
            await _remove_user_from_table_for_moderation(table_id, target_user_id_value)
            await _emit_table_snapshot(table_id)
            await _emit_table_game_state(table_id)
            await _broadcast_lobby_snapshots()
            message = f"kicked {target_username_value} from table {table_id}"

        elif command_name in {"mute", "unmute", "ban", "unban"}:
            if len(args) < 1:
                raise ValueError(
                    f"usage: /{command_name} <user_id_or_username>"
                    + (" [seconds] [table_id]" if command_name == "mute" else " [table_id]")
                )

            db = SessionLocal()
            try:
                target_user = _resolve_user_reference(db, args[0])
                target_user_id_value = target_user.id if target_user else ""
                target_username_value = target_user.username if target_user else ""
            finally:
                db.close()
            if not target_user:
                raise ValueError("target user not found")

            duration_seconds = MUTE_DEFAULT_SECONDS
            table_arg: str | None = None
            if command_name == "mute":
                if len(args) >= 2:
                    try:
                        duration_seconds = int(args[1])
                        if len(args) >= 3:
                            table_arg = args[2]
                    except ValueError:
                        table_arg = args[1]
            elif len(args) >= 2:
                table_arg = args[1]

            table_id = _resolve_table_for_target_user(target_user_id_value, table_arg)
            if not table_id or not lobby_service.get_table(table_id):
                raise ValueError("table not found for target user")

            target_user_id = target_user_id_value
            target_table_id = table_id
            if command_name == "mute":
                bounded_seconds = max(10, min(MUTE_MAX_SECONDS, duration_seconds))
                mute_until = _next_deadline(bounded_seconds)
                _table_chat_muted_until.setdefault(table_id, {})[target_user_id_value] = mute_until
                data["duration_seconds"] = bounded_seconds
            elif command_name == "unmute":
                _table_chat_muted_until.get(table_id, {}).pop(target_user_id_value, None)
                if table_id in _table_chat_muted_until and len(_table_chat_muted_until[table_id]) == 0:
                    _table_chat_muted_until.pop(table_id, None)
            elif command_name == "ban":
                _table_chat_banned.setdefault(table_id, set()).add(target_user_id_value)
                _table_chat_muted_until.get(table_id, {}).pop(target_user_id_value, None)
                await _remove_user_from_table_for_moderation(table_id, target_user_id_value)
            else:
                _table_chat_banned.get(table_id, set()).discard(target_user_id_value)
                if table_id in _table_chat_banned and len(_table_chat_banned[table_id]) == 0:
                    _table_chat_banned.pop(table_id, None)

            payload = {
                "table_id": table_id,
                "action": command_name,
                "target_user_id": target_user_id_value,
                "actor_user_id": identity.user_id,
                "at": _utc_now().isoformat(),
                "details": data,
            }
            await _emit_admin_moderation_notice(table_id, payload, target_user_id_value)
            await _emit_table_snapshot(table_id)
            await _emit_table_game_state(table_id)
            await _emit_table_moderation_state(table_id)
            await _broadcast_lobby_snapshots()
            message = f"{command_name} applied to {target_username_value} on table {table_id}"

        elif command_name == "spectate":
            if len(args) < 1:
                raise ValueError("usage: /spectate <table_id>")
            table_id = args[0].strip()
            table = lobby_service.get_table(table_id)
            if not table:
                raise ValueError("table not found")

            target_table_id = table_id
            actor_sids = [
                user_sid
                for user_sid, sid_identity in _sid_to_identity.items()
                if sid_identity.user_id == identity.user_id
            ]
            if len(actor_sids) == 0:
                raise ValueError("no active connection found for actor")

            for user_sid in actor_sids:
                await _set_sid_spectator_table(user_sid, table_id)
                await sio.emit(
                    "spectator_joined",
                    {"table_id": table_id, "mode": "spectator"},
                    room=user_sid,
                )
                await _emit_table_snapshot(table_id)
                await _emit_table_game_state(table_id)
                await _emit_table_chat_history(user_sid, table_id)
                await _emit_table_moderation_state(table_id)
            await _broadcast_lobby_snapshots()
            message = f"moved admin session to spectate table {table_id}"

        elif command_name in {"lock_table", "unlock_table"}:
            if len(args) < 1:
                raise ValueError(f"usage: /{command_name} <table_id>")
            table_id = args[0].strip()
            if not table_id or not lobby_service.get_table(table_id):
                raise ValueError("table not found")
            target_table_id = table_id

            if command_name == "lock_table":
                _locked_tables.add(table_id)
                message = f"table {table_id} locked"
            else:
                _locked_tables.discard(table_id)
                message = f"table {table_id} unlocked"
            await _emit_table_snapshot(table_id)
            await _broadcast_lobby_snapshots()

        elif command_name == "end_table_round":
            if len(args) < 1:
                raise ValueError("usage: /end_round <table_id>")
            table_id = args[0].strip()
            if not table_id or not lobby_service.get_table(table_id):
                raise ValueError("table not found")
            target_table_id = table_id

            await _stop_table_game(table_id, reason="admin_ended_round")
            await _emit_table_snapshot(table_id)
            await _emit_table_game_state(table_id)
            await _broadcast_lobby_snapshots()
            message = f"ended active round for table {table_id}"

        elif command_name == "close_table":
            if len(args) < 1:
                raise ValueError("usage: /close_table <table_id>")
            table_id = args[0].strip()
            target_table_id = table_id
            closed = lobby_service.close_table(table_id)
            if not closed:
                raise ValueError("table not found")
            await _emit_table_snapshot(table_id)
            await _broadcast_lobby_snapshots()
            message = f"closed table {table_id}"

        elif command_name in {"add_balance", "remove_balance", "set_balance"}:
            if len(args) < 2:
                raise ValueError(f"usage: /{command_name} <user_id_or_username> <amount>")
            amount = float(args[1])
            if command_name in {"add_balance", "remove_balance"} and amount <= 0:
                raise ValueError("amount must be greater than 0")
            if command_name == "set_balance" and amount < 0:
                raise ValueError("amount cannot be negative")

            db = SessionLocal()
            try:
                target_user = _resolve_user_reference(db, args[0])
                if not target_user:
                    raise ValueError("target user not found")

                mode = (
                    "add"
                    if command_name == "add_balance"
                    else "remove"
                    if command_name == "remove_balance"
                    else "set"
                )
                updated_user = adjust_user_balance(db, target_user.id, amount, mode)
                updated_user_id = updated_user.id if updated_user else ""
                updated_username = updated_user.username if updated_user else ""
                updated_balance = float(updated_user.balance) if updated_user else 0.0
            finally:
                db.close()

            if not updated_user:
                raise ValueError("target user not found")

            target_user_id = updated_user_id
            data = {"balance": updated_balance}
            message = f"{command_name} completed for {updated_username}; balance={updated_balance:.2f}"
            await notify_balance_updated(updated_user_id, updated_balance)

        elif command_name == "set_role":
            if len(args) < 2:
                raise ValueError("usage: /set_role <user_id_or_username> <player|mod|admin|super>")

            requested_role = args[1].strip().lower()
            target_role = normalize_role(requested_role)
            if requested_role != target_role:
                raise ValueError("invalid role")
            db = SessionLocal()
            try:
                target_user = _resolve_user_reference(db, args[0])
                if not target_user:
                    raise ValueError("target user not found")
                updated_user = set_user_role(db, target_user.id, target_role)
                updated_user_id = updated_user.id if updated_user else ""
                updated_username = updated_user.username if updated_user else ""
                updated_role = updated_user.role if updated_user else ""
            finally:
                db.close()

            if not updated_user:
                raise ValueError("target user not found")

            target_user_id = updated_user_id
            data = {"role": updated_role}
            message = f"set role for {updated_username} to {updated_role}"
            await notify_role_updated(updated_user_id, updated_role)
            if updated_user_id == identity.user_id:
                identity.role = updated_role

    except ValueError as exc:
        status = "error"
        message = str(exc)
    except Exception:
        status = "error"
        message = "admin command failed"

    db = SessionLocal()
    try:
        write_audit_log(
            db,
            actor_user_id=identity.user_id,
            actor_role=identity.role,
            command_text=normalized_command,
            status=status,
            message=message,
            target_user_id=target_user_id,
            target_table_id=target_table_id,
            metadata=data,
        )
    finally:
        db.close()

    return {"ok": status == "success", "message": message, "data": data or None}


@sio.event
async def connect(sid: str, environ: dict, auth: dict | None = None) -> bool:
    client_ip = _extract_client_ip_from_environ(environ)
    if not _is_socket_connect_allowed(client_ip):
        return False

    token = _resolve_token(auth, environ)
    identity, session_id = _load_identity_from_token(token)
    if not identity:
        return False

    _ensure_turn_timer_task()
    _register_presence(sid, identity)
    _sid_client_ip[sid] = client_ip
    _clear_reconnect_deadline(identity.user_id)
    await sio.save_session(
        sid,
        {
            "user_id": identity.user_id,
            "username": identity.username,
            "role": identity.role,
            "session_id": session_id,
            "table_id": None,
            "spectator_table_id": None,
        },
    )
    restored_table_id = await _restore_sid_table_membership(sid, identity.user_id)
    await sio.emit(
        "system",
        {
            "message": "connected",
            "user_id": identity.user_id,
            "username": identity.username,
            "role": identity.role,
            "turn_seconds": TURN_SECONDS,
            "reconnect_grace_seconds": RECONNECT_GRACE_SECONDS,
        },
        room=sid,
    )
    await sio.emit(
        "session_restored",
        {
            "table_id": restored_table_id,
            "spectator_table_id": None,
            "recovered": restored_table_id is not None,
        },
        room=sid,
    )
    if restored_table_id:
        await _emit_table_snapshot(restored_table_id)
        await _emit_table_game_state(restored_table_id)
        await _emit_table_chat_history(sid, restored_table_id)
        await _emit_table_moderation_state(restored_table_id)
    await _broadcast_lobby_snapshots()
    return True


@sio.event
async def disconnect(sid: str) -> None:
    _sid_last_reaction_at.pop(sid, None)
    _sid_client_ip.pop(sid, None)
    spectator_table_id = _sid_spectator_table.get(sid)
    if spectator_table_id:
        await _set_sid_spectator_table(sid, None)

    identity = _unregister_presence(sid)
    if not identity:
        if spectator_table_id:
            await _emit_table_snapshot(spectator_table_id)
            await _broadcast_lobby_snapshots()
        return

    table_ids = set(lobby_service.table_ids_for_user(identity.user_id))
    if identity.user_id not in _user_to_sids:
        _set_reconnect_deadline(identity.user_id)

    if spectator_table_id:
        table_ids.add(spectator_table_id)

    for table_id in table_ids:
        await _emit_table_snapshot(table_id)
        await _emit_table_game_state(table_id)
    await _broadcast_lobby_snapshots()


@sio.event
async def join_lobby(sid: str, _: dict | None = None) -> dict:
    if not _is_socket_event_allowed(sid, "join_lobby"):
        return await _socket_rate_limited_payload(sid, "join_lobby")
    await sio.enter_room(sid, "lobby")
    await _emit_lobby_snapshot_for_sid(sid)
    await sio.emit("lobby_joined", {"ok": True}, room=sid)
    return {"ok": True}


@sio.event
async def admin_command(sid: str, data: dict | None = None) -> dict:
    identity = _sid_to_identity.get(sid)
    if not identity:
        return {"ok": False, "message": "unauthorized"}
    if not _is_socket_event_allowed(sid, "admin_command"):
        return await _socket_rate_limited_payload(sid, "admin_command")
    if not has_role_at_least(identity.role, "mod"):
        return {"ok": False, "message": "requires mod role"}

    command = str((data or {}).get("command", "")).strip()
    result = await _execute_admin_command(identity, command)
    await sio.emit("admin_command_result", result, room=sid)
    return result


@sio.event
async def create_table(sid: str, data: dict) -> dict:
    identity = _sid_to_identity.get(sid)
    if not identity:
        return {"ok": False, "error": "unauthorized"}
    if not _is_socket_event_allowed(sid, "create_table"):
        return await _socket_rate_limited_payload(sid, "create_table")

    try:
        payload = TableCreateRequest.model_validate(data)
    except Exception:
        return {"ok": False, "error": "invalid payload"}

    previous_table_ids = set(lobby_service.table_ids_for_user(identity.user_id))
    previous_spectator_table_id = _sid_spectator_table.get(sid)
    table = lobby_service.create_table(identity.user_id, payload)
    _clear_user_ready(identity.user_id)
    await _set_sid_spectator_table(sid, None)
    await _attach_sid_to_table_room(sid, table.id)

    await sio.emit("table_joined", {"table_id": table.id}, room=sid)
    await _emit_table_snapshot(table.id)
    await _emit_table_game_state(table.id)
    await _emit_table_chat_history(sid, table.id)
    await _emit_table_moderation_state(table.id)
    for table_id in previous_table_ids:
        if table_id == table.id:
            continue
        await _handle_player_removed_from_turn_state(table_id, identity.user_id)
        await _emit_table_snapshot(table_id)
    if previous_spectator_table_id and previous_spectator_table_id != table.id:
        await _emit_table_snapshot(previous_spectator_table_id)
    await _broadcast_lobby_snapshots()
    return {"ok": True, "table": _serialize_table(table)}


@sio.event
async def join_table(sid: str, data: dict) -> dict:
    identity = _sid_to_identity.get(sid)
    if not identity:
        return {"ok": False, "error": "unauthorized"}
    if not _is_socket_event_allowed(sid, "join_table"):
        return await _socket_rate_limited_payload(sid, "join_table")

    table_id = str(data.get("table_id", "")).strip()
    invite_code = str(data.get("invite_code", "")).strip()
    previous_table_ids = set(lobby_service.table_ids_for_user(identity.user_id))
    previous_spectator_table_id = _sid_spectator_table.get(sid)

    target_table = lobby_service.get_table(table_id) if table_id else None
    if invite_code and not target_table:
        target_table = lobby_service.get_table_by_invite_code(invite_code)

    if (
        target_table
        and target_table.id in _locked_tables
        and identity.user_id not in target_table.players
        and not has_role_at_least(identity.role, "mod")
    ):
        return {"ok": False, "error": "table is locked by admin"}

    if target_table and _is_user_banned(target_table.id, identity.user_id):
        return {"ok": False, "error": "you are banned from this table"}

    if target_table and target_table.id in _table_turn_states and identity.user_id not in target_table.players:
        return {"ok": False, "error": "table game already in progress"}

    if table_id:
        table = lobby_service.join_table(table_id, identity.user_id)
    elif invite_code:
        table = lobby_service.join_table_by_invite_code(invite_code, identity.user_id)
    else:
        return {"ok": False, "error": "table_id or invite_code required"}

    if not table:
        return {"ok": False, "error": "Unable to join table"}

    _clear_user_ready(identity.user_id)
    await _set_sid_spectator_table(sid, None)
    await _attach_sid_to_table_room(sid, table.id)
    await sio.emit("table_joined", {"table_id": table.id}, room=sid)
    await _emit_table_snapshot(table.id)
    await _emit_table_game_state(table.id)
    await _emit_table_chat_history(sid, table.id)
    await _emit_table_moderation_state(table.id)
    for previous_table_id in previous_table_ids:
        if previous_table_id == table.id:
            continue
        await _handle_player_removed_from_turn_state(previous_table_id, identity.user_id)
        await _emit_table_snapshot(previous_table_id)
    if previous_spectator_table_id and previous_spectator_table_id != table.id:
        await _emit_table_snapshot(previous_spectator_table_id)
    await _broadcast_lobby_snapshots()
    return {"ok": True, "table": _serialize_table(table)}


@sio.event
async def leave_table(sid: str, data: dict | None = None) -> dict:
    identity = _sid_to_identity.get(sid)
    if not identity:
        return {"ok": False, "error": "unauthorized"}
    if not _is_socket_event_allowed(sid, "leave_table"):
        return await _socket_rate_limited_payload(sid, "leave_table")

    requested_table_id = str((data or {}).get("table_id", "")).strip()
    table_ids = lobby_service.table_ids_for_user(identity.user_id)
    table_id = requested_table_id or (table_ids[0] if table_ids else "")
    if not table_id:
        await _attach_sid_to_table_room(sid, None)
        return {"ok": True}

    _clear_user_ready(identity.user_id)
    lobby_service.leave_table(table_id, identity.user_id)
    await _handle_player_removed_from_turn_state(table_id, identity.user_id)
    await sio.leave_room(sid, _table_room(table_id))
    await _attach_sid_to_table_room(sid, None)
    await sio.emit("table_left", {"table_id": table_id}, room=sid)
    await _emit_table_snapshot(table_id)
    await _emit_table_game_state(table_id)
    await _broadcast_lobby_snapshots()
    return {"ok": True}


@sio.event
async def spectate_table(sid: str, data: dict | None = None) -> dict:
    identity = _sid_to_identity.get(sid)
    if not identity:
        return {"ok": False, "error": "unauthorized"}
    if not _is_socket_event_allowed(sid, "spectate_table"):
        return await _socket_rate_limited_payload(sid, "spectate_table")

    requested_table_id = str((data or {}).get("table_id", "")).strip()
    if not requested_table_id:
        return {"ok": False, "error": "table_id required"}

    table = lobby_service.get_table(requested_table_id)
    if not table:
        return {"ok": False, "error": "table not found"}
    if _is_user_banned(table.id, identity.user_id):
        return {"ok": False, "error": "you are banned from this table"}
    if not _can_user_spectate_table(identity.user_id, table):
        return {"ok": False, "error": "table is private"}

    try:
        session = await sio.get_session(sid)
    except KeyError:
        return {"ok": False, "error": "session missing"}

    participant_table_id = _session_string(session, "table_id")
    if participant_table_id and participant_table_id == requested_table_id:
        await _set_sid_spectator_table(sid, None)
        await sio.emit(
            "spectator_joined",
            {"table_id": requested_table_id, "mode": "player"},
            room=sid,
        )
        await _emit_table_snapshot(requested_table_id)
        await _emit_table_game_state(requested_table_id)
        await _emit_table_chat_history(sid, requested_table_id)
        await _emit_table_moderation_state(requested_table_id)
        return {"ok": True, "table_id": requested_table_id, "mode": "player"}

    previous_spectator_table_id = _sid_spectator_table.get(sid)
    await _set_sid_spectator_table(sid, requested_table_id)
    await sio.emit(
        "spectator_joined",
        {"table_id": requested_table_id, "mode": "spectator"},
        room=sid,
    )
    await _emit_table_snapshot(requested_table_id)
    await _emit_table_game_state(requested_table_id)
    await _emit_table_chat_history(sid, requested_table_id)
    await _emit_table_moderation_state(requested_table_id)
    if previous_spectator_table_id and previous_spectator_table_id != requested_table_id:
        await _emit_table_snapshot(previous_spectator_table_id)
    await _broadcast_lobby_snapshots()
    return {"ok": True, "table_id": requested_table_id, "mode": "spectator"}


@sio.event
async def stop_spectating(sid: str, data: dict | None = None) -> dict:
    identity = _sid_to_identity.get(sid)
    if not identity:
        return {"ok": False, "error": "unauthorized"}
    if not _is_socket_event_allowed(sid, "stop_spectating"):
        return await _socket_rate_limited_payload(sid, "stop_spectating")

    requested_table_id = str((data or {}).get("table_id", "")).strip()
    current_spectator_table_id = _sid_spectator_table.get(sid)
    table_id = requested_table_id or (current_spectator_table_id or "")
    if not table_id:
        return {"ok": True}

    if current_spectator_table_id and requested_table_id and current_spectator_table_id != requested_table_id:
        return {"ok": False, "error": "not spectating requested table"}

    await _set_sid_spectator_table(sid, None)
    await sio.emit("spectator_left", {"table_id": table_id}, room=sid)
    await _emit_table_snapshot(table_id)
    await _broadcast_lobby_snapshots()
    return {"ok": True, "table_id": table_id}


@sio.event
async def set_ready(sid: str, data: dict | None = None) -> dict:
    identity = _sid_to_identity.get(sid)
    if not identity:
        return {"ok": False, "error": "unauthorized"}
    if not _is_socket_event_allowed(sid, "set_ready"):
        return await _socket_rate_limited_payload(sid, "set_ready")

    session = await sio.get_session(sid)
    table_id = _session_string(session, "table_id")
    if not table_id:
        return {"ok": False, "error": "join a table first"}
    if table_id in _locked_tables and not has_role_at_least(identity.role, "mod"):
        return {"ok": False, "error": "table is locked by admin"}

    table = lobby_service.get_table(table_id)
    if not table or identity.user_id not in table.players:
        return {"ok": False, "error": "table unavailable"}
    if table_id in _locked_tables and not has_role_at_least(identity.role, "mod"):
        return {"ok": False, "error": "table is locked by admin"}
    if table_id in _table_turn_states:
        return {"ok": False, "error": "table game already active"}

    ready = bool((data or {}).get("ready", True))
    ready_players = _table_ready.setdefault(table_id, set())
    if ready:
        ready_players.add(identity.user_id)
    else:
        ready_players.discard(identity.user_id)

    if len(ready_players) == 0:
        _table_ready.pop(table_id, None)

    await _emit_table_snapshot(table_id)

    refreshed_table = lobby_service.get_table(table_id)
    refreshed_ready_players = _table_ready.get(table_id, set())
    if (
        refreshed_table
        and len(refreshed_table.players) >= 2
        and all(player_id in refreshed_ready_players for player_id in refreshed_table.players)
    ):
        state = _start_table_game(refreshed_table)
        if state:
            await sio.emit("table_ready_to_start", {"table_id": table_id}, room=_table_room(table_id))
            await sio.emit("table_game_started", _serialize_turn_state(state), room=_table_room(table_id))
            await _emit_table_snapshot(table_id)
            await _emit_table_game_state(table_id)

    await _broadcast_lobby_snapshots()
    return {"ok": True, "ready": ready}


@sio.event
async def send_table_chat(sid: str, data: dict | None = None) -> dict:
    identity = _sid_to_identity.get(sid)
    if not identity:
        return {"ok": False, "error": "unauthorized"}
    if not _is_socket_event_allowed(sid, "send_table_chat"):
        return await _socket_rate_limited_payload(sid, "send_table_chat")

    try:
        session = await sio.get_session(sid)
    except KeyError:
        return {"ok": False, "error": "session missing"}

    table_id = _resolve_target_table_id_for_interaction(
        session,
        payload_table_id=(data or {}).get("table_id"),
    )
    if not table_id:
        return {"ok": False, "error": "join or spectate a table first"}
    if _session_string(session, "table_id") != table_id:
        return {"ok": False, "error": "spectators are read-only"}

    table = lobby_service.get_table(table_id)
    if not table:
        return {"ok": False, "error": "table not found"}

    is_blocked, reason = _is_user_chat_blocked(table_id, identity.user_id)
    if is_blocked:
        return {"ok": False, "error": f"chat blocked: {reason}"}

    raw_message = str((data or {}).get("message", ""))
    clean_message, filtered = sanitize_chat_message(raw_message)
    if not clean_message:
        return {"ok": False, "error": "message is empty"}
    if len(clean_message) > MAX_CHAT_MESSAGE_LENGTH:
        clean_message = clean_message[:MAX_CHAT_MESSAGE_LENGTH]

    entry = ChatMessage(
        id=uuid4().hex,
        table_id=table_id,
        user_id=identity.user_id,
        username=identity.username,
        message=clean_message,
        filtered=filtered,
        created_at=_utc_now(),
    )
    _append_chat_message(entry)
    payload = _serialize_chat_message(entry)
    await sio.emit("table_chat_message", payload, room=_table_room(table_id))
    return {"ok": True, "message": payload}


@sio.event
async def send_table_reaction(sid: str, data: dict | None = None) -> dict:
    identity = _sid_to_identity.get(sid)
    if not identity:
        return {"ok": False, "error": "unauthorized"}
    if not _is_socket_event_allowed(sid, "send_table_reaction"):
        return await _socket_rate_limited_payload(sid, "send_table_reaction")

    try:
        session = await sio.get_session(sid)
    except KeyError:
        return {"ok": False, "error": "session missing"}

    table_id = _resolve_target_table_id_for_interaction(
        session,
        payload_table_id=(data or {}).get("table_id"),
    )
    if not table_id:
        return {"ok": False, "error": "join or spectate a table first"}
    if _session_string(session, "table_id") != table_id:
        return {"ok": False, "error": "spectators are read-only"}

    is_blocked, reason = _is_user_chat_blocked(table_id, identity.user_id)
    if is_blocked:
        return {"ok": False, "error": f"reaction blocked: {reason}"}

    emoji = str((data or {}).get("emoji", "")).strip()
    if not emoji:
        return {"ok": False, "error": "emoji is required"}
    if len(emoji) > MAX_REACTION_EMOJI_LENGTH:
        return {"ok": False, "error": "emoji is too long"}

    now = _utc_now()
    last_sent = _sid_last_reaction_at.get(sid)
    if last_sent and (now - last_sent).total_seconds() < REACTION_RATE_LIMIT_SECONDS:
        return {"ok": False, "error": "sending reactions too fast"}
    _sid_last_reaction_at[sid] = now

    payload = {
        "id": uuid4().hex,
        "table_id": table_id,
        "user_id": identity.user_id,
        "username": identity.username,
        "emoji": emoji,
        "created_at": now.isoformat(),
    }
    await sio.emit("table_reaction", payload, room=_table_room(table_id))
    return {"ok": True, "reaction": payload}


@sio.event
async def moderate_table_chat(sid: str, data: dict | None = None) -> dict:
    identity = _sid_to_identity.get(sid)
    if not identity:
        return {"ok": False, "error": "unauthorized"}
    if not _is_socket_event_allowed(sid, "moderate_table_chat"):
        return await _socket_rate_limited_payload(sid, "moderate_table_chat")

    try:
        session = await sio.get_session(sid)
    except KeyError:
        return {"ok": False, "error": "session missing"}

    table_id = str((data or {}).get("table_id", "")).strip()
    if not table_id:
        table_id = _session_string(session, "table_id")
    if not table_id:
        return {"ok": False, "error": "table_id required"}

    table = lobby_service.get_table(table_id)
    if not table:
        return {"ok": False, "error": "table not found"}
    if not _can_manage_table(identity, table):
        return {"ok": False, "error": "only table owner can moderate chat"}

    target_user_id = str((data or {}).get("target_user_id", "")).strip()
    action = str((data or {}).get("action", "")).strip().lower()
    if not target_user_id:
        return {"ok": False, "error": "target_user_id required"}
    if target_user_id == identity.user_id:
        return {"ok": False, "error": "cannot moderate yourself"}
    if action not in {"mute", "unmute", "ban", "unban"}:
        return {"ok": False, "error": "invalid moderation action"}

    if action == "mute":
        raw_duration = (data or {}).get("duration_seconds", MUTE_DEFAULT_SECONDS)
        try:
            duration_seconds = int(raw_duration)
        except (TypeError, ValueError):
            duration_seconds = MUTE_DEFAULT_SECONDS
        duration_seconds = max(10, min(MUTE_MAX_SECONDS, duration_seconds))
        mute_until = _next_deadline(duration_seconds)
        _table_chat_muted_until.setdefault(table_id, {})[target_user_id] = mute_until
        details = {"duration_seconds": duration_seconds, "mute_until": mute_until.isoformat()}
    elif action == "unmute":
        _table_chat_muted_until.get(table_id, {}).pop(target_user_id, None)
        if table_id in _table_chat_muted_until and len(_table_chat_muted_until[table_id]) == 0:
            _table_chat_muted_until.pop(table_id, None)
        details = {}
    elif action == "ban":
        _table_chat_banned.setdefault(table_id, set()).add(target_user_id)
        _table_chat_muted_until.get(table_id, {}).pop(target_user_id, None)
        details = {}
        await _remove_user_from_table_for_moderation(table_id, target_user_id)
    else:
        _table_chat_banned.get(table_id, set()).discard(target_user_id)
        if table_id in _table_chat_banned and len(_table_chat_banned[table_id]) == 0:
            _table_chat_banned.pop(table_id, None)
        details = {}

    payload = {
        "table_id": table_id,
        "action": action,
        "target_user_id": target_user_id,
        "actor_user_id": identity.user_id,
        "at": _utc_now().isoformat(),
        "details": details,
    }
    await sio.emit("table_moderation_notice", payload, room=_table_room(table_id))

    for user_sid, user_identity in list(_sid_to_identity.items()):
        if user_identity.user_id != target_user_id:
            continue
        await sio.emit("table_moderation_notice", payload, room=user_sid)

    await _emit_table_snapshot(table_id)
    await _emit_table_game_state(table_id)
    await _emit_table_moderation_state(table_id)
    await _broadcast_lobby_snapshots()
    return {"ok": True, "moderation": payload}


@sio.event
async def take_turn_action(sid: str, data: dict | None = None) -> dict:
    identity = _sid_to_identity.get(sid)
    if not identity:
        return {"ok": False, "error": "unauthorized"}
    if not _is_socket_event_allowed(sid, "take_turn_action"):
        return await _socket_rate_limited_payload(sid, "take_turn_action")

    await _process_turn_timeouts()

    try:
        session = await sio.get_session(sid)
    except KeyError:
        return {"ok": False, "error": "session missing"}

    table_id = _session_string(session, "table_id")
    if not table_id:
        return {"ok": False, "error": "join a table first"}

    state = _table_turn_states.get(table_id)
    if not state or state.status != "active":
        return {"ok": False, "error": "no active turn cycle"}

    current_turn_user_id = _current_turn_user_id(state)
    if identity.user_id != current_turn_user_id:
        return {"ok": False, "error": "not your turn"}

    action = str((data or {}).get("action", "")).strip().lower()
    if action not in {"hit", "stand"}:
        return {"ok": False, "error": "invalid action"}

    action_id = str((data or {}).get("action_id", "")).strip() or None
    if action_id and not _is_valid_action_id(action_id):
        return {"ok": False, "error": "invalid action_id"}
    if _track_turn_action_id(state, action_id):
        return {"ok": True, "state": _serialize_turn_state(state), "duplicate": True}

    _record_turn_action(state, action=action, user_id=identity.user_id)
    advanced = _advance_turn(state)
    if not advanced:
        await _stop_table_game(table_id, reason="not_enough_players")
        return {"ok": True, "state": _idle_turn_state_payload(table_id)}

    await sio.emit(
        "turn_action_applied",
        {
            "table_id": table_id,
            "user_id": identity.user_id,
            "action": action,
            "next_turn_user_id": _current_turn_user_id(state),
        },
        room=_table_room(table_id),
    )
    await _emit_table_snapshot(table_id)
    await _emit_table_game_state(table_id)
    await _broadcast_lobby_snapshots()
    return {"ok": True, "state": _serialize_turn_state(state)}


@sio.event
async def sync_state(sid: str, data: dict | None = None) -> dict:
    if not _is_socket_event_allowed(sid, "sync_state"):
        return await _socket_rate_limited_payload(sid, "sync_state")
    await _process_turn_timeouts()
    await _process_reconnect_deadlines()
    await _emit_lobby_snapshot_for_sid(sid)

    identity = _sid_to_identity.get(sid)
    if not identity:
        return {"ok": False, "error": "unauthorized"}

    try:
        session = await sio.get_session(sid)
    except KeyError:
        return {"ok": False, "error": "session missing"}

    preferred_table_id = str((data or {}).get("preferred_table_id", "")).strip()
    preferred_mode = str((data or {}).get("preferred_mode", "auto")).strip().lower()
    user_table_ids = lobby_service.table_ids_for_user(identity.user_id)
    table_id = _session_string(session, "table_id")
    spectator_table_id = _session_string(session, "spectator_table_id")

    if table_id and table_id not in user_table_ids:
        table_id = ""

    if preferred_table_id and preferred_table_id in user_table_ids:
        table_id = preferred_table_id
    elif not table_id and user_table_ids:
        table_id = user_table_ids[0]

    await _attach_sid_to_table_room(sid, table_id or None)

    next_spectator_table_id = spectator_table_id
    if table_id and next_spectator_table_id == table_id:
        next_spectator_table_id = ""

    if (
        preferred_table_id
        and preferred_table_id not in user_table_ids
        and preferred_mode in {"auto", "spectator"}
    ):
        preferred_table = lobby_service.get_table(preferred_table_id)
        if (
            preferred_table
            and _can_user_spectate_table(identity.user_id, preferred_table)
            and not _is_user_banned(preferred_table.id, identity.user_id)
        ):
            next_spectator_table_id = preferred_table_id
        else:
            next_spectator_table_id = ""
    elif next_spectator_table_id:
        spectator_table = lobby_service.get_table(next_spectator_table_id)
        if (
            not spectator_table
            or not _can_user_spectate_table(identity.user_id, spectator_table)
            or _is_user_banned(spectator_table.id, identity.user_id)
            or next_spectator_table_id == table_id
        ):
            next_spectator_table_id = ""

    previous_spectator_table_id = _sid_spectator_table.get(sid)
    await _set_sid_spectator_table(sid, next_spectator_table_id or None)

    if table_id:
        await _emit_table_snapshot(table_id)
        await _emit_table_game_state(table_id)
        await _emit_table_chat_history(sid, table_id)
        await _emit_table_moderation_state(table_id)

    if next_spectator_table_id:
        await _emit_table_snapshot(next_spectator_table_id)
        await _emit_table_game_state(next_spectator_table_id)
        await _emit_table_chat_history(sid, next_spectator_table_id)
        await _emit_table_moderation_state(next_spectator_table_id)

    if (
        previous_spectator_table_id != (next_spectator_table_id or None)
        and previous_spectator_table_id
    ):
        await _emit_table_snapshot(previous_spectator_table_id)

    if previous_spectator_table_id != (next_spectator_table_id or None):
        await _broadcast_lobby_snapshots()

    return {
        "ok": True,
        "table_id": table_id or None,
        "spectator_table_id": next_spectator_table_id or None,
    }


async def notify_role_updated(user_id: str, role: str) -> None:
    normalized_role = normalize_role(role)
    for user_sid, sid_identity in list(_sid_to_identity.items()):
        if sid_identity.user_id != user_id:
            continue
        sid_identity.role = normalized_role
        try:
            session = await sio.get_session(user_sid)
            session["role"] = normalized_role
            await sio.save_session(user_sid, session)
        except KeyError:
            pass
        await sio.emit(
            "role_updated",
            {"user_id": user_id, "role": normalized_role},
            room=user_sid,
        )


async def notify_balance_updated(user_id: str, balance: float) -> None:
    for user_sid, sid_identity in list(_sid_to_identity.items()):
        if sid_identity.user_id != user_id:
            continue
        await sio.emit(
            "balance_updated",
            {"user_id": user_id, "balance": float(balance)},
            room=user_sid,
        )


def build_socket_app(api_app) -> socketio.ASGIApp:
    return socketio.ASGIApp(sio, other_asgi_app=api_app, socketio_path="socket.io")
