/**
 * Contrato que debe cumplir cualquier proveedor de emisión de la
 * GRE-Transportista de SUNAT, sin importar el mecanismo real detrás:
 * un PSE (Nubefact, EFACT, Bizlinks...), los webservices directos de
 * SUNAT, o un simulador de pruebas.
 *
 * El resto del sistema (ticketService, la API, la interfaz web) solo
 * conoce esta clase. Cambiar de proveedor es cambiar una línea en la
 * fábrica de abajo, no reescribir el flujo de tickets.
 *
 * @typedef {Object} DatosGRE
 * @property {string} ticketId              Correlativo interno del ticket
 * @property {string} placa
 * @property {string} configuracionVehicular  Ej. "T3S3", "C2"
 * @property {string} choferDni
 * @property {string} choferNombres
 * @property {string} choferLicencia
 * @property {string} origen
 * @property {string} destino
 * @property {string} mercancia
 * @property {number} pesoKg
 * @property {string} motivoTraslado
 *
 * @typedef {Object} ResultadoGRE
 * @property {'ACEPTADO'|'RECHAZADO'|'OBSERVADO'} estado
 * @property {string|null} serieCorrelativo  Ej. "T001-000160"
 * @property {string|null} hash              Hash o CDR de referencia
 * @property {string|null} motivoRechazo
 * @property {string} proveedor              Qué implementación respondió
 */

class EmisorGRE {
  /**
   * Emite la GRE-Transportista para un ticket de traslado.
   * @param {DatosGRE} datos
   * @returns {Promise<ResultadoGRE>}
   */
  async emitir(datos) {
    throw new Error('emitir() debe implementarse en la subclase');
  }

  /**
   * Consulta el estado de una guía ya emitida. No todos los proveedores
   * lo necesitan (algunos responden el estado final en el mismo emitir()).
   * @param {string} serieCorrelativo
   * @returns {Promise<ResultadoGRE>}
   */
  async consultarEstado(serieCorrelativo) {
    throw new Error('consultarEstado() no está implementado para este proveedor');
  }
}

module.exports = { EmisorGRE };
