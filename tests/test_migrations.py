"""Migrations are the source of truth for the schema; these tests keep them honest."""

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect

from app.db.migrate import alembic_config
from app.db.session import Base


def _db(tmp_path):
    return f"sqlite:///{(tmp_path / 'migrations.db').as_posix()}"


def test_migrations_match_models(tmp_path):
    url = _db(tmp_path)
    command.upgrade(alembic_config(url), "head")

    engine = create_engine(url)
    with engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={"compare_type": True})
        diff = compare_metadata(context, Base.metadata)
    engine.dispose()
    assert diff == [], f"Models and migrations disagree; write a migration for: {diff}"


def test_downgrade_and_upgrade_round_trip(tmp_path):
    url = _db(tmp_path)
    config = alembic_config(url)
    command.upgrade(config, "head")
    command.downgrade(config, "base")

    engine = create_engine(url)
    assert set(inspect(engine).get_table_names()) <= {"alembic_version"}
    engine.dispose()

    command.upgrade(config, "head")
    engine = create_engine(url)
    assert {"users", "tasks", "organizations"} <= set(inspect(engine).get_table_names())
    engine.dispose()
