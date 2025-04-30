import base64
import hashlib
import hmac
import json
import os

from fastapi import HTTPException, Request
from pydantic import BaseModel

HMAC_SECRET = bytes.fromhex(os.environ.get("HMAC_SECRET", "secret"))


class UserAuth(BaseModel):
    id: str
    username: str


def generate_token(data: UserAuth) -> str:
    payload_json = json.dumps(data.model_dump()).encode("utf-8")
    h = hmac.new(HMAC_SECRET, payload_json, hashlib.sha256).digest()

    token = h + payload_json
    return base64.b64encode(token).decode("utf-8")


def digest_token(token: str) -> UserAuth:
    try:
        decoded_token = base64.b64decode(token.encode("utf-8"))
        hmac_hash, payload = decoded_token[:32], decoded_token[32:]
        expected_hmac = hmac.new(HMAC_SECRET, payload, hashlib.sha256).digest()
        if not hmac.compare_digest(hmac_hash, expected_hmac):
            raise ValueError("Invalid HMAC")
        data = json.loads(payload.decode("utf-8"))
        if not isinstance(data, dict):
            raise ValueError("Invalid payload format")

        if "id" not in data or "username" not in data:
            raise ValueError("Missing required fields in payload")

        if not isinstance(data["id"], str) or not isinstance(data["username"], str):
            raise ValueError("Invalid field types in payload")

        user_data = UserAuth.model_validate(data)
        return user_data
    except Exception as e:
        raise ValueError(f"Invalid token: {e}")


def use_auth(request: Request) -> UserAuth:
    token = request.cookies.get("auth_token")
    if not token:
        raise HTTPException(status_code=403, detail="Unauthorized")

    try:
        user = digest_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    return user
