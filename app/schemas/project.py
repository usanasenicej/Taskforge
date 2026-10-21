from pydantic import Field, field_validator

from app.schemas.common import ORMModel, UTCDateTime


class ProjectCreate(ORMModel):
    name: str = Field(min_length=1, max_length=160)
    key: str = Field(min_length=2, max_length=12)
    description: str | None = None

    @field_validator("key")
    @classmethod
    def uppercase_key(cls, value: str) -> str:
        cleaned = value.strip().upper()
        if not cleaned.isalnum():
            raise ValueError("Project key must be alphanumeric")
        return cleaned


class ProjectUpdate(ORMModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = None


class ProjectOut(ORMModel):
    id: int
    organization_id: int
    name: str
    key: str
    description: str | None
    created_by: int
    created_at: UTCDateTime
