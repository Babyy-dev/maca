import unittest
from unittest.mock import patch

from app.realtime import socket_server as ws
from app.schemas.lobby import TableCreateRequest
from app.services.lobby_service import lobby_service


class _FakeUser:
    def __init__(self, user_id: str, balance: float) -> None:
        self.id = user_id
        self.balance = balance


class _FakeScalars:
    def __init__(self, users):
        self._users = users

    def all(self):
        return self._users


class _FakeDbSession:
    def __init__(self, users_by_id):
        self._users_by_id = users_by_id

    def scalars(self, _stmt):
        return _FakeScalars(list(self._users_by_id.values()))

    def add(self, _item):
        return None

    def commit(self):
        return None

    def rollback(self):
        return None

    def close(self):
        return None


class MultiplayerForcedShoeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self._clear_runtime_state()
        self.sessions: dict[str, dict] = {}
        self.users_by_id = {
            "u1": _FakeUser("u1", 1000.0),
            "u2": _FakeUser("u2", 1000.0),
        }
        self.patches = []

        async def fake_emit(_event, _payload=None, room=None):
            _ = room
            return None

        async def fake_get_session(sid):
            return self.sessions[sid]

        async def fake_save_session(sid, session):
            self.sessions[sid] = session

        async def fake_enter_room(_sid, _room):
            return None

        async def fake_leave_room(_sid, _room):
            return None

        self.patches.append(patch.object(ws.sio, "emit", new=fake_emit))
        self.patches.append(patch.object(ws.sio, "get_session", new=fake_get_session))
        self.patches.append(patch.object(ws.sio, "save_session", new=fake_save_session))
        self.patches.append(patch.object(ws.sio, "enter_room", new=fake_enter_room))
        self.patches.append(patch.object(ws.sio, "leave_room", new=fake_leave_room))
        self.patches.append(
            patch.object(ws, "SessionLocal", new=lambda: _FakeDbSession(self.users_by_id))
        )
        self.patches.append(patch.object(ws, "_is_socket_event_allowed", return_value=True))
        for patcher in self.patches:
            patcher.start()

    async def asyncTearDown(self) -> None:
        for patcher in reversed(self.patches):
            patcher.stop()
        self._clear_runtime_state()

    def _clear_runtime_state(self) -> None:
        ws._sid_to_identity.clear()
        ws._user_to_sids.clear()
        ws._table_ready.clear()
        ws._table_pending_bets.clear()
        ws._table_turn_states.clear()
        ws._reconnect_deadlines.clear()
        ws._sid_spectator_table.clear()
        ws._table_spectators.clear()
        ws._table_chat_messages.clear()
        ws._table_chat_muted_until.clear()
        ws._table_chat_banned.clear()
        ws._sid_last_reaction_at.clear()
        ws._sid_client_ip.clear()
        ws._locked_tables.clear()
        ws._clear_forced_shoe()
        lobby_service._tables.clear()  # type: ignore[attr-defined]

    async def test_forced_shoe_draw_order_applied_to_initial_deal(self) -> None:
        table = lobby_service.create_table(
            owner_id="u1",
            payload=TableCreateRequest(name="Forced Shoe", max_players=2, is_private=False),
        )
        lobby_service.join_table(table.id, "u2")

        ws._sid_to_identity["sid-u1"] = ws.ConnectionIdentity("u1", "u1", "player")
        ws._sid_to_identity["sid-u2"] = ws.ConnectionIdentity("u2", "u2", "player")
        ws._user_to_sids["u1"] = {"sid-u1"}
        ws._user_to_sids["u2"] = {"sid-u2"}
        self.sessions["sid-u1"] = {"table_id": table.id, "spectator_table_id": None}
        self.sessions["sid-u2"] = {"table_id": table.id, "spectator_table_id": None}

        ws._set_forced_shoe_draw_order(
            table.id,
            ["9H", "8H", "7D", "6C", "5S", "4C"],
        )
        await ws.set_ready("sid-u1", {"ready": True, "bet": 10})
        await ws.set_ready("sid-u2", {"ready": True, "bet": 10})

        state = ws._table_turn_states[table.id]
        self.assertEqual(state.player_states["u1"].hands[0].cards, ["9H", "6C"])
        self.assertEqual(state.player_states["u2"].hands[0].cards, ["8H", "5S"])
        self.assertEqual(state.dealer_cards, ["7D", "4C"])
        self.assertNotIn(table.id, ws._table_forced_shoes)

    def test_forced_shoe_validation(self) -> None:
        with self.assertRaises(ValueError):
            ws._set_forced_shoe_draw_order("table-x", [])
        with self.assertRaises(ValueError):
            ws._set_forced_shoe_draw_order("", ["AS"])


if __name__ == "__main__":
    unittest.main()
