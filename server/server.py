import asyncio
import base64
import datetime
import json
import logging
from contextlib import asynccontextmanager
from threading import Thread
from typing import Annotated
import os

import bcrypt
import magic
from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    Response,
    UploadFile,
    WebSocket,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import and_

from auth import UserAuth, generate_token, use_auth
from db import File as FileModel
from db import SessionLocal
from db import User as UserModel
from db import init_db
from hub import sharder_hub

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)

CONNECTION_SECRET = base64.b64encode(
    bytes.fromhex(os.environ["CONNECTION_SECRET"])
).decode().strip("=")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    Thread(target=sharder_hub.healthcheck, daemon=True).start()
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class UploadResponse(BaseModel):
    ulid: str


class FilePydantic(BaseModel):
    id: str
    name: str
    size: int
    hmac: str
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/login")
async def login(request: LoginRequest):
    with SessionLocal() as db:
        user = (
            db.query(UserModel).filter(UserModel.username == request.username).first()
        )
        if not user or not bcrypt.checkpw(
            request.password.encode("utf-8"),
            user.password.encode("utf-8"),
        ):
            return {"message": "Invalid username or password"}

        token = generate_token(UserAuth(id=user.id, username=user.username))
        response = Response()
        response.set_cookie(
            key="auth_token",
            value=token,
            httponly=True,
            secure=True,
            samesite="strict",
            expires=datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=7),
        )
        return response


@app.post("/api/register")
async def register(request: LoginRequest):
    with SessionLocal() as db:
        if db.query(UserModel).filter(UserModel.username == request.username).first():
            raise HTTPException(status_code=400, detail="Username already exists")

        hashed_password = bcrypt.hashpw(
            request.password.encode("utf-8"),
            bcrypt.gensalt(),
        ).decode("utf-8")
        user = UserModel(username=request.username, password=hashed_password)
        db.add(user)
        db.commit()
        db.refresh(user)

        token = generate_token(UserAuth(id=user.id, username=user.username))
        response = Response()
        response.set_cookie(
            key="auth_token",
            value=token,
            httponly=True,
            secure=True,
            samesite="strict",
            expires=datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=7),
        )
        return response


@app.get("/api/logout")
async def logout():
    response = Response()
    response.delete_cookie("auth_token")
    response.headers["Location"] = "/"
    response.status_code = 302
    return response


@app.get("/api/me")
async def me(user: Annotated[UserAuth, Depends(use_auth)]):
    with SessionLocal() as db:
        user = db.query(UserModel).filter(UserModel.id == user.id).first()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")

        return {"id": user.id, "username": user.username}


@app.get("/api/secret")
async def secret(user: Annotated[UserAuth, Depends(use_auth)]):
    with SessionLocal() as db:
        user = db.query(UserModel).filter(UserModel.id == user.id).first()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")

        return {"secret": CONNECTION_SECRET}


class ConnectionInfo(BaseModel):
    host: str
    port: int


@app.post("/api/connect/{connection_secret}")
async def connect(data: ConnectionInfo, connection_secret: str):
    if connection_secret != CONNECTION_SECRET:
        raise HTTPException(status_code=401, detail="Invalid connection secret")

    sharder_hub.add_shard(data.host, data.port)
    return {"ok": True}


@app.post("/api/upload")
async def upload_file(
    user: Annotated[UserAuth, Depends(use_auth)],
    file: UploadFile = File(...),
):
    contents = await file.read()
    file_hmac = await asyncio.get_event_loop().run_in_executor(
        None,
        sharder_hub.send,
        contents,
    )
    with SessionLocal() as db:
        user = db.query(UserModel).filter(UserModel.id == user.id).first()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")

        file_record = FileModel(
            name=file.filename,
            size=len(contents),
            hmac=file_hmac,
            owner=user,
        )
        db.add(file_record)
        db.commit()
        db.refresh(file_record)

    return UploadResponse(ulid=file_record.id)


@app.get("/api/files")
async def list_files(
    user: Annotated[UserAuth, Depends(use_auth)],
) -> list[FilePydantic]:
    with SessionLocal() as db:
        return [
            FilePydantic.model_validate(file)
            for file in db.query(FileModel).filter(FileModel.owner_id == user.id).all()
        ]


@app.get("/api/files/{file_id}")
async def get_file(file_id: str, user: Annotated[UserAuth, Depends(use_auth)]):
    with SessionLocal() as db:
        file_record = (
            db.query(FileModel)
            .filter(and_(FileModel.id == file_id, FileModel.owner_id == user.id))
            .first()
        )

        if not file_record:
            return b"File not found"

        contents = await asyncio.get_event_loop().run_in_executor(
            None,
            sharder_hub.reconstruct,
            file_record.hmac,
        )

    mime_type = magic.from_buffer(contents, mime=True)
    headers = {
        "Cache-Control": "public, max-age=31536000, immutable",
        "ETag": file_record.hmac,
    }

    if mime_type:
        return Response(content=contents, media_type=mime_type, headers=headers)
    else:
        try:
            return Response(
                content=contents.decode("utf-8"),
                media_type="text/plain",
                headers=headers,
            )
        except UnicodeDecodeError:
            return Response(
                content=contents,
                media_type="application/octet-stream",
                headers=headers,
            )


@app.delete("/api/files/{file_id}")
async def delete_file(file_id: str, user: Annotated[UserAuth, Depends(use_auth)]):
    with SessionLocal() as db:
        file_record = (
            db.query(FileModel)
            .filter(and_(FileModel.id == file_id, FileModel.owner_id == user.id))
            .first()
        )
        if not file_record:
            return {"message": "File not found"}

        hmac: str = file_record.hmac
        db.delete(file_record)
        db.commit()
        if not db.query(FileModel).filter(FileModel.hmac == hmac).first():
            sharder_hub.destroy(bytes.fromhex(hmac))


@app.websocket("/api/shards")
async def websocket_status(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.send_text(json.dumps(sharder_hub.status))
            await asyncio.sleep(3)
    except Exception:
        pass
    finally:
        await websocket.close()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
