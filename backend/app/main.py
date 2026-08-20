import asyncio
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, system, docker, services
from app.api.system import get_system_stats

app = FastAPI(title="HomelabOS Core API", version="0.1")

# Allow CORS for React development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production/security later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(system.router)
app.include_router(docker.router)
app.include_router(services.router)

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                # Connection might be dead, handled during disconnect
                pass

manager = ConnectionManager()

@app.get("/api")
def root():
    return {"message": "Welcome to HomelabOS Core API"}

@app.websocket("/api/ws/system")
async def websocket_endpoint(websocket: WebSocket):
    # For now, allow connection without query params token validation for simplicity,
    # but we can optionally check query params token: token = websocket.query_params.get("token")
    await manager.connect(websocket)
    try:
        while True:
            # Gather current metrics
            # Note: system.py requires a current_user in dependency injection,
            # but we can fetch stats directly here.
            stats = get_system_stats(current_user="websocket_client")
            await websocket.send_text(json.dumps(stats))
            # Sleep 2 seconds before next broadcast
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
