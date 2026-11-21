import pytest
from pydantic import ValidationError

from app.config import Settings


def test_production_rejects_default_secrets():
    with pytest.raises(ValidationError, match="non-default"):
        Settings(
            app_env="production",
            secret_key="change-me",
            internal_api_key="real-internal-key",
        )


def test_production_accepts_explicit_secrets():
    settings = Settings(
        app_env="production",
        secret_key="not-a-placeholder-secret",
        internal_api_key="not-a-placeholder-internal",
    )
    assert settings.is_production is True


def test_cors_origins_from_comma_string():
    settings = Settings(cors_origins="https://app.example.com, https://admin.example.com")
    assert settings.cors_origins == ["https://app.example.com", "https://admin.example.com"]
