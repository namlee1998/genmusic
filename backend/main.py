import os
import logging
from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.aimusic import MusicGenerator  # 👈 Class đã đóng gói xử lý

# ==============================
# Logger setup
# ==============================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# ==============================
# FastAPI app setup
# ==============================
app = FastAPI()

# Enable CORS (nếu frontend và backend chung domain thì có thể giới hạn lại)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static + generated dirs
STATIC_DIR = "static"
# đặt thư mục generated vào /tmp để chắc có quyền ghi trên Cloud Run
BASE_DIR = os.environ.get("GENERATED_DIR", "/tmp/generated_songs")

# đảm bảo thư mục tồn tại
os.makedirs(BASE_DIR, exist_ok=True)

# ==============================
# Request model
# ==============================
class PromptRequest(BaseModel):
    prompt: str

# ==============================
# Music generator init
# ==============================
logger.info("🚀 Server is starting...")
try:
    generator = MusicGenerator()
    logger.info("✅ MusicGenerator initialized successfully.")
except Exception as e:
    logger.error(f"❌ Error initializing MusicGenerator: {e}")
    generator = None

# ==============================
# API endpoints
# ==============================
@app.post("/api/generate")
async def generate_song(request: PromptRequest):
    if generator is None:
        return JSONResponse({"error": "Music generator not initialized"}, status_code=500)

    logger.info(f"🎤 Received prompt: {request.prompt}")
    try:
        # IMPORTANT: giữ nguyên logic sync: generator.generate_all(...) trả về dict kết quả
        result = generator.generate_all(request.prompt)
        # Nếu generator lưu file, hãy đảm bảo path là BASE_DIR/final_song.wav
        logger.info("🎶 Song generation completed.")
        return JSONResponse(result)
    except Exception as e:
        logger.exception("❌ Error during song generation")
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/download")
async def download_song():
    song_path = os.path.join(BASE_DIR, "final_song.wav")
    logger.info(f"📥 Download request received. Checking: {song_path}")

    if os.path.exists(song_path):
        logger.info("✅ Song file found. Sending file.")
        return FileResponse(path=song_path, filename="final_song.wav", media_type="audio/wav")

    logger.warning("⚠️ Song file not found.")
    return JSONResponse({"error": "Song not found"}, status_code=404)

app.mount("/static", StaticFiles(directory="static", html=True), name="static")

# Catch-all route: trả về index.html cho React Router
@app.get("/{full_path:path}")
async def catch_all(full_path: str):
    index_path = os.path.join("static", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"error": "index.html not found"}

