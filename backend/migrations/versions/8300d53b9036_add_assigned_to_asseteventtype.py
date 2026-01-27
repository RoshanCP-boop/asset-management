"""add ASSIGNED to asseteventtype

Revision ID: 8300d53b9036
Revises: 68b14987ddf8
Create Date: 2026-01-21 23:50:35.469103

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8300d53b9036'
down_revision: Union[str, Sequence[str], None] = '68b14987ddf8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
