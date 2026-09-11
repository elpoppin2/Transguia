/**
 * Programación de viajes: agendar de antemano qué unidad y qué chofer van
 * a qué ruta un día dado. Es un paso previo y opcional al ticket real; no
 * lo reemplaza ni lo crea automáticamente. La única regla de negocio
 * fuerte es no dejar programar dos veces la misma unidad o el mismo
 * chofer el mismo día.
 */
const { CENTROS_ORIGEN, DESTINOS, MERCANCIAS, normalizarContra } = require('../tickets/catalogos');

const ESTADOS = ['PROGRAMADO', 'CUMPLIDO', 'CANCELADO'];

class ViajesProgramadosService {
  constructor({ repositorioViajesProgramados, repositorioUnidades, repositorioChoferes } = {}) {
    if (!repositorioViajesProgramados || !repositorioUnidades || !repositorioChoferes) {
      throw new Error(
        'ViajesProgramadosService requiere repositorioViajesProgramados, repositorioUnidades y repositorioChoferes'
      );
    }
    this.repo = repositorioViajesProgramados;
    this.unidades = repositorioUnidades;
    this.choferes = repositorioChoferes;
  }

  async listar(empresaId) {
    if (!empresaId) throw new Error('empresaId es obligatorio');
    return this.repo.listarPorEmpresa(empresaId);
  }

  async programar(datos) {
    const limpio = await this._validar(datos);
    const conflicto = await this.repo.buscarConflicto(
      limpio.empresaId, limpio.unidadId, limpio.choferId, limpio.fechaProgramada
    );
    if (conflicto) {
      const cual = conflicto.unidadId === limpio.unidadId ? 'La unidad' : 'El chofer';
      throw new Error(`${cual} ya tiene otro viaje programado para el ${limpio.fechaProgramada}`);
    }
    return this.repo.crear(limpio);
  }

  async cumplir(id, empresaId) {
    const viaje = await this._obtenerDeLaEmpresa(id, empresaId);
    if (viaje.estado !== 'PROGRAMADO') {
      throw new Error('Solo se puede marcar cumplido un viaje que está PROGRAMADO');
    }
    return this.repo.cambiarEstado(id, 'CUMPLIDO');
  }

  async cancelar(id, empresaId, motivo) {
    const viaje = await this._obtenerDeLaEmpresa(id, empresaId);
    if (viaje.estado !== 'PROGRAMADO') {
      throw new Error('Solo se puede cancelar un viaje que está PROGRAMADO');
    }
    return this.repo.cambiarEstado(id, 'CANCELADO', motivo || null);
  }

  async _obtenerDeLaEmpresa(id, empresaId) {
    const viaje = await this.repo.obtenerPorId(id);
    if (!viaje || viaje.empresaId !== empresaId) {
      throw new Error('El viaje programado no existe o no pertenece a esta empresa');
    }
    return viaje;
  }

  async _validar(d) {
    if (!d || typeof d !== 'object') throw new Error('Faltan los datos del viaje');
    const requeridos = ['empresaId', 'unidadId', 'choferId', 'fechaProgramada', 'origen', 'destino'];
    const faltantes = requeridos.filter(
      (campo) => d[campo] === undefined || d[campo] === null || String(d[campo]).trim() === ''
    );
    if (faltantes.length) throw new Error(`Faltan campos obligatorios: ${faltantes.join(', ')}`);

    const fecha = String(d.fechaProgramada).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new Error('fechaProgramada debe tener formato AAAA-MM-DD');
    }

    const unidad = await this.unidades.buscarPorId(String(d.unidadId).trim());
    if (!unidad || unidad.empresaId !== d.empresaId) {
      throw new Error('La unidad indicada no existe o no pertenece a esta empresa');
    }
    if (unidad.activo === false) throw new Error('La unidad indicada está inactiva');
    if (unidad.estadoRegistro && unidad.estadoRegistro !== 'APROBADA') {
      throw new Error('La unidad todavía no fue liberada por la plataforma; no se puede programar');
    }

    const chofer = await this.choferes.buscarPorId(String(d.choferId).trim());
    if (!chofer || chofer.empresaId !== d.empresaId) {
      throw new Error('El chofer indicado no existe o no pertenece a esta empresa');
    }
    if (chofer.activo === false) throw new Error('El chofer indicado está inactivo');
    if (chofer.estadoRegistro && chofer.estadoRegistro !== 'APROBADA') {
      throw new Error('El chofer todavía no fue liberado por la plataforma; no se puede programar');
    }

    const origen = normalizarContra(CENTROS_ORIGEN, d.origen);
    if (!origen) throw new Error(`origen debe ser un centro de origen del catálogo: ${CENTROS_ORIGEN.join(', ')}`);
    const destino = normalizarContra(DESTINOS, d.destino);
    if (!destino) throw new Error(`destino debe ser uno del catálogo: ${DESTINOS.join(', ')}`);

    let mercancia = null;
    if (d.descripcionMercancia) {
      mercancia = normalizarContra(MERCANCIAS, d.descripcionMercancia);
      if (!mercancia) throw new Error(`descripcionMercancia debe ser una del catálogo: ${MERCANCIAS.join(', ')}`);
    }

    return {
      empresaId: String(d.empresaId).trim(),
      unidadId: String(d.unidadId).trim(),
      choferId: String(d.choferId).trim(),
      fechaProgramada: fecha,
      origen,
      destino,
      descripcionMercancia: mercancia,
      observaciones: d.observaciones ? String(d.observaciones).trim() : null,
      creadoPor: d.creadoPor || null
    };
  }
}

module.exports = { ViajesProgramadosService, ESTADOS };
