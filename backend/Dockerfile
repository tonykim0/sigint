FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Railway persistent volume should be mounted here for KIS token + SQLite persistence
# SIGINT_DATA_DIR env var can override (default: /app/data)
ENV SIGINT_DATA_DIR=/app/data

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
