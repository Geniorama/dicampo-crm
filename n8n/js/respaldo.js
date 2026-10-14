// El agente falló (modelo caído, tiempo agotado, salida vacía): el cliente
// recibe un mensaje de respaldo y la conversación pasa a un asesor.
const telefono = $('Armar prompt').first().json.telefono;
const e = $input.first().json;
const detalle = String((e.error && (e.error.message || e.error)) || e.message || 'Error sin detalle').slice(0, 4000);
return [{
  json: {
    telefono,
    texto: 'Disculpa, se me presentó un inconveniente. Ya le aviso a un asesor de Dicampo para que te escriba en breve.',
    detalle: `El agente IA no pudo responder: ${detalle}`,
  },
}];
