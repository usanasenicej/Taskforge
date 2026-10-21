from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "TaskForge"
    app_env: Literal["development", "staging", "production", "test"] = "development"
    app_debug: bool = False
    api_prefix: str = "/api/v1"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 14
    algorithm: str = "HS256"
    internal_api_key: str = "change-me-internal-key"

    database_url: str = "mysql+pymysql://taskforge:taskforge@localhost:3306/taskforge"
    redis_url: str = "redis://localhost:6379/0"
    rq_queue_name: str = "taskforge"

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@taskforge.local"
    smtp_tls: bool = True

    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )
    log_level: str = "INFO"
    json_logs: bool = True
    cache_ttl_seconds: int = 60
    metrics_cache_ttl_seconds: int = 15
    overdue_scan_interval_seconds: int = 120
    worker_metrics_port: int = 9101  # /metrics for a self-hosted Prometheus; 0 disables

    # Grafana Cloud push (all optional). URLs are the full push endpoints:
    #   metrics: https://<prometheus host>/api/v1/push/influx/write
    #   logs:    https://<logs host>/loki/api/v1/push
    grafana_cloud_metrics_url: str = ""
    grafana_cloud_metrics_user: str = ""
    grafana_cloud_logs_url: str = ""
    grafana_cloud_logs_user: str = ""
    grafana_cloud_token: str = ""
    grafana_cloud_push_interval_seconds: float = 15

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                import json

                return json.loads(stripped)
            return [item.strip() for item in stripped.split(",") if item.strip()]
        return value

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
