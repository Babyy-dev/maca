import json
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import re
from threading import Lock
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import RoundLog, User
from app.schemas.game import RoundLogRead, SinglePlayerRoundRead

Card = str
SUITS = ("S", "H", "D", "C")
RANKS = ("A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K")
ACTION_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def build_deck() -> list[Card]:
    deck = [f"{rank}{suit}" for suit in SUITS for rank in RANKS]
    rng = secrets.SystemRandom()
    rng.shuffle(deck)
    return deck


def card_value(card: Card) -> int:
    rank = card[:-1]
    if rank in {"J", "Q", "K"}:
        return 10
    if rank == "A":
        return 11
    return int(rank)


def hand_score(cards: list[Card]) -> int:
    score = sum(card_value(card) for card in cards)
    aces = sum(1 for card in cards if card[:-1] == "A")
    while score > 21 and aces > 0:
        score -= 10
        aces -= 1
    return score


def natural_blackjack(cards: list[Card]) -> bool:
    return len(cards) == 2 and hand_score(cards) == 21


def expose_cards(cards: list[Card], reveal_all: bool) -> list[str]:
    if reveal_all or len(cards) < 2:
        return cards
    return [cards[0], "??"]


@dataclass
class ActiveRound:
    round_id: str
    user_id: str
    bet: float
    deck: list[Card]
    player_cards: list[Card]
    dealer_cards: list[Card]
    status: str
    actions: list[str] = field(default_factory=list)
    result: str | None = None
    payout: float | None = None
    message: str | None = None
    action_deadline: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    processed_action_ids: dict[str, datetime] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    ended_at: datetime | None = None


