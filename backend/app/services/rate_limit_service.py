from dataclasses import dataclass
import threading
import time

from app.services.redis_client import get_redis_client


@dataclass
class RateLimitDecision:
    allowed: bool
    limit: int
    remaining: int
    retry_after_seconds: int
    reset_after_seconds: int


class RateLimitService:
    def __init__(self) -> None:
        self._redis = get_redis_client()
        self._memory_counters: dict[str, tuple[int, float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str, *, limit: int, window_seconds: int) -> RateLimitDecision:
        safe_limit = max(1, int(limit))
        safe_window = max(1, int(window_seconds))
        decision = self._check_redis(key, safe_limit, safe_window)
        if decision:
            return decision
        return self._check_memory(key, safe_limit, safe_window)

    def _check_redis(
        self,
        key: str,
        limit: int,
        window_seconds: int,
    ) -> RateLimitDecision | None:
        if self._redis is None:
            return None
        try:
            now_epoch = time.time()
            bucket = int(now_epoch // window_seconds)
            redis_key = f"maca:ratelimit:{key}:{bucket}"
            pipe = self._redis.pipeline()
            pipe.incr(redis_key, 1)
            pipe.ttl(redis_key)
            count_value, ttl_value = pipe.execute()
            count = int(count_value)
            ttl = int(ttl_value) if isinstance(ttl_value, int) else -1
            if ttl < 0:
                self._redis.expire(redis_key, window_seconds + 1)
                ttl = window_seconds

            remaining = max(0, limit - count)
            allowed = count <= limit
            retry_after = max(1, ttl) if not allowed else 0
            return RateLimitDecision(
                allowed=allowed,
                limit=limit,
                remaining=remaining,
                retry_after_seconds=retry_after,
                reset_after_seconds=max(1, ttl),
            )
        except Exception:
            return None

    def _check_memory(
        self,
        key: str,
        limit: int,
        window_seconds: int,
    ) -> RateLimitDecision:
        now_epoch = time.time()
        with self._lock:
            stale_keys = [
                bucket_key
                for bucket_key, (_, reset_epoch) in self._memory_counters.items()
                if now_epoch > reset_epoch + 1
            ]
            for stale_key in stale_keys:
                self._memory_counters.pop(stale_key, None)

            bucket = int(now_epoch // window_seconds)
            bucket_key = f"{key}:{bucket}"
            current_count, reset_epoch = self._memory_counters.get(
                bucket_key,
                (0, ((bucket + 1) * window_seconds)),
            )
            next_count = current_count + 1
            self._memory_counters[bucket_key] = (next_count, reset_epoch)

            remaining = max(0, limit - next_count)
            allowed = next_count <= limit
            reset_seconds = max(1, int(reset_epoch - now_epoch))
            retry_after = reset_seconds if not allowed else 0
            return RateLimitDecision(
                allowed=allowed,
                limit=limit,
                remaining=remaining,
                retry_after_seconds=retry_after,
                reset_after_seconds=reset_seconds,
            )


rate_limit_service = RateLimitService()
