import redis

from app.core.config import get_settings


def get_redis_client() -> redis.Redis | None:
    settings = get_settings()
    try:
        return redis.Redis.from_url(settings.redis_url, decode_responses=True)
    except redis.RedisError:
        return None
