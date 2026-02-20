import unittest
from datetime import timedelta
from unittest.mock import patch

from app.realtime import socket_server as ws
from app.schemas.lobby import TableCreateRequest
from app.services.lobby_service import lobby_service


class MultiplayerReconnectFlowTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self._clear_runtime_state()
        self.emitted: list[tuple[str, object, str | None]] = []
        self.sessions: dict[str, dict] = {}
        self.patches = []

        async def fake_emit(event, payload=None, room=None):
            self.emitted.append((event, payload, room))

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
        ws._clear_forced_shoe()
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
        lobby_service._tables.clear()  # type: ignore[attr-defined]

    async def test_disconnect_and_expired_grace_evicts_player(self) -> None:
        table = lobby_service.create_table(
            owner_id="u1",
            payload=TableCreateRequest(name="Reconnect", max_players=2, is_private=False),
        )
        lobby_service.join_table(table.id, "u2")

        ws._register_presence("sid-u1", ws.ConnectionIdentity("u1", "u1", "player"))
        ws._register_presence("sid-u2", ws.ConnectionIdentity("u2", "u2", "player"))

        await ws.disconnect("sid-u1")
        self.assertIn("u1", ws._reconnect_deadlines)

        ws._reconnect_deadlines["u1"] = ws._utc_now() - timedelta(seconds=1)
        await ws._process_reconnect_deadlines()

        updated_table = lobby_service.get_table(table.id)
        self.assertIsNotNone(updated_table)
        assert updated_table is not None
        self.assertNotIn("u1", updated_table.players)
        self.assertIn("u2", updated_table.players)

        player_removed_events = [
            payload
            for event, payload, _room in self.emitted
            if event == "player_auto_removed" and isinstance(payload, dict)
        ]
        self.assertTrue(
            any(
                payload.get("user_id") == "u1"
                and payload.get("reason") == "disconnect_grace_expired"
                for payload in player_removed_events
            )
        )

    async def test_reconnect_clears_deadline_and_skips_evict(self) -> None:
        table = lobby_service.create_table(
            owner_id="u1",
            payload=TableCreateRequest(name="Reconnect2", max_players=2, is_private=False),
        )
        lobby_service.join_table(table.id, "u2")

        ws._reconnect_deadlines["u1"] = ws._utc_now() - timedelta(seconds=1)

        with (
            patch.object(ws, "_is_socket_connect_allowed", return_value=True),
            patch.object(ws, "_resolve_token", return_value="mock-token"),
            patch.object(
                ws,
                "_load_identity_from_token",
                return_value=(ws.ConnectionIdentity("u1", "u1", "player"), "session-1"),
            ),
            patch.object(ws, "_ensure_turn_timer_task", return_value=None),
        ):
            connected = await ws.connect(
                "sid-u1-rejoin",
                {"REMOTE_ADDR": "127.0.0.1"},
                {"token": "mock-token"},
            )

        self.assertTrue(connected)
        self.assertNotIn("u1", ws._reconnect_deadlines)
        self.assertIn("u1", ws._user_to_sids)
        self.assertIn("sid-u1-rejoin", ws._user_to_sids["u1"])

        restored_session = self.sessions.get("sid-u1-rejoin")
        self.assertIsNotNone(restored_session)
        assert restored_session is not None
        self.assertEqual(restored_session.get("table_id"), table.id)

        await ws._process_reconnect_deadlines()
        updated_table = lobby_service.get_table(table.id)
        self.assertIsNotNone(updated_table)
        assert updated_table is not None
        self.assertIn("u1", updated_table.players)

        player_removed_events = [
            payload
            for event, payload, _room in self.emitted
            if event == "player_auto_removed" and isinstance(payload, dict)
        ]
        self.assertFalse(any(payload.get("user_id") == "u1" for payload in player_removed_events))

        session_restored_events = [
            payload
            for event, payload, _room in self.emitted
            if event == "session_restored" and isinstance(payload, dict)
        ]
        self.assertTrue(
            any(
                payload.get("table_id") == table.id and payload.get("recovered") is True
                for payload in session_restored_events
            )
        )


if __name__ == "__main__":
    unittest.main()
