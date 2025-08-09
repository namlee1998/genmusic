from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os

from aimusic import MusicGenerator  # 👈 Class đã đóng gói xử lý

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    
STATIC_DIR = "static"
BASE_DIR = "generated_songs"

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

class PromptRequest(BaseModel):
    prompt: str

logger.info("🚀 Server is starting...")
try:
    generator = MusicGenerator()
    logger.info("✅ MusicGenerator initialized successfully.")
except Exception as e:
    logger.error(f"❌ Error initializing MusicGenerator: {e}")


@app.post("/generate")
async def generate_song(request: PromptRequest):
    logger.info(f"🎤 Received prompt: {request.prompt}")
    try:
        result = generator.generate_all(request.prompt)
        logger.info("🎶 Song generation completed.")
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"❌ Error during song generation: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/download")
async def download_song():
    song_path = os.path.join(BASE_DIR, "final_song.wav")
    logger.info(f"📥 Download request received. Checking: {song_path}")
    if os.path.exists(song_path):
        logger.info("✅ Song file found. Sending file.")
        return FileResponse(path=song_path, filename="final_song.wav", media_type="audio/wav")
    logger.warning("⚠️ Song file not found.")
    return JSONResponse({"error": "Song not found"}, status_code=404)
