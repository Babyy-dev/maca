import unittest
from datetime import datetime, timezone
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
        self.added = []

    def scalars(self, _stmt):
        return _FakeScalars(list(self._users_by_id.values()))

    def add(self, item):
        self.added.append(item)

    def commit(self):
        return None

    def rollback(self):
        return None

    def close(self):
        return None


class MultiplayerSocketRoundFlowTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self._clear_runtime_state()
        self.emitted: list[tuple[str, object, str | None]] = []
        self.users_by_id = {
            "u1": _FakeUser("u1", 1000.0),
            "u2": _FakeUser("u2", 1000.0),
        }
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

    async def test_round_flow_ready_to_settle_with_insurance_and_surrender(self) -> None:
        table = lobby_service.create_table(
            owner_id="u1",
            payload=TableCreateRequest(name="VIP", max_players=2, is_private=False),
        )
        lobby_service.join_table(table.id, "u2")

        ws._sid_to_identity["sid-u1"] = ws.ConnectionIdentity("u1", "u1", "player")
        ws._sid_to_identity["sid-u2"] = ws.ConnectionIdentity("u2", "u2", "player")
        ws._user_to_sids["u1"] = {"sid-u1"}
        ws._user_to_sids["u2"] = {"sid-u2"}
        self.sessions["sid-u1"] = {"table_id": table.id, "spectator_table_id": None}
        self.sessions["sid-u2"] = {"table_id": table.id, "spectator_table_id": None}

        ready_1 = await ws.set_ready("sid-u1", {"ready": True, "bet": 10})
        ready_2 = await ws.set_ready("sid-u2", {"ready": True, "bet": 10})
        self.assertTrue(ready_1["ok"])
        self.assertTrue(ready_2["ok"])
        self.assertIn(table.id, ws._table_turn_states)

        state = ws._table_turn_states[table.id]
        state.players = ["u1", "u2"]
        state.turn_index = 0
        state.status = "active"
        state.phase = "player_turns"
        state.turn_deadline = ws._next_deadline(ws.TURN_SECONDS)
        state.dealer_cards = ["AS", "KD"]
        state.dealer_hidden = True
        state.shoe = ["2C", "3D", "4H", "5S"]
        state.player_states = {
            "u1": ws.TablePlayerState(
                user_id="u1",
                hands=[ws.TableHandState(hand_id="u1h1", cards=["10H", "7C"], bet=10.0)],
                base_bet=10.0,
                bankroll_at_start=1000.0,
                committed_bet=10.0,
            ),
            "u2": ws.TablePlayerState(
                user_id="u2",
                hands=[ws.TableHandState(hand_id="u2h1", cards=["10S", "6C"], bet=10.0)],
                base_bet=10.0,
                bankroll_at_start=1000.0,
                committed_bet=10.0,
            ),
        }

        insurance_action = await ws.take_turn_action(
            "sid-u1", {"action": "insurance", "action_id": "flow-insurance"}
        )
        self.assertTrue(insurance_action["ok"])
        self.assertEqual(ws._current_turn_user_id(state), "u1")
        self.assertEqual(state.player_states["u1"].insurance_bet, 5.0)

        stand_action = await ws.take_turn_action(
            "sid-u1", {"action": "stand", "action_id": "flow-stand"}
        )
        self.assertTrue(stand_action["ok"])
        self.assertEqual(ws._current_turn_user_id(state), "u2")

        surrender_action = await ws.take_turn_action(
            "sid-u2", {"action": "surrender", "action_id": "flow-surrender"}
        )
        self.assertTrue(surrender_action["ok"])
        self.assertEqual(state.status, "ended")
        self.assertEqual(state.phase, "settled")

        u1_state = state.player_states["u1"]
        u2_state = state.player_states["u2"]
        self.assertEqual(u1_state.total_payout, 0.0)
        self.assertEqual(u1_state.insurance_payout, 10.0)
        self.assertEqual(u2_state.total_payout, -5.0)
        self.assertEqual(u2_state.hands[0].result, "surrender")

        self.assertEqual(self.users_by_id["u1"].balance, 1000.0)
        self.assertEqual(self.users_by_id["u2"].balance, 995.0)

        emitted_events = [event for event, _, _ in self.emitted]
        self.assertIn("table_round_resolved", emitted_events)


if __name__ == "__main__":
    unittest.main()
