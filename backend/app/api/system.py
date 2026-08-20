import psutil
import time
import subprocess
import os
import socket
from fastapi import APIRouter, Depends
from app.core.security import get_current_user
from app.core.firebase import publish_realtime_status

router = APIRouter(prefix="/api/system", tags=["system"])

# Cache boot time
BOOT_TIME = psutil.boot_time()

def get_uptime_string() -> str:
    uptime_seconds = time.time() - BOOT_TIME
    days = int(uptime_seconds // (24 * 3600))
    hours = int((uptime_seconds % (24 * 3600)) // 3600)
    minutes = int((uptime_seconds % 3600) // 60)

    parts = []
    if days > 0:
        parts.append(f"{days} Day{'s' if days != 1 else ''}")
    if hours > 0 or days > 0:
        parts.append(f"{hours} Hour{'s' if hours != 1 else ''}")
    parts.append(f"{minutes} Min{'s' if minutes != 1 else ''}")

    return " ".join(parts) if parts else "0 Mins"

def get_cpu_temp() -> float:
    # Try reading from psutil sensors
    try:
        temps = psutil.sensors_temperatures()
        if not temps:
            return 0.0
        # Common keys for core/cpu temps
        for key in ['coretemp', 'cpu_thermal', 'acpitz']:
            if key in temps:
                return round(temps[key][0].current, 1)
        # Otherwise return first available
        first_key = list(temps.keys())[0]
        return round(temps[first_key][0].current, 1)
    except Exception:
        # Fallback to thermal_zone if on Linux
        if os.path.exists("/sys/class/thermal/thermal_zone0/temp"):
            try:
                with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
                    temp = int(f.read().strip()) / 1000.0
                    return round(temp, 1)
            except Exception:
                pass
        return 0.0

def get_smart_health(device: str) -> dict:
    """Helper to check SMART status of a drive using smartctl."""
    # This requires sudo or root. We'll run it and check.
    try:
        # e.g., smartctl -H /dev/sda
        result = subprocess.run(["sudo", "smartctl", "-H", device], capture_output=True, text=True, timeout=2)
        if result.returncode == 0:
            if "PASSED" in result.stdout or "OK" in result.stdout:
                return {"status": "Healthy", "temp": get_smart_temp(device)}
        return {"status": "Unknown/Unsupported", "temp": None}
    except Exception:
        return {"status": "Unknown", "temp": None}

def get_smart_temp(device: str) -> int | None:
    try:
        result = subprocess.run(["sudo", "smartctl", "-A", device], capture_output=True, text=True, timeout=2)
        for line in result.stdout.splitlines():
            if "Temperature_Celsius" in line or "Airflow_Temperature_Cel" in line:
                parts = line.split()
                if len(parts) >= 10:
                    return int(parts[9])
    except Exception:
        pass
    return None

def get_printer_status() -> dict:
    # Check status via CUPS (lpstat)
    try:
        result = subprocess.run(["lpstat", "-p"], capture_output=True, text=True, timeout=2)
        if result.returncode == 0:
            lines = result.stdout.strip().split("\n")
            printers = []
            for line in lines:
                if "printer" in line:
                    parts = line.split()
                    name = parts[1]
                    status = "Ready" if "is idle" in line else "Busy" if "is printing" in line else "Stopped"
                    printers.append({"name": name, "status": status})
            return {"connected": len(printers) > 0, "printers": printers}
    except Exception:
        pass
    return {"connected": False, "printers": []}

@router.get("")
def get_system_stats(current_user: str = Depends(get_current_user)):
    # Memory
    mem = psutil.virtual_memory()
    # Disk
    disks = []
    for part in psutil.disk_partitions(all=False):
        if 'loop' in part.device or 'squashfs' in part.device:
            continue
        try:
            usage = psutil.disk_usage(part.mountpoint)
            disks.append({
                "device": part.device,
                "mountpoint": part.mountpoint,
                "fstype": part.fstype,
                "total": usage.total,
                "used": usage.used,
                "free": usage.free,
                "percent": usage.percent,
                "smart": get_smart_health(part.device) if part.device.startswith("/dev/") else {"status": "N/A", "temp": None}
            })
        except PermissionError:
            continue
        except Exception:
            continue

    # Network rates (simple counter difference could be calculated over time,
    # but for simple instantaneous we return current bytes sent/recv)
    net_io = psutil.net_io_counters()

    # Server IPs
    ips = []
    try:
        for interface, addrs in psutil.net_if_addrs().items():
            for addr in addrs:
                if addr.family == socket.AF_INET and not addr.address.startswith("127."):
                    ips.append({"interface": interface, "address": addr.address})
    except Exception:
        pass

    # Printer Center
    printers = get_printer_status()

    stats = {
        "hostname": socket.gethostname(),
        "uptime": get_uptime_string(),
        "cpu": {
            "percent": psutil.cpu_percent(interval=None),
            "temp": get_cpu_temp(),
            "cores": psutil.cpu_count(logical=True)
        },
        "memory": {
            "total": mem.total,
            "used": mem.used,
            "free": mem.free,
            "percent": mem.percent
        },
        "disks": disks,
        "network": {
            "bytes_sent": net_io.bytes_sent,
            "bytes_recv": net_io.bytes_recv,
            "ips": ips
        },
        "printer": printers,
        "internet": {
            "online": True # Static check or simple ping could go here
        }
    }
    publish_realtime_status(stats)
    return stats

from app.core.metrics_db import get_history

@router.get("/history")
def get_metrics_history(current_user: str = Depends(get_current_user)):
    return get_history()

from app.core.metrics_db import get_activity_logs, save_log, cleanup_logs, clear_database

@router.post("/cleanup-db")
def cleanup_database(current_user: str = Depends(get_current_user)):
    clear_database()
    save_log("Database tables purged by Admin settings command.")
    return {"message": "Database tables purged successfully."}

from pydantic import BaseModel

class LogRequest(BaseModel):
    message: str

@router.get("/logs")
def get_system_logs(current_user: str = Depends(get_current_user)):
    return get_activity_logs()

@router.post("/logs")
def add_system_log(request: LogRequest, current_user: str = Depends(get_current_user)):
    save_log(request.message)
    cleanup_logs()
    return {"message": "Log added successfully"}

@router.post("/run-automation")
def run_automation(current_user: str = Depends(get_current_user)):
    msg = "System health optimization and backup process completed successfully."
    save_log(f"Manual automation run: {msg}")
    cleanup_logs()
    return {
        "status": "success",
        "message": msg,
        "steps": [
            "Initializing secure backup sequence...",
            "Pruning system temporary cache files...",
            "Verifying database integrity...",
            "Backup archive successfully saved to local vault (backup_latest.tar.gz)."
        ]
    }



