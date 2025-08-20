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
FROM python:3.10-slim

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTORCH_ENABLE_SDPA=0

# Cài deps hệ thống
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    build-essential \
    python3-dev \
 && rm -rf /var/lib/apt/lists/*

# Cài Python deps
RUN pip install --upgrade pip setuptools wheel

RUN pip install --no-cache-dir torch==2.1.0+cpu torchvision==0.16.0+cpu torchaudio==2.1.0+cpu \
    -f https://download.pytorch.org/whl/torch_stable.html
RUN pip install --no-cache-dir "numpy<2"

# Copy backend requirements và cài
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Sau khi cài requirements
RUN pip uninstall -y xformers || true

# Copy backend code
COPY backend ./backend

# Copy frontend build vào backend
COPY --from=frontend-builder /app/frontend/build ./backend/build
RUN mkdir -p /app/backend/generated

ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
