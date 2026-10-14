// Convierte la salida del agente en uno o más mensajes de WhatsApp y arma la
// traza (herramientas y fuentes) que muestra la supervisión del CRM.
const r = $input.first().json;
const telefono = $('Armar prompt').first().json.telefono;

let texto = String(r.output || '').trim()
  .replace(/\*\*(.+?)\*\*/g, '*$1*')
  .replace(/^#{1,6}\s+/gm, '');
if (!texto) throw new Error('El agente no devolvió texto.');

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
