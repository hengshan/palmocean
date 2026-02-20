"""Database engine & session factory — PostgreSQL / PostGIS."""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from backend directory
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, MappedAsDataclass, sessionmaker

DATABASE_URL = os.getenv(
    "GEO_DATABASE_URL",
    "postgresql://palmview:palmview@localhost:5432/palmview",
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=10)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables. For production use Alembic migrations instead."""
    from sqlalchemy import text

    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
        conn.commit()

    # Import models so metadata is populated
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
