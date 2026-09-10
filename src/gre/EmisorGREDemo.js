const { EmisorGRE } = require('./EmisorGRE');

/**
 * Implementación de demostración. No llama a ningún servicio externo:
 * simula la demora de red y devuelve ACEPTADO u RECHAZADO con una
 * probabilidad configurable. Es la implementación por defecto para que
 * el resto del sistema se pueda probar sin certificado digital ni
 * contrato con un PSE.
 */
class EmisorGREDemo extends EmisorGRE {
  constructor({ serie = 'T001', correlativoInicial = 1, probabilidadRechazo = 0.12, demoraMs = 1200 } = {}) {
    super();
    this.serie = serie;
    this.correlativo = correlativoInicial;
    this.probabilidadRechazo = probabilidadRechazo;
    this.demoraMs = demoraMs;
  }

  async emitir(datos) {
    await esperar(this.demoraMs);

    if (Math.random() < this.probabilidadRechazo) {
      return {
        estado: 'RECHAZADO',
        serieCorrelativo: null,
        hash: null,
        motivoRechazo: 'Simulado: la configuración vehicular declarada no admite el peso indicado.',
        proveedor: 'demo'
      };
    }

    const serieCorrelativo = `${this.serie}-${String(this.correlativo).padStart(6, '0')}`;
    this.correlativo += 1;

    return {
      estado: 'ACEPTADO',
      serieCorrelativo,
      hash: hashSimulado(datos.ticketId + serieCorrelativo),
      motivoRechazo: null,
      proveedor: 'demo'
    };
  }

  async consultarEstado(serieCorrelativo) {
    await esperar(200);
    return {
      estado: 'ACEPTADO',
      serieCorrelativo,
      hash: hashSimulado(serieCorrelativo),
      motivoRechazo: null,
      proveedor: 'demo'
    };
  }
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashSimulado(semilla) {
  let h = 0;
  for (const c of String(semilla)) {
    h = (h * 31 + c.charCodeAt(0)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

module.exports = { EmisorGREDemo };
