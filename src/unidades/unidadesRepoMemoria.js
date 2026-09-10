const crypto = require('crypto');

/**
 * Guarda las unidades (vehículos) en memoria: se pierden al reiniciar el
 * proceso. Tiene exactamente los mismos métodos que
 * unidadesRepoPostgres.js, para que unidadesService.js no distinga cuál
 * está usando — misma idea de "interfaz desacoplada" que en auth y GRE.
 */
class UnidadesRepositorioMemoria {
  constructor() {
    this.unidades = new Map(); // id -> unidad
  }

  async listarPorEmpresa(empresaId) {
    return Array.from(this.unidades.values())
      .filter((u) => u.empresaId === empresaId)
      .sort((a, b) => a.placa.localeCompare(b.placa));
  }

  async buscarPorPlaca(placa) {
    return (
      Array.from(this.unidades.values()).find((u) => u.placa === placa) || null
    );
  }

  async buscarPorId(id) {
    return this.unidades.get(id) || null;
  }

  async crearUnidad(datos) {
    if (await this.buscarPorPlaca(datos.placa)) {
      throw new Error('Ya existe una unidad registrada con esa placa');
    }
    const unidad = {
      id: crypto.randomUUID(),
      activo: true,
      creadoEn: new Date().toISOString(),
      ...datos
    };
    this.unidades.set(unidad.id, unidad);
    return unidad;
  }

  async cambiarActivo(id, activo) {
    const unidad = this.unidades.get(id);
    if (!unidad) throw new Error('La unidad indicada no existe');
    unidad.activo = activo;
    return unidad;
  }
}

module.exports = { UnidadesRepositorioMemoria };
