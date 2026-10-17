// Convierte la salida del agente en uno o más mensajes de WhatsApp y arma la
// traza (herramientas y fuentes) que muestra la supervisión del CRM.
const r = $input.first().json;
const telefono = $('Armar prompt').first().json.telefono;

let texto = String(r.output || '').trim()
  .replace(/\*\*(.+?)\*\*/g, '*$1*')
  .replace(/^#{1,6}\s+/gm, '');
if (!texto) throw new Error('El agente no devolvió texto.');

// ── Reglas de estilo que el modelo a veces se salta ─────────────────────
// 1) Una sola pregunta por respuesta: se corta después del primer "?".
// 2) El nombre del cliente solo una vez en la conversación: si David ya lo
//    usó antes, se quita del vocativo ("Gracias, Angel." → "Gracias.").
const ctx = $('CRM · Contexto').first().json.data;
const perfil = $('Preparar entrante').first().json.nombrePerfil;
const nombres = [ctx.lead && ctx.lead.contacto && ctx.lead.contacto.nombre, perfil]
  .filter(Boolean)
  .map((n) => String(n).trim().split(/\s+/)[0])
  .filter((n) => n.length >= 3);
const previos = ctx.mensajes.filter((m) => m.autor === 'AGENTE_IA').map((m) => m.texto || '').join('\n');
texto = limitarPreguntas(texto);
for (const nombre of [...new Set(nombres)]) {
  const yaLoUso = new RegExp(`\\b${escapar(nombre)}\\b`, 'i').test(previos);
  if (yaLoUso) texto = quitarNombre(texto, nombre);
}

function escapar(t) {
  return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function limitarPreguntas(t) {
  const primera = t.indexOf('?');
  if (primera === -1 || t.indexOf('?', primera + 1) === -1) return t;
  return t.slice(0, primera + 1).replace(/\n\s*---+\s*$/, '').trim();
}

function quitarNombre(t, nombre) {
  const n = escapar(nombre);
  return t
    // "Gracias, Angel." / "Perfecto, Angel Burgos," → "Gracias." / "Perfecto,"
    .replace(new RegExp(`,\\s*${n}(\\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?(?=[\\s.,!?¡¿])`, 'g'), '')
    // "Angel, ¿..." al inicio de una frase
    .replace(new RegExp(`(^|[.!?¡¿]\\s+|\\n)${n},\\s*`, 'g'), '$1')
    // "... gracias Angel." / "... para ti Angel?"
    .replace(new RegExp(`\\s+${n}(?=[.!?])`, 'g'), '')
    .replace(/(^|[.!?]\s+|\n)([¡¿]?)([a-záéíóúñ])/g, (m, a, b, c) => a + b + c.toUpperCase())
    .replace(/ {2,}/g, ' ')
    .trim();
}

const pasos = r.intermediateSteps || [];
const herramientas = [...new Set(pasos.map((p) => p.action && p.action.tool).filter(Boolean))];
const fuentes = [];
for (const p of pasos) {
  if (!p.action || p.action.tool !== 'buscar_conocimiento') continue;
  try {
    let obs = typeof p.observation === 'string' ? JSON.parse(p.observation) : p.observation;
    if (Array.isArray(obs)) obs = obs[0];
    if (obs && typeof obs.response === 'string') obs = JSON.parse(obs.response);
    const filas = (obs && obs.data && obs.data.resultados) || [];
    for (const f of filas) {
      fuentes.push({ titulo: [f.titulo, f.seccion].filter(Boolean).join(' · ') || f.fuente, similitud: f.similitud });
    }
  } catch (e) {
    // Una observación que no es JSON no impide responder.
  }
}

// "---" en una línea separa mensajes; WhatsApp admite 4.096 caracteres.
const LIMITE = 4096;
const mensajes = [];
for (const parte of texto.split(/\n\s*---+\s*\n/)) {
  let resto = parte.trim();
  while (resto.length > LIMITE) {
    let corte = resto.lastIndexOf('\n', LIMITE);
    if (corte < LIMITE / 2) corte = resto.lastIndexOf(' ', LIMITE);
    if (corte < LIMITE / 2) corte = LIMITE;
    mensajes.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) mensajes.push(resto);
}

return mensajes.map((t, i) => ({
  json: { telefono, texto: t, traza: i === 0 ? { herramientas, fuentes } : {} },
}));
