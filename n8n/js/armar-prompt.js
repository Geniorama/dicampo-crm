// Arma el mensaje para el agente: hora de Bogotá, ficha del CRM, historial y
// el bloque de mensajes nuevos que el cliente escribió de corrido.
const ctx = $('CRM · Contexto').item.json.data;
const msg = $('Preparar entrante').item.json;
const lead = ctx.lead;

const partes = Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long',
  }).formatToParts(new Date()).map((p) => [p.type, p.value]),
);
const dias = { Monday: 'lunes', Tuesday: 'martes', Wednesday: 'miércoles', Thursday: 'jueves', Friday: 'viernes', Saturday: 'sábado', Sunday: 'domingo' };
const ahora = `${dias[partes.weekday] || partes.weekday} ${partes.year}-${partes.month}-${partes.day}, ${partes.hour}:${partes.minute} (America/Bogota, UTC-05:00)`;

const autores = { CLIENTE: 'Cliente', AGENTE_IA: 'David (tú)', ASESOR: 'Asesor' };
const texto = (m) => m.texto || (m.conArchivo ? '[archivo]' : '');
const pendientes = new Set(ctx.pendientes.map((m) => m.waMessageId));
const historial = ctx.mensajes
  .filter((m) => !pendientes.has(m.waMessageId))
  .map((m) => `${autores[m.autor] || m.autor}: ${texto(m)}`)
  .join('\n');
const nuevos = ctx.pendientes.map(texto).join('\n');

let ficha = 'No está registrado en el CRM (todavía no es lead).';
if (lead) {
  ficha = JSON.stringify({
    clientId: lead.cliente.id,
    codigo: lead.cliente.codigo,
    negocio: lead.cliente.nombreComercial || lead.cliente.razonSocial,
    tipo: lead.cliente.tipo,
    estado: lead.cliente.estado,
    contacto: lead.contacto ? lead.contacto.nombre : null,
    vendedor: lead.vendedor ? lead.vendedor.nombre : null,
    oportunidadAbierta: lead.oportunidadAbierta,
    ultimoPedido: lead.ultimoPedido,
    sedePrincipal: lead.sedePrincipal,
  }, null, 2);
}

const secciones = [
  `Fecha y hora: ${ahora}\nNombre en su perfil de WhatsApp: ${msg.nombrePerfil || 'desconocido'}`,
  `Ficha en el CRM:\n${ficha}`,
  ctx.estado.descartada
    ? `Ojo: antes se descartó por ${ctx.estado.descartada.motivo}. Si ahora califica, sigue el flujo normal.`
    : null,
  ctx.estado.resumen ? `Resumen previo: ${ctx.estado.resumen}` : null,
  `Conversación hasta ahora:\n${historial || '(es el primer contacto)'}`,
  `Mensajes nuevos del cliente (respóndelos juntos):\n${nuevos}`,
];
const prompt = secciones.filter(Boolean).join('\n\n');

return { json: { prompt, telefono: msg.telefono } };
