from pydantic import BaseModel, Field, field_validator

from app.schemas.common import validate_email_value


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=120)
    organization_name: str = Field(min_length=1, max_length=120)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return validate_email_value(value)


class VerifyEmailRequest(BaseModel):
    email: str
    code: str = Field(min_length=4, max_length=12)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return validate_email_value(value)


class ResendVerificationRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return validate_email_value(value)


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return validate_email_value(value)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class MfaChallenge(BaseModel):
    mfa_required: bool = True
    mfa_token: str


class MfaLoginRequest(BaseModel):
    mfa_token: str
    code: str = Field(min_length=6, max_length=32)


class TwoFactorCodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=32)


class TwoFactorDisableRequest(BaseModel):
    password: str
    code: str = Field(min_length=6, max_length=32)


class TwoFactorSetupResponse(BaseModel):
    secret: str
    otpauth_uri: str


class TwoFactorStatus(BaseModel):
    enabled: bool
    recovery_codes_left: int
