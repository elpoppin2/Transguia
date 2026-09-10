const { EmisorGRE } = require('./EmisorGRE');

/**
 * Integración con un PSE (Proveedor de Servicios Electrónicos) homologado
 * por SUNAT — por ejemplo Nubefact, EFACT o Bizlinks.
 *
 * Cada PSE define su propio contrato de API (rutas, nombres de campo,
 * forma de autenticarse). Este archivo muestra la forma general de una
 * integración REST; los bloques marcados con TODO son los que debes
 * reemplazar siguiendo el manual técnico de tu proveedor específico.
 * No está pensado para funcionar contra un endpoint real "tal cual".
 */
class EmisorGREPSE extends EmisorGRE {
  constructor({ baseUrl, apiToken, rucEmisor, fetchImpl = fetch } = {}) {
    super();
    if (!baseUrl || !apiToken || !rucEmisor) {
      throw new Error(
        'EmisorGREPSE requiere baseUrl, apiToken y rucEmisor (defínelos en tu .env)'
      );
    }
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiToken = apiToken;
    this.rucEmisor = rucEmisor;
    this.fetch = fetchImpl;
  }

  async emitir(datos) {
    // TODO: reemplaza la ruta y el cuerpo del payload por los que indique
    // la documentación de tu PSE — cada uno define su propio formato.
    const payload = {
      ruc_emisor: this.rucEmisor,
      tipo_documento: 'GRE_TRANSPORTISTA',
      referencia_interna: datos.ticketId,
      vehiculo: {
        placa: datos.placa,
        configuracion_vehicular: datos.configuracionVehicular
      },
      conductor: {
        dni: datos.choferDni,
        nombres: datos.choferNombres,
        licencia: datos.choferLicencia
      },
      traslado: {
        origen: datos.origen,
        destino: datos.destino,
        motivo: datos.motivoTraslado,
        peso_bruto_kg: datos.pesoKg,
        descripcion_mercancia: datos.mercancia
      }
    };

    const respuesta = await this.fetch(`${this.baseUrl}/guias-remision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiToken}`
      },
      body: JSON.stringify(payload)
    });

    if (!respuesta.ok) {
      const texto = await respuesta.text().catch(() => '');
      throw new Error(`El PSE respondió ${respuesta.status}: ${texto}`);
    }

    const data = await respuesta.json();

    // TODO: ajusta estos nombres de campo a la respuesta real de tu PSE.
    return {
      estado: mapEstado(data.estado),
      serieCorrelativo: data.serie_correlativo ?? null,
      hash: data.hash ?? null,
      motivoRechazo: data.motivo ?? null,
      proveedor: 'pse'
    };
  }

  async consultarEstado(serieCorrelativo) {
    const respuesta = await this.fetch(
      `${this.baseUrl}/guias-remision/${encodeURIComponent(serieCorrelativo)}`,
      { headers: { Authorization: `Bearer ${this.apiToken}` } }
    );
    if (!respuesta.ok) {
      throw new Error(`No se pudo consultar el estado (${respuesta.status})`);
    }
    const data = await respuesta.json();
    return {
      estado: mapEstado(data.estado),
      serieCorrelativo,
      hash: data.hash ?? null,
      motivoRechazo: data.motivo ?? null,
      proveedor: 'pse'
    };
  }
}

function mapEstado(estadoProveedor) {
  if (estadoProveedor === 'ACEPTADO') return 'ACEPTADO';
  if (estadoProveedor === 'RECHAZADO') return 'RECHAZADO';
  return 'OBSERVADO';
}

module.exports = { EmisorGREPSE };
