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

# Cài đặt gói cần thiết cho build Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /install

# Nâng pip để tránh compile thủ công torch/scipy
RUN pip install --upgrade pip setuptools wheel

# Cài dependencies vào /install để copy sang stage nhẹ hơn
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ==============================
# Stage 3: Final lightweight image
# ==============================
FROM python:3.10-slim

WORKDIR /app

# Copy dependencies từ stage backend-builder
COPY --from=backend-builder /install /usr/local

# Copy backend code
COPY backend/ .

# Copy build React sang static
COPY --from=frontend-builder /frontend/build ./static

ENV PORT=8080
EXPOSE 8080

# Xoá cache để giảm kích thước
RUN apt-get clean && rm -rf /root/.cache

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
