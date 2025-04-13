import asyncio
import datetime
import hmac
import json
import logging
import os
import random
import socket
import struct
import time
from contextlib import asynccontextmanager
from threading import Thread

import magic
from db import File as FileModel
from db import SessionLocal, init_db
from fastapi import FastAPI, File, Response, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    SHARDS = int(os.environ["SHARDS"])
except (KeyError, ValueError):
    print("Environment variable 'SHARDS' not set or invalid")
    exit(1)

CHUNKS_PER_FILE = int(os.environ.get("CHUNKS_PER_FILE", 3))
REPLICAS = int(os.environ.get("REPLICAS", 2))
HMAC_SECRET = bytes.fromhex(os.environ.get("HMAC_SECRET", "secret"))

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)


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


class ShardStatus(BaseModel):
    shard: str
    healthy: bool
    size: int


class SharderHub:
    def __init__(self, shards: list[str] | None = None):
        self._shards = shards or [f"shard-{i+1}:12345" for i in range(SHARDS)]
        self._status: dict[str, ShardStatus] = {}

    @property
    def status(self) -> list[dict]:
        return [status.model_dump() for status in self._status.values()]

    def send(self, data: bytes) -> str:
        chunk_size = (len(data) + CHUNKS_PER_FILE - 1) // CHUNKS_PER_FILE
        chunks = [
            data[i * chunk_size : min((i + 1) * chunk_size, len(data))]
            for i in range(CHUNKS_PER_FILE)
        ]
        file_hmac = hmac.new(HMAC_SECRET, data, "sha256").digest()

        for i, chunk in enumerate(chunks):
            sent = 0
            for shard in random.sample(self._shards, len(self._shards)):
                if self._send_chunk(shard, chunk, file_hmac, i):
                    sent += 1
                if sent >= REPLICAS:
                    break

        return file_hmac.hex()

    def _send_chunk(
        self,
        shard: str,
        chunk: bytes,
        file_hmac: bytes,
        index: int,
    ) -> bool:
        host, port = shard.split(":")
        try:
            with socket.create_connection((host, int(port)), timeout=5) as sock:
                payload = (
                    b"\x01"
                    + struct.pack(">IHI", index, len(file_hmac), len(chunk))
                    + file_hmac
                    + chunk
                )
                sock.sendall(payload)
                logging.info(f"Sent chunk {index} to {shard}")
                header = sock.recv(1)
                if header and header.startswith(b"\x01"):
                    logging.info(f"Chunk {index} sent successfully to {shard}")
                    return True
                raise RuntimeError(
                    f"Failed to send chunk {index} to {shard}: No acknowledgment"
                )
        except Exception as e:
            logging.error(f"Failed to send chunk {index} to {shard}: {e}")

        return False

    def reconstruct(self, file_hmac_hex: str) -> bytes:
        file_hmac = bytes.fromhex(file_hmac_hex)
        reconstructed_chunks = []

        for index in range(CHUNKS_PER_FILE):
            chunk = self._retrieve_chunk(index, file_hmac)
            if chunk is None:
                raise RuntimeError(f"Failed to reconstruct chunk {index}")
            reconstructed_chunks.append(chunk)

        return b"".join(reconstructed_chunks)

    def _retrieve_chunk(self, index: int, file_hmac: bytes) -> bytes | None:
        message = b"\x02" + struct.pack(">IH", index, len(file_hmac)) + file_hmac
        for shard in self._shards:
            host, port = shard.split(":")
            try:
                with socket.create_connection((host, int(port)), timeout=5) as sock:
                    sock.sendall(message)
                    header = sock.recv(5)
                    if not header or header[0] != 0x01:
                        continue

                    chunk_size = struct.unpack(">I", header[1:])[0]
                    chunk = b""
                    while len(chunk) < chunk_size:
                        part = sock.recv(min(4096, chunk_size - len(chunk)))
                        if not part:
                            break
                        chunk += part

                    if len(chunk) == chunk_size:
                        logging.info(
                            f"Successfully retrieved chunk {index} from {shard}"
                        )
                        return chunk
                    else:
                        logging.warning(f"Incomplete chunk {index} from {shard}")
            except Exception as e:
                logging.error(f"Error retrieving chunk {index} from {shard}: {e}")
        return None

    def destroy(self, file_hmac: bytes):
        for shard in self._shards:
            host, port = shard.split(":")
            try:
                with socket.create_connection((host, int(port)), timeout=5) as sock:
                    message = b"\x03" + struct.pack(">H", len(file_hmac)) + file_hmac
                    sock.sendall(message)
                    logging.info(f"Deleted file {file_hmac.hex()} from {shard}")
            except Exception as e:
                logging.error(
                    f"Failed to delete file {file_hmac.hex()} from {shard}: {e}"
                )

    def healthcheck(self):
        while True:
            for shard in self._shards:
                host, port = shard.split(":")
                try:
                    with socket.create_connection((host, int(port)), timeout=5) as sock:
                        sock.sendall(b"\x04")
                        size = sock.recv(4)
                        if not size:
                            raise RuntimeError("No response from shard")
                        size = struct.unpack(">I", size)[0]
                        self._status[shard] = ShardStatus(
                            shard=shard,
                            healthy=True,
                            size=size,
                        )
                except Exception as e:
                    logging.error(f"Failed to check health of shard {shard}: {e}")
                    self._status[shard] = ShardStatus(
                        shard=shard,
                        healthy=False,
                        size=0,
                    )

            time.sleep(3)


sharder_hub = SharderHub()


class UploadResponse(BaseModel):
    ulid: str


class FilePydantic(BaseModel):
    id: str
    name: str
    size: int
    hmac: str
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)) -> UploadResponse:
    contents = await file.read()
    file_hmac = await asyncio.get_event_loop().run_in_executor(
        None,
        sharder_hub.send,
        contents,
    )
    with SessionLocal() as db:
        file_record = FileModel(name=file.filename, size=len(contents), hmac=file_hmac)
        db.add(file_record)
        db.commit()
        db.refresh(file_record)

    return UploadResponse(ulid=file_record.id)


@app.get("/api/files")
async def list_files() -> list[FilePydantic]:
    with SessionLocal() as db:
        return [FilePydantic.model_validate(file) for file in db.query(FileModel).all()]


@app.get("/api/files/{file_id}")
async def get_file(file_id: str):
    with SessionLocal() as db:
        file_record = db.query(FileModel).filter(FileModel.id == file_id).first()
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
async def delete_file(file_id: str):
    with SessionLocal() as db:
        file_record = db.query(FileModel).filter(FileModel.id == file_id).first()
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
