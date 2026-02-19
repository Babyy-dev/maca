from dataclasses import asdict, dataclass, field
from threading import Lock
from uuid import uuid4

from app.schemas.lobby import TableCreateRequest
from app.services.redis_client import get_redis_client


@dataclass
class LobbyTable:
    id: str
    name: str
    owner_id: str
    max_players: int
    is_private: bool
    invite_code: str | None
    players: list[str] = field(default_factory=list)


class LobbyService:
    def __init__(self) -> None:
        self._tables: dict[str, LobbyTable] = {}
        self._lock = Lock()
        self._redis = get_redis_client()

    def _persist(self) -> None:
        if self._redis is None:
            return
        try:
            payload = {table_id: str(asdict(table)) for table_id, table in self._tables.items()}
            self._redis.hset("maca:lobby:tables", mapping=payload)
        except Exception:
            return

    def _remove_user_from_all_tables_locked(
        self,
        user_id: str,
        keep_table_id: str | None = None,
    ) -> list[str]:
        touched_table_ids: list[str] = []
        empty_table_ids: list[str] = []

        for table in self._tables.values():
            if keep_table_id and table.id == keep_table_id:
                continue
            if user_id not in table.players:
                continue
            table.players = [player_id for player_id in table.players if player_id != user_id]
            touched_table_ids.append(table.id)
            if len(table.players) == 0:
                empty_table_ids.append(table.id)

        for table_id in empty_table_ids:
            self._tables.pop(table_id, None)
            touched_table_ids.append(table_id)

        return touched_table_ids

    def list_tables(self) -> list[LobbyTable]:
        with self._lock:
            return list(self._tables.values())

    def visible_tables_for_user(self, user_id: str) -> list[LobbyTable]:
        with self._lock:
            return [
                table
                for table in self._tables.values()
                if not table.is_private or user_id in table.players
            ]

    def table_ids_for_user(self, user_id: str) -> list[str]:
        with self._lock:
            return [table.id for table in self._tables.values() if user_id in table.players]

    def get_table(self, table_id: str) -> LobbyTable | None:
        with self._lock:
            return self._tables.get(table_id)

    def get_table_by_invite_code(self, invite_code: str) -> LobbyTable | None:
        normalized = invite_code.strip().upper()
        with self._lock:
            return next(
                (
                    table
                    for table in self._tables.values()
                    if table.invite_code and table.invite_code.upper() == normalized
                ),
                None,
            )

    def create_table(self, owner_id: str, payload: TableCreateRequest) -> LobbyTable:
        with self._lock:
            table_id = uuid4().hex[:8]
            invite_code = uuid4().hex[:6].upper() if payload.is_private else None
            self._remove_user_from_all_tables_locked(owner_id)
            table = LobbyTable(
                id=table_id,
                name=payload.name.strip(),
                owner_id=owner_id,
                max_players=payload.max_players,
                is_private=payload.is_private,
                invite_code=invite_code,
                players=[owner_id],
            )
            self._tables[table.id] = table
            self._persist()
            return table

    def join_table(self, table_id: str, user_id: str) -> LobbyTable | None:
        with self._lock:
            table = self._tables.get(table_id)
            if not table:
                return None
            if user_id in table.players:
                return table
            if len(table.players) >= table.max_players:
                return None
            self._remove_user_from_all_tables_locked(user_id, keep_table_id=table_id)
            table.players.append(user_id)
            self._persist()
            return table

    def join_table_by_invite_code(self, invite_code: str, user_id: str) -> LobbyTable | None:
        normalized = invite_code.strip().upper()
        with self._lock:
            table = next(
                (
                    entry
                    for entry in self._tables.values()
                    if entry.invite_code and entry.invite_code.upper() == normalized
                ),
                None,
            )
            if not table:
                return None
            if user_id in table.players:
                return table
            if len(table.players) >= table.max_players:
                return None
            self._remove_user_from_all_tables_locked(user_id, keep_table_id=table.id)
            table.players.append(user_id)
            self._persist()
            return table

    def leave_table(self, table_id: str, user_id: str) -> LobbyTable | None:
        with self._lock:
            table = self._tables.get(table_id)
            if not table:
                return None
            if user_id not in table.players:
                return table

            table.players = [player_id for player_id in table.players if player_id != user_id]
            if len(table.players) == 0:
                self._tables.pop(table_id, None)
                self._persist()
                return None

            if table.owner_id == user_id:
                table.owner_id = table.players[0]
            self._persist()
            return table

    def close_table(self, table_id: str) -> bool:
        with self._lock:
            if table_id not in self._tables:
                return False
            self._tables.pop(table_id, None)
            self._persist()
            return True


lobby_service = LobbyService()
