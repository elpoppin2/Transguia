/**
 * Orquesta el ciclo de vida de un ticket de traslado. No sabe:
 *   - si la GRE se emite vía PSE, directo con SUNAT o un simulador
 *     (solo conoce el contrato EmisorGRE), ni
 *   - si los datos se guardan en memoria o en Postgres
 *     (solo conoce los repositorios que recibe por constructor).
 *
 * Un ticket referencia una unidad y un chofer YA registrados (por id),
 * no se escriben placa/DNI sueltos: por eso el servicio recibe también
 * los repositorios de unidades y choferes, para validar que existan y
 * pertenezcan a la empresa antes de crear el ticket.
 */
const { MERCANCIAS, normalizarMercancia } = require('./mercancias');

const MOTIVOS_VALIDOS = ['VENTA', 'TRASLADO_ENTRE_ESTABLECIMIENTOS', 'OTROS'];
const ESTADOS_OPERATIVOS = ['GENERADO', 'EN_TRANSITO', 'ENTREGADO', 'ANULADO'];

class TicketService {
  /**
   * @param {object} deps
   * @param {import('../gre/EmisorGRE').EmisorGRE} deps.emisorGRE
   * @param {object} deps.repositorioTickets
   * @param {object} deps.repositorioUnidades
   * @param {object} deps.repositorioChoferes
   * @param {object} [deps.repositorioDocumentos] - opcional; si está, la GRE incluye el nº de licencia vigente del chofer
   * @param {string} [deps.proveedorGre] - "demo" | "pse" | "directo" (default: GRE_PROVIDER del .env)
   * @param {boolean} [deps.emisionSincrona] - si true, espera el resultado de la GRE antes de devolver el ticket
   *        (necesario en entornos serverless que apagan el proceso al responder, p. ej. Vercel).
   */
  constructor({ emisorGRE, repositorioTickets, repositorioUnidades, repositorioChoferes, repositorioDocumentos, proveedorGre, emisionSincrona } = {}) {
    if (!emisorGRE || !repositorioTickets || !repositorioUnidades || !repositorioChoferes) {
      throw new Error(
        'TicketService requiere emisorGRE, repositorioTickets, repositorioUnidades y repositorioChoferes'
      );
    }
    this.emisorGRE = emisorGRE;
    this.repo = repositorioTickets;
    this.unidades = repositorioUnidades;
    this.choferes = repositorioChoferes;
    this.documentos = repositorioDocumentos || null;
    this.proveedorGre = proveedorGre || process.env.GRE_PROVIDER || 'demo';
    this.emisionSincrona = !!emisionSincrona;
  }

  /**
   * Crea el ticket en estado GENERADO y emite la GRE.
   *
   * - Modo normal: la emisión corre en segundo plano; devuelve el ticket
   *   con estadoSunat 'ENVIANDO'. Se sigue con obtenerTicket(id) o onCambio.
   * - Modo `emisionSincrona`: espera el resultado de la GRE y devuelve el
   *   ticket ya con su estado final.
   *
   * @param {object} datos - { empresaId, unidadId, choferId, origen, destino, motivo?, descripcionMercancia, pesoBrutoKg, creadoPor? }
   * @param {(ticket: object) => void} [onCambio]
   */
  async crearTicket(datos, onCambio) {
    const limpio = validarDatosTraslado(datos);
    const creadoPor = datos && datos.creadoPor ? String(datos.creadoPor) : null;

    const unidad = await this.unidades.buscarPorId(limpio.unidadId);
    if (!unidad || unidad.empresaId !== limpio.empresaId) {
      throw new Error('La unidad indicada no existe o no pertenece a esta empresa');
    }
    if (unidad.activo === false) {
      throw new Error('La unidad indicada está inactiva; reactívala antes de usarla');
    }

    const chofer = await this.choferes.buscarPorId(limpio.choferId);
    if (!chofer || chofer.empresaId !== limpio.empresaId) {
      throw new Error('El chofer indicado no existe o no pertenece a esta empresa');
    }
    if (chofer.activo === false) {
      throw new Error('El chofer indicado está inactivo; reactívalo antes de usarlo');
    }

    const ticket = await this.repo.crear({
      empresaId: limpio.empresaId,
      unidad,
      chofer,
      origen: limpio.origen,
      destino: limpio.destino,
      motivo: limpio.motivo,
      descripcionMercancia: limpio.descripcionMercancia,
      pesoBrutoKg: limpio.pesoBrutoKg,
      proveedorGre: this.proveedorGre,
      creadoPor
    });

    // Nº de licencia de conducir vigente del chofer, si tenemos el módulo
    // de documentos conectado (si no, va null y el emisor lo maneja).
    let choferLicencia = null;
    if (this.documentos) {
      try {
        const lic = await this.documentos.licenciaVigenteDeChofer(chofer.id);
        choferLicencia = lic ? lic.numeroDocumento : null;
      } catch (_) { /* no bloquear la emisión por esto */ }
    }

    const datosGre = {
      ticketId: ticket.id,
      placa: unidad.placa,
      configuracionVehicular: unidad.configuracionVehicular,
      choferDni: chofer.dni,
      choferNombres: `${chofer.nombres} ${chofer.apellidos}`.trim(),
      choferLicencia,
      origen: ticket.origen,
      destino: ticket.destino,
      mercancia: ticket.descripcionMercancia,
      pesoKg: Number(ticket.pesoBrutoKg),
      motivoTraslado: ticket.motivo
    };

    // Emite la GRE y guarda el resultado en emisiones_gre. Devuelve el
    // ticket ya actualizado (o el mismo ticket si algo raro pasó).
    const emitirYGuardar = () =>
      this.emisorGRE
        .emitir(datosGre)
        .catch((error) => ({
          estado: 'RECHAZADO',
          serieCorrelativo: null,
          hash: null,
          motivoRechazo: `Error del proveedor: ${error.message}`,
          proveedor: this.proveedorGre
        }))
        .then((resultado) => this.repo.registrarResultadoGre(ticket.id, resultado))
        .then((actualizado) => {
          if (actualizado && onCambio) onCambio(actualizado);
          return actualizado || ticket;
        });

    if (this.emisionSincrona) {
      return emitirYGuardar();
    }

    // Modo normal: en segundo plano. El ticket ya existe aunque SUNAT /
    // el PSE todavía no responda.
    emitirYGuardar().catch((error) => {
      console.error(`[ticket ${ticket.id}] no se pudo registrar el resultado de la GRE:`, error.message);
    });
    return ticket;
  }

