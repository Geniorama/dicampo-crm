// Mocks de Meta Graph API (4020), Supabase Storage (4030) y OpenAI (4040).
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

// ── Modelo ───────────────────────────────────────────────────
function script(fullPrompt, results) {
  const n = results.length;
  const prompt = fullPrompt.split("Mensajes nuevos del cliente")[1] || fullPrompt;
  if (prompt.includes("FALLA")) return { error: true };
  if (prompt.includes("agendar visita prueba")) {
    const clientId = (fullPrompt.match(/"clientId": "([^"]+)"/) || [])[1];
    if (n === 0) return { tool: "consultar_disponibilidad", input: { clientId, desde: "" } };
    const avail = JSON.parse(results[0]);
    const inicio = avail.data?.dias?.find((d) => d.franjas.length)?.franjas[0]?.inicio;
    if (n === 1) return { tool: "agendar_visita", input: { clientId, fecha: inicio, direccion: "Calle 1 # 2-3", barrio: "", notas: "prueba" } };
    return { text: `Listo, quedó agendada para ${inicio}.` };
  }
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

// OpenAI Chat Completions: el primer mensaje "user" es el prompt; los
// resultados de herramientas llegan como mensajes "tool".
function sse(res, body, message, finish) {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const base = { id: "chatcmpl-1", object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: body.model };
  const send = (delta, finish_reason = null) => res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
  if (message.tool_calls) {
    send({ role: "assistant", content: null, tool_calls: message.tool_calls.map((t, index) => ({ index, ...t })) });
  } else {
    send({ role: "assistant", content: message.content });
  }
  send({}, finish);
  res.write("data: [DONE]\n\n");
  res.end();
}

http.createServer(async (req, res) => {
  const body = JSON.parse((await read(req)).toString() || "{}");
  const msgs = body.messages || [];
  const asText = (c) => (typeof c === "string" ? c : (c || []).map((x) => x.text || "").join(""));
  const system = asText(msgs.find((m) => m.role === "system")?.content);
  const prompt = asText(msgs.find((m) => m.role === "user")?.content);
  const results = msgs.filter((m) => m.role === "tool").map((m) => asText(m.content));
  const step = script(prompt, results);
  log({ srv: "llm", url: req.url, auth: req.headers.authorization, model: body.model, stream: !!body.stream, temperature: body.temperature, max_tokens: body.max_tokens ?? body.max_completion_tokens, tools: (body.tools || []).map((t) => t.function?.name), toolSchemas: results.length === 0 ? body.tools : undefined, system: results.length === 0 ? system.slice(0, 20000) : undefined, prompt: results.length === 0 ? prompt : undefined, results, step });
  if (step.error) { res.writeHead(500, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: { message: "mock caído", type: "server_error" } })); }
  const message = step.tool
    ? { role: "assistant", content: null, tool_calls: [{ id: `call_${results.length}`, type: "function", function: { name: step.tool, arguments: JSON.stringify(step.input) } }] }
    : { role: "assistant", content: step.text };
  const finish = step.tool ? "tool_calls" : "stop";
  if (body.stream) return sse(res, body, message, finish);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ id: "chatcmpl-1", object: "chat.completion", created: Math.floor(Date.now() / 1000), model: body.model, choices: [{ index: 0, message, finish_reason: finish }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }));
}).listen(4040);
console.log("mocks listos");
