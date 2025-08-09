import { useState } from "react";

export default function SongGenerator() {
  const [prompt, setPrompt] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const generateSong = async (prompt) => {
    setLoading(true);
    const res = await fetch("http://0.0.0.0:8080/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    const data = await res.json();
    setLyrics(data.lyrics);
    setAudioUrl("/download"); // endpoint tải bài hát từ backend
    setLoading(false);
  };
  
	const downloadSong = () => {
  window.open("/download", "music");
};
  return (
    <div className="min-h-screen bg-transparent flex flex-col items-center justify-center text-center p-6 space-y-6">
      <h1 className="text-4xl font-bold text-teal-500">Ai Music Generation</h1>
	  <img
		  src="/image/note.jpeg"
		  alt="Song illustration"
		  className="w-72 h-72 object-cover rounded shadow"
	  />
      <p className="text-black font-semibold text-lg">Type in your mind</p>

      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Insert here ....."
        className="w-full max-w-md px-4 py-2 rounded border border-gray-300 text-black bg-white placeholder-gray-500 shadow"
      />

      <button
        onClick={() => generateSong(prompt)}
        disabled={loading || !prompt}
        className={`bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded transition ${
          loading ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {loading ? "Loading..." : "Load"}
      </button>

      {lyrics && (
        <p className="text-black font-medium max-w-md">
          The process has been done! Please press on the download button below
        </p>
      )}

      {audioUrl && (
        <a
          href={audioUrl}
          download
          className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded inline-flex items-center gap-2"
        >
          ⬇ Download
        </a>
      )}
    </div>
  );
}
