"""Phase 11: WebSocket endpoint for real-time inference status updates."""

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)
router = APIRouter()


class ConnectionManager:
    """Manages active WebSocket connections."""

    def __init__(self):
        self.active: dict[str, list[WebSocket]] = {}  # session_id → connections

    async def connect(self, websocket: WebSocket, session_id: str = "global"):
        await websocket.accept()
        if session_id not in self.active:
            self.active[session_id] = []
        self.active[session_id].append(websocket)
        logger.info(f"WS connected: {session_id} (total: {self._total()})")

    def disconnect(self, websocket: WebSocket, session_id: str = "global"):
        if session_id in self.active:
            self.active[session_id] = [
                ws for ws in self.active[session_id] if ws != websocket
            ]
            if not self.active[session_id]:
                del self.active[session_id]
        logger.info(f"WS disconnected: {session_id} (total: {self._total()})")

    async def broadcast(self, message: dict, session_id: str = "global"):
        """Send message to all connections in a session."""
        connections = self.active.get(session_id, [])
        dead = []
        for ws in connections:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, session_id)

    async def broadcast_all(self, message: dict):
        """Send to all connected clients."""
        for session_id in list(self.active.keys()):
            await self.broadcast(message, session_id)

    def _total(self) -> int:
        return sum(len(v) for v in self.active.values())


# Singleton
manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, session_id: str = "global"):
    await manager.connect(websocket, session_id)
    try:
        while True:
            # Keep connection alive, handle client messages
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                # Client can send ping/subscribe messages
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, session_id)


# --- Helper functions for broadcasting inference updates ---

async def notify_inference_start(task_id: str, inference_type: str, image_id: str):
    await manager.broadcast_all({
        "type": "inference_start",
        "task_id": task_id,
        "inference_type": inference_type,
        "image_id": image_id,
    })


async def notify_inference_progress(task_id: str, progress: float, message: str = ""):
    await manager.broadcast_all({
        "type": "inference_progress",
        "task_id": task_id,
        "progress": progress,  # 0.0 - 1.0
        "message": message,
    })


async def notify_inference_complete(task_id: str, result_count: int, total_area: float = 0):
    await manager.broadcast_all({
        "type": "inference_complete",
        "task_id": task_id,
        "result_count": result_count,
        "total_area": total_area,
    })


async def notify_inference_error(task_id: str, error: str):
    await manager.broadcast_all({
        "type": "inference_error",
        "task_id": task_id,
        "error": error,
    })
