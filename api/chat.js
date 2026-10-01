// Serverless function (Vercel). API key disimpan di environment variable, tidak pernah sampai ke browser.
const SYSTEM = "Kamu adalah Zyst.ai, asisten umum yang ramah, jelas, dan akurat. Jawab dalam bahasa yang dipakai pengguna (utamakan Bahasa Indonesia). Jawab ringkas dan mudah dipahami; jika tidak yakin, katakan jujur.";
const hits = new Map(); // pembatas sederhana per IP
const LIMIT = Number(process.env.RATE_LIMIT || 20), WINDOW = 10 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'API key belum diatur di server.' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW);
  if (recent.length >= LIMIT) return res.status(429).json({ error: 'Terlalu banyak pertanyaan. Coba lagi beberapa menit lagi.' });
  recent.push(now); hits.set(ip, recent);

  const msgs = Array.isArray(req.body?.messages) ? req.body.messages.slice(-20) : [];
  const clean = msgs.filter(m => (m.role === 'user' || m.role === 'assistant') && m.content);
  if (!clean.length || clean[0].role !== 'user' || clean[clean.length - 1].role !== 'user')
    return res.status(400).json({ error: 'Format pesan tidak valid.' });

  try {
    const r = await fetch('https://api.gemini.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.GEMINI_API_KEY,
        'gemini-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.MODEL || 'gemini 3.6 flash',
        max_tokens: 1500,
        system: SYSTEM,
        messages: clean
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || 'Gagal menghubungi AI.' });
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: 'Kesalahan server.' });
  }
}
