import json
import queue
import threading
import time
from typing import Any

import redis
import structlog

from app.config import get_settings
from app.core.telemetry import cache_requests

logger = structlog.get_logger(__name__)
_client: Any = None
_raw_client: Any = None
_lock = threading.Lock()


class InMemoryPubSub:
    """Thread-safe in-process pub/sub for running without Redis/Docker."""

    def __init__(self, broker: "InMemoryRedis") -> None:
        self._broker = broker
        self._channels: set[str] = set()
        self._queue: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=256)
        self._closed = False

    def subscribe(self, *channels: str) -> None:
        for ch in channels:
            self._channels.add(ch)
            self._broker._register_subscriber(ch, self._queue)

    def unsubscribe(self, *channels: str) -> None:
        targets = list(channels) if channels else list(self._channels)
        for ch in targets:
            self._channels.discard(ch)
            self._broker._unregister_subscriber(ch, self._queue)

    def get_message(self, ignore_subscribe_messages: bool = True, timeout: float = 0.0) -> dict[str, Any] | None:
        if self._closed:
            return None
        try:
            msg = self._queue.get(timeout=timeout) if timeout and timeout > 0 else self._queue.get_nowait()
            if ignore_subscribe_messages and msg.get("type") != "message":
                return None
            return msg
        except queue.Empty:
            return None

    def listen(self):
        while not self._closed:
            try:
                yield self._queue.get(timeout=0.5)
            except queue.Empty:
                continue

    def close(self) -> None:
        self._closed = True
        self.unsubscribe()


class InMemoryRedis:
    """In-memory Redis-compatible fallback for running locally without Docker."""

    is_memory_fallback = True

    def __init__(self) -> None:
        self._store: dict[str, tuple[str, float | None]] = {}
        self._lists: dict[str, list[str]] = {}
        self._subscribers: dict[str, list[queue.Queue[dict[str, Any]]]] = {}
        self._sub_lock = threading.Lock()

    def _register_subscriber(self, channel: str, q: queue.Queue[dict[str, Any]]) -> None:
        with self._sub_lock:
            subs = self._subscribers.setdefault(channel, [])
            if q not in subs:
                subs.append(q)

    def _unregister_subscriber(self, channel: str, q: queue.Queue[dict[str, Any]]) -> None:
        with self._sub_lock:
            subs = self._subscribers.get(channel, [])
            if q in subs:
                subs.remove(q)

    def get(self, key: str) -> str | None:
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expires_at = entry
        if expires_at is not None and time.time() > expires_at:
            self._store.pop(key, None)
            return None
        return value

    def set(self, key: str, value: str, ex: int | None = None) -> bool:
        expires_at = (time.time() + ex) if ex else None
        self._store[key] = (value, expires_at)
        return True

    def delete(self, *keys: str) -> int:
        removed = sum(1 for k in keys if self._store.pop(k, None) is not None)
        return removed + sum(1 for k in keys if self._lists.pop(k, None) is not None)

    def incr(self, key: str) -> int:
        value = int(self.get(key) or 0) + 1
        self.set(key, str(value))
        return value

    def expire(self, key: str, seconds: int) -> bool:
        entry = self._store.get(key)
        if entry is None:
            return False
        self._store[key] = (entry[0], time.time() + seconds)
        return True

    def ttl(self, key: str) -> int:
        entry = self._store.get(key)
        if entry is None or self.get(key) is None:
            return -2
        return -1 if entry[1] is None else max(int(entry[1] - time.time()), 0)

    def lpush(self, key: str, *values: str) -> int:
        items = self._lists.setdefault(key, [])
        for value in values:
            items.insert(0, value)
        return len(items)

    def ltrim(self, key: str, start: int, end: int) -> bool:
        if key in self._lists:
            self._lists[key] = self._lists[key][start : end + 1]
        return True

    def lrange(self, key: str, start: int, end: int) -> list[str]:
        items = self._lists.get(key, [])
        return items[start : end + 1] if end >= 0 else items[start:]

    def publish(self, channel: str, message: str) -> int:
        payload = {"type": "message", "channel": channel, "data": message}
        with self._sub_lock:
            subs = list(self._subscribers.get(channel, []))
        delivered = 0
        for q in subs:
            try:
                q.put_nowait(payload)
                delivered += 1
            except queue.Full:
                pass
        return delivered

    def ping(self) -> bool:
        return True

    def pubsub(self) -> InMemoryPubSub:
        return InMemoryPubSub(self)


