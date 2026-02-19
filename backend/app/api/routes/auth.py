from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.request_meta import extract_client_ip, extract_user_agent
from app.core.security import (
    build_totp_uri,
    create_access_token_with_claims,
    generate_totp_secret,
    verify_password,
    verify_totp_code,
)
from app.db.models import User
from app.db.session import get_db
from app.schemas.auth import (
    EmailVerificationConfirmRequest,
    EmailVerificationRequest,
    EmailVerificationStatusRead,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    TwoFactorDisableRequest,
    TwoFactorEnableRequest,
    TwoFactorSetupResponse,
    TwoFactorStatusRead,
    UserRead,
)
from app.services.auth_service import (
    clear_failed_login_attempts,
    create_user_session,
    create_user,
    get_user_by_email,
    get_user_by_username,
    is_login_locked,
    issue_email_verification_token,
    record_security_event,
    register_failed_login_attempt,
    verify_email_with_token,
)
from app.services.referral_service import (
    apply_referral_signup_bonus,
    get_user_by_referral_code,
    normalize_referral_code,
)

router = APIRouter()


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> UserRead:
    if get_user_by_email(db, payload.email.lower()):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")
    if get_user_by_username(db, payload.username.strip()):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already in use")

    referrer = None
    normalized_referral_code = normalize_referral_code(payload.referral_code)
    if normalized_referral_code:
        referrer = get_user_by_referral_code(db, normalized_referral_code)
        if not referrer:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid referral code",
            )

    user = create_user(
        db,
        payload,
        referred_by_user_id=referrer.id if referrer else None,
    )

    if referrer:
        try:
            apply_referral_signup_bonus(
                db,
                referrer=referrer,
                new_user=user,
                referral_code=normalized_referral_code,
            )
            db.refresh(user)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if not user.email_verified:
        token = issue_email_verification_token(db, user=user)
        print(f"[SECURITY] Email verification token for {user.email}: {token}")

    record_security_event(
        db,
        event_type="register_success",
        severity="info",
        user_id=user.id,
        ip_address=extract_client_ip(request),
        user_agent=extract_user_agent(request),
    )
    return UserRead.model_validate(user)


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> TokenResponse:
    settings = get_settings()
    user = get_user_by_email(db, payload.email.lower())
    client_ip = extract_client_ip(request)
    user_agent = extract_user_agent(request)

    if not user:
        record_security_event(
            db,
            event_type="login_failed_unknown_user",
            severity="warning",
            user_id=None,
            ip_address=client_ip,
            user_agent=user_agent,
            metadata={"email": payload.email.lower()},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if is_login_locked(user):
        record_security_event(
            db,
            event_type="login_blocked_lockout",
            severity="warning",
            user_id=user.id,
            ip_address=client_ip,
            user_agent=user_agent,
        )
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Too many failed logins. Try again later.",
        )

    if not verify_password(payload.password, user.hashed_password):
        register_failed_login_attempt(db, user)
        record_security_event(
            db,
            event_type="login_failed_bad_password",
            severity="warning",
            user_id=user.id,
            ip_address=client_ip,
            user_agent=user_agent,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if settings.auth_require_email_verification and not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email verification required",
        )

    if user.two_factor_enabled:
        if not payload.otp_code:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="2FA code required",
            )
        if not user.two_factor_secret or not verify_totp_code(
            user.two_factor_secret,
            payload.otp_code,
            step_seconds=settings.two_factor_time_step_seconds,
            allowed_drift_steps=settings.two_factor_allowed_drift_steps,
        ):
            record_security_event(
                db,
                event_type="login_failed_bad_2fa",
                severity="warning",
                user_id=user.id,
                ip_address=client_ip,
                user_agent=user_agent,
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid 2FA code",
            )

    clear_failed_login_attempts(db, user)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=settings.access_token_expire_minutes)
    token_jti = uuid4().hex
    session = create_user_session(
        db,
        user_id=user.id,
        token_jti=token_jti,
        ip_address=client_ip,
        user_agent=user_agent,
        expires_at=expires_at,
    )
    user.last_login_at = now
    db.add(user)
    db.commit()
    db.refresh(user)

    record_security_event(
        db,
        event_type="login_success",
        severity="info",
        user_id=user.id,
        ip_address=client_ip,
        user_agent=user_agent,
    )
    return TokenResponse(
        access_token=create_access_token_with_claims(
            user.email,
            session_id=session.id,
            token_jti=token_jti,
        ),
        session_id=session.id,
    )


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)) -> UserRead:
    return UserRead.model_validate(current_user)


