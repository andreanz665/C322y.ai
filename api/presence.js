const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ACTIVE = 45000;

async function redis(cmds) {
  const r = await fetch(`${URL_}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds.map(c => c.map(String)))
  });
  if (!r.ok) throw new Error("redis " + r.status);
  return (await r.json()).map(x => x.result);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOKEN) return res.status(503).json({ error: "Database belum terhubung." });
  const now = Date.now();
  try {
    if (req.method === "POST") {
      const { id, sent } = req.body || {};
      if (typeof id !== "string" || !/^[a-z0-9]{4,20}$/.test(id)) return res.status(400).json({ error: "ID tidak valid." });
      let city = "";
      try { city = decodeURIComponent(req.headers["x-vercel-ip-city"] || ""); } catch (e) {}
      const meta = JSON.stringify({
        city, country: req.headers["x-vercel-ip-country"] || "",
        device: /Mobi|Android|iPhone|iPad/i.test(req.headers["user-agent"] || "") ? "HP" : "Komputer"
      });
      const cmds = [["ZADD", "seen", now, id], ["HSET", "meta", id, meta], ["HSETNX", "first", id, now]];
      if (sent) cmds.push(["HINCRBY", "msgs", id, 1]);
      cmds.push(["ZREMRANGEBYSCORE", "seen", 0, now - 86400000], ["ZCOUNT", "seen", now - ACTIVE, "+inf"]);
      const out = await redis(cmds);
      return res.status(200).json({ count: out[out.length - 1] });
    }
    if (req.method === "GET") {
      const adminKey = process.env.ADMIN_KEY;
      if (!adminKey || req.headers["x-admin-key"] !== adminKey) return res.status(401).json({ error: "Kunci admin salah." });
      const [flat] = await redis([["ZRANGEBYSCORE", "seen", now - 1800000, "+inf", "WITHSCORES"]]);
      const ids = [], seen = [];
      for (let i = 0; i < flat.length; i += 2) { ids.push(flat[i]); seen.push(Number(flat[i + 1])); }
      let users = [];
      if (ids.length) {
        const [meta, first, msgs] = await redis([["HMGET", "meta", ...ids], ["HMGET", "first", ...ids], ["HMGET", "msgs", ...ids]]);
        users = ids.map((id, i) => {
          let m = {}; try { m = JSON.parse(meta[i] || "{}"); } catch (e) {}
          return { id, ...m, first: Number(first[i]) || null, last: seen[i], msgs: Number(msgs[i]) || 0, active: now - seen[i] < ACTIVE };
        }).sort((a, b) => b.last - a.last);
      }
      return res.status(200).json({ now, active: users.filter(u => u.active).length, users });
    }
    res.status(405).json({ error: "Metode tidak diizinkan." });
  } catch (e) {
    res.status(500).json({ error: "Gagal membaca data." });
  }
};
