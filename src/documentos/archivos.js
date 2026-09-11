// Decodifica y valida un PDF que llega como base64 (o data URL) en el
// cuerpo de la petición. Sin subida multipart ni storage externo: el
// archivo entra como texto en el mismo POST y se guarda en la base
// (columna bytea de documentos_unidad).
const MAX_BYTES_DEFECTO = 5 * 1024 * 1024; // 5 MB por archivo

/**
 * @param {string} valor - base64 puro, o "data:application/pdf;base64,...."
 * @param {string} etiqueta - nombre del documento, para el mensaje de error
 * @returns {Buffer}
 */
function decodificarPdf(valor, etiqueta, maxBytes = MAX_BYTES_DEFECTO) {
  const limpio = String(valor || '').replace(/^data:application\/pdf;base64,/, '').trim();
  if (!limpio) {
    throw new Error(`Falta adjuntar el PDF de ${etiqueta}`);
  }
  let buf;
  try {
    buf = Buffer.from(limpio, 'base64');
  } catch {
    throw new Error(`El archivo de ${etiqueta} no se pudo leer`);
  }
  if (buf.length === 0 || buf.slice(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error(`El archivo de ${etiqueta} debe ser un PDF`);
  }
  if (buf.length > maxBytes) {
    throw new Error(`El PDF de ${etiqueta} pesa más de ${Math.round(maxBytes / 1024 / 1024)} MB`);
  }
  return buf;
}

module.exports = { decodificarPdf, MAX_BYTES_DEFECTO };
