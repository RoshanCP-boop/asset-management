"""Initial schema - complete database setup

Revision ID: 001_initial
Revises: 
Create Date: 2026-01-29

This is a consolidated migration that creates all tables from scratch.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '001_initial'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all tables."""
    
    # Organizations table (for multi-tenancy)
    op.create_table('organizations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('domain', sa.String(length=255), nullable=True),
        sa.Column('is_personal', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_organizations_domain', 'organizations', ['domain'], unique=True)
    
    # Locations table
    op.create_table('locations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_locations_name', 'locations', ['name'], unique=True)
    
    # Users table
    op.create_table('users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=True),
        sa.Column('google_id', sa.String(length=255), nullable=True),
        sa.Column('role', sa.Enum('ADMIN', 'MANAGER', 'EMPLOYEE', 'AUDITOR', name='userrole'), nullable=False, server_default='EMPLOYEE'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('organization_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_index('ix_users_google_id', 'users', ['google_id'], unique=True)
    op.create_index('ix_users_role', 'users', ['role'])
    op.create_index('ix_users_organization_id', 'users', ['organization_id'])
    
    # Invite codes table
    op.create_table('invite_codes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), nullable=False),
        sa.Column('max_uses', sa.Integer(), nullable=True),
        sa.Column('uses', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_invite_codes_code', 'invite_codes', ['code'], unique=True)
    op.create_index('ix_invite_codes_organization_id', 'invite_codes', ['organization_id'])
    
    # Assets table
    op.create_table('assets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=True),
        sa.Column('asset_tag', sa.String(length=50), nullable=False),
        sa.Column('asset_type', sa.Enum('HARDWARE', 'SOFTWARE', name='assettype'), nullable=False),
        sa.Column('category', sa.String(length=100), nullable=True),
        sa.Column('subscription', sa.String(length=200), nullable=True),
        sa.Column('manufacturer', sa.String(length=200), nullable=True),
        sa.Column('model', sa.String(length=200), nullable=True),
        sa.Column('serial_number', sa.String(length=200), nullable=True),
        sa.Column('purchase_date', sa.Date(), nullable=True),
        sa.Column('warranty_start', sa.Date(), nullable=True),
        sa.Column('warranty_end', sa.Date(), nullable=True),
        sa.Column('warranty_extended_months', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('renewal_date', sa.Date(), nullable=True),
        sa.Column('seats_total', sa.Integer(), nullable=True),
        sa.Column('seats_used', sa.Integer(), nullable=True),
        sa.Column('status', sa.Enum('IN_STOCK', 'ASSIGNED', 'IN_REPAIR', 'RETIRED', name='assetstatus'), nullable=False),
        sa.Column('condition', sa.Enum('NEW', 'GOOD', 'FAIR', 'DAMAGED', name='assetcondition'), nullable=False),
        sa.Column('owner_org', sa.String(length=200), nullable=False, server_default='Company'),
        sa.Column('location_id', sa.Integer(), nullable=True),
        sa.Column('assigned_to_user_id', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
        sa.ForeignKeyConstraint(['location_id'], ['locations.id']),
        sa.ForeignKeyConstraint(['assigned_to_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_assets_asset_tag', 'assets', ['asset_tag'], unique=True)
    op.create_index('ix_assets_asset_type', 'assets', ['asset_type'])
    op.create_index('ix_assets_category', 'assets', ['category'])
    op.create_index('ix_assets_subscription', 'assets', ['subscription'])
    op.create_index('ix_assets_serial_number', 'assets', ['serial_number'], unique=True)
    op.create_index('ix_assets_status', 'assets', ['status'])
    op.create_index('ix_assets_condition', 'assets', ['condition'])
    op.create_index('ix_assets_organization_id', 'assets', ['organization_id'])
    op.create_index('ix_assets_assigned_to_user_id', 'assets', ['assigned_to_user_id'])
    
    # Asset events table (audit log)
    op.create_table('asset_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('asset_id', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.Enum('CREATE', 'ASSIGN', 'RETURN', 'MOVE', 'UPDATE', name='asseteventtype'), nullable=False),
        sa.Column('from_user_id', sa.Integer(), nullable=True),
        sa.Column('to_user_id', sa.Integer(), nullable=True),
        sa.Column('from_location_id', sa.Integer(), nullable=True),
        sa.Column('to_location_id', sa.Integer(), nullable=True),
        sa.Column('actor_user_id', sa.Integer(), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['asset_id'], ['assets.id']),
        sa.ForeignKeyConstraint(['actor_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_asset_events_asset_id', 'asset_events', ['asset_id'])
    op.create_index('ix_asset_events_event_type', 'asset_events', ['event_type'])
    op.create_index('ix_asset_events_timestamp', 'asset_events', ['timestamp'])
    op.create_index('ix_asset_events_actor_user_id', 'asset_events', ['actor_user_id'])
    
    # User requests table
    op.create_table('user_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('requested_name', sa.String(length=200), nullable=False),
        sa.Column('requested_email', sa.String(length=255), nullable=False),
        sa.Column('requested_role', sa.Enum('ADMIN', 'MANAGER', 'EMPLOYEE', 'AUDITOR', name='userrole', create_constraint=False), nullable=False),
        sa.Column('requester_id', sa.Integer(), nullable=False),
        sa.Column('target_admin_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.Enum('PENDING', 'APPROVED', 'DENIED', name='userrequeststatus'), nullable=False, server_default='PENDING'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['requester_id'], ['users.id']),
        sa.ForeignKeyConstraint(['target_admin_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_user_requests_requester_id', 'user_requests', ['requester_id'])
    op.create_index('ix_user_requests_target_admin_id', 'user_requests', ['target_admin_id'])
    op.create_index('ix_user_requests_status', 'user_requests', ['status'])
    
    # Asset requests table
    op.create_table('asset_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('request_type', sa.Enum('NEW_ASSET', 'EXISTING_ASSET', name='assetrequesttype'), nullable=False),
        sa.Column('asset_type_requested', sa.Enum('HARDWARE', 'SOFTWARE', name='assettype', create_constraint=False), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('asset_id', sa.Integer(), nullable=True),
        sa.Column('requester_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.Enum('PENDING', 'APPROVED', 'DENIED', name='assetrequeststatus'), nullable=False, server_default='PENDING'),
        sa.Column('resolved_by_id', sa.Integer(), nullable=True),
        sa.Column('resolution_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['asset_id'], ['assets.id']),
        sa.ForeignKeyConstraint(['requester_id'], ['users.id']),
        sa.ForeignKeyConstraint(['resolved_by_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_asset_requests_asset_id', 'asset_requests', ['asset_id'])
    op.create_index('ix_asset_requests_requester_id', 'asset_requests', ['requester_id'])
    op.create_index('ix_asset_requests_resolved_by_id', 'asset_requests', ['resolved_by_id'])
    op.create_index('ix_asset_requests_status', 'asset_requests', ['status'])
    
    # User events table (audit log)
    op.create_table('user_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.Enum('USER_CREATED', 'USER_DEACTIVATED', 'USER_REACTIVATED', 'ROLE_CHANGED', 'REQUEST_CREATED', 'REQUEST_APPROVED', 'REQUEST_DENIED', 'PASSWORD_CHANGED', name='usereventtype'), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('target_user_id', sa.Integer(), nullable=True),
        sa.Column('actor_user_id', sa.Integer(), nullable=True),
        sa.Column('old_value', sa.String(length=200), nullable=True),
        sa.Column('new_value', sa.String(length=200), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['target_user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['actor_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_user_events_event_type', 'user_events', ['event_type'])
    op.create_index('ix_user_events_timestamp', 'user_events', ['timestamp'])
    op.create_index('ix_user_events_target_user_id', 'user_events', ['target_user_id'])
    op.create_index('ix_user_events_actor_user_id', 'user_events', ['actor_user_id'])


def downgrade() -> None:
    """Drop all tables."""
    op.drop_table('user_events')
    op.drop_table('asset_requests')
    op.drop_table('user_requests')
    op.drop_table('asset_events')
    op.drop_table('assets')
    op.drop_table('invite_codes')
    op.drop_table('users')
    op.drop_table('locations')
    op.drop_table('organizations')
    
    # Drop enums
    op.execute('DROP TYPE IF EXISTS usereventtype')
    op.execute('DROP TYPE IF EXISTS assetrequeststatus')
    op.execute('DROP TYPE IF EXISTS assetrequesttype')
    op.execute('DROP TYPE IF EXISTS userrequeststatus')
    op.execute('DROP TYPE IF EXISTS asseteventtype')
    op.execute('DROP TYPE IF EXISTS assetcondition')
    op.execute('DROP TYPE IF EXISTS assetstatus')
    op.execute('DROP TYPE IF EXISTS assettype')
    op.execute('DROP TYPE IF EXISTS userrole')
