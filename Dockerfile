# ==============================
# Stage 1: Build React frontend
# ==============================
FROM node:18 AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci --no-audit --progress=false || npm install

COPY frontend/ ./
RUN npm run build


# ==============================
# Stage 2: Final backend + frontend
# ==============================
FROM python:3.10

WORKDIR /app
COPY backend/requirements.txt ./requirements.txt

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    build-essential \
    python3-dev \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip setuptools wheel

# Cài thẳng từ requirements (bao gồm torch do bạn quy định)
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY --from=frontend-builder /app/frontend/build ./backend/build

RUN mkdir -p /app/backend/generated

ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
