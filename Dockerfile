# ==============================
# Stage 1: Build React frontend
# ==============================
FROM node:18 AS frontend-builder

WORKDIR /app/frontend

# Copy package.json và cài deps frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --progress=false || npm install

# Copy toàn bộ code frontend và build
COPY frontend/ ./
RUN npm run build


# ==============================
# Stage 2: Final backend + frontend
# ==============================
FROM python:3.10

WORKDIR /app
# Copy backend requirements và cài đặt (KHÔNG override torch)
COPY backend/requirements.txt ./requirements.txt


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

# Cài pip + wheel
RUN pip install --upgrade pip setuptools wheel

# ⚡ Cài PyTorch CPU-only (ổn định cho audiocraft + bark)
RUN pip install --no-cache-dir \
    torch==2.1.0+cpu \
    torchvision==0.16.0+cpu \
    torchaudio==2.1.0+cpu \
    -f https://download.pytorch.org/whl/cpu/torch_stable.html

# ⚡ Khoá torch lại (không cho override)
RUN pip install --no-deps --no-cache-dir \
    torch==2.1.0+cpu \
    torchvision==0.16.0+cpu \
    torchaudio==2.1.0+cpu

# Cài numpy < 2 để tránh conflict
RUN pip install --no-cache-dir "numpy<2"

RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend ./backend

# Copy frontend build sang backend
COPY --from=frontend-builder /app/frontend/build ./backend/build

# Tạo thư mục output
RUN mkdir -p /app/backend/generated

ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
