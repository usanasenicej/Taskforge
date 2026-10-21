import multiprocessing
import os

bind = "0.0.0.0:8000"
worker_class = "uvicorn.workers.UvicornWorker"
workers = int(os.getenv("WEB_CONCURRENCY", max(2, multiprocessing.cpu_count())))
timeout = 60
keepalive = 5
graceful_timeout = 30
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("LOG_LEVEL", "info").lower()
