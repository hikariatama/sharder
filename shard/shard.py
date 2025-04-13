import logging
import os
import socket
import struct
import threading
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)


class FileSystem:
    def __init__(self, base: Path) -> None:
        self._base = base
        self._base.mkdir(parents=True, exist_ok=True)
        self._size: int = -1
        self._calculate_size()

    @property
    def size(self) -> int:
        if self._size == -1:
            self._calculate_size()
        return self._size

    def _calculate_size(self):
        self._size = 0
        for path in self._base.glob("**/*"):
            if path.is_file():
                self._size += path.stat().st_size

    def save(self, hmac: str, chunk: bytes, chunk_index: int) -> None:
        dir_path = self._base / hmac[:2] / hmac[2:4] / hmac
        dir_path.mkdir(parents=True, exist_ok=True)

        file_path = dir_path / f"{chunk_index:08x}"
        file_path.write_bytes(chunk)
        self._calculate_size()
        logging.info(f"Saved chunk to {file_path}")

    def load(self, hmac: str, chunk_index: int) -> bytes | None:
        file_path = self._base / hmac[:2] / hmac[2:4] / hmac / f"{chunk_index:08x}"
        if not file_path.exists():
            return None

        data = file_path.read_bytes()
        logging.info(f"Loaded chunk from {file_path}")
        return data

    def destroy(self, hmac: str) -> bool:
        dir_path = self._base / hmac[:2] / hmac[2:4] / hmac
        if not dir_path.exists():
            return False

        for file in dir_path.glob("*"):
            file.unlink()
        dir_path.rmdir()

        while (
            dir_path.parent.exists()
            and not any(dir_path.parent.iterdir())
            and dir_path.parent != self._base
        ):
            dir_path.parent.rmdir()
            dir_path = dir_path.parent

        logging.info(f"Deleted files for HMAC {hmac}")
        return True


fs = FileSystem(
    Path(os.getenv("SHARDER_BASE", (Path(__file__).parent / ".data").as_posix()))
)


class Shard:
    def __init__(self, host="0.0.0.0", port=12345):
        self.host = host
        self.port = port
        self.is_running = False
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

    def start(self):
        self.server_socket.bind((self.host, self.port))
        self.server_socket.listen(5)
        self.is_running = True
        logging.info(f"Shard server started at {self.host}:{self.port}")

        try:
            while self.is_running:
                client_sock, addr = self.server_socket.accept()
                logging.info(f"Connection from {addr}")
                threading.Thread(
                    target=self._handle_client,
                    args=(client_sock, addr),
                    daemon=True,
                ).start()
        except KeyboardInterrupt:
            self.stop()

    def stop(self):
        self.is_running = False
        self.server_socket.close()
        logging.info("Shard server stopped.")

    def _handle_client(self, client_socket: socket.socket, address):
        try:
            with client_socket:
                initial_data = client_socket.recv(43)
                if not initial_data:
                    return

                msg_type = initial_data[0]
                if msg_type == 0x01:
                    self._handle_store(client_socket, initial_data)
                elif msg_type == 0x02:
                    self._handle_retrieve(client_socket, initial_data)
                elif msg_type == 0x03:
                    self._handle_delete(client_socket, initial_data)
                elif msg_type == 0x04:
                    self._handle_ping(client_socket)
        except Exception as e:
            logging.error(f"Error handling client {address}: {e}")
        finally:
            logging.info(f"Connection closed for {address}")

    def _handle_store(self, sock: socket.socket, header: bytes):
        chunk_index, hmac_len, data_len = struct.unpack(">IHI", header[1:11])
        hmac = header[11 : 11 + hmac_len]
        chunk = b""
        while len(chunk) < data_len:
            part = sock.recv(min(4096, data_len - len(chunk)))
            if not part:
                break
            chunk += part

        if len(chunk) == data_len:
            fs.save(hmac.hex(), chunk, chunk_index)
            logging.info(f"Stored chunk {chunk_index}")
            sock.sendall(b"\x01")
        else:
            logging.warning(f"Failed to receive full chunk {chunk_index}")

    def _handle_retrieve(self, sock: socket.socket, header: bytes):
        chunk_index, hmac_len = struct.unpack(">IH", header[1:7])
        hmac = header[7 : 7 + hmac_len]
        chunk = fs.load(hmac.hex(), chunk_index)

        if chunk:
            sock.sendall(b"\x01" + struct.pack(">I", len(chunk)))
            for i in range(0, len(chunk), 4096):
                sock.sendall(chunk[i : i + 4096])
            logging.info(f"Sent chunk {chunk_index}")
        else:
            sock.sendall(b"\x00")

    def _handle_delete(self, sock: socket.socket, header: bytes):
        hmac_len = struct.unpack(">H", header[1:3])[0]
        hmac = header[3 : 3 + hmac_len].hex()

        if fs.destroy(hmac):
            logging.info(f"Deleted files for HMAC {hmac}")
            sock.sendall(b"\x01")
        else:
            sock.sendall(b"\x00")

    def _handle_ping(self, sock: socket.socket):
        sock.sendall(struct.pack(">I", fs.size))


if __name__ == "__main__":
    shard = Shard(host="0.0.0.0", port=12345)
    shard.start()
