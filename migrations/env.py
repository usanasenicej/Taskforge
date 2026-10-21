from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import get_settings
from app.db.session import Base
from app.models import *  # noqa: F401,F403

config = context.config
# When the app runs migrations at startup it keeps its own (structlog) logging config.
if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name, disable_existing_loggers=False)

settings = get_settings()
config.set_main_option("sqlalchemy.url", config.attributes.get("database_url") or settings.database_url)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            # SQLite can't ALTER most things; batch mode rebuilds the table instead.
            render_as_batch=connection.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
