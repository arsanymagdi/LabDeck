import os
import json
import socket
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from app.core.security import get_current_user

router = APIRouter(prefix="/api/services", tags=["services"])

SERVICES_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "services.json")

class ServiceModel(BaseModel):
    name: str
    description: str
    port: int

DEFAULT_SERVICES = [
    {"name": "Home Assistant", "description": "Smart home automation", "port": 8123},
    {"name": "Jellyfin", "description": "Media streaming server", "port": 8096},
    {"name": "Uptime Kuma", "description": "Service monitor", "port": 3001},
    {"name": "FileBrowser", "description": "Private file manager", "port": 8080},
]

def load_services() -> list[dict]:
    if not os.path.exists(SERVICES_FILE):
        try:
            with open(SERVICES_FILE, "w") as f:
                json.dump(DEFAULT_SERVICES, f, indent=2)
        except Exception:
            return DEFAULT_SERVICES
        return DEFAULT_SERVICES
    try:
        with open(SERVICES_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return DEFAULT_SERVICES

def save_services(services: list[dict]):
    with open(SERVICES_FILE, "w") as f:
        json.dump(services, f, indent=2)

def get_host_ip() -> str:
    try:
        with open("/proc/net/route", "r") as f:
            for line in f:
                fields = line.strip().split()
                if len(fields) >= 3 and fields[1] == "00000000":
                    gateway_hex = fields[2]
                    bytes_list = [int(gateway_hex[i:i+2], 16) for i in range(0, 8, 2)]
                    bytes_list.reverse()
                    return ".".join(map(str, bytes_list))
    except Exception:
        pass
    return "127.0.0.1"

def is_port_open(port: int) -> bool:
    host_ip = get_host_ip()
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            s.connect((host_ip, port))
            return True
    except Exception:
        pass
    
    if host_ip != "127.0.0.1":
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.5)
                s.connect(("127.0.0.1", port))
                return True
        except Exception:
            pass
    return False

@router.get("")
def get_services(current_user: str = Depends(get_current_user)):
    services = load_services()
    result = []
    for s in services:
        result.append({
            "name": s["name"],
            "description": s["description"],
            "port": str(s["port"]),
            "healthy": is_port_open(int(s["port"]))
        })
    return result

@router.post("")
def add_service(service: ServiceModel, current_user: str = Depends(get_current_user)):
    services = load_services()
    if any(s["name"].lower() == service.name.lower() for s in services):
        raise HTTPException(status_code=400, detail="Service with this name already exists")
    
    services.append({
        "name": service.name,
        "description": service.description,
        "port": service.port
    })
    save_services(services)
    return {"message": "Service added successfully"}

@router.delete("/{name}")
def delete_service(name: str, current_user: str = Depends(get_current_user)):
    services = load_services()
    filtered_services = [s for s in services if s["name"].lower() != name.lower()]
    if len(filtered_services) == len(services):
        raise HTTPException(status_code=404, detail="Service not found")
    save_services(filtered_services)
    return {"message": "Service deleted successfully"}
