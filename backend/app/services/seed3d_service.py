"""Seed3D 3D asset generation service.

Current implementation is a **mock** — no real Volcano Engine API calls are made.
The public interface is intentionally close to what a real integration would expose,
so swapping in real HTTP calls later requires only changes inside this module.
"""

import uuid
import time
import random
from typing import Literal


# In-memory task store (survives only while the process is alive).
# Replace with a Redis / DB-backed store for production.
_tasks: dict[str, dict] = {}

# In-memory asset store (persisted tasks that completed successfully)
_assets: dict[str, dict] = {}


class Seed3DService:
    """Mock implementation of the Seed3D / Volcano Engine 3D generation service."""

    # ── Generate ──────────────────────────────────────────────────────────────

    def generate_3d(
        self,
        prompt: str,
        references: list[str] | None = None,
        output_format: Literal["gltf", "usd"] = "gltf",
    ) -> str:
        """Submit a 3D generation task.

        Returns the task_id immediately with status="pending".
        In a real implementation this would POST to the Volcano Engine API
        and store the returned job id.
        """
        task_id = str(uuid.uuid4())
        _tasks[task_id] = {
            "task_id": task_id,
            "prompt": prompt,
            "reference_images": references or [],
            "output_format": output_format,
            "status": "pending",
            "progress": 0,
            "result_url": None,
            "created_at": time.time(),
            "updated_at": time.time(),
        }
        return task_id

    # ── Status ────────────────────────────────────────────────────────────────

    def get_task_status(self, task_id: str) -> dict | None:
        """Query task status and simulate gradual progress.

        Real implementation would poll the Volcano Engine status endpoint.
        Returns None if the task_id is unknown.
        """
        task = _tasks.get(task_id)
        if task is None:
            return None

        # Simulate progress: advance ~20 % per status check.
        elapsed = time.time() - task["created_at"]
        simulated_progress = min(100, int(elapsed * 10))  # 10 % per second
        task["progress"] = simulated_progress
        task["updated_at"] = time.time()

        if simulated_progress >= 100 and task["status"] not in ("completed", "failed"):
            # Simulate occasional failure (5 % chance)
            if random.random() < 0.05:
                task["status"] = "failed"
            else:
                task["status"] = "completed"
                asset_id = str(uuid.uuid4())
                mock_url = (
                    f"https://storage.example.com/seed3d/{asset_id}."
                    f"{task['output_format']}"
                )
                task["result_url"] = mock_url
                # Promote to the assets store
                _assets[asset_id] = {
                    "id": asset_id,
                    "task_id": task_id,
                    "prompt": task["prompt"],
                    "output_format": task["output_format"],
                    "result_url": mock_url,
                    "created_at": time.time(),
                }
        elif task["status"] == "pending" and simulated_progress > 0:
            task["status"] = "processing"

        return task

    # ── Assets ────────────────────────────────────────────────────────────────

    def list_assets(self) -> list[dict]:
        """Return all successfully generated 3D assets."""
        return list(_assets.values())

    def delete_asset(self, asset_id: str) -> bool:
        """Delete a generated asset. Returns True if it existed, False otherwise."""
        if asset_id not in _assets:
            return False
        del _assets[asset_id]
        return True


# Module-level singleton (cheap for a stateless mock)
seed3d_service = Seed3DService()
