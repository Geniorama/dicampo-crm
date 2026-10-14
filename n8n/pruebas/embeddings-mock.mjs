import http from "node:http";
import crypto from "node:crypto";
export function vec(text) {
  const v = new Array(1536).fill(0);
  const words = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]+/g) ?? [];
  for (const w of words) { const h = crypto.createHash("md5").update(w).digest(); v[h.readUInt16BE(0) % 1536] += 1; }
  const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / n);
}
if (process.argv[2] === "serve") {
  http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.headers.authorization !== "Bearer sk-test") { res.writeHead(401); return res.end("{}"); }
      const { input } = JSON.parse(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ embedding: vec(input) }] }));
    });
  }).listen(4010, () => console.log("mock 4010"));
}
