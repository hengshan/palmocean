"""add inference_result_drafts table

Revision ID: a1b2c3d4e5f6
Revises: 465b89dd9e71
Create Date: 2026-02-25 15:00:00.000000

Phase 1 persist table — no auth/FK deps, stores GeoAI results inline.
Phase 2 will link these to inference_jobs/outputs + MinIO artifacts.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON, UUID

# revision identifiers
revision = 'a1b2c3d4e5f6'
down_revision = '465b89dd9e71'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'inference_result_drafts',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('plantation_id', UUID(as_uuid=True), nullable=True),
        sa.Column('project_id', UUID(as_uuid=True), nullable=True),
        sa.Column('model_slug', sa.String(100), nullable=False),
        sa.Column('task_type', sa.String(50), nullable=False),
        sa.Column('prompt_type', sa.String(50), nullable=False),
        sa.Column('prompt_params', JSON, nullable=True),
        sa.Column('geojson', JSON, nullable=False),
        sa.Column('stats', JSON, nullable=True),
        sa.Column('inference_time_ms', sa.Integer, nullable=True),
        sa.Column('image_url', sa.Text, nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
    )
    op.create_index('ix_ird_plantation', 'inference_result_drafts', ['plantation_id'])
    op.create_index('ix_ird_created', 'inference_result_drafts', ['created_at'])
    op.create_index('ix_ird_model', 'inference_result_drafts', ['model_slug'])


def downgrade() -> None:
    op.drop_index('ix_ird_model', table_name='inference_result_drafts')
    op.drop_index('ix_ird_created', table_name='inference_result_drafts')
    op.drop_index('ix_ird_plantation', table_name='inference_result_drafts')
    op.drop_table('inference_result_drafts')
