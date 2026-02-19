from datetime import datetime, timezone

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.db.models import FriendRequest, Friendship, TableInvite, User


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _user_brief(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
    }


def _friendship_exists(db: Session, user_id: str, friend_id: str) -> bool:
    pair = db.scalar(
        select(Friendship.id).where(
            and_(
                Friendship.user_id == user_id,
                Friendship.friend_id == friend_id,
            )
        )
    )
    return pair is not None


def _ensure_friendship_pair(db: Session, user_a_id: str, user_b_id: str) -> None:
    if user_a_id == user_b_id:
        return
    if not _friendship_exists(db, user_a_id, user_b_id):
        db.add(Friendship(user_id=user_a_id, friend_id=user_b_id))
    if not _friendship_exists(db, user_b_id, user_a_id):
        db.add(Friendship(user_id=user_b_id, friend_id=user_a_id))


class SocialService:
    def get_overview(self, db: Session, user: User) -> dict:
        friends = self.list_friends(db, user.id)
        incoming_friend_requests = self.list_friend_requests(db, user.id, incoming=True)
        outgoing_friend_requests = self.list_friend_requests(db, user.id, incoming=False)
        incoming_table_invites = self.list_table_invites(db, user.id, incoming=True)
        outgoing_table_invites = self.list_table_invites(db, user.id, incoming=False)
        return {
            "friends": [_user_brief(friend) for friend in friends],
            "incoming_friend_requests": incoming_friend_requests,
            "outgoing_friend_requests": outgoing_friend_requests,
            "incoming_table_invites": incoming_table_invites,
            "outgoing_table_invites": outgoing_table_invites,
        }

    def list_friends(self, db: Session, user_id: str) -> list[User]:
        friend_ids = db.scalars(
            select(Friendship.friend_id).where(Friendship.user_id == user_id)
        ).all()
        if not friend_ids:
            return []
        return db.scalars(
            select(User)
            .where(User.id.in_(friend_ids))
            .order_by(User.username.asc())
        ).all()

    def list_friend_requests(self, db: Session, user_id: str, incoming: bool) -> list[dict]:
        base_filter = FriendRequest.recipient_id == user_id if incoming else FriendRequest.sender_id == user_id
        requests = db.scalars(
            select(FriendRequest)
            .where(base_filter)
            .where(FriendRequest.status == "pending")
            .order_by(FriendRequest.created_at.desc())
        ).all()
        return self._map_friend_requests_with_usernames(db, requests)

    def list_table_invites(self, db: Session, user_id: str, incoming: bool) -> list[dict]:
        base_filter = TableInvite.recipient_id == user_id if incoming else TableInvite.sender_id == user_id
        invites = db.scalars(
            select(TableInvite)
            .where(base_filter)
            .where(TableInvite.status == "pending")
            .order_by(TableInvite.created_at.desc())
        ).all()
        return self._map_table_invites_with_usernames(db, invites)

    def send_friend_request(self, db: Session, sender: User, target_username: str) -> dict:
        normalized_username = target_username.strip()
        target_user = db.scalar(select(User).where(User.username == normalized_username))
        if not target_user:
            raise ValueError("User not found")
        if target_user.id == sender.id:
            raise ValueError("Cannot friend yourself")
        if _friendship_exists(db, sender.id, target_user.id):
            raise ValueError("Already friends")

        existing_pending = db.scalar(
            select(FriendRequest).where(
                and_(
                    FriendRequest.status == "pending",
                    or_(
                        and_(
                            FriendRequest.sender_id == sender.id,
                            FriendRequest.recipient_id == target_user.id,
                        ),
                        and_(
                            FriendRequest.sender_id == target_user.id,
                            FriendRequest.recipient_id == sender.id,
                        ),
                    ),
                )
            )
        )
        if existing_pending:
            if existing_pending.sender_id == sender.id:
                raise ValueError("Friend request already sent")
            accepted = self.respond_to_friend_request(
                db,
                existing_pending.id,
                actor_user_id=sender.id,
                accept=True,
            )
            accepted["status"] = "accepted"
            return accepted

        friend_request = FriendRequest(
            sender_id=sender.id,
            recipient_id=target_user.id,
            status="pending",
        )
        db.add(friend_request)
        db.commit()
        db.refresh(friend_request)
        return self._map_friend_requests_with_usernames(db, [friend_request])[0]

    def respond_to_friend_request(
        self,
        db: Session,
        request_id: str,
        actor_user_id: str,
        accept: bool,
    ) -> dict:
        request = db.scalar(select(FriendRequest).where(FriendRequest.id == request_id))
        if not request:
            raise ValueError("Friend request not found")
        if request.recipient_id != actor_user_id:
            raise ValueError("Not authorized for this friend request")
        if request.status != "pending":
            raise ValueError("Friend request already resolved")

        request.status = "accepted" if accept else "declined"
        request.resolved_at = _utc_now()
        db.add(request)
        if accept:
            _ensure_friendship_pair(db, request.sender_id, request.recipient_id)
        db.commit()
        db.refresh(request)
        return self._map_friend_requests_with_usernames(db, [request])[0]

    def remove_friend(self, db: Session, user_id: str, friend_user_id: str) -> None:
        friendships = db.scalars(
            select(Friendship).where(
                or_(
                    and_(
                        Friendship.user_id == user_id,
                        Friendship.friend_id == friend_user_id,
                    ),
                    and_(
                        Friendship.user_id == friend_user_id,
                        Friendship.friend_id == user_id,
                    ),
                )
            )
        ).all()
        for friendship in friendships:
            db.delete(friendship)
        db.commit()

    def send_table_invite(
        self,
        db: Session,
        sender: User,
        recipient_username: str,
        table_id: str,
        invite_code: str | None,
    ) -> dict:
        normalized_username = recipient_username.strip()
        recipient = db.scalar(select(User).where(User.username == normalized_username))
        if not recipient:
            raise ValueError("Recipient user not found")
        if recipient.id == sender.id:
            raise ValueError("Cannot invite yourself")

        existing_pending = db.scalar(
            select(TableInvite).where(
                and_(
                    TableInvite.sender_id == sender.id,
                    TableInvite.recipient_id == recipient.id,
                    TableInvite.table_id == table_id,
                    TableInvite.status == "pending",
                )
            )
        )
        if existing_pending:
            return self._map_table_invites_with_usernames(db, [existing_pending])[0]

        invite = TableInvite(
            sender_id=sender.id,
            recipient_id=recipient.id,
            table_id=table_id,
            invite_code=invite_code,
            status="pending",
        )
        db.add(invite)
        db.commit()
        db.refresh(invite)
        return self._map_table_invites_with_usernames(db, [invite])[0]

    def respond_to_table_invite(
        self,
        db: Session,
        invite_id: str,
        actor_user_id: str,
        accept: bool,
    ) -> dict:
        invite = db.scalar(select(TableInvite).where(TableInvite.id == invite_id))
        if not invite:
            raise ValueError("Table invite not found")
        if invite.recipient_id != actor_user_id:
            raise ValueError("Not authorized for this table invite")
        if invite.status != "pending":
            raise ValueError("Table invite already resolved")

        invite.status = "accepted" if accept else "declined"
        invite.resolved_at = _utc_now()
        db.add(invite)
        db.commit()
        db.refresh(invite)
        return self._map_table_invites_with_usernames(db, [invite])[0]

    def list_notifications(self, db: Session, user: User) -> list[dict]:
        notifications: list[dict] = []

        incoming_friend_requests = self.list_friend_requests(db, user.id, incoming=True)
        for request in incoming_friend_requests:
            notifications.append(
                {
                    "id": f"friend-request-{request['id']}",
                    "type": "friend_request",
                    "message": f"{request['sender_username']} sent you a friend request",
                    "created_at": request["created_at"],
                    "meta": {"request_id": request["id"]},
                }
            )

        incoming_table_invites = self.list_table_invites(db, user.id, incoming=True)
        for invite in incoming_table_invites:
            notifications.append(
                {
                    "id": f"table-invite-{invite['id']}",
                    "type": "table_invite",
                    "message": f"{invite['sender_username']} invited you to table {invite['table_id']}",
                    "created_at": invite["created_at"],
                    "meta": {"invite_id": invite["id"], "table_id": invite["table_id"]},
                }
            )

        notifications.sort(key=lambda item: item["created_at"], reverse=True)
        return notifications

    def _map_friend_requests_with_usernames(
        self,
        db: Session,
        requests: list[FriendRequest],
    ) -> list[dict]:
        user_ids = {request.sender_id for request in requests} | {
            request.recipient_id for request in requests
        }
        users = db.scalars(select(User).where(User.id.in_(list(user_ids)))).all() if user_ids else []
        user_map = {user.id: user for user in users}

        return [
            {
                "id": request.id,
                "sender_id": request.sender_id,
                "recipient_id": request.recipient_id,
                "sender_username": user_map.get(request.sender_id).username
                if user_map.get(request.sender_id)
                else request.sender_id,
                "recipient_username": user_map.get(request.recipient_id).username
                if user_map.get(request.recipient_id)
                else request.recipient_id,
                "status": request.status,
                "created_at": request.created_at,
                "resolved_at": request.resolved_at,
            }
            for request in requests
        ]

    def _map_table_invites_with_usernames(
        self,
        db: Session,
        invites: list[TableInvite],
    ) -> list[dict]:
        user_ids = {invite.sender_id for invite in invites} | {invite.recipient_id for invite in invites}
        users = db.scalars(select(User).where(User.id.in_(list(user_ids)))).all() if user_ids else []
        user_map = {user.id: user for user in users}

        return [
            {
                "id": invite.id,
                "sender_id": invite.sender_id,
                "recipient_id": invite.recipient_id,
                "sender_username": user_map.get(invite.sender_id).username
                if user_map.get(invite.sender_id)
                else invite.sender_id,
                "recipient_username": user_map.get(invite.recipient_id).username
                if user_map.get(invite.recipient_id)
                else invite.recipient_id,
                "table_id": invite.table_id,
                "invite_code": invite.invite_code,
                "status": invite.status,
                "created_at": invite.created_at,
                "resolved_at": invite.resolved_at,
            }
            for invite in invites
        ]


social_service = SocialService()
