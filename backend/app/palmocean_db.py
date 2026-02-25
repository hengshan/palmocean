"""PalmOcean — Separate DB connection for TimescaleDB (IoT / time-series data)."""

import logging

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.config import settings

logger = logging.getLogger(__name__)

engine = create_engine(
    settings.palmocean_database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    echo=False,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_palmocean_db():
    """Dependency that provides a PalmOcean TimescaleDB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_palmocean_db():
    """Create tables and enable TimescaleDB hypertables."""
    from app.models.palmocean import PalmOceanBase

    # Enable PostGIS and TimescaleDB extensions
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;"))
        conn.commit()

    # Create all tables
    PalmOceanBase.metadata.create_all(engine)

    # Enable hypertables for time-series tables
    with engine.connect() as conn:
        try:
            conn.execute(
                text("SELECT create_hypertable('tree_health_snapshots', 'timestamp', if_not_exists => TRUE);")
            )
            logger.info("Created hypertable for tree_health_snapshots")
        except Exception as e:
            logger.debug(f"Hypertable tree_health_snapshots: {e}")

        try:
            conn.execute(text("SELECT create_hypertable('iot_events', 'timestamp', if_not_exists => TRUE);"))
            logger.info("Created hypertable for iot_events")
        except Exception as e:
            logger.debug(f"Hypertable iot_events: {e}")

        conn.commit()

    logger.info("PalmOcean TimescaleDB initialized")
