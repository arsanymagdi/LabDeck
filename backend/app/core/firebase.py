"""Optional Firebase Admin integration. Credentials are supplied at runtime only."""
import json
from functools import lru_cache
import socket
from datetime import datetime, timezone
from app.core.config import settings

@lru_cache
def firebase_auth():
    if not settings.FIREBASE_PROJECT_ID or not settings.FIREBASE_SERVICE_ACCOUNT_JSON:
        return None
    try:
        import firebase_admin
        from firebase_admin import auth, credentials
        if not firebase_admin._apps:
            credential = credentials.Certificate(json.loads(settings.FIREBASE_SERVICE_ACCOUNT_JSON))
            options = {"projectId": settings.FIREBASE_PROJECT_ID}
            if settings.FIREBASE_DATABASE_URL:
                options["databaseURL"] = settings.FIREBASE_DATABASE_URL
            firebase_admin.initialize_app(credential, options)
        return auth
    except Exception as error:
        print(f"Firebase disabled: {error}")
        return None

def public_firebase_config() -> dict:
    if not settings.FIREBASE_API_KEY or not settings.FIREBASE_PROJECT_ID:
        return {"enabled": False}
    return {"enabled": True, "apiKey": settings.FIREBASE_API_KEY, "authDomain": settings.FIREBASE_AUTH_DOMAIN or f"{settings.FIREBASE_PROJECT_ID}.firebaseapp.com", "projectId": settings.FIREBASE_PROJECT_ID, "databaseURL": settings.FIREBASE_DATABASE_URL, "appId": settings.FIREBASE_APP_ID}

import time

_last_history_update = 0.0
_history_cpu_sum = 0.0
_history_mem_sum = 0.0
_history_count = 0
_history_cpu_max = 0.0
_history_mem_max = 0.0
_last_date = ""

def publish_realtime_status(status: dict) -> None:
    """Best-effort status mirror for mobile/desktop clients using Firebase RTDB."""
    global _last_history_update, _history_cpu_sum, _history_mem_sum, _history_count, _history_cpu_max, _history_mem_max, _last_date
    
    auth = firebase_auth()
    if not auth or not settings.FIREBASE_DATABASE_URL:
        return
    try:
        from firebase_admin import db
        db.reference(f"homelabos/servers/{socket.gethostname()}/status").set({
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "cpu": status.get("cpu", {}),
            "memory": status.get("memory", {}),
            "network": status.get("network", {}),
            "uptime": status.get("uptime"),
        })
        
        cpu_val = status.get("cpu", {}).get("percent", 0.0)
        mem_val = status.get("memory", {}).get("percent", 0.0)
        
        current_time = time.time()
        current_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        if current_date != _last_date:
            _history_cpu_sum = 0.0
            _history_mem_sum = 0.0
            _history_count = 0
            _history_cpu_max = 0.0
            _history_mem_max = 0.0
            _last_date = current_date
            
        _history_cpu_sum += cpu_val
        _history_mem_sum += mem_val
        _history_count += 1
        _history_cpu_max = max(_history_cpu_max, cpu_val)
        _history_mem_max = max(_history_mem_max, mem_val)
        
        # Sync stats to Firebase history every 5 minutes (300 seconds)
        if current_time - _last_history_update >= 300:
            _last_history_update = current_time
            ref = db.reference(f"homelabos/servers/{socket.gethostname()}/history/{current_date}")
            existing = ref.get()
            
            if existing:
                ext_count = existing.get("count", 0)
                ext_cpu_sum = existing.get("cpu_sum", 0.0)
                ext_mem_sum = existing.get("mem_sum", 0.0)
                ext_cpu_max = existing.get("cpu_max", 0.0)
                ext_mem_max = existing.get("mem_max", 0.0)
                
                total_count = ext_count + _history_count
                total_cpu_sum = ext_cpu_sum + _history_cpu_sum
                total_mem_sum = ext_mem_sum + _history_mem_sum
                
                ref.set({
                    "cpu_sum": total_cpu_sum,
                    "mem_sum": total_mem_sum,
                    "count": total_count,
                    "cpu_avg": round(total_cpu_sum / total_count, 2),
                    "mem_avg": round(total_mem_sum / total_count, 2),
                    "cpu_max": max(ext_cpu_max, _history_cpu_max),
                    "mem_max": max(ext_mem_max, _history_mem_max)
                })
            else:
                ref.set({
                    "cpu_sum": _history_cpu_sum,
                    "mem_sum": _history_mem_sum,
                    "count": _history_count,
                    "cpu_avg": round(_history_cpu_sum / _history_count, 2),
                    "mem_avg": round(_history_mem_sum / _history_count, 2),
                    "cpu_max": _history_cpu_max,
                    "mem_max": _history_mem_max
                })
            
            _history_cpu_sum = 0.0
            _history_mem_sum = 0.0
            _history_count = 0
            _history_cpu_max = 0.0
            _history_mem_max = 0.0
            
    except Exception as error:
        print(f"Realtime Database update failed: {error}")
