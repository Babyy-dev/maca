import unittest
from datetime import datetime, timezone

from app.realtime.socket_server import TableHandState, TablePlayerState, TableTurnState
from app.realtime.socket_server import _apply_table_action, _available_actions_for_current_turn
from app.realtime.socket_server import _current_turn_user_id


def _make_two_player_state(
    dealer_cards: list[str],
    player1_cards: list[str],
    player2_cards: list[str],
) -> TableTurnState:
    player1_bet = 10.0
    player2_bet = 10.0
    player1 = TablePlayerState(
        user_id="u1",
        hands=[TableHandState(hand_id="h1", cards=player1_cards, bet=player1_bet)],
        base_bet=player1_bet,
        bankroll_at_start=1000.0,
        committed_bet=player1_bet,
    )
    player2 = TablePlayerState(
        user_id="u2",
        hands=[TableHandState(hand_id="h2", cards=player2_cards, bet=player2_bet)],
        base_bet=player2_bet,
        bankroll_at_start=1000.0,
        committed_bet=player2_bet,
    )
    return TableTurnState(
        table_id="t1",
        players=["u1", "u2"],
        turn_index=0,
        turn_seconds=8,
        turn_deadline=datetime.now(timezone.utc),
        dealer_cards=dealer_cards,
        dealer_hidden=True,
        player_states={"u1": player1, "u2": player2},
    )


class MultiplayerActionTests(unittest.TestCase):
    def test_insurance_action_is_available_and_keeps_turn(self) -> None:
        state = _make_two_player_state(
            dealer_cards=["AS", "9D"],
            player1_cards=["10H", "7C"],
            player2_cards=["9H", "8C"],
        )
        self.assertIn("insurance", _available_actions_for_current_turn(state))
        finished, error = _apply_table_action(state, user_id="u1", action="insurance")
        self.assertFalse(finished)
        self.assertIsNone(error)
        self.assertEqual(_current_turn_user_id(state), "u1")
        self.assertEqual(state.player_states["u1"].insurance_bet, 5.0)
        self.assertTrue(state.player_states["u1"].insurance_decided)
        self.assertEqual(state.player_states["u1"].committed_bet, 15.0)

    def test_non_insurance_action_auto_declines_insurance(self) -> None:
        state = _make_two_player_state(
            dealer_cards=["AS", "9D"],
            player1_cards=["10H", "7C"],
            player2_cards=["9H", "8C"],
        )
        finished, error = _apply_table_action(state, user_id="u1", action="stand")
        self.assertFalse(finished)
        self.assertIsNone(error)
        self.assertTrue(state.player_states["u1"].insurance_decided)
        self.assertEqual(state.player_states["u1"].insurance_bet, 0.0)

    def test_surrender_moves_to_next_player(self) -> None:
        state = _make_two_player_state(
            dealer_cards=["9S", "7D"],
            player1_cards=["10H", "6C"],
            player2_cards=["9H", "8C"],
        )
        self.assertIn("surrender", _available_actions_for_current_turn(state))
        finished, error = _apply_table_action(state, user_id="u1", action="surrender")
        self.assertFalse(finished)
        self.assertIsNone(error)
        self.assertEqual(_current_turn_user_id(state), "u2")
        hand = state.player_states["u1"].hands[0]
        self.assertEqual(hand.result, "surrender")
        self.assertEqual(hand.status, "surrendered")
        self.assertEqual(hand.payout, -5.0)


if __name__ == "__main__":
    unittest.main()
