import os
import random
from hashlib import sha256
from pathlib import Path
from urllib.parse import quote

from requests_unixsocket import Session

session = Session()

sock_path = (Path(__file__).parent / "socks" / "nginx.sock").resolve()
if not sock_path.exists():
    print(
        f"\033[91m❌ Socket file not found at {sock_path}. Please ensure the server is running.\033[0m"
    )
    exit(1)

sock_path = quote(str(sock_path), safe="")


def auth() -> None:
    username = os.urandom(8).hex()
    password = os.urandom(8).hex()

    session.post(
        f"http+unix://{sock_path}:/api/register",
        json={"username": username, "password": password},
    )
    response = session.get(f"http+unix://{sock_path}:/api/me").json()
    assert response.get("username") == username
    assert response.get("id")


def upload(data: bytes) -> str:
    files = {
        "file": (f"test_{os.urandom(4).hex()}.bin", data, "application/octet-stream")
    }
    response = session.post(f"http+unix://{sock_path}:/api/upload", files=files)
    return response.json().get("ulid")


def download(ulid: str) -> bytes:
    response = session.get(f"http+unix://{sock_path}:/api/files/{ulid}")
    return response.content


def delete(ulid: str) -> None:
    session.delete(f"http+unix://{sock_path}:/api/files/{ulid}")


def test_download_upload(size: int) -> str:
    original_data = os.urandom(size)
    ulid = upload(original_data)
    assert ulid
    downloaded_data = download(ulid)
    assert downloaded_data
    assert sha256(original_data).hexdigest() == sha256(downloaded_data).hexdigest()
    delete(ulid)
    return sha256(original_data).hexdigest()


if __name__ == "__main__":
    try:
        auth()

        test_sizes = [
            *[random.randint(100, 1000) for _ in range(5)],
            *[random.randint(1000, 10000) for _ in range(5)],
            *[random.randint(10000, 100000) for _ in range(5)],
            *[random.randint(100000, 1000000) for _ in range(5)],
            *[random.randint(1000000, 10000000) for _ in range(5)],
        ]
        for size in test_sizes:
            try:
                file_hash = test_download_upload(size)
            except AssertionError:
                print(f"\033[91m❌ Test failed for size: {size} bytes\033[0m")
                exit(1)
            else:
                print(
                    f"\033[92m✅ Download-Upload-Delete test passed for size: {size} bytes - {file_hash}\033[0m"
                )
    except Exception as e:
        print(f"\033[91m❌ Tests failed: {e}\033[0m")
        exit(1)
