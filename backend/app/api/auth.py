from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta
from app.core.config import settings
from app.core.security import verify_password, create_access_token, get_current_user
from app.core.firebase import firebase_auth, public_firebase_config
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["auth"])

class FirebaseToken(BaseModel):
    id_token: str

@router.get("/firebase-config")
def firebase_config():
    """Public Firebase web configuration; service-account credentials stay on the server."""
    return public_firebase_config()

@router.post("/firebase")
def firebase_login(payload: FirebaseToken):
    auth = firebase_auth()
    if not auth:
        raise HTTPException(status_code=503, detail="Firebase authentication is not configured")
    try:
        claims = auth.verify_id_token(payload.id_token)
        subject = claims.get("email") or claims["uid"]
        token = create_access_token(data={"sub": subject, "firebase_uid": claims["uid"]})
        return {"access_token": token, "token_type": "bearer", "username": subject}
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Firebase identity token")

@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # We verify against simple settings credentials for Version 0.1
    if form_data.username != settings.DASHBOARD_USERNAME or not verify_password(form_data.password, settings.DASHBOARD_PASSWORD):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": form_data.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me")
def read_users_me(current_user: str = Depends(get_current_user)):
    return {"username": current_user}
