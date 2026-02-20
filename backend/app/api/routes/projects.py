"""Project CRUD endpoints."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import (
    ProjectModel, ProjectCreate, ProjectUpdate, ProjectResponse,
    ProjectImage,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectResponse])
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(ProjectModel).order_by(ProjectModel.updated_at.desc()).all()
    results = []
    for p in projects:
        results.append(ProjectResponse(
            id=p.id, name=p.name, description=p.description,
            bounds=p.bounds, settings=p.settings,
            feature_count=len(p.features),
            image_count=len(p.images),
            created_at=p.created_at, updated_at=p.updated_at,
        ))
    return results


@router.post("", response_model=ProjectResponse, status_code=201)
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    project = ProjectModel(
        id=str(uuid.uuid4()),
        name=body.name,
        description=body.description,
        bounds=body.bounds,
        settings=body.settings or {"classes": ["building", "road", "vegetation", "water", "solar_panel"]},
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return ProjectResponse(
        id=project.id, name=project.name, description=project.description,
        bounds=project.bounds, settings=project.settings,
        feature_count=0, image_count=0,
        created_at=project.created_at, updated_at=project.updated_at,
    )


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: str, db: Session = Depends(get_db)):
    p = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    return ProjectResponse(
        id=p.id, name=p.name, description=p.description,
        bounds=p.bounds, settings=p.settings,
        feature_count=len(p.features),
        image_count=len(p.images),
        created_at=p.created_at, updated_at=p.updated_at,
    )


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: str, body: ProjectUpdate, db: Session = Depends(get_db)):
    p = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(p, field, value)
    p.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(p)
    return ProjectResponse(
        id=p.id, name=p.name, description=p.description,
        bounds=p.bounds, settings=p.settings,
        feature_count=len(p.features),
        image_count=len(p.images),
        created_at=p.created_at, updated_at=p.updated_at,
    )


@router.delete("/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    p = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    db.delete(p)
    db.commit()
    return {"status": "ok", "message": f"Project {project_id} deleted"}


@router.post("/{project_id}/images/{image_id}")
def add_image_to_project(project_id: str, image_id: str, db: Session = Depends(get_db)):
    p = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    link = ProjectImage(project_id=project_id, image_id=image_id)
    db.add(link)
    db.commit()
    return {"status": "ok"}