  async obtenerTicket(id) {
    return this.repo.obtenerPorId(id);
  }

  async listarTickets(empresaId) {
    if (!empresaId) throw new Error('empresaId es obligatorio');
    return this.repo.listarPorEmpresa(empresaId);
  }

  /**
   * Cambia el estado operativo del ticket (GENERADO → EN_TRANSITO →
   * ENTREGADO, o ANULADO). Solo se puede avanzar si la GRE fue ACEPTADA;
   * ANULADO se permite siempre.
   */
  async avanzarEstado(id, nuevoEstado, usuarioId = null) {
    const estado = String(nuevoEstado || '').toUpperCase().trim();
    if (!ESTADOS_OPERATIVOS.includes(estado)) {
      throw new Error(`Estado operativo inválido. Debe ser uno de: ${ESTADOS_OPERATIVOS.join(', ')}`);
    }

    const ticket = await this.repo.obtenerPorId(id);
    if (!ticket) throw new Error(`El ticket ${id} no existe`);

    if (ticket.estadoOperativo === 'ANULADO') {
      throw new Error('El ticket está anulado; no admite más cambios de estado');
    }
    if (estado !== 'ANULADO' && ticket.estadoSunat !== 'ACEPTADO') {
      throw new Error('Solo se puede avanzar un ticket cuya GRE fue aceptada por SUNAT');
    }
    if (ticket.estadoOperativo === estado) {
      return ticket;
    }

    return this.repo.actualizarEstado(id, estado, usuarioId);
  }
}

function validarDatosTraslado(d) {
  if (!d || typeof d !== 'object') {
    throw new Error('Faltan los datos del traslado');
  }
  const requeridos = ['empresaId', 'unidadId', 'choferId', 'origen', 'destino', 'descripcionMercancia', 'pesoBrutoKg'];
  const faltantes = requeridos.filter(
    (campo) => d[campo] === undefined || d[campo] === null || String(d[campo]).trim() === ''
  );
  if (faltantes.length) {
    throw new Error(`Faltan campos obligatorios: ${faltantes.join(', ')}`);
  }

  const peso = Number(d.pesoBrutoKg);
  if (!Number.isFinite(peso) || peso <= 0) {
    throw new Error('pesoBrutoKg debe ser un número mayor a 0');
  }

  // La mercancía debe ser una del catálogo fijo (ver src/tickets/mercancias.js).
  const mercancia = normalizarMercancia(d.descripcionMercancia);
  if (!mercancia) {
    throw new Error(
      `descripcionMercancia debe ser una del catálogo: ${MERCANCIAS.join(', ')}`
    );
  }

  return {
    empresaId: String(d.empresaId).trim(),
    unidadId: String(d.unidadId).trim(),
    choferId: String(d.choferId).trim(),
    origen: String(d.origen).trim(),
    destino: String(d.destino).trim(),
    descripcionMercancia: mercancia,
    pesoBrutoKg: peso,
    motivo: normalizarMotivo(d.motivo)
  };
}

/**
 * El motivo llega como texto libre ("Venta", "Traslado entre
 * establecimientos"...). La tabla usa una lista fija. Traducimos lo
 * conocido y mandamos OTROS si no reconocemos el texto.
 */
function normalizarMotivo(motivo) {
  if (motivo === undefined || motivo === null || String(motivo).trim() === '') {
    return 'VENTA'; // mismo default que la columna en la base
  }
  const limpio = quitarTildes(String(motivo).toUpperCase())
    .replace(/\s+/g, '_')
    .trim();

  if (MOTIVOS_VALIDOS.includes(limpio)) return limpio;
  if (limpio.includes('VENTA')) return 'VENTA';
  if (limpio.includes('ESTABLECIMIENTO')) return 'TRASLADO_ENTRE_ESTABLECIMIENTOS';
  return 'OTROS';
}

/** Quita las tildes/acentos (á→A, ñ→N) para comparar sin sorpresas. */
function quitarTildes(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

module.exports = { TicketService, MOTIVOS_VALIDOS, ESTADOS_OPERATIVOS, MERCANCIAS };