@router.post("/email/verify/request", response_model=EmailVerificationStatusRead)
def request_email_verification(
    payload: EmailVerificationRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> EmailVerificationStatusRead:
    user = get_user_by_email(db, payload.email.lower())
    if not user:
        return EmailVerificationStatusRead(
            verified=False,
            message="If this account exists, a verification email has been sent",
        )
    if user.email_verified:
        return EmailVerificationStatusRead(verified=True, message="Email already verified")

    try:
        token = issue_email_verification_token(db, user=user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc

    print(f"[SECURITY] Email verification token for {user.email}: {token}")
    record_security_event(
        db,
        event_type="email_verification_sent",
        severity="info",
        user_id=user.id,
        ip_address=extract_client_ip(request),
        user_agent=extract_user_agent(request),
    )
    return EmailVerificationStatusRead(verified=False, message="Verification email sent")


@router.post("/email/verify/confirm", response_model=EmailVerificationStatusRead)
def confirm_email_verification(
    payload: EmailVerificationConfirmRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> EmailVerificationStatusRead:
    try:
        user = verify_email_with_token(db, token=payload.token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    record_security_event(
        db,
        event_type="email_verified",
        severity="info",
        user_id=user.id,
        ip_address=extract_client_ip(request),
        user_agent=extract_user_agent(request),
    )
    return EmailVerificationStatusRead(verified=True, message="Email verified successfully")


@router.post("/2fa/setup", response_model=TwoFactorSetupResponse)
def setup_two_factor(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TwoFactorSetupResponse:
    settings = get_settings()
    secret = generate_totp_secret()
    current_user.two_factor_pending_secret = secret
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return TwoFactorSetupResponse(
        secret=secret,
        provisioning_uri=build_totp_uri(secret, current_user.email, settings.two_factor_issuer),
        issuer=settings.two_factor_issuer,
    )


@router.post("/2fa/enable", response_model=TwoFactorStatusRead)
def enable_two_factor(
    payload: TwoFactorEnableRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TwoFactorStatusRead:
    settings = get_settings()
    pending_secret = current_user.two_factor_pending_secret
    if not pending_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA setup not started")
    if not verify_totp_code(
        pending_secret,
        payload.code,
        step_seconds=settings.two_factor_time_step_seconds,
        allowed_drift_steps=settings.two_factor_allowed_drift_steps,
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid 2FA code")
    current_user.two_factor_secret = pending_secret
    current_user.two_factor_pending_secret = None
    current_user.two_factor_enabled = True
    now = datetime.now(timezone.utc)
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return TwoFactorStatusRead(enabled=True, updated_at=now)


@router.post("/2fa/disable", response_model=TwoFactorStatusRead)
def disable_two_factor(
    payload: TwoFactorDisableRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TwoFactorStatusRead:
    settings = get_settings()
    if not current_user.two_factor_enabled or not current_user.two_factor_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA is not enabled")
    if not verify_totp_code(
        current_user.two_factor_secret,
        payload.code,
        step_seconds=settings.two_factor_time_step_seconds,
        allowed_drift_steps=settings.two_factor_allowed_drift_steps,
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid 2FA code")
    current_user.two_factor_enabled = False
    current_user.two_factor_secret = None
    current_user.two_factor_pending_secret = None
    now = datetime.now(timezone.utc)
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return TwoFactorStatusRead(enabled=False, updated_at=now)
