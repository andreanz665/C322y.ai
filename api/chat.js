const SYSTEM = "Kamu C322y, agen AI yang ramah, rapi, dan teliti. Jawab dalam bahasa pengguna dengan Markdown ringkas (judul pendek, poin, tabel bila perlu). Jika ada foto atau voice note, pahami isinya dengan jelas.";

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Metode tidak diizinkan." });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY belum diatur di server." });

  const { contents, mode } = req.body || {};
  const ok = Array.isArray(contents) && contents.length > 0 && contents.length <= 40 &&
    contents.every(c => ["user", "model"].includes(c.role) && Array.isArray(c.parts));
  if (!ok) return res.status(400).json({ error: "Permintaan tidak valid." });

  const img = mode === "gambar";
  const model = img ? "gemini-3.1-flash-image" : "gemini-3.6-flash";
  const sys = SYSTEM + (mode === "rencana" ? " Mode rencana: susun rencana langkah demi langkah yang terstruktur sebelum menjawab." : "");
  const payload = img
    ? { contents, generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }
    : { system_instruction: { parts: [{ text: sys }] }, contents, generationConfig: { maxOutputTokens: 8192 } };

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(payload)
    });
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: d.error?.message || "Kesalahan dari Gemini." });
    const parts = d.candidates?.[0]?.content?.parts || [];
    const text = parts.filter(p => !p.thought && p.text).map(p => p.text).join("");
    const images = parts.map(p => p.inlineData || p.inline_data).filter(x => x && x.data)
      .map(x => ({ mime: x.mimeType || x.mime_type || "image/png", data: x.data }));
    if (!text && !images.length) return res.status(502).json({ error: "Respons kosong atau diblokir filter keamanan." });
    res.status(200).json({ text, images });
  } catch (e) {
    res.status(500).json({ error: "Gagal menghubungi Gemini." });
  }
};
