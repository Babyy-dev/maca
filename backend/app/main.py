from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.routes import router as api_router
from app.core.config import get_settings
from app.core.request_meta import extract_client_ip
from app.db.base import Base
from app.db.migrations import ensure_runtime_schema
from app.db.session import engine
from app.realtime.socket_server import build_socket_app
from app.services.rate_limit_service import rate_limit_service

settings = get_settings()

api_app = FastAPI(title=settings.app_name, debug=settings.debug)


class ApiRateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if not settings.rate_limit_enabled:
            return await call_next(request)

        if request.url.path.endswith("/health"):
            return await call_next(request)

        client_ip = extract_client_ip(request)
        path = request.url.path.lower()
        if "/auth/" in path:
            scope = "auth"
            limit = settings.rate_limit_auth_limit
            window_seconds = settings.rate_limit_auth_window_seconds
        elif "/admin/" in path or "/wallet/" in path:
            scope = "sensitive"
            limit = settings.rate_limit_sensitive_limit
            window_seconds = settings.rate_limit_sensitive_window_seconds
        else:
            scope = "global"
            limit = settings.rate_limit_global_limit
            window_seconds = settings.rate_limit_global_window_seconds

        decision = rate_limit_service.check(
            f"api:{scope}:{client_ip}",
            limit=limit,
            window_seconds=window_seconds,
        )
        headers = {
            "X-RateLimit-Limit": str(decision.limit),
            "X-RateLimit-Remaining": str(decision.remaining),
            "X-RateLimit-Reset-Seconds": str(decision.reset_after_seconds),
        }
        if not decision.allowed:
            headers["Retry-After"] = str(decision.retry_after_seconds)
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded"},
                headers=headers,
            )

        response = await call_next(request)
        for key, value in headers.items():
            response.headers[key] = value
        return response


api_app.add_middleware(ApiRateLimitMiddleware)
api_app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
api_app.include_router(api_router, prefix=settings.api_prefix)


@api_app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_runtime_schema(engine)


app = build_socket_app(api_app)