_memory_fallback = InMemoryRedis()


def _can_reach_redis(url: str) -> bool:
    if not url or url.startswith("memory://"):
        return False
    try:
        probe = redis.Redis.from_url(url, decode_responses=True, socket_connect_timeout=0.5, socket_timeout=0.5)
        return bool(probe.ping())
    except Exception:
        return False


def get_redis() -> Any:
    """Text client for cache and pub/sub (SSE)."""
    global _client
    if _client is not None:
        return _client
    with _lock:
        if _client is None:
            settings = get_settings()
            if _can_reach_redis(settings.redis_url):
                _client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
                logger.info("redis_connected", url=settings.redis_url)
            else:
                _client = _memory_fallback
                logger.warning(
                    "redis_unreachable_using_memory_fallback",
                    url=settings.redis_url,
                    hint="Start Redis (scripts/dev/start-redis.ps1) for caching, RQ jobs and cross-process events",
                )
        return _client


def redis_backend() -> str:
    return "memory" if getattr(get_redis(), "is_memory_fallback", False) else "redis"


def get_redis_raw() -> Any:
    """Bytes client for RQ. RQ cannot use decode_responses=True."""
    global _raw_client
    if _raw_client is not None:
        return _raw_client
    with _lock:
        if _raw_client is None:
            settings = get_settings()
            if _can_reach_redis(settings.redis_url):
                _raw_client = redis.Redis.from_url(settings.redis_url, decode_responses=False)
            else:
                _raw_client = _memory_fallback
        return _raw_client



def cache_get(key: str) -> Any | None:
    try:
        raw = get_redis().get(key)
    except redis.RedisError:
        logger.warning("cache_get_failed", key=key)
        return None
    if raw is None:
        cache_requests.labels(result="miss").inc()
        return None
    cache_requests.labels(result="hit").inc()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def cache_set(key: str, value: Any, ttl: int | None = None) -> None:
    settings = get_settings()
    try:
        get_redis().set(key, json.dumps(value, default=str), ex=ttl or settings.cache_ttl_seconds)
    except redis.RedisError:
        logger.warning("cache_set_failed", key=key)


def cache_delete(*keys: str) -> None:
    if not keys:
        return
    try:
        get_redis().delete(*keys)
    except redis.RedisError:
        logger.warning("cache_delete_failed", keys=list(keys))


def hit_rate_limit(key: str, limit: int, window_seconds: int) -> int | None:
    """Fixed-window counter. Returns seconds to wait when over the limit, else None."""
    try:
        client = get_redis()
        count = client.incr(f"ratelimit:{key}")
        if count == 1:
            client.expire(f"ratelimit:{key}", window_seconds)
        if count > limit:
            return max(int(client.ttl(f"ratelimit:{key}")), 1)
    except redis.RedisError:
        logger.warning("rate_limit_check_failed", key=key)
    return None


def org_cache_key(org_id: int) -> str:
    return f"org:{org_id}"


def project_cache_key(project_id: int) -> str:
    return f"project:{project_id}"


def metrics_cache_key(org_id: int) -> str:
    return f"metrics:{org_id}"


def invalidate_org(org_id: int) -> None:
    cache_delete(org_cache_key(org_id), metrics_cache_key(org_id))
    logger.info("cache_invalidated", org_id=org_id)
