import os

class Settings:
    SECRET_KEY: str = os.getenv("JWT_SECRET", "supersecretkeychangeinproduction")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 1 day

    # Simple authentication credentials
    DASHBOARD_USERNAME: str = os.getenv("DASHBOARD_USERNAME", "admin")
    # For dev purposes, we check plaintext or a default password 'password'
    DASHBOARD_PASSWORD: str = os.getenv("DASHBOARD_PASSWORD", "admin")
    FIREBASE_PROJECT_ID: str = os.getenv("FIREBASE_PROJECT_ID", "")
    FIREBASE_API_KEY: str = os.getenv("FIREBASE_API_KEY", "")
    FIREBASE_AUTH_DOMAIN: str = os.getenv("FIREBASE_AUTH_DOMAIN", "")
    FIREBASE_DATABASE_URL: str = os.getenv("FIREBASE_DATABASE_URL", "")
    FIREBASE_APP_ID: str = os.getenv("FIREBASE_APP_ID", "")
    FIREBASE_SERVICE_ACCOUNT_JSON: str = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "")

settings = Settings()
