# ==============================
# Stage 1: Build React frontend
# ==============================
FROM node:18 AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install --production
COPY frontend/ ./
RUN npm run build

# ==============================
# Stage 2: Build backend deps
# ==============================
FROM python:3.10-slim AS backend-builder
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
ENV PYTORCH_SDP_DISABLE=1
ENV PYTORCH_SDP_KERNEL=0


RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    ffmpeg \
    git \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip setuptools wheel
RUN pip install --no-cache-dir "torch>=2.1.1"

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir "numpy<2"
RUN pip install --no-cache-dir -r requirements.txt
ENV TORCH_DTYPE=float32
# ==============================
# Stage 3: Final lightweight image
# ==============================
FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip setuptools wheel
RUN pip install --no-cache-dir "torch>=2.1.1" "numpy<2"

# Copy backend code + requirements
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend

# Copy built React into static folder for FastAPI
COPY --from=frontend-builder /app/frontend/build ./backend/build
RUN mkdir -p /app/backend/generated

ENV PYTORCH_ENABLE_SDPA=0
ENV PORT=8080
EXPOSE 8080


CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
