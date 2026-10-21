from pydantic import Field

from app.schemas.common import ORMModel, UTCDateTime


class OrganizationCreate(ORMModel):
    name: str = Field(min_length=1, max_length=120)


class OrganizationOut(ORMModel):
    id: int
    name: str
    slug: str
    created_at: UTCDateTime
