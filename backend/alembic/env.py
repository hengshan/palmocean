"""Alembic env.py — configured for PalmView PostGIS models."""

import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Ensure app is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import Base  # noqa: E402
import app.models  # noqa: E402, F401  — register all models

config = context.config

# Override sqlalchemy.url from env var if set
db_url = os.getenv("GEO_DATABASE_URL")
if db_url:
    config.set_main_option("sqlalchemy.url", db_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def include_name(name, type_, parent_names):
    """Skip PostGIS internal tables."""
    if type_ == "table" and name.startswith("spatial_ref_sys"):
        return False
    return True


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_name=include_name,
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
            include_name=include_name,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
