from pydantic import Field, field_validator

from app.models.enums import OrgRole
from app.schemas.common import ORMModel, UTCDateTime, validate_email_value


class UserOut(ORMModel):
    id: int
    email: str
    full_name: str
    is_active: bool
    email_verified: bool = False
    totp_enabled: bool = False
    created_at: UTCDateTime


class MemberOut(ORMModel):
    user_id: int
    email: str
    full_name: str
    role: OrgRole
    created_at: UTCDateTime


class MemberInvite(ORMModel):
    email: str
    full_name: str = Field(min_length=1, max_length=120)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    role: OrgRole = OrgRole.MEMBER

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return validate_email_value(value)


class MemberRoleUpdate(ORMModel):
    role: OrgRole
