# syntax=docker/dockerfile:1
FROM python:3.12.8-slim AS python-base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=off \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_DEFAULT_TIMEOUT=100 \
    AIOHTTP_NO_EXTENSIONS=1 \
    POETRY_VERSION=1.8.3 \
    POETRY_HOME="/opt/poetry" \
    POETRY_VIRTUALENVS_IN_PROJECT=true \
    POETRY_NO_INTERACTION=1 \
    PYSETUP_PATH="/opt/pysetup" \
    VENV_PATH="/opt/pysetup/.venv" \
    GIT_PYTHON_REFRESH=quiet

ENV DOCKER=true
ENV PATH="$POETRY_HOME/bin:$VENV_PATH/bin:$PATH"

FROM python-base AS builder-base
RUN apt-get update && \
    apt-get install --no-install-recommends -y \
        curl \
        build-essential

RUN curl -sSL https://install.python-poetry.org | python -

WORKDIR $PYSETUP_PATH
COPY poetry.lock pyproject.toml ./
RUN poetry install --no-dev

FROM python-base AS production

RUN apt-get update && \
    apt-get install --no-install-recommends -y \
        libmagic1 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder-base $PYSETUP_PATH $PYSETUP_PATH

WORKDIR /opt/sharder-backend
COPY . /opt/sharder-backend

CMD ["python3", "server.py"]
