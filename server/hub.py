import hmac
import logging
import os
import random
import socket
import struct
import time

from pydantic import BaseModel

CHUNKS_PER_FILE = int(os.environ.get("CHUNKS_PER_FILE", 3))
REPLICAS = int(os.environ.get("REPLICAS", 2))
HMAC_SECRET = bytes.fromhex(os.environ.get("HMAC_SECRET", "secret"))


class ShardStatus(BaseModel):
    shard: str
    healthy: bool
    size: int
    last_heartbeat: float = 0


class SharderHub:
    def __init__(self):
        self._shards = []
        self._status: dict[str, ShardStatus] = {}

    def add_shard(self, host: str, port: int):
        shard = f"{host}:{port}"
        if shard not in self._shards:
            self._shards.append(shard)
            self._status[shard] = ShardStatus(
                shard=shard,
                healthy=False,
                size=0,
            )
            logging.info(f"Added shard {shard}")

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
            logging.debug("Sending %s to %s", message, shard)
            try:
                with socket.create_connection((host, int(port)), timeout=5) as sock:
                    sock.sendall(message)
                    header = sock.recv(5)
                    logging.debug("Got %s from %s", header, host)
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
            for shard in list(self._shards):
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
                            last_heartbeat=time.time(),
                        )
                except Exception as e:
                    logging.error(f"Failed to check health of shard {shard}: {e}")
                    if shard in self._status:
                        self._status[shard].healthy = False

                    if time.time() - self._status[shard].last_heartbeat > 300:
                        logging.warning(
                            f"Removing shard {shard} due to prolonged offline status"
                        )
                        self._shards.remove(shard)
                        del self._status[shard]

            time.sleep(3)


sharder_hub = SharderHub()
