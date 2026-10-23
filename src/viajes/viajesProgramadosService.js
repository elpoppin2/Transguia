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

  /**
   * @param {{ flotaPropia?: boolean }} opciones - flotaPropia: la empresa es
   *   PROVEEDOR; origen, destino y mercancía son texto libre (sus propias
   *   canteras y clientes) en vez de los catálogos de los tickets.
   */
  async programar(datos, { flotaPropia = false } = {}) {
    const limpio = await this._validar(datos, { flotaPropia });
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

  async _validar(d, { flotaPropia = false } = {}) {
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

    let origen, destino, mercancia = null;
    if (flotaPropia) {
      origen = textoLibre(d.origen, 'el origen');
      destino = textoLibre(d.destino, 'el destino');
      mercancia = d.descripcionMercancia ? textoLibre(d.descripcionMercancia, 'la mercancía') : null;
    } else {
      origen = normalizarContra(CENTROS_ORIGEN, d.origen);
      if (!origen) throw new Error(`origen debe ser un centro de origen del catálogo: ${CENTROS_ORIGEN.join(', ')}`);
      destino = normalizarContra(DESTINOS, d.destino);
      if (!destino) throw new Error(`destino debe ser uno del catálogo: ${DESTINOS.join(', ')}`);
      if (d.descripcionMercancia) {
        mercancia = normalizarContra(MERCANCIAS, d.descripcionMercancia);
        if (!mercancia) throw new Error(`descripcionMercancia debe ser una del catálogo: ${MERCANCIAS.join(', ')}`);
      }
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

/** Texto libre de hasta 80 caracteres, con los espacios colapsados. `campo` lleva su artículo ("el origen"). */
function textoLibre(valor, campo) {
  const t = String(valor || '').replace(/\s+/g, ' ').trim();
  if (!t) throw new Error(`Falta ${campo}`);
  if (t.length > 80) throw new Error(`${campo[0].toUpperCase()}${campo.slice(1)} no puede pasar de 80 caracteres`);
  return t;
}

module.exports = { ViajesProgramadosService, ESTADOS };
