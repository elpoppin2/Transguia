const { EmisorGRE } = require('./EmisorGRE');

/**
 * Esqueleto de la integración DIRECTA con los webservices de SUNAT
 * (sin pasar por un PSE). Se deja intencionalmente sin terminar: hacerlo
 * bien requiere piezas que no se pueden improvisar ni probar sin tus
 * credenciales reales:
 *
 *  1. Ser emisor electrónico habilitado ante SUNAT (SEE - Sistema del
 *     contribuyente) y tener un certificado digital vigente.
 *  2. Construir el XML de la GRE-Transportista en formato UBL 2.1,
 *     siguiendo la estructura exacta del Manual del Programador de
 *     SUNAT (los catálogos y tags cambian con cada actualización).
 *  3. Firmar digitalmente el XML con tu certificado (XMLDSig).
 *  4. Enviarlo por SOAP al endpoint de SUNAT (primero en el ambiente
 *     beta, luego en producción) y procesar la respuesta: un ZIP con
 *     el CDR (Constancia de Recepción) que indica aceptado/rechazado.
 *
 * Recomendación: usa una librería especializada en facturación
 * electrónica peruana para los pasos 2 y 3 en vez de generar el XML a
 * mano; un solo tag mal formado hace que SUNAT rechace el documento.
 *
 * Este archivo solo deja marcada la forma que tomaría la clase para
 * que encaje en el mismo contrato EmisorGRE — no genera un XML válido
 * ni firma nada todavía.
 */
class EmisorGREDirectoSunat extends EmisorGRE {
  constructor({ certificadoPath, certificadoPassword, rucEmisor, ambiente = 'beta' } = {}) {
    super();
    if (!certificadoPath || !certificadoPassword || !rucEmisor) {
      throw new Error(
        'EmisorGREDirectoSunat requiere certificadoPath, certificadoPassword y rucEmisor'
      );
    }
    this.certificadoPath = certificadoPath;
    this.certificadoPassword = certificadoPassword;
    this.rucEmisor = rucEmisor;
    this.ambiente = ambiente;
  }

  async emitir(datos) {
    throw new Error(
      'EmisorGREDirectoSunat no está implementado: construir XML UBL 2.1, ' +
      'firmarlo con el certificado digital y enviarlo por SOAP a SUNAT ' +
      'requiere tus credenciales reales y pruebas en el ambiente beta. ' +
      'Usa EmisorGREPSE o EmisorGREDemo mientras tanto.'
    );
  }

  async consultarEstado(serieCorrelativo) {
    throw new Error('EmisorGREDirectoSunat no está implementado todavía.');
  }
}

module.exports = { EmisorGREDirectoSunat };
