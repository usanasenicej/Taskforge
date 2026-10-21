"""Seed a demo tenant. Run after migrations: python -m scripts.seed"""

from datetime import UTC, datetime, timedelta

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import Comment, Organization, OrganizationMember, Project, Task, TaskAssignee, User
from app.models.enums import OrgRole, TaskPriority, TaskStatus


def main() -> None:
    db = SessionLocal()
    try:
        if db.query(User).filter(User.email == "owner@taskforge.local").first():
            print("Seed data already present")
            return

        owner = User(
            email="owner@taskforge.local",
            hashed_password=hash_password("password123"),
            full_name="Avery Owner",
            email_verified=True,
        )
        admin = User(
            email="admin@taskforge.local",
            hashed_password=hash_password("password123"),
            full_name="Casey Admin",
            email_verified=True,
        )
        member = User(
            email="member@taskforge.local",
            hashed_password=hash_password("password123"),
            full_name="Morgan Member",
            email_verified=True,
        )
        org = Organization(name="TaskForge Demo", slug="taskforge-demo")
        db.add_all([owner, admin, member, org])
        db.flush()

        db.add_all(
            [
                OrganizationMember(organization_id=org.id, user_id=owner.id, role=OrgRole.OWNER),
                OrganizationMember(organization_id=org.id, user_id=admin.id, role=OrgRole.ADMIN),
                OrganizationMember(organization_id=org.id, user_id=member.id, role=OrgRole.MEMBER),
            ]
        )
        project = Project(
            organization_id=org.id,
            name="Core Platform",
            key="PLAT",
            description="Multi-tenant API architecture, RBAC permissions, and real-time event streaming.",
            created_by=owner.id,
        )
        project2 = Project(
            organization_id=org.id,
            name="Customer Portal",
            key="WEB",
            description="Frontend experience, Kanban boards, analytics charts, and team workflows.",
            created_by=admin.id,
        )
        db.add_all([project, project2])
        db.flush()

        now = datetime.now(UTC)
        due_soon = now + timedelta(hours=18)
        due_next_week = now + timedelta(days=4)
        overdue = now - timedelta(days=1)
        t1 = Task(
            organization_id=org.id,
            project_id=project.id,
            title="Design multi-tenant isolation & RBAC",
            description="Enforce row-level organization_id scoping on every query and role-based access control.",
            status=TaskStatus.IN_PROGRESS,
            priority=TaskPriority.HIGH,
            due_date=due_soon,
            created_by=owner.id,
        )
        t2 = Task(
            organization_id=org.id,
            project_id=project.id,
            title="Configure overdue reminder notifications",
            description="Scan overdue tasks and dispatch background reminder jobs to assignees.",
            status=TaskStatus.TODO,
            priority=TaskPriority.URGENT,
            due_date=overdue,
            created_by=admin.id,
        )
        t3 = Task(
            organization_id=org.id,
            project_id=project.id,
            title="Implement JWT refresh token rotation",
            description="Issue short-lived access tokens and revoke rotated refresh tokens on use.",
            status=TaskStatus.DONE,
            priority=TaskPriority.HIGH,
            due_date=now - timedelta(days=2),
            created_by=owner.id,
        )
        t4 = Task(
            organization_id=org.id,
            project_id=project2.id,
            title="Build interactive Kanban & list views",
            description="Allow filtering by project, priority, assignee, and instant status updates.",
            status=TaskStatus.IN_REVIEW,
            priority=TaskPriority.MEDIUM,
            due_date=due_next_week,
            created_by=admin.id,
        )
        t5 = Task(
            organization_id=org.id,
            project_id=project2.id,
            title="Add real-time SSE workspace sync",
            description="Stream task.created, task.updated, and comment.created events to connected clients.",
            status=TaskStatus.DONE,
            priority=TaskPriority.MEDIUM,
            due_date=due_soon,
            created_by=member.id,
        )
        db.add_all([t1, t2, t3, t4, t5])
        db.flush()
        db.add_all(
            [
                TaskAssignee(task_id=t1.id, user_id=member.id),
                TaskAssignee(task_id=t1.id, user_id=owner.id),
                TaskAssignee(task_id=t2.id, user_id=admin.id),
                TaskAssignee(task_id=t3.id, user_id=owner.id),
                TaskAssignee(task_id=t4.id, user_id=member.id),
                TaskAssignee(task_id=t5.id, user_id=admin.id),
                Comment(
                    organization_id=org.id,
                    task_id=t1.id,
                    user_id=owner.id,
                    body="Keep organization_id on every query and invalidate tenant cache keys on write.",
                ),
                Comment(
                    organization_id=org.id,
                    task_id=t1.id,
                    user_id=member.id,
                    body="Added composite indexes for (organization_id, status) and (organization_id, due_date).",
                ),
            ]
        )
        db.commit()
        print(f"Seeded org_id={org.id} owner@taskforge.local / password123")

    finally:
        db.close()


if __name__ == "__main__":
    main()
