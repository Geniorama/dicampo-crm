// Arma el cuerpo de POST /api/agente/conversaciones/mensajes para el entrante.
const msg = $('Desglosar evento').item.json;
const cuerpo = {
  telefono: msg.telefono,
  waMessageId: msg.waMessageId,
  direccion: 'ENTRANTE',
  tipo: msg.tipo,
  texto: msg.texto || undefined,
  fecha: msg.fecha,
};
if ($json.archivoOk === true && $json.ruta) {
  cuerpo.media = { ruta: $json.ruta, mime: msg.mime };
  if ($json.bytes) cuerpo.media.bytes = $json.bytes;
}
return { json: { ...msg, cuerpo } };
