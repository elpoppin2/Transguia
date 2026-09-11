const crypto = require('crypto');

/**
 * Guarda los tickets en memoria (se pierden al reiniciar). Mismo
 * contrato que ticketsRepoPostgres.js: crear, registrarResultadoGre,
 * obtenerPorId, listarPorEmpresa y actualizarEstado. Lo usan demo.js y
 * las pruebas rápidas que no quieren tocar la base real.
 *
 * En la base real un ticket vive en 3 tablas (tickets_traslado,
 * emisiones_gre, historial_estado_ticket); aquí lo tenemos aplanado en
 * un solo objeto, pero de puertas afuera se ve igual.
 */
class TicketsRepositorioMemoria {
  constructor() {
    this.tickets = new Map();
    this.correlativo = 1;
  }

  async crear({ empresaId, unidad, chofer, origen, destino, motivo, descripcionMercancia, pesoBrutoKg, proveedorGre, creadoPor }) {
    const id = crypto.randomUUID();
    const ahora = new Date().toISOString();
    const registro = {
      id,
      codigoInterno: `TCK-${String(this.correlativo).padStart(6, '0')}`,
      empresaId,
      unidadId: unidad.id,
      choferId: chofer.id,
      placa: unidad.placa,
      configuracionVehicular: unidad.configuracionVehicular,
      choferDni: chofer.dni,
      choferNombres: `${chofer.nombres} ${chofer.apellidos}`.trim(),
      origen,
      destino,
      motivo,
      descripcionMercancia,
      pesoBrutoKg: Number(pesoBrutoKg),
      estadoOperativo: 'GENERADO',
      estadoSunat: 'ENVIANDO',
      serieCorrelativoGre: null,
      motivoRechazo: null,
      fechaTraslado: null,
      fechaEntrega: null,
      creadoPor: creadoPor ?? null,
      creadoEn: ahora,
      _proveedorGre: proveedorGre,
      _historial: [{ estadoAnterior: null, estadoNuevo: 'GENERADO', usuarioId: creadoPor ?? null, creadoEn: ahora }]
    };
    this.correlativo += 1;
    this.tickets.set(id, registro);
    return vista(registro);
  }

  async registrarResultadoGre(ticketId, resultado) {
    const registro = this.tickets.get(ticketId);
    if (!registro) throw new Error(`El ticket ${ticketId} no existe`);
    registro.estadoSunat = resultado.estado;
    registro.serieCorrelativoGre = resultado.serieCorrelativo ?? null;
    registro.motivoRechazo = resultado.motivoRechazo ?? null;
    return vista(registro);
  }

  async obtenerPorId(id) {
    const registro = this.tickets.get(id);
    return registro ? vista(registro) : null;
  }

  async listarPorEmpresa(empresaId) {
    return Array.from(this.tickets.values())
      .filter((t) => t.empresaId === empresaId)
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
      .map(vista);
  }

  async actualizarEstado(id, nuevoEstado, usuarioId) {
    const registro = this.tickets.get(id);
    if (!registro) throw new Error(`El ticket ${id} no existe`);
    const anterior = registro.estadoOperativo;
    const ahora = new Date().toISOString();
    registro.estadoOperativo = nuevoEstado;
    if (nuevoEstado === 'EN_TRANSITO' && !registro.fechaTraslado) registro.fechaTraslado = ahora;
    if (nuevoEstado === 'ENTREGADO' && !registro.fechaEntrega) registro.fechaEntrega = ahora;
    registro._historial.push({ estadoAnterior: anterior, estadoNuevo: nuevoEstado, usuarioId: usuarioId ?? null, creadoEn: ahora });
    return vista(registro);
  }

  async listarHistorial(ticketId) {
    const registro = this.tickets.get(ticketId);
    if (!registro) return [];
    return registro._historial.map((h) => ({ ...h, usuarioNombre: null }));
  }
}

/** Devuelve solo los campos públicos (oculta los que empiezan con "_"). */
function vista(registro) {
  const publico = {};
  for (const [clave, valor] of Object.entries(registro)) {
    if (!clave.startsWith('_')) publico[clave] = valor;
  }
  return publico;
}

module.exports = { TicketsRepositorioMemoria };
