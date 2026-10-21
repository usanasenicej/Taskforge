"""add email verification fields

Revision ID: 0002_email_verification
Revises: 0001_initial
Create Date: 2026-10-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_email_verification"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column("users", sa.Column("email_verification_code", sa.String(length=12), nullable=True))

    # Accounts predating email verification were already trusted and could sign in.
    op.execute(sa.text("UPDATE users SET email_verified = 1"))
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "email_verified",
            existing_type=sa.Boolean(),
            existing_nullable=False,
            server_default=None,
        )


def downgrade() -> None:
    op.drop_column("users", "email_verification_code")
    op.drop_column("users", "email_verified")
