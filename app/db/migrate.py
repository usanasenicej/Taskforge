"""Run Alembic migrations from code (dev startup and tests)."""

from pathlib import Path

from alembic import command
from alembic.config import Config

ROOT = Path(__file__).resolve().parents[2]


def alembic_config(database_url: str | None = None) -> Config:
    config = Config(str(ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(ROOT / "migrations"))
    config.attributes["configure_logger"] = False
    if database_url:
        config.attributes["database_url"] = database_url
    return config


def upgrade_to_head(database_url: str | None = None) -> None:
    command.upgrade(alembic_config(database_url), "head")
