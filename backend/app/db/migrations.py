from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def ensure_runtime_schema(engine: Engine) -> None:
    # Lightweight runtime migration for local dev SQLite databases.
    with engine.begin() as connection:
        inspector = inspect(connection)
        tables = set(inspector.get_table_names())
        if "users" not in tables:
            return

        user_columns = {column["name"] for column in inspector.get_columns("users")}
        if "balance" not in user_columns:
            connection.execute(
                text("ALTER TABLE users ADD COLUMN balance FLOAT NOT NULL DEFAULT 1000.0")
            )
        if "role" not in user_columns:
            connection.execute(
                text("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'player'")
            )
        if "referral_code" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN referral_code VARCHAR(20)"))
        if "referred_by_user_id" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN referred_by_user_id VARCHAR(32)"))
        if "referral_bonus_earned" not in user_columns:
            connection.execute(
                text("ALTER TABLE users ADD COLUMN referral_bonus_earned FLOAT NOT NULL DEFAULT 0.0")
            )
        if "email_verified" not in user_columns:
            connection.execute(
                text("ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT 0")
            )
        if "email_verified_at" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN email_verified_at DATETIME"))
        if "failed_login_attempts" not in user_columns:
            connection.execute(
                text("ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0")
            )
        if "login_locked_until" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN login_locked_until DATETIME"))
        if "last_login_at" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN last_login_at DATETIME"))
        if "two_factor_enabled" not in user_columns:
            connection.execute(
                text("ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN NOT NULL DEFAULT 0")
            )
        if "two_factor_secret" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN two_factor_secret VARCHAR(255)"))
        if "two_factor_pending_secret" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN two_factor_pending_secret VARCHAR(255)"))

        connection.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_referral_code ON users(referral_code)")
        )
        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_users_referred_by_user_id ON users(referred_by_user_id)"
            )
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_users_email_verified ON users(email_verified)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_users_login_locked_until ON users(login_locked_until)")
        )
