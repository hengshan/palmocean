"""Sprint 1 — Projects API routes (v1, uses new domain models)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.tenancy import Project
from app.schemas.projects_v1 import (
    ProjectCreateV1, ProjectCreated, ProjectDetailV1,
    ProjectListV1, ProjectUpdateV1,
)

router = APIRouter(prefix="/api/v1/projects", tags=["projects-v1"])


def _slugify(name: str) -> str:
    import re
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:100]


@router.post("", response_model=ProjectCreated, status_code=201)
def create_project(body: ProjectCreateV1, db: Session = Depends(get_db)):
    slug = _slugify(body.name)
    # Ensure unique slug within org
    existing = db.query(Project).filter(Project.org_id == body.org_id, Project.slug == slug).first()
    if existing:
        slug = f"{slug}-{uuid.uuid4().hex[:6]}"

    project = Project(
        org_id=body.org_id,
        name=body.name,
        slug=slug,
        description=body.description,
        region=body.region,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return ProjectCreated(project_id=project.project_id, name=project.name)


@router.get("", response_model=ProjectListV1)
def list_projects(
    org_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
):
    projects = (
        db.query(Project)
        .filter(Project.org_id == org_id, Project.archived_at.is_(None))
        .order_by(Project.updated_at.desc())
        .all()
    )
    return ProjectListV1(
        projects=[ProjectDetailV1.model_validate(p) for p in projects],
    )


@router.get("/{project_id}", response_model=ProjectDetailV1)
def get_project(project_id: uuid.UUID, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.project_id == project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    return ProjectDetailV1.model_validate(p)


@router.put("/{project_id}", response_model=ProjectDetailV1)
def update_project(project_id: uuid.UUID, body: ProjectUpdateV1, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.project_id == project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(p, field, value)
    p.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(p)
    return ProjectDetailV1.model_validate(p)


@router.delete("/{project_id}")
def delete_project(project_id: uuid.UUID, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.project_id == project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    p.archived_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "ok", "message": f"Project {project_id} archived"}
