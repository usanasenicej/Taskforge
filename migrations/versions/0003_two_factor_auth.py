"""add two-factor authentication (TOTP)

Revision ID: 0003_two_factor_auth
Revises: 0002_email_verification
Create Date: 2026-10-21

Zero-downtime notes: every change is additive or widening. New columns are nullable or have a
server default, so pods still running the previous release keep working during a rolling deploy.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_two_factor_auth"
down_revision: Union[str, None] = "0002_email_verification"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        # Encrypted secrets are longer than the raw base32 value.
        batch_op.alter_column(
            "totp_secret",
            existing_type=sa.String(length=64),
            type_=sa.String(length=255),
            existing_nullable=True,
        )
        batch_op.add_column(sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column("totp_last_counter", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("totp_recovery_codes", sa.Text(), nullable=True))

    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("totp_enabled", existing_type=sa.Boolean(), existing_nullable=False, server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("totp_recovery_codes")
        batch_op.drop_column("totp_last_counter")
        batch_op.drop_column("totp_enabled")
        batch_op.alter_column(
            "totp_secret",
            existing_type=sa.String(length=255),
            type_=sa.String(length=64),
            existing_nullable=True,
        )
