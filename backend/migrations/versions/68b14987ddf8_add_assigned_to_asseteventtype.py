"""add ASSIGNED to asseteventtype

Revision ID: 68b14987ddf8
Revises: 8f6ad8b8d730
Create Date: 2026-01-21 23:35:59.306902

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '68b14987ddf8'
down_revision: Union[str, Sequence[str], None] = '8f6ad8b8d730'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
