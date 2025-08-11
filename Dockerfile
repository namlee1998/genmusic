# ==============================
# Stage 1: Build React frontend
# ==============================
FROM node:18 AS frontend-builder

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install --production
COPY frontend/ ./
RUN npm run build

# ==============================
# Stage 2: Build backend deps
# ==============================
FROM python:3.10-slim AS backend-builder

# Cài đặt gói cần thiết cho build Python packages + ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Nâng pip để tránh compile thủ công torch/scipy
RUN pip install --upgrade pip setuptools wheel

WORKDIR /app

# Cài numpy trước để tránh lỗi với torch
COPY backend/requirements.txt .
RUN pip install --no-cache-dir "numpy<2"
# ... Stage 2 or final setup
RUN pip install --no-cache-dir torch==2.1.0
RUN pip install --no-cache-dir -r requirements.txt
# Optional: if you need xformers:
RUN pip install --no-cache-dir xformers==0.0.18 --no-deps


# ==============================
# Stage 3: Final lightweight image
# ==============================
FROM python:3.10-slim

WORKDIR /app

# Cài ffmpeg cho stage final (để khi runtime vẫn có ffmpeg)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy toàn bộ Python env từ stage 2
COPY --from=backend-builder /usr/local /usr/local

# Copy backend code
COPY backend/ .

# Copy build React sang static
COPY --from=frontend-builder /frontend/build ./static

ENV PORT=8080
EXPOSE 8080

# Xoá cache để giảm kích thước
RUN apt-get clean && rm -rf /root/.cache

# Dùng biến PORT của Cloud Run
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
