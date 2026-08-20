import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core.security import get_current_user


router = APIRouter(prefix="/api/storage", tags=["storage"])
STORAGE_ROOT = Path(os.environ.get("STORAGE_PATH", "/storage")).resolve()
MAX_UPLOAD_SIZE = 10 * 1024 * 1024 * 1024  # 10 GiB
MAX_TEXT_FILE_SIZE = 2 * 1024 * 1024  # 2 MiB


class TextFileUpdate(BaseModel):
    content: str


def storage_path(relative_path: str = "") -> Path:
    """Resolve a relative browser path safely inside the storage directory."""
    target = (STORAGE_ROOT / relative_path).resolve()
    if target != STORAGE_ROOT and STORAGE_ROOT not in target.parents:
        raise HTTPException(status_code=400, detail="Invalid storage path")
    return target


def ensure_storage_root() -> None:
    STORAGE_ROOT.mkdir(parents=True, exist_ok=True)


@router.get("/files")
def list_files(directory: str = "", current_user: str = Depends(get_current_user)):
    ensure_storage_root()
    folder = storage_path(directory)
    if not folder.is_dir():
        raise HTTPException(status_code=404, detail="Folder not found")
    entries = []
    for item in folder.iterdir():
        if item.is_symlink():
            continue
        details = item.stat()
        entries.append({
            "name": item.name,
            "path": str(item.relative_to(STORAGE_ROOT)),
            "type": "folder" if item.is_dir() else "file",
            "size": details.st_size if item.is_file() else None,
            "modified": details.st_mtime,
        })
    return sorted(entries, key=lambda item: (item["type"] != "folder", item["name"].lower()))


@router.post("/folders", status_code=status.HTTP_201_CREATED)
def create_folder(name: str, directory: str = "", current_user: str = Depends(get_current_user)):
    ensure_storage_root()
    if not name or Path(name).name != name or name in {".", ".."}:
        raise HTTPException(status_code=400, detail="A valid folder name is required")
    parent = storage_path(directory)
    if not parent.is_dir():
        raise HTTPException(status_code=404, detail="Folder not found")
    target = storage_path(str(Path(directory) / name))
    if target.exists():
        raise HTTPException(status_code=409, detail="An item with this name already exists")
    target.mkdir()
    return {"name": target.name, "path": str(target.relative_to(STORAGE_ROOT)), "type": "folder"}


@router.post("/files", status_code=status.HTTP_201_CREATED)
async def upload_file(file: UploadFile, directory: str = "", current_user: str = Depends(get_current_user)):
    ensure_storage_root()
    name = Path(file.filename or "").name
    if not name or name in {".", ".."}:
        raise HTTPException(status_code=400, detail="A valid file name is required")
    parent = storage_path(directory)
    if not parent.is_dir():
        raise HTTPException(status_code=404, detail="Folder not found")
    target = storage_path(str(Path(directory) / name))
    if target.exists():
        raise HTTPException(status_code=409, detail="An item with this name already exists")
    temporary, total_size = target.with_name(f".{target.name}.uploading"), 0
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
    return {"name": target.name, "path": str(target.relative_to(STORAGE_ROOT)), "size": total_size}


@router.get("/text/{path:path}")
def read_text_file(path: str, current_user: str = Depends(get_current_user)):
    target = storage_path(path)
    if not target.is_file() or target.is_symlink():
        raise HTTPException(status_code=404, detail="File not found")
    if target.stat().st_size > MAX_TEXT_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Only text files up to 2 MiB can be edited")
    try:
        return {"content": target.read_text(encoding="utf-8")}
    except UnicodeDecodeError:
        raise HTTPException(status_code=415, detail="This file is not UTF-8 text")


@router.put("/text/{path:path}")
def write_text_file(path: str, update: TextFileUpdate, current_user: str = Depends(get_current_user)):
    target = storage_path(path)
    if not target.is_file() or target.is_symlink():
        raise HTTPException(status_code=404, detail="File not found")
    encoded = update.content.encode("utf-8")
    if len(encoded) > MAX_TEXT_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Only text files up to 2 MiB can be edited")
    temporary = target.with_name(f".{target.name}.editing")
    temporary.write_bytes(encoded)
    temporary.replace(target)
    return {"path": path, "size": len(encoded)}


@router.get("/files/{path:path}")
def download_file(path: str, current_user: str = Depends(get_current_user)):
    target = storage_path(path)
    if not target.is_file() or target.is_symlink():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(target, filename=target.name)


@router.delete("/files/{path:path}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(path: str, current_user: str = Depends(get_current_user)):
    target = storage_path(path)
    if target == STORAGE_ROOT or not target.exists() or target.is_symlink():
        raise HTTPException(status_code=404, detail="Item not found")
    if target.is_dir():
        try:
            target.rmdir()
        except OSError:
            raise HTTPException(status_code=409, detail="Folder is not empty")
    else:
        target.unlink()
