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
FROM python:3.10-slim

WORKDIR /app

COPY backend/requirements.txt .


# Cài đặt torch riêng (CPU build), không để trong requirements.txt
RUN pip install --no-cache-dir \
    torch==2.1.0+cpu \
    torchvision==0.16.0+cpu \
    torchaudio==2.1.0+cpu \
    -f https://download.pytorch.org/whl/cpu/torch_stable.html

# Cài đặt các thư viện còn lại
RUN pip install --no-cache-dir -r requirements.txt

# Copy code sau cùng (để tối ưu cache build)
COPY . .

# Expose port
EXPOSE 8080

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
