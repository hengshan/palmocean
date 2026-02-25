"""
PalmView Seed Script
Usage: python seed.py

Creates default org, user, project, and model versions.
Idempotent: safe to run multiple times.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import text
from app.database import engine, SessionLocal
from app.models.tenancy import Org, User, Membership, Project, Role
from app.models.ml import Model, ModelVersion

# ── Fixed seed UUIDs (stable across runs) ────────────────────────────
SEED_ORG_ID      = uuid.UUID("1b77d523-9e70-4486-b64a-2b78fc600e9e")
SEED_USER_ID     = uuid.UUID("e42434f2-2406-42c1-a6a9-cbb56bb41108")
SEED_PROJECT_ID  = uuid.UUID("dd341b39-da8f-4142-98e8-da582b6f8d6a")
SEED_ROLE_ID     = uuid.UUID("f0000001-0000-0000-0000-000000000001")

SEED_MODELS = [
    {
        "model_id":  uuid.UUID("507d848f-6874-48cd-a62e-8841645fb20f"),
        "name":      "SAM2 Segmentation",
        "slug":      "sam2-segment",
        "task_type": "segmentation",
        "description": "Segment Anything Model 2 — general-purpose segmentation for palm tree AOI extraction.",
        "version_id": uuid.UUID("16868fc6-b1d6-4ca5-b742-f6244d874e03"),
        "artifact_uri": "hf://synga/sam2-segment",
        "input_spec": {"type": "image", "bands": ["RGB"], "resolution_m": 0.1},
        "output_spec": {"type": "segmentation_mask", "format": "geojson"},
    },
    {
        "model_id":  uuid.UUID("b59c922c-01f5-40e8-a9b9-bcb71d486ba6"),
        "name":      "YOLOv8 Palm Tree Detector",
        "slug":      "yolov8-palm",
        "task_type": "detection",
        "description": "YOLOv8-based palm tree crown detection from UAV/satellite imagery.",
        "version_id": uuid.UUID("787eecc6-255c-4dc0-8b44-4249e1248453"),
        "artifact_uri": "hf://synga/yolov8-palm",
        "input_spec": {"type": "image", "bands": ["RGB"], "resolution_m": 0.1},
        "output_spec": {"type": "bounding_boxes", "format": "geojson"},
    },
    {
        "model_id":  uuid.UUID("9f77cf49-4cce-4fd8-b2ac-26e62d37db0a"),
        "name":      "LULC Classifier",
        "slug":      "lulc-5class",
        "task_type": "classification",
        "description": "5-class Land Use/Land Cover classifier (palm, bare, water, built, other).",
        "version_id": uuid.UUID("844bb69e-eba4-48e5-a8ae-7dce335c6d96"),
        "artifact_uri": "hf://synga/lulc-5class",
        "input_spec": {"type": "image", "bands": ["RGB", "NIR"], "resolution_m": 10},
        "output_spec": {"type": "classification_map", "format": "geotiff"},
    },
    {
        "model_id":  uuid.UUID("057f2bc9-88e3-4d00-8134-57d3a22b242f"),
        "name":      "BIT Change Detection",
        "slug":      "bit-cd",
        "task_type": "change_detection",
        "description": "Bitemporal Image Transformer (BIT) for deforestation / plantation change detection.",
        "version_id": uuid.UUID("12c1bee3-3d07-4c9f-9a2e-c4bf3eea7c19"),
        "artifact_uri": "hf://synga/bit-cd",
        "input_spec": {"type": "image_pair", "bands": ["RGB"], "resolution_m": 10},
        "output_spec": {"type": "change_mask", "format": "geojson"},
    },
    # Prithvi foundation model
    {
        "model_id":  uuid.UUID("a1234567-1111-1111-1111-000000000001"),
        "name":      "Prithvi-100M",
        "slug":      "prithvi-100m",
        "task_type": "foundation",
        "description": "NASA + IBM geospatial foundation model (100M params) for multi-spectral Earth observation.",
        "version_id": uuid.UUID("a1234567-2222-2222-2222-000000000001"),
        "artifact_uri": "hf://ibm-nasa-geospatial/Prithvi-100M",
        "input_spec": {"type": "image", "bands": ["B2","B3","B4","B8A","B11","B12"], "resolution_m": 30},
        "output_spec": {"type": "embeddings", "format": "numpy"},
    },
]


def seed():
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)

        # ── Org ───────────────────────────────────────────────────────
        org = db.get(Org, SEED_ORG_ID)
        if not org:
            org = Org(org_id=SEED_ORG_ID, name="Synga", slug="synga", plan="pro")
            db.add(org)
            print("✅ Created org: Synga")
        else:
            print("⏭  Org already exists: Synga")

        # ── User ──────────────────────────────────────────────────────
        user = db.get(User, SEED_USER_ID)
        if not user:
            user = User(
                user_id=SEED_USER_ID,
                email="admin@synga.ai",
                name="PalmView Admin",
                auth_provider="seed",
                auth_subject="seed-admin",
            )
            db.add(user)
            print("✅ Created user: admin@synga.ai")
        else:
            print("⏭  User already exists: admin@synga.ai")

        db.flush()

        # ── Role ──────────────────────────────────────────────────────
        role = db.get(Role, SEED_ROLE_ID)
        if not role:
            role = Role(
                role_id=SEED_ROLE_ID,
                org_id=SEED_ORG_ID,
                name="owner",
                permissions=["*"],
                is_system=True,
            )
            db.add(role)
            print("✅ Created role: owner")
        else:
            print("⏭  Role already exists: owner")

        db.flush()

        # ── Membership (org admin) ────────────────────────────────────
        existing_membership = db.execute(
            text("SELECT 1 FROM memberships WHERE org_id=:o AND user_id=:u"),
            {"o": str(SEED_ORG_ID), "u": str(SEED_USER_ID)}
        ).first()
        if not existing_membership:
            membership = Membership(org_id=SEED_ORG_ID, user_id=SEED_USER_ID, role_id=SEED_ROLE_ID)
            db.add(membership)
            print("✅ Created membership: admin → Synga (owner)")
        else:
            print("⏭  Membership already exists")

        # ── Project ───────────────────────────────────────────────────
        project = db.get(Project, SEED_PROJECT_ID)
        if not project:
            project = Project(
                project_id=SEED_PROJECT_ID,
                org_id=SEED_ORG_ID,
                name="PalmView Demo",
                slug="palmview-demo",
                description="Default demo project for Johor plantation analysis.",
                region="Johor, Malaysia",
                created_by=SEED_USER_ID,
            )
            db.add(project)
            print("✅ Created project: PalmView Demo")
        else:
            print("⏭  Project already exists: PalmView Demo")

        db.flush()

        # ── Models + ModelVersions ────────────────────────────────────
        for m in SEED_MODELS:
            model = db.get(Model, m["model_id"])
            if not model:
                model = Model(
                    model_id=m["model_id"],
                    org_id=SEED_ORG_ID,
                    name=m["name"],
                    slug=m["slug"],
                    task_type=m["task_type"],
                    description=m["description"],
                    created_by=SEED_USER_ID,
                )
                db.add(model)
                print(f"✅ Created model: {m['name']}")
            else:
                print(f"⏭  Model already exists: {m['name']}")

            db.flush()

            version = db.get(ModelVersion, m["version_id"])
            if not version:
                version = ModelVersion(
                    model_version_id=m["version_id"],
                    org_id=SEED_ORG_ID,
                    model_id=m["model_id"],
                    version="v1.0",
                    status="published",
                    artifact_uri=m["artifact_uri"],
                    artifact_format="pytorch",
                    input_spec=m["input_spec"],
                    output_spec=m["output_spec"],
                    metrics={},
                    provenance={"seeded": True},
                    runtime_config={"device": "cuda", "batch_size": 1},
                    created_by=SEED_USER_ID,
                    promoted_at=now,
                )
                db.add(version)
                print(f"   ✅ Created version v1.0 → {m['artifact_uri']}")
            else:
                print(f"   ⏭  Version already exists: {m['name']} v1.0")

        db.commit()
        print("\n🌴 Seed complete.")

    except Exception as e:
        db.rollback()
        print(f"❌ Seed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
