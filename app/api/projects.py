from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.cache import cache_delete, cache_get, cache_set, invalidate_org, project_cache_key
from app.core.events import publish_event
from app.db.session import get_db
from app.deps import get_current_user, get_membership, require_admin, require_member
from app.models import OrganizationMember, Project, User
from app.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate

router = APIRouter()


@router.get("", response_model=list[ProjectOut])
def list_projects(
    org_id: int,
    membership: OrganizationMember = Depends(get_membership),
    db: Session = Depends(get_db),
):
    return db.query(Project).filter(Project.organization_id == org_id).order_by(Project.id.desc()).all()


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    org_id: int,
    payload: ProjectCreate,
    membership: OrganizationMember = Depends(require_member),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = Project(
        organization_id=org_id,
        name=payload.name,
        key=payload.key,
        description=payload.description,
        created_by=user.id,
    )
    db.add(project)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Project key already exists in this organization") from None
    db.refresh(project)
    invalidate_org(org_id)
    publish_event(org_id, "project.created", {"id": project.id, "name": project.name, "key": project.key}, actor_id=user.id)
    return project


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    org_id: int,
    project_id: int,
    membership: OrganizationMember = Depends(get_membership),
    db: Session = Depends(get_db),
):
    cached = cache_get(project_cache_key(project_id))
    if cached and cached.get("organization_id") == org_id:
        return ProjectOut.model_validate(cached)
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.organization_id == org_id)
        .one_or_none()
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    out = ProjectOut.model_validate(project)
    cache_set(project_cache_key(project_id), out.model_dump(mode="json"))
    return out


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    org_id: int,
    project_id: int,
    payload: ProjectUpdate,
    membership: OrganizationMember = Depends(require_member),
    db: Session = Depends(get_db),
):
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.organization_id == org_id)
        .one_or_none()
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    cache_delete(project_cache_key(project_id))
    invalidate_org(org_id)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    org_id: int,
    project_id: int,
    membership: OrganizationMember = Depends(require_admin),
    db: Session = Depends(get_db),
):
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.organization_id == org_id)
        .one_or_none()
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(project)
    db.commit()
    cache_delete(project_cache_key(project_id))
    invalidate_org(org_id)
    return None
