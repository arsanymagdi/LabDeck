import docker
from fastapi import APIRouter, Depends, HTTPException
from app.core.security import get_current_user

router = APIRouter(prefix="/api/docker", tags=["docker"])

def get_docker_client():
    try:
        return docker.from_env()
    except Exception:
        return None

@router.get("")
def list_containers(current_user: str = Depends(get_current_user)):
    client = get_docker_client()
    if not client:
        # Fallback list for offline or local testing if Docker is missing/inaccessible
        return {
            "status": "unavailable",
            "message": "Docker daemon is not running or current user does not have permission.",
            "containers": [
                {
                    "id": "mock-ha-id",
                    "name": "homeassistant",
                    "status": "running",
                    "image": "homeassistant/home-assistant:latest",
                    "cpu_percent": 1.8,
                    "memory_usage": 367001600,  # ~350MB
                    "ports": {"8123/tcp": [{"HostIp": "0.0.0.0", "HostPort": "8123"}]}
                },
                {
                    "id": "mock-portainer-id",
                    "name": "portainer",
                    "status": "running",
                    "image": "portainer/portainer-ce:latest",
                    "cpu_percent": 0.2,
                    "memory_usage": 45000000,
                    "ports": {"9443/tcp": [{"HostIp": "0.0.0.0", "HostPort": "9443"}]}
                },
                {
                    "id": "mock-kuma-id",
                    "name": "uptime-kuma",
                    "status": "paused",
                    "image": "louislam/uptime-kuma:latest",
                    "cpu_percent": 0.0,
                    "memory_usage": 110000000,
                    "ports": {"3001/tcp": [{"HostIp": "0.0.0.0", "HostPort": "3001"}]}
                }
            ]
        }

    try:
        containers_list = client.containers.list(all=True)
        containers_data = []
        for c in containers_list:
            # Gather basic stats - we avoid stream=False full stats query because it blocks / takes time.
            # We can read memory usage directly if running, otherwise 0.
            cpu = 0.0
            ram = 0
            if c.status == "running":
                try:
                    # Quick check from container stats (no stream, single read)
                    stats = c.stats(stream=False)
                    # CPU calculation
                    cpu_delta = stats['cpu_stats']['cpu_usage']['total_usage'] - stats['precpu_stats']['cpu_usage']['total_usage']
                    system_delta = stats['cpu_stats']['system_cpu_usage'] - stats['precpu_stats']['system_cpu_usage']
                    if system_delta > 0:
                        cpu = round((cpu_delta / system_delta) * len(stats['cpu_stats']['cpu_usage']['percpu_usage']) * 100.0, 2)
                    ram = stats['memory_stats'].get('usage', 0)
                except Exception:
                    pass

            containers_data.append({
                "id": c.id[:12],
                "name": c.name,
                "status": c.status,
                "image": c.image.tags[0] if c.image.tags else c.image.id[:12],
                "cpu_percent": cpu,
                "memory_usage": ram,
                "ports": c.ports
            })
        return {"status": "ok", "containers": containers_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{container_id}/{action}")
def container_action(container_id: str, action: str, current_user: str = Depends(get_current_user)):
    if action not in ["start", "stop", "restart"]:
        raise HTTPException(status_code=400, detail="Invalid action")

    if container_id.startswith("mock-"):
        # Allow mock actions for testing the UI
        return {"status": "success", "message": f"Mock action '{action}' executed on {container_id}."}

    client = get_docker_client()
    if not client:
        raise HTTPException(status_code=503, detail="Docker service unavailable")

    try:
        container = client.containers.get(container_id)
        if action == "start":
            container.start()
        elif action == "stop":
            container.stop()
        elif action == "restart":
            container.restart()
        return {"status": "success", "message": f"Container {container_id} {action}ed successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{container_id}/logs")
def get_container_logs(container_id: str, tail: int = 100, current_user: str = Depends(get_current_user)):
    if container_id.startswith("mock-"):
        return {"logs": f"Logs for mock container {container_id}\nLine 1: Service loaded\nLine 2: Server listening on port 80\nLine 3: Database connected successfully."}

    client = get_docker_client()
    if not client:
        raise HTTPException(status_code=503, detail="Docker service unavailable")

    try:
        container = client.containers.get(container_id)
        logs = container.logs(tail=tail, stderr=True, stdout=True).decode("utf-8", errors="replace")
        return {"logs": logs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
