.PHONY: install test run compose migrate seed

install:
	python -m venv .venv
	.venv/Scripts/pip install -r requirements-dev.txt || .venv/bin/pip install -r requirements-dev.txt

test:
	pytest -q

run:
	uvicorn app.main:app --reload --port 8000

compose:
	docker compose -f docker/docker-compose.yml up --build

migrate:
	alembic upgrade head

seed:
	python -m scripts.seed
