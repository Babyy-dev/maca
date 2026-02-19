from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user
from app.db.models import User
from app.schemas.lobby import TableCreateRequest, TableJoinByCodeRequest, TableRead
from app.services.lobby_service import lobby_service

router = APIRouter()


@router.get("/tables", response_model=list[TableRead])
def list_tables(current_user: User = Depends(get_current_user)) -> list[TableRead]:
    visible_tables = lobby_service.visible_tables_for_user(current_user.id)
    return [TableRead(**table.__dict__) for table in visible_tables]


@router.post("/tables", response_model=TableRead, status_code=status.HTTP_201_CREATED)
def create_table(
    payload: TableCreateRequest,
    current_user: User = Depends(get_current_user),
) -> TableRead:
    table = lobby_service.create_table(current_user.id, payload)
    return TableRead(**table.__dict__)


@router.post("/tables/{table_id}/join", response_model=TableRead)
def join_table(table_id: str, current_user: User = Depends(get_current_user)) -> TableRead:
    table = lobby_service.join_table(table_id, current_user.id)
    if not table:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to join table (not found or full)",
        )
    return TableRead(**table.__dict__)


@router.post("/tables/join-by-code", response_model=TableRead)
def join_table_by_code(
    payload: TableJoinByCodeRequest,
    current_user: User = Depends(get_current_user),
) -> TableRead:
    table = lobby_service.join_table_by_invite_code(payload.invite_code, current_user.id)
    if not table:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to join table with invite code",
        )
    return TableRead(**table.__dict__)
