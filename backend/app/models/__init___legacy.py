# Import all models so SQLAlchemy registers them with Base.metadata
from app.models.image import ImageModel  # noqa: F401
from app.models.project import ProjectModel, FeatureModel, ProjectImage  # noqa: F401
from app.models.collaboration import ProjectMember, AuditLog  # noqa: F401
from app.services.auth import UserModel  # noqa: F401
