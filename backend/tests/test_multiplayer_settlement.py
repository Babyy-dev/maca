import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from app.realtime.socket_server import TableHandState, TablePlayerState, TableTurnState
from app.realtime.socket_server import _settle_table_round


class _FakeScalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeSession:
    def __init__(self, users):
        self._users = users
        self.added = []

    def scalars(self, _stmt):
        return _FakeScalars(self._users)

    def add(self, item):
        self.added.append(item)

    def commit(self):
        return None

    def rollback(self):
        return None

    def close(self):
        return None


class _FakeUser:
    def __init__(self, user_id: str, balance: float):
        self.id = user_id
        self.balance = balance


class MultiplayerSettlementTests(unittest.TestCase):
    def test_insurance_offsets_main_loss_when_dealer_blackjack(self) -> None:
        user = _FakeUser("u1", 1000.0)
        session = _FakeSession([user])
        state = TableTurnState(
            table_id="t1",
            players=["u1"],
            turn_index=0,
            turn_seconds=8,
            turn_deadline=datetime.now(timezone.utc),
            dealer_cards=["AS", "10D"],
            dealer_hidden=True,
            player_states={
                "u1": TablePlayerState(
                    user_id="u1",
                    hands=[TableHandState(hand_id="h1", cards=["10H", "9C"], bet=10.0)],
                    base_bet=10.0,
                    bankroll_at_start=1000.0,
                    committed_bet=15.0,
                    insurance_bet=5.0,
                    insurance_decided=True,
                )
            },
        )

        with patch("app.realtime.socket_server.SessionLocal", return_value=session):
            _settle_table_round(state, completion_reason="test")

        player = state.player_states["u1"]
        hand = player.hands[0]
        self.assertEqual(hand.result, "lose")
        self.assertEqual(hand.payout, -10.0)
        self.assertEqual(player.insurance_payout, 10.0)
        self.assertEqual(player.total_payout, 0.0)
        self.assertEqual(user.balance, 1000.0)

    def test_surrender_stays_half_loss_on_settlement(self) -> None:
        user = _FakeUser("u1", 1000.0)
        session = _FakeSession([user])
        state = TableTurnState(
            table_id="t2",
            players=["u1"],
            turn_index=0,
            turn_seconds=8,
            turn_deadline=datetime.now(timezone.utc),
            dealer_cards=["9S", "7D"],
            dealer_hidden=True,
            player_states={
                "u1": TablePlayerState(
                    user_id="u1",
                    hands=[
                        TableHandState(
                            hand_id="h1",
                            cards=["10H", "6C"],
                            bet=10.0,
                            status="surrendered",
                            result="surrender",
                            payout=-5.0,
                        )
                    ],
                    base_bet=10.0,
                    bankroll_at_start=1000.0,
                    committed_bet=10.0,
                )
            },
        )

        with patch("app.realtime.socket_server.SessionLocal", return_value=session):
            _settle_table_round(state, completion_reason="test")

        player = state.player_states["u1"]
        hand = player.hands[0]
        self.assertEqual(hand.result, "surrender")
        self.assertEqual(hand.payout, -5.0)
        self.assertEqual(player.total_payout, -5.0)
        self.assertEqual(user.balance, 995.0)


if __name__ == "__main__":
    unittest.main()
