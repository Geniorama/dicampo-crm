// Convierte el webhook de Meta en un ítem por mensaje y uno por estado de entrega.
// Solo procesa eventos del número configurado en Config.phoneNumberId.
const cfg = $('Config').first().json;
const body = cfg.body || {};

// Tipos que el CRM guarda como archivo (ver MEDIA_LIMITS del CRM).
const MIME_PERMITIDOS = [
  'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr',
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
];
const baseMime = (mime) => String(mime || '').split(';')[0].trim().toLowerCase();

function normalizar(m, nombres) {
  const base = {
    evento: 'mensaje',
    telefono: m.from,
    waMessageId: m.id,
    fecha: new Date(Number(m.timestamp) * 1000).toISOString(),
    nombrePerfil: nombres[m.from] || null,
    tipo: 'TEXTO',
    texto: null,
    mediaId: null,
    mime: null,
  };
  const archivo = (tipo, media, texto) => {
    const mime = baseMime(media && media.mime_type);
    const guardable = media && media.id && MIME_PERMITIDOS.includes(mime);
    return { ...base, tipo, texto, mediaId: guardable ? media.id : null, mime: guardable ? mime : null };
  };

  switch (m.type) {
    case 'text':
      return { ...base, texto: m.text.body };
    case 'button':
      return { ...base, tipo: 'INTERACTIVO', texto: m.button.text };
    case 'interactive': {
      const r = m.interactive || {};
      const titulo = (r.button_reply && r.button_reply.title) || (r.list_reply && r.list_reply.title) || '[Respuesta interactiva]';
      return { ...base, tipo: 'INTERACTIVO', texto: titulo };
    }
    case 'image':
      return archivo('IMAGEN', m.image, m.image.caption || '[Imagen]');
    case 'sticker':
      return archivo('IMAGEN', m.sticker, '[Sticker]');
    case 'audio':
      return archivo('AUDIO', m.audio, '[Nota de voz]');
    case 'document': {
      const nombre = m.document.filename ? `[Documento: ${m.document.filename}]` : '[Documento]';
      return archivo('DOCUMENTO', m.document, m.document.caption ? `${nombre} ${m.document.caption}` : nombre);
    }
    case 'video':
      return { ...base, texto: m.video && m.video.caption ? `[Video] ${m.video.caption}` : '[Video]' };
    case 'location': {
      const l = m.location || {};
      const lugar = [l.name, l.address].filter(Boolean).join(', ');
      return { ...base, texto: `[Ubicación: ${l.latitude}, ${l.longitude}${lugar ? ` · ${lugar}` : ''}]` };
    }
    case 'contacts':
      return { ...base, texto: '[Compartió un contacto]' };
    default:
      // reaction, unsupported, system…: no ameritan respuesta.
      return null;
  }
}

const salida = [];
for (const entry of body.entry || []) {
  for (const change of entry.changes || []) {
    const v = change.value || {};
    const numero = v.metadata && String(v.metadata.phone_number_id);
    if (cfg.phoneNumberId && numero && numero !== String(cfg.phoneNumberId)) continue;

    const nombres = {};
    for (const c of v.contacts || []) nombres[c.wa_id] = (c.profile && c.profile.name) || null;

    for (const m of v.messages || []) {
      const item = normalizar(m, nombres);
      if (item) salida.push({ json: item });
    }
    for (const s of v.statuses || []) {
      if (['sent', 'delivered', 'read', 'failed'].includes(s.status)) {
        salida.push({ json: { evento: 'estado', waMessageId: s.id, estado: s.status } });
      }
    }
  }
}
return salida;
