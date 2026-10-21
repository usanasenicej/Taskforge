FROM python:3.12-slim AS builder

WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN python -m venv /opt/venv && /opt/venv/bin/pip install --upgrade pip && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    APP_HOME=/app

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl default-mysql-client \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 taskforge

COPY --from=builder /opt/venv /opt/venv
WORKDIR ${APP_HOME}
COPY app ./app
COPY migrations ./migrations
COPY alembic.ini ./alembic.ini
COPY scripts ./scripts
COPY docker/gunicorn.conf.py ./gunicorn.conf.py

USER 10001
EXPOSE 8000
HEALTHCHECK --interval=20s --timeout=5s --retries=5 CMD curl -fsS http://127.0.0.1:8000/health/live || exit 1

CMD ["gunicorn", "app.main:app", "-c", "gunicorn.conf.py"]