class BlackjackService:
    ACTION_TIMEOUT_SECONDS = 45
    COMPLETED_ROUND_RETENTION_SECONDS = 600
    MAX_ACTION_IDS_PER_ROUND = 200

    def __init__(self) -> None:
        self._rounds: dict[str, ActiveRound] = {}
        self._lock = Lock()

    def _active_round_for_user(self, user_id: str) -> ActiveRound | None:
        for round_state in self._rounds.values():
            if round_state.user_id == user_id and round_state.status == "player_turn":
                return round_state
        return None

    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    def _new_deadline(self) -> datetime:
        return self._now() + timedelta(seconds=self.ACTION_TIMEOUT_SECONDS)

    def _cleanup_round_cache(self) -> None:
        now = self._now()
        stale_rounds: list[str] = []
        for round_id, round_state in self._rounds.items():
            if round_state.status != "completed" or not round_state.ended_at:
                continue
            age_seconds = (now - round_state.ended_at).total_seconds()
            if age_seconds > self.COMPLETED_ROUND_RETENTION_SECONDS:
                stale_rounds.append(round_id)

        for round_id in stale_rounds:
            self._rounds.pop(round_id, None)

    def _track_action_id(self, round_state: ActiveRound, action_id: str | None) -> bool:
        if action_id is None:
            return False

        normalized = action_id.strip()
        if not normalized:
            return False
        if len(normalized) > 64:
            raise ValueError("Invalid action id")
        if not ACTION_ID_PATTERN.match(normalized):
            raise ValueError("Invalid action id")

        if normalized in round_state.processed_action_ids:
            return True

        round_state.processed_action_ids[normalized] = self._now()
        if len(round_state.processed_action_ids) > self.MAX_ACTION_IDS_PER_ROUND:
            oldest = next(iter(round_state.processed_action_ids))
            round_state.processed_action_ids.pop(oldest, None)
        return False

    def _expire_timed_out_rounds(self, db: Session, user_id: str | None = None) -> None:
        now = self._now()
        for round_state in list(self._rounds.values()):
            if user_id and round_state.user_id != user_id:
                continue
            if round_state.status != "player_turn":
                continue
            if now < round_state.action_deadline:
                continue

            round_state.actions.append("anti_cheat_timeout")
            round_state.result = "timeout"
            round_state.payout = -round_state.bet
            round_state.message = "Round timed out. Dealer wins by forfeit."
            self._finalize_round(db, round_state)

    def _draw(self, round_state: ActiveRound) -> Card:
        return round_state.deck.pop()

    def _dealer_play(self, round_state: ActiveRound) -> None:
        while hand_score(round_state.dealer_cards) < 17:
            round_state.dealer_cards.append(self._draw(round_state))
            round_state.actions.append("dealer_hit")

    def _finalize_round(self, db: Session, round_state: ActiveRound) -> None:
        round_state.status = "completed"
        round_state.ended_at = self._now()
        round_state.payout = round(round_state.payout or 0.0, 2)

        user = db.get(User, round_state.user_id)
        if user is not None:
            user.balance = round(max(0.0, user.balance + (round_state.payout or 0.0)), 2)
            db.add(user)

        dealer_score = hand_score(round_state.dealer_cards)
        player_score = hand_score(round_state.player_cards)

        log = RoundLog(
            user_id=round_state.user_id,
            bet=round_state.bet,
            result=round_state.result or "unknown",
            payout=round_state.payout or 0.0,
            player_score=player_score,
            dealer_score=dealer_score,
            player_cards_json=json.dumps(round_state.player_cards),
            dealer_cards_json=json.dumps(round_state.dealer_cards),
            actions_json=json.dumps(round_state.actions),
            created_at=round_state.created_at,
            ended_at=round_state.ended_at or self._now(),
        )
        db.add(log)
        db.commit()

    def _resolve_result(self, db: Session, round_state: ActiveRound) -> None:
        player_score = hand_score(round_state.player_cards)
        dealer_score = hand_score(round_state.dealer_cards)

        if player_score > 21:
            round_state.result = "lose"
            round_state.payout = -round_state.bet
            round_state.message = "Bust. Dealer wins."
        elif dealer_score > 21:
            round_state.result = "win"
            round_state.payout = round_state.bet
            round_state.message = "Dealer busts. You win."
        elif player_score > dealer_score:
            round_state.result = "win"
            round_state.payout = round_state.bet
            round_state.message = "You beat the dealer."
        elif player_score < dealer_score:
            round_state.result = "lose"
            round_state.payout = -round_state.bet
            round_state.message = "Dealer wins."
        else:
            round_state.result = "push"
            round_state.payout = 0.0
            round_state.message = "Push."

        self._finalize_round(db, round_state)

    def _to_view(self, round_state: ActiveRound) -> SinglePlayerRoundRead:
        reveal_all = round_state.status == "completed"
        can_hit = round_state.status == "player_turn"
        can_stand = round_state.status == "player_turn"
        dealer_score = hand_score(round_state.dealer_cards) if reveal_all else None
        return SinglePlayerRoundRead(
            round_id=round_state.round_id,
            status=round_state.status,
            bet=round_state.bet,
            player_cards=round_state.player_cards,
            dealer_cards=expose_cards(round_state.dealer_cards, reveal_all),
            player_score=hand_score(round_state.player_cards),
            dealer_score=dealer_score,
            can_hit=can_hit,
            can_stand=can_stand,
            result=round_state.result,
            payout=round_state.payout,
            message=round_state.message,
            actions=round_state.actions,
            created_at=round_state.created_at,
            ended_at=round_state.ended_at,
        )

    def start_round(self, db: Session, user_id: str, bet: float) -> SinglePlayerRoundRead:
        with self._lock:
            self._expire_timed_out_rounds(db, user_id=user_id)
            self._cleanup_round_cache()

            if self._active_round_for_user(user_id):
                raise ValueError("Finish your current round before starting a new one")

            user = db.get(User, user_id)
            if user is None:
                raise ValueError("User not found")

            safe_bet = round(float(bet), 2)
            if safe_bet <= 0:
                raise ValueError("Bet must be greater than 0")
            if safe_bet > user.balance:
                raise ValueError("Insufficient balance for this bet")

            deck = build_deck()
            round_state = ActiveRound(
                round_id=uuid4().hex,
                user_id=user_id,
                bet=safe_bet,
                deck=deck,
                player_cards=[deck.pop(), deck.pop()],
                dealer_cards=[deck.pop(), deck.pop()],
                status="player_turn",
                actions=["start_round"],
                action_deadline=self._new_deadline(),
            )

            player_blackjack = natural_blackjack(round_state.player_cards)
            dealer_blackjack = natural_blackjack(round_state.dealer_cards)

            if player_blackjack and dealer_blackjack:
                round_state.result = "push"
                round_state.payout = 0.0
                round_state.message = "Both blackjack. Push."
                self._finalize_round(db, round_state)
            elif player_blackjack:
                round_state.result = "blackjack"
                round_state.payout = round(round_state.bet * 1.5, 2)
                round_state.message = "Blackjack. You win 3:2."
                self._finalize_round(db, round_state)
            elif dealer_blackjack:
                round_state.result = "lose"
                round_state.payout = -round_state.bet
                round_state.message = "Dealer blackjack."
                self._finalize_round(db, round_state)

            self._rounds[round_state.round_id] = round_state
            return self._to_view(round_state)

    def get_round(self, db: Session, user_id: str, round_id: str) -> SinglePlayerRoundRead | None:
        with self._lock:
            self._expire_timed_out_rounds(db, user_id=user_id)
            self._cleanup_round_cache()

            round_state = self._rounds.get(round_id)
            if not round_state or round_state.user_id != user_id:
                return None
            return self._to_view(round_state)

    def hit(
        self,
        db: Session,
        user_id: str,
        round_id: str,
        action_id: str | None = None,
    ) -> SinglePlayerRoundRead | None:
        with self._lock:
            self._expire_timed_out_rounds(db, user_id=user_id)
            self._cleanup_round_cache()

            round_state = self._rounds.get(round_id)
            if not round_state or round_state.user_id != user_id:
                return None
            if round_state.status != "player_turn":
                return self._to_view(round_state)
            if self._track_action_id(round_state, action_id):
                return self._to_view(round_state)

            round_state.player_cards.append(self._draw(round_state))
            round_state.actions.append("player_hit")

            if hand_score(round_state.player_cards) >= 21:
                round_state.actions.append("auto_stand")
                self._dealer_play(round_state)
                self._resolve_result(db, round_state)
            else:
                round_state.action_deadline = self._new_deadline()

            return self._to_view(round_state)

    def stand(
        self,
        db: Session,
        user_id: str,
        round_id: str,
        action_id: str | None = None,
    ) -> SinglePlayerRoundRead | None:
        with self._lock:
            self._expire_timed_out_rounds(db, user_id=user_id)
            self._cleanup_round_cache()

            round_state = self._rounds.get(round_id)
            if not round_state or round_state.user_id != user_id:
                return None
            if round_state.status != "player_turn":
                return self._to_view(round_state)
            if self._track_action_id(round_state, action_id):
                return self._to_view(round_state)

            round_state.actions.append("player_stand")
            self._dealer_play(round_state)
            self._resolve_result(db, round_state)
            return self._to_view(round_state)

    def history(self, db: Session, user_id: str, limit: int = 20) -> list[RoundLogRead]:
        with self._lock:
            self._expire_timed_out_rounds(db, user_id=user_id)
            self._cleanup_round_cache()

        stmt = (
            select(RoundLog)
            .where(RoundLog.user_id == user_id)
            .order_by(RoundLog.ended_at.desc())
            .limit(limit)
        )
        rows = db.scalars(stmt).all()
        return [
            RoundLogRead(
                id=row.id,
                user_id=row.user_id,
                bet=row.bet,
                result=row.result,
                payout=row.payout,
                player_score=row.player_score,
                dealer_score=row.dealer_score,
                player_cards=json.loads(row.player_cards_json),
                dealer_cards=json.loads(row.dealer_cards_json),
                actions=json.loads(row.actions_json),
                created_at=row.created_at,
                ended_at=row.ended_at,
            )
            for row in rows
        ]


blackjack_service = BlackjackService()
