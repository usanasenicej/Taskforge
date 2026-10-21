from datetime import UTC, datetime


def utc_now() -> datetime:
    return datetime.now(UTC)


def utc_now_naive() -> datetime:
    """MariaDB DATETIME is timezone-naive; store and compare in UTC."""
    return datetime.now(UTC).replace(tzinfo=None)
