"""Phase 12: Collaboration endpoints — members, permissions, audit log."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.auth import UserModel, require_auth, get_current_user
from app.models.collaboration import (
    ProjectMember, AuditLog,
    InviteMemberRequest, MemberResponse, AuditLogResponse,
)
from app.models.project import ProjectModel

router = APIRouter(tags=["collaboration"])


def _check_project_access(
    project_id: str, user: UserModel | None, db: Session, min_role: str = "viewer"
) -> ProjectModel:
    """Check user has access to project. Returns project or raises 403."""
    project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    # If no auth required (dev mode), allow all
    if user is None:
        return project

    member = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id)
        .first()
    )
    if not member:
        raise HTTPException(403, "Not a member of this project")

    role_hierarchy = {"viewer": 0, "editor": 1, "owner": 2}
    if role_hierarchy.get(member.role, 0) < role_hierarchy.get(min_role, 0):
        raise HTTPException(403, f"Requires {min_role} role, you have {member.role}")

    return project


def _log_action(
    db: Session, project_id: str, user: UserModel | None, action: str, details: dict | None = None
):
    """Record an audit log entry."""
    log = AuditLog(
        project_id=project_id,
        user_id=user.id if user else "anonymous",
        username=user.username if user else "anonymous",
        action=action,
        details=details,
    )
    db.add(log)


# --- Members ---

@router.get("/api/projects/{project_id}/members", response_model=list[MemberResponse])
def list_members(project_id: str, user: UserModel | None = Depends(get_current_user), db: Session = Depends(get_db)):
    _check_project_access(project_id, user, db)
    members = db.query(ProjectMember).filter(ProjectMember.project_id == project_id).all()
    result = []
    for m in members:
        u = db.query(UserModel).filter(UserModel.id == m.user_id).first()
        if u:
            result.append(MemberResponse(
                id=m.id, user_id=m.user_id, username=u.username,
                email=u.email, role=m.role, joined_at=m.joined_at,
            ))
    return result


@router.post("/api/projects/{project_id}/members", status_code=201)
def invite_member(
    project_id: str,
    body: InviteMemberRequest,
    user: UserModel = Depends(require_auth),
    db: Session = Depends(get_db),
):
    _check_project_access(project_id, user, db, min_role="owner")

    target = db.query(UserModel).filter(UserModel.email == body.email).first()
    if not target:
        raise HTTPException(404, "User not found")

    existing = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == target.id)
        .first()
    )
    if existing:
        raise HTTPException(400, "User is already a member")

    member = ProjectMember(
        project_id=project_id,
        user_id=target.id,
        role=body.role,
        invited_by=user.id,
    )
    db.add(member)
    _log_action(db, project_id, user, "invite_member", {"email": body.email, "role": body.role})
    db.commit()
    return {"status": "ok", "message": f"Invited {body.email} as {body.role}"}


@router.patch("/api/projects/{project_id}/members/{member_id}")
def update_member_role(
    project_id: str,
    member_id: str,
    role: str,
    user: UserModel = Depends(require_auth),
    db: Session = Depends(get_db),
):
    _check_project_access(project_id, user, db, min_role="owner")
    member = db.query(ProjectMember).filter(ProjectMember.id == member_id).first()
    if not member:
        raise HTTPException(404, "Member not found")
    member.role = role
    _log_action(db, project_id, user, "update_member_role", {"member_id": member_id, "role": role})
    db.commit()
    return {"status": "ok"}


@router.delete("/api/projects/{project_id}/members/{member_id}")
def remove_member(
    project_id: str,
    member_id: str,
    user: UserModel = Depends(require_auth),
    db: Session = Depends(get_db),
):
    _check_project_access(project_id, user, db, min_role="owner")
    member = db.query(ProjectMember).filter(ProjectMember.id == member_id).first()
    if not member:
        raise HTTPException(404, "Member not found")
    _log_action(db, project_id, user, "remove_member", {"member_id": member_id})
    db.delete(member)
    db.commit()
    return {"status": "ok"}


# --- Audit Log ---

@router.get("/api/projects/{project_id}/audit", response_model=list[AuditLogResponse])
def get_audit_log(
    project_id: str,
    limit: int = 50,
    user: UserModel | None = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_project_access(project_id, user, db)
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.project_id == project_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        AuditLogResponse(
            id=l.id, user_id=l.user_id, username=l.username,
            action=l.action, details=l.details, created_at=l.created_at,
        )
        for l in logs
    ]
