from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import mapped_column

from .db import Base
from ulid import ULID


class File(Base):
    __tablename__ = "files"

    id = mapped_column(String(26), primary_key=True, default=lambda: str(ULID()))
    name = mapped_column(String(255), nullable=False)
    size = mapped_column(Integer, nullable=False)
    hmac = mapped_column(String(255), nullable=False)
    created_at = mapped_column(DateTime, default=datetime.now)
