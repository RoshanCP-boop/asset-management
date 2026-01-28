"""add_asset_event_create_and_indexes

Revision ID: 3e5ee0486987
Revises: 6c996bf8e162
Create Date: 2026-01-28 12:04:16.039023

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3e5ee0486987'
down_revision: Union[str, Sequence[str], None] = '6c996bf8e162'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add CREATE to asseteventtype enum
    op.execute("ALTER TYPE asseteventtype ADD VALUE IF NOT EXISTS 'CREATE'")

    # Add missing indexes
    op.create_index(
        "ix_assets_assigned_to_user_id",
        "assets",
        ["assigned_to_user_id"],
    )
    op.create_index(
        "ix_asset_events_timestamp",
        "asset_events",
        ["timestamp"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_asset_events_timestamp", table_name="asset_events")
    op.drop_index("ix_assets_assigned_to_user_id", table_name="assets")
    # Enum value removal is not supported safely; leaving CREATE in place.
