import os
import random
import time
from hashlib import sha256
from pathlib import Path
from urllib.parse import quote_plus

from requests_unixsocket import Session

SOCKET_PATH = Path(__file__).parent / "socks" / "nginx.sock"
session = Session()
encoded_path = quote_plus(str(SOCKET_PATH))
BASE_URL = f"http+unix://{encoded_path}"


def auth() -> None:
    username = os.urandom(8).hex()
    password = os.urandom(8).hex()

    response = session.post(
        f"{BASE_URL}/api/register",
        json={"username": username, "password": password},
    )

    if "auth_token" in session.cookies:
        session.cookies["auth_token"] = session.cookies["auth_token"].strip('"')

    response = session.get(f"{BASE_URL}/api/me").json()
    assert response.get("username") == username
    assert response.get("id")


def upload(data: bytes) -> str:
    files = {
        "file": (f"test_{os.urandom(4).hex()}.bin", data, "application/octet-stream")
    }
    response = session.post(f"{BASE_URL}/api/upload", files=files)
    return response.json().get("ulid")


def download(ulid: str) -> bytes:
    response = session.get(f"{BASE_URL}/api/files/{ulid}")
    return response.content


def delete(ulid: str) -> None:
    session.delete(f"{BASE_URL}/api/files/{ulid}")


def test_download_upload(size: int) -> str:
    original_data = os.urandom(size)
    ulid = upload(original_data)
    if not ulid:
        print(f"❌ ULID is empty: {ulid = }, {size = }")
        exit(1)

    downloaded_data = download(ulid)
    if not downloaded_data:
        print(f"❌ Downloaded data is empty: {downloaded_data = }, {size = }")
        exit(1)

    if sha256(original_data).hexdigest() != sha256(downloaded_data).hexdigest():
        print(
            f"❌ Hashes do not match: {sha256(original_data).hexdigest()} != {sha256(downloaded_data).hexdigest()}, {size = }, {original_data[:10] = }, {downloaded_data[:10] = }"
        )
        exit(1)

    delete(ulid)
    return sha256(original_data).hexdigest()


def wait_for_shards() -> None:
    while True:
        response = session.get(f"{BASE_URL}/api/healthcheck")
        if response.status_code == 200:
            break
        print("Waiting for shards to be available...")
        time.sleep(1)


if __name__ == "__main__":
    wait_for_shards()
    auth()

    test_sizes = [
        *[random.randint(100, 1000) for _ in range(5)],
        *[random.randint(1000, 10000) for _ in range(5)],
        *[random.randint(10000, 100000) for _ in range(5)],
        *[random.randint(100000, 1000000) for _ in range(5)],
        *[random.randint(1000000, 10000000) for _ in range(5)],
    ]
    for size in test_sizes:
        file_hash = test_download_upload(size)
        print(
            f"\033[92m✅ Download-Upload-Delete test passed for size: {size} bytes - {file_hash}\033[0m"
        )
