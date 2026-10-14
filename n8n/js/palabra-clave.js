// Confirma la baja o la solicitud de supresión de datos (política de Dicampo).
const respuesta = $json.data;
const telefono = $('Preparar entrante').item.json.telefono;
const textos = {
  BAJA: 'Listo, no te enviaremos más mensajes comerciales. Si más adelante quieres retomar, aquí estamos.',
  ELIMINAR_DATOS:
    'Recibimos tu solicitud para eliminar tus datos. La atendemos en un plazo máximo de 10 días hábiles y te confirmaremos por este medio.',
};
return { json: { telefono, texto: textos[respuesta.palabraClave] || textos.BAJA } };
