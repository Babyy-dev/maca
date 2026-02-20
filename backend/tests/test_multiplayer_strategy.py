import unittest
from datetime import datetime, timezone

from app.realtime.socket_server import TableHandState, TablePlayerState, TableTurnState
from app.realtime.socket_server import _recommended_basic_strategy_action


def _make_state(
    player_cards: list[str],
    dealer_cards: list[str],
    bankroll: float = 1000.0,
    bet: float = 10.0,
) -> TableTurnState:
    hand = TableHandState(hand_id="h1", cards=player_cards, bet=bet)
    player_state = TablePlayerState(
        user_id="u1",
        hands=[hand],
        bankroll_at_start=bankroll,
        committed_bet=bet,
    )
    return TableTurnState(
        table_id="t1",
        players=["u1"],
        turn_index=0,
        turn_seconds=8,
        turn_deadline=datetime.now(timezone.utc),
        dealer_cards=dealer_cards,
        dealer_hidden=True,
        player_states={"u1": player_state},
    )


class MultiplayerStrategyTests(unittest.TestCase):
    def test_soft_18_vs_6_prefers_double_down(self) -> None:
        state = _make_state(["AH", "7D"], ["6S", "9C"])
        self.assertEqual(_recommended_basic_strategy_action(state), "double_down")

    def test_soft_18_with_three_cards_falls_back_to_hit(self) -> None:
        state = _make_state(["AH", "3D", "4C"], ["6S", "9C"])
        self.assertEqual(_recommended_basic_strategy_action(state), "hit")

    def test_pair_of_eights_prefers_split(self) -> None:
        state = _make_state(["8H", "8D"], ["10S", "9C"])
        self.assertEqual(_recommended_basic_strategy_action(state), "split")

    def test_hard_16_vs_10_prefers_hit(self) -> None:
        state = _make_state(["10H", "6D"], ["10S", "9C"])
        self.assertEqual(_recommended_basic_strategy_action(state), "hit")

    def test_hard_12_vs_4_prefers_stand(self) -> None:
        state = _make_state(["10H", "2D"], ["4S", "9C"])
        self.assertEqual(_recommended_basic_strategy_action(state), "stand")


if __name__ == "__main__":
    unittest.main()
