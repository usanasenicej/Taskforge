from datetime import UTC, datetime
from typing import Annotated

from email_validator import EmailNotValidError, validate_email
from pydantic import AfterValidator, BaseModel, ConfigDict, field_validator


def _as_utc(value: datetime) -> datetime:
    # The database stores UTC without tzinfo; make it explicit so clients never guess.
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


UTCDateTime = Annotated[datetime, AfterValidator(_as_utc)]


def validate_email_value(value: str) -> str:
    if not isinstance(value, str):
        raise TypeError("Email must be a string")

    value = value.strip()
    if not value or "@" not in value:
        raise ValueError("Invalid email address")

    try:
        return validate_email(value, check_deliverability=False).normalized
    except EmailNotValidError:
        # Reserved TLDs are rejected by email_validator but are what demo/test accounts use.
        # They're safe to accept: app.services.email never delivers to them.
        local_part, domain = value.rsplit("@", 1)
        if local_part and "." in domain and domain.lower().endswith(RESERVED_TEST_TLDS):
            return value.lower()
        raise ValueError("Invalid email address")


RESERVED_TEST_TLDS = (".local", ".test", ".example", ".localhost")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Message(BaseModel):
    detail: str


class EmailAddress(BaseModel):
    value: str

    @field_validator("value")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return validate_email_value(value)
