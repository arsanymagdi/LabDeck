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

def publish_realtime_status(status: dict) -> None:
    """Best-effort status mirror for mobile/desktop clients using Firebase RTDB."""
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
    except Exception as error:
        print(f"Realtime Database update failed: {error}")
