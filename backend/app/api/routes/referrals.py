from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.referrals import ReferralDashboardRead
from app.services.referral_service import get_referral_dashboard

router = APIRouter()


@router.get("/me", response_model=ReferralDashboardRead)
def get_my_referral_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReferralDashboardRead:
    payload = get_referral_dashboard(db, current_user)
    return ReferralDashboardRead.model_validate(payload)
