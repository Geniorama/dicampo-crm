// Mocks de Meta Graph API (4020), Supabase Storage (4030) y Anthropic (4040).
import http from "node:http";
import fs from "node:fs";
const LOG = process.env.MOCK_LOG || "/tmp/mocks.jsonl";
const log = (o) => fs.appendFileSync(LOG, JSON.stringify({ t: Date.now(), ...o }) + "\n");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const read = (req) => new Promise((r) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => r(Buffer.concat(c))); });
let out = 0;

http.createServer(async (req, res) => {
  const body = await read(req);
  const auth = req.headers.authorization;
  if (req.method === "POST" && /\/messages$/.test(req.url)) {
    const j = JSON.parse(body.toString());
    log({ srv: "meta", kind: "send", url: req.url, auth, to: j.to, body: j.text?.body });
    if (j.to === "573000000999") { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: { message: "bad number" } })); }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ messaging_product: "whatsapp", contacts: [{ wa_id: j.to }], messages: [{ id: `wamid.OUT.${Date.now()}.${++out}` }] }));
  }
  if (req.method === "GET" && req.url.startsWith("/v23.0/MEDIA")) {
    log({ srv: "meta", kind: "media-info", url: req.url, auth });
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ url: "http://localhost:4020/download/x.png", mime_type: "image/png", file_size: PNG.length, id: "MEDIA1" }));
  }
  if (req.method === "GET" && req.url.startsWith("/download/")) {
    log({ srv: "meta", kind: "download", auth });
    res.writeHead(200, { "Content-Type": "image/png" });
    return res.end(PNG);
  }
  res.writeHead(404); res.end("{}");
}).listen(4020);

http.createServer(async (req, res) => {
  const body = await read(req);
  const m = req.url.match(/^\/storage\/v1\/object\/upload\/sign\/(.+)$/);
  if (req.method === "POST" && m) {
    log({ srv: "storage", kind: "sign-upload", path: m[1] });
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ url: `/object/upload/sign/${m[1]}?token=tok123` }));
  }
  if (req.method === "PUT" && req.url.startsWith("/storage/v1/object/upload/sign/")) {
    log({ srv: "storage", kind: "put", url: req.url, bytes: body.length, ctype: req.headers["content-type"], upsert: req.headers["x-upsert"] });
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ Key: req.url }));
  }
  if (req.method === "POST" && req.url.startsWith("/storage/v1/object/sign/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ signedURL: "/object/sign/x?token=r" }));
  }
  res.writeHead(404); res.end("{}");
}).listen(4030);

// ── Anthropic ────────────────────────────────────────────────
function script(fullPrompt, results) {
  const n = results.length;
  const prompt = fullPrompt.split("Mensajes nuevos del cliente")[1] || fullPrompt;
  if (prompt.includes("FALLA")) return { error: true };
  if (prompt.includes("Chapinero")) {
    if (n === 0) return { tool: "registrar_lead", input: { nombreContacto: "María Prueba", negocio: "ZZVERIF Restaurante María", tipo: "RESTAURANTE" } };
    const lead = JSON.parse(results[0]);
    const data = lead.data ?? JSON.parse(lead.response ?? "{}").data ?? lead[0]?.data;
    const clientId = data?.cliente?.id;
    if (n === 1) return { tool: "buscar_conocimiento", input: { consulta: "pedido mínimo" } };
    if (n === 2) return { tool: "registrar_interes", input: { oportunidad: { clientId, interes: [{ sku: "MAN-K", kilosMes: 16 }], notas: "Mango para jugos" } } };
    return { text: `¡Qué bien, María! Con nuestra pulpa sacas **8 jugos exactos** por kilo.\n---\n¿Qué día te funciona para que pase nuestro asesor? [clientId=${clientId}]` };
  }
  return { text: "¡Hola! Con mucho gusto te atiendo. Soy David de Dicampo. ¿Con quién tengo el gusto?" };
}

function sse(res, msg) {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  ev("message_start", { message: { ...msg, content: [], stop_reason: null } });
  msg.content.forEach((block, index) => {
    if (block.type === "text") {
      ev("content_block_start", { index, content_block: { type: "text", text: "" } });
      ev("content_block_delta", { index, delta: { type: "text_delta", text: block.text } });
    } else {
      ev("content_block_start", { index, content_block: { ...block, input: {} } });
      ev("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
    }
    ev("content_block_stop", { index });
  });
  ev("message_delta", { delta: { stop_reason: msg.stop_reason }, usage: { output_tokens: 10 } });
  ev("message_stop", {});
  res.end();
}

http.createServer(async (req, res) => {
  const body = JSON.parse((await read(req)).toString() || "{}");
  const msgs = body.messages || [];
  const first = msgs[0];
  const prompt = typeof first?.content === "string" ? first.content : (first?.content || []).map((c) => c.text || "").join("");
  const results = [];
  for (const m of msgs) for (const c of Array.isArray(m.content) ? m.content : []) if (c.type === "tool_result") {
    results.push(typeof c.content === "string" ? c.content : (c.content || []).map((x) => x.text).join(""));
  }
  const step = script(prompt, results);
  log({ srv: "anthropic", model: body.model, stream: !!body.stream, temperature: body.temperature, top_p: body.top_p, tools: (body.tools || []).map((t) => t.name), toolSchemas: results.length === 0 ? body.tools : undefined, system: results.length === 0 ? String(typeof body.system === "string" ? body.system : JSON.stringify(body.system)).slice(0, 20000) : undefined, prompt: results.length === 0 ? prompt : undefined, results, step });
  if (step.error) { res.writeHead(500, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "mock caído" } })); }
  const content = step.tool
    ? [{ type: "tool_use", id: `toolu_${results.length}`, name: step.tool, input: step.input }]
    : [{ type: "text", text: step.text }];
  const msg = { id: "msg_1", type: "message", role: "assistant", model: body.model, content, stop_reason: step.tool ? "tool_use" : "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } };
  if (body.stream) return sse(res, msg);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(msg));
}).listen(4040);
console.log("mocks listos");
