const crypto = require('crypto');

/**
 * Versión en memoria de DocumentosRepositorioPostgres (mismo contrato).
 * Para demo.js y pruebas.
 */
class DocumentosRepositorioMemoria {
  constructor() {
    this.deUnidad = new Map(); // id -> doc
    this.deChofer = new Map(); // id -> doc
  }

  async listarDeUnidad(unidadId) {
    return [...this.deUnidad.values()]
      .filter((d) => d.unidadId === unidadId)
      .sort((a, b) => String(a.fechaVencimiento).localeCompare(String(b.fechaVencimiento)));
  }

  async agregarAUnidad(datos) {
    const doc = { id: crypto.randomUUID(), archivoUrl: null, numeroDocumento: null, fechaEmision: null, creadoEn: new Date().toISOString(), ...datos };
    this.deUnidad.set(doc.id, doc);
    return doc;
  }

  async eliminarDeUnidad(docId) {
    if (!this.deUnidad.delete(docId)) throw new Error('El documento indicado no existe');
  }

  async listarDeChofer(choferId) {
    return [...this.deChofer.values()]
      .filter((d) => d.choferId === choferId)
      .sort((a, b) => String(a.fechaVencimiento).localeCompare(String(b.fechaVencimiento)));
  }

  async agregarAChofer(datos) {
    const doc = { id: crypto.randomUUID(), numeroDocumento: null, categoriaLicencia: null, fechaEmision: null, creadoEn: new Date().toISOString(), ...datos };
    this.deChofer.set(doc.id, doc);
    return doc;
  }

  async eliminarDeChofer(docId) {
    if (!this.deChofer.delete(docId)) throw new Error('El documento indicado no existe');
  }

  async licenciaVigenteDeChofer(choferId) {
    const hoy = new Date().toISOString().slice(0, 10);
    return [...this.deChofer.values()]
      .filter((d) => d.choferId === choferId && d.tipoDocumento === 'LICENCIA_CONDUCIR')
      .sort((a, b) => {
        const va = a.fechaVencimiento >= hoy ? 1 : 0;
        const vb = b.fechaVencimiento >= hoy ? 1 : 0;
        return vb - va || String(b.fechaVencimiento).localeCompare(String(a.fechaVencimiento));
      })[0] || null;
  }

  async vencimientosProximos() {
    return []; // la memoria no reconstruye la vista; se prueba contra Postgres
  }
}

module.exports = { DocumentosRepositorioMemoria };
