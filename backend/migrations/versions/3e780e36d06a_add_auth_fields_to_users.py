"""add auth fields to users

Revision ID: 3e780e36d06a
Revises: d1e727271c23
Create Date: 2026-01-21 17:14:39.627226

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql



# revision identifiers, used by Alembic.
revision: str = '3e780e36d06a'
down_revision: Union[str, Sequence[str], None] = 'd1e727271c23'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
        # 1) Create the enum type in Postgres first
    userrole = postgresql.ENUM('ADMIN', 'MANAGER', 'EMPLOYEE', 'AUDITOR', name='userrole')
    userrole.create(op.get_bind(), checkfirst=True)

    # 2) Now add columns
    op.add_column('users', sa.Column('password_hash', sa.String(length=255), nullable=True))
    op.add_column('users', sa.Column('role', userrole, nullable=False, server_default='EMPLOYEE'))
    op.add_column('users', sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()))

    op.create_index('ix_users_role', 'users', ['role'], unique=False)

    # 3) Optional: once existing rows have defaults, drop server_default
    op.alter_column('users', 'role', server_default=None)
    op.alter_column('users', 'is_active', server_default=None)


def downgrade() -> None:
    userrole = postgresql.ENUM('ADMIN', 'MANAGER', 'EMPLOYEE', 'AUDITOR', name='userrole')

    op.drop_index('ix_users_role', table_name='users')
    op.drop_column('users', 'is_active')
    op.drop_column('users', 'role')
    op.drop_column('users', 'password_hash')

    # Drop the enum type last
    userrole.drop(op.get_bind(), checkfirst=True)