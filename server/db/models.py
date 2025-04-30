from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ulid import ULID

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(26),
        primary_key=True,
        default=lambda: str(ULID()),
    )
    username: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password: Mapped[str] = mapped_column(String(255), nullable=False)

    files: Mapped[list["File"]] = relationship("File", back_populates="owner")


class File(Base):
    __tablename__ = "files"

    id: Mapped[str] = mapped_column(
        String(26),
        primary_key=True,
        default=lambda: str(ULID()),
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    hmac: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    owner: Mapped[User] = relationship("User", back_populates="files")
