from fastapi import APIRouter

from app.api.routes.admin import router as admin_router
from app.api.routes.auth import router as auth_router
from app.api.routes.game import router as game_router
from app.api.routes.health import router as health_router
from app.api.routes.lobby import router as lobby_router
from app.api.routes.profile import router as profile_router
from app.api.routes.referrals import router as referrals_router
from app.api.routes.social import router as social_router
from app.api.routes.stats import router as stats_router
from app.api.routes.wallet import router as wallet_router

router = APIRouter()
router.include_router(health_router, tags=["health"])
router.include_router(auth_router, prefix="/auth", tags=["auth"])
router.include_router(profile_router, prefix="/profile", tags=["profile"])
router.include_router(lobby_router, prefix="/lobby", tags=["lobby"])
router.include_router(game_router, prefix="/game", tags=["game"])
router.include_router(social_router, prefix="/social", tags=["social"])
router.include_router(referrals_router, prefix="/referrals", tags=["referrals"])
router.include_router(admin_router, prefix="/admin", tags=["admin"])
router.include_router(stats_router, prefix="/stats", tags=["stats"])
router.include_router(wallet_router, prefix="/wallet", tags=["wallet"])
