import os
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.core.security import get_current_user


router = APIRouter(prefix="/api/storage", tags=["storage"])
STORAGE_ROOT = Path(os.environ.get("STORAGE_PATH", "/storage")).resolve()
MAX_UPLOAD_SIZE = 10 * 1024 * 1024 * 1024  # 10 GiB


def storage_path(filename: str) -> Path:
    """Resolve a filename safely inside the configured storage directory."""
    clean_name = Path(filename).name
    if not clean_name or clean_name in {".", ".."}:
        raise HTTPException(status_code=400, detail="A valid file name is required")
    target = (STORAGE_ROOT / clean_name).resolve()
    if target.parent != STORAGE_ROOT:
        raise HTTPException(status_code=400, detail="Invalid storage path")
    return target


def ensure_storage_root() -> None:
    STORAGE_ROOT.mkdir(parents=True, exist_ok=True)


@router.get("/files")
def list_files(current_user: str = Depends(get_current_user)):
    ensure_storage_root()
    files = []
    for item in STORAGE_ROOT.iterdir():
        if item.is_file():
            details = item.stat()
            files.append({
                "name": item.name,
                "size": details.st_size,
                "modified": details.st_mtime,
            })
    return sorted(files, key=lambda item: item["modified"], reverse=True)


@router.post("/files", status_code=status.HTTP_201_CREATED)
async def upload_file(file: UploadFile, current_user: str = Depends(get_current_user)):
    ensure_storage_root()
    target = storage_path(file.filename or "")
    if target.exists():
        raise HTTPException(status_code=409, detail="A file with this name already exists")

    temporary = target.with_name(f".{target.name}.uploading")
    total_size = 0
    try:
        with temporary.open("wb") as destination:
            while chunk := await file.read(1024 * 1024):
                total_size += len(chunk)
                if total_size > MAX_UPLOAD_SIZE:
                    raise HTTPException(status_code=413, detail="File exceeds the 10 GiB upload limit")
                destination.write(chunk)
        temporary.replace(target)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    return {"name": target.name, "size": total_size}


@router.get("/files/{filename}")
def download_file(filename: str, current_user: str = Depends(get_current_user)):
    target = storage_path(filename)
    if not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(target, filename=target.name)


@router.delete("/files/{filename}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(filename: str, current_user: str = Depends(get_current_user)):
    target = storage_path(filename)
    if not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    target.unlink()
