import os, torch, numpy as np, traceback, gc
import scipy.io.wavfile as wavfile
from transformers import AutoProcessor, BarkModel, GPT2Tokenizer, GPT2LMHeadModel
from audiocraft.models import MusicGen
from pydub import AudioSegment

class MusicGenerator:
    def __init__(self, base_dir="generated_songs", segment_dir="segments", mixed_dir="mixed_segments"):
        # CPU-only mode
        self.device = "cpu"
        self.torch_dtype = torch.float16

        self.BASE_DIR = base_dir
        self.SEGMENT_DIR = segment_dir
        self.MIXED_DIR = mixed_dir
        os.makedirs(self.BASE_DIR, exist_ok=True)
        os.makedirs(self.SEGMENT_DIR, exist_ok=True)
        os.makedirs(self.MIXED_DIR, exist_ok=True)

        # Lazy load models (None until used)
        self.tokenizer = GPT2Tokenizer.from_pretrained("gpt2")
        self.lyric_model = None
        self.bark_processor = None
        self.bark_model = None

    def _load_lyric_model(self):
        if self.lyric_model is None:
            self.lyric_model = GPT2LMHeadModel.from_pretrained(
                "SpartanCinder/GPT2-finetuned-lyric-generation",
                torch_dtype=self.torch_dtype
            ).to(self.device)

    def _unload_lyric_model(self):
        if self.lyric_model:
            del self.lyric_model
            self.lyric_model = None
            gc.collect()

    def _load_bark(self):
        if self.bark_processor is None or self.bark_model is None:
            self.bark_processor = AutoProcessor.from_pretrained("suno/bark-small")
            self.bark_model = BarkModel.from_pretrained(
                "suno/bark-small",
                use_safetensors=True,
                torch_dtype=self.torch_dtype
            ).to(self.device)

    def _unload_bark(self):
        if self.bark_model:
            del self.bark_model
            self.bark_model = None
        if self.bark_processor:
            del self.bark_processor
            self.bark_processor = None
        gc.collect()

    def generate_lyrics(self, prompt, max_length=100):
        self._load_lyric_model()
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)
        with torch.no_grad():
            outputs = self.lyric_model.generate(
                **inputs,
                max_length=max_length,
                do_sample=True,
                top_k=50,
                top_p=0.95,
                temperature=1.0,
                pad_token_id=self.tokenizer.eos_token_id
            )
        lyrics = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
        self._unload_lyric_model()
        return lyrics

    def split_lyrics(self, lyrics, max_words=25):
        words = lyrics.strip().split()
        return [' '.join(words[i:i+max_words]) for i in range(0, len(words), max_words)]

    def generate_melody(self, prompt, duration=30):
        musicgen = MusicGen.get_pretrained(
            "facebook/musicgen-small",
            device=self.device,
            dtype=self.torch_dtype
        )
        musicgen.set_generation_params(duration=duration, top_k=250, temperature=1.0)
        with torch.no_grad():
            wav = musicgen.generate([prompt])[0].cpu().numpy()
        del musicgen
        gc.collect()

        if wav.ndim == 2:
            wav = np.mean(wav, axis=0)
        if np.max(np.abs(wav)) > 1:
            wav /= np.max(np.abs(wav))

        out_path = os.path.join(self.BASE_DIR, "melody.wav")
        wavfile.write(out_path, 32000, (wav * 32767).astype(np.int16))
        return out_path

    def synth_segment(self, text, index, voice_preset="v2/en_speaker_9"):
        self._load_bark()
        out_path = os.path.join(self.SEGMENT_DIR, f"segment_{index:03d}.wav")
        try:
            inputs = self.bark_processor(text=f"♪ {text} ♪", voice_preset=voice_preset, return_tensors="pt")
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            with torch.no_grad():
                audio = self.bark_model.generate(**inputs)
            audio = audio.cpu().numpy().squeeze()
            wavfile.write(out_path, self.bark_model.generation_config.sample_rate, audio)
        except Exception as e:
            print(f"Error at segment {index}: {e}")
            traceback.print_exc()
            return None
        finally:
            self._unload_bark()
        return out_path

    def mix_segment(self, melody_path, voice_path, out_path):
        melody = AudioSegment.from_wav(melody_path)
        voice = AudioSegment.from_wav(voice_path)
        voice = voice + AudioSegment.silent(duration=max(0, len(melody) - len(voice)))
        mixed = melody - 5
        voice = voice + 5
        final = mixed.overlay(voice).fade_in(300).fade_out(300)
        final.export(out_path, format="wav")
        return out_path

    def concat_segments(self, output_path=None):
        files = sorted([f for f in os.listdir(self.MIXED_DIR) if f.endswith(".wav")])
        combined = AudioSegment.empty()
        for file in files:
            segment = AudioSegment.from_wav(os.path.join(self.MIXED_DIR, file))
            combined += segment + AudioSegment.silent(duration=300)
        final_path = output_path or os.path.join(self.BASE_DIR, "final_song.wav")
        combined.export(final_path, format="wav")
        return final_path

    def generate_all(self, prompt):
        lyrics = self.generate_lyrics(prompt)
        segments = self.split_lyrics(lyrics)
        melody_path = self.generate_melody(prompt)

        mixed_files = []
        for i, text in enumerate(segments):
            voice_path = self.synth_segment(text, i)
            if voice_path:
                out_path = os.path.join(self.MIXED_DIR, f"mix_{i:03d}.wav")
                self.mix_segment(melody_path, voice_path, out_path)
                mixed_files.append(out_path)

        final_path = self.concat_segments()
        return {
            "lyrics": lyrics,
            "segments": segments,
            "mixed_files": mixed_files,
            "final_song_path": final_path
        }
