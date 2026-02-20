# Import all models so SQLAlchemy registers them with Base.metadata
from app.models.tenancy import (  # noqa: F401
    Org, User, Role, Membership, Project, ProjectMembership, ApiKey, AuditLog, Quota,
)
from app.models.assets import (  # noqa: F401
    Farm, Block, ROI, ImageryAsset, StacRemote, StacAssetLink,
)
from app.models.ml import (  # noqa: F401
    Model, ModelVersion, InferenceJob, InferenceOutput, InferenceResultIndex,
)
from app.models.kepler import (  # noqa: F401
    MapConfig, MapConfigRelease, MapConfigShare,
)
