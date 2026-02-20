"""Phase 12: Collaboration models — project members, permissions, audit log."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from pydantic import BaseModel

from app.database import Base


class ProjectMember(Base):
    __tablename__ = "project_members"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False, default="editor")  # "owner" | "editor" | "viewer"
    invited_by = Column(String, nullable=True)
    joined_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, nullable=False)
    username = Column(String, nullable=False)
    action = Column(String, nullable=False)  # "create_feature", "delete_feature", "update_class", etc.
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# --- Pydantic Schemas ---

class InviteMemberRequest(BaseModel):
    email: str
    role: str = "editor"


class MemberResponse(BaseModel):
    id: str
    user_id: str
    username: str
    email: str
    role: str
    joined_at: datetime | None = None

    model_config = {"from_attributes": True}


class AuditLogResponse(BaseModel):
    id: str
    user_id: str
    username: str
    action: str
    details: dict | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}
