
"""Seed the database with a demo TaskForge tenant.

Run after applying database migrations:

    python -m scripts.seed

Demo credentials (all accounts):
    owner@taskforge.local  / password123
    admin@taskforge.local  / password123
    member@taskforge.local / password123
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import (
    Comment,
    Organization,
    OrganizationMember,
    Project,
    Task,
    TaskAssignee,
    User,
)
from app.models.enums import OrgRole, TaskPriority, TaskStatus


DEMO_ORG_SLUG = "taskforge-demo"
DEFAULT_PASSWORD = "password123"


def create_demo_users(db: Session) -> dict[str, User]:
    """Create the demo users."""

    users = {
        "owner": User(
            email="owner@taskforge.local",
            hashed_password=hash_password(DEFAULT_PASSWORD),
            full_name="Avery Owner",
            email_verified=True,
        ),
        "admin": User(
            email="admin@taskforge.local",
            hashed_password=hash_password(DEFAULT_PASSWORD),
            full_name="Casey Admin",
            email_verified=True,
        ),
        "member": User(
            email="member@taskforge.local",
            hashed_password=hash_password(DEFAULT_PASSWORD),
            full_name="Morgan Member",
            email_verified=True,
        ),
    }

    db.add_all(users.values())
    db.flush()

    return users


def create_demo_organization(db: Session) -> Organization:
    """Create the demo organization."""

    organization = Organization(
        name="TaskForge Demo",
        slug=DEMO_ORG_SLUG,
    )

    db.add(organization)
    db.flush()

    return organization


def create_organization_members(
    db: Session,
    organization: Organization,
    users: dict[str, User],
) -> None:
    """Assign users their respective organization roles."""

    memberships = [
        OrganizationMember(
            organization_id=organization.id,
            user_id=users["owner"].id,
            role=OrgRole.OWNER,
        ),
        OrganizationMember(
            organization_id=organization.id,
            user_id=users["admin"].id,
            role=OrgRole.ADMIN,
        ),
        OrganizationMember(
            organization_id=organization.id,
            user_id=users["member"].id,
            role=OrgRole.MEMBER,
        ),
    ]

    db.add_all(memberships)


def create_demo_projects(
    db: Session,
    organization: Organization,
    users: dict[str, User],
) -> dict[str, Project]:
    """Create the demo projects."""

    projects = {
        "platform": Project(
            organization_id=organization.id,
            name="Core Platform",
            key="PLAT",
            description=(
                "Multi-tenant API architecture, RBAC permissions, "
                "and real-time event streaming."
            ),
            created_by=users["owner"].id,
        ),
        "portal": Project(
            organization_id=organization.id,
            name="Customer Portal",
            key="WEB",
            description=(
                "Frontend experience, Kanban boards, analytics charts, "
                "and team workflows."
            ),
            created_by=users["admin"].id,
        ),
    }

    db.add_all(projects.values())
    db.flush()

    return projects


def create_demo_tasks(
    db: Session,
    organization: Organization,
    projects: dict[str, Project],
    users: dict[str, User],
) -> dict[str, Task]:
    """Create demo tasks with different statuses and priorities."""

    now = datetime.now(UTC)

    tasks = {
        "rbac": Task(
            organization_id=organization.id,
            project_id=projects["platform"].id,
            title="Design multi-tenant isolation & RBAC",
            description=(
                "Enforce row-level organization_id scoping on every "
                "query and role-based access control."
            ),
            status=TaskStatus.IN_PROGRESS,
            priority=TaskPriority.HIGH,
            due_date=now + timedelta(hours=18),
            created_by=users["owner"].id,
        ),
        "reminders": Task(
            organization_id=organization.id,
            project_id=projects["platform"].id,
            title="Configure overdue reminder notifications",
            description=(
                "Scan overdue tasks and dispatch background reminder "
                "jobs to assignees."
            ),
            status=TaskStatus.TODO,
            priority=TaskPriority.URGENT,
            due_date=now - timedelta(days=1),
            created_by=users["admin"].id,
        ),
        "jwt": Task(
            organization_id=organization.id,
            project_id=projects["platform"].id,
            title="Implement JWT refresh token rotation",
            description=(
                "Issue short-lived access tokens and revoke rotated "
                "refresh tokens on use."
            ),
            status=TaskStatus.DONE,
            priority=TaskPriority.HIGH,
            due_date=now - timedelta(days=2),
            created_by=users["owner"].id,
        ),
        "kanban": Task(
            organization_id=organization.id,
            project_id=projects["portal"].id,
            title="Build interactive Kanban & list views",
            description=(
                "Allow filtering by project, priority, assignee, "
                "and instant status updates."
            ),
            status=TaskStatus.IN_REVIEW,
            priority=TaskPriority.MEDIUM,
            due_date=now + timedelta(days=4),
            created_by=users["admin"].id,
        ),
        "sync": Task(
            organization_id=organization.id,
            project_id=projects["portal"].id,
            title="Add real-time SSE workspace sync",
            description=(
                "Stream task.created, task.updated, and comment.created "
                "events to connected clients."
            ),
            status=TaskStatus.DONE,
            priority=TaskPriority.MEDIUM,
            due_date=now + timedelta(hours=18),
            created_by=users["member"].id,
        ),
    }

    db.add_all(tasks.values())
    db.flush()

    return tasks


def create_task_assignees(
    db: Session,
    tasks: dict[str, Task],
    users: dict[str, User],
) -> None:
    """Assign demo tasks to organization members."""

    assignments = [
        ("rbac", "member"),
        ("rbac", "owner"),
        ("reminders", "admin"),
        ("jwt", "owner"),
        ("kanban", "member"),
        ("sync", "admin"),
    ]

    db.add_all(
        [
            TaskAssignee(
                task_id=tasks[task_key].id,
                user_id=users[user_key].id,
            )
            for task_key, user_key in assignments
        ]
    )


def create_demo_comments(
    db: Session,
    organization: Organization,
    tasks: dict[str, Task],
    users: dict[str, User],
) -> None:
    """Add sample discussion comments to demo tasks."""

    comments = [
        Comment(
            organization_id=organization.id,
            task_id=tasks["rbac"].id,
            user_id=users["owner"].id,
            body=(
                "Keep organization_id on every query and invalidate "
                "tenant cache keys on write."
            ),
        ),
        Comment(
            organization_id=organization.id,
            task_id=tasks["rbac"].id,
            user_id=users["member"].id,
            body=(
                "Added composite indexes for (organization_id, status) "
                "and (organization_id, due_date)."
            ),
        ),
    ]

    db.add_all(comments)


def seed_demo_tenant(db: Session) -> None:
    """Create the complete TaskForge demo tenant."""

    existing_organization = (
        db.query(Organization)
        .filter(Organization.slug == DEMO_ORG_SLUG)
        .first()
    )

    if existing_organization:
        print("Demo tenant already exists. Skipping seed.")
        return

    users = create_demo_users(db)
    organization = create_demo_organization(db)

    create_organization_members(db, organization, users)

    projects = create_demo_projects(db, organization, users)

    tasks = create_demo_tasks(db, organization, projects, users)

    create_task_assignees(db, tasks, users)

    create_demo_comments(db, organization, tasks, users)

    db.commit()

    print("\nDemo tenant seeded successfully!")
    print(f"Organization: {organization.name}")
    print(f"Organization ID: {organization.id}")
    print(f"Projects: {len(projects)}")
    print(f"Tasks: {len(tasks)}")
    print(f"Users: {len(users)}")
    print("\nDemo login credentials:")
    print("  Owner:  owner@taskforge.local / password123")
    print("  Admin:  admin@taskforge.local / password123")
    print("  Member: member@taskforge.local / password123")


def main() -> None:
    """Execute the database seeding process."""

    db = SessionLocal()

    try:
        seed_demo_tenant(db)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
