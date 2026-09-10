const TIPOS_UNIDAD = ['SOAT', 'REVISION_TECNICA', 'TARJETA_CIRCULACION', 'PERMISO_OPERACION', 'OTRO'];
const TIPOS_CHOFER = ['LICENCIA_CONDUCIR', 'CERTIFICADO_MEDICO', 'OTRO'];
const CATEGORIAS_LICENCIA = ['A-I', 'A-IIa', 'A-IIb', 'A-IIIa', 'A-IIIb', 'A-IIIc'];

/**
 * Reglas de negocio para los documentos con vencimiento de unidades y
 * choferes. Necesita los repositorios de unidades y choferes para
 * comprobar que la unidad / el chofer pertenecen a la empresa que pide.
 */
class DocumentosService {
  constructor({ repositorioDocumentos, repositorioUnidades, repositorioChoferes }) {
    if (!repositorioDocumentos || !repositorioUnidades || !repositorioChoferes) {
      throw new Error('DocumentosService requiere repositorioDocumentos, repositorioUnidades y repositorioChoferes');
    }
    this.repo = repositorioDocumentos;
    this.unidades = repositorioUnidades;
    this.choferes = repositorioChoferes;
  }

  async _unidadDe(empresaId, unidadId) {
    const u = await this.unidades.buscarPorId(unidadId);
    if (!u || u.empresaId !== empresaId) throw new Error('La unidad indicada no existe o no es de tu empresa');
    return u;
  }
  async _choferDe(empresaId, choferId) {
    const c = await this.choferes.buscarPorId(choferId);
    if (!c || c.empresaId !== empresaId) throw new Error('El chofer indicado no existe o no es de tu empresa');
    return c;
  }

  async listarDeUnidad(empresaId, unidadId) {
    await this._unidadDe(empresaId, unidadId);
    return this.repo.listarDeUnidad(unidadId);
  }

  async agregarAUnidad(empresaId, unidadId, datos) {
    await this._unidadDe(empresaId, unidadId);
    const tipoDocumento = exigirEnum('tipoDocumento', datos.tipoDocumento, TIPOS_UNIDAD);
    return this.repo.agregarAUnidad({
      unidadId,
      tipoDocumento,
      numeroDocumento: textoOpcional(datos.numeroDocumento),
      fechaEmision: fechaOpcional(datos.fechaEmision, 'fechaEmision'),
      fechaVencimiento: fechaObligatoria(datos.fechaVencimiento),
      archivoUrl: textoOpcional(datos.archivoUrl)
    });
  }

  async listarDeChofer(empresaId, choferId) {
    await this._choferDe(empresaId, choferId);
    return this.repo.listarDeChofer(choferId);
  }

  async agregarAChofer(empresaId, choferId, datos) {
    await this._choferDe(empresaId, choferId);
    const tipoDocumento = exigirEnum('tipoDocumento', datos.tipoDocumento, TIPOS_CHOFER);
    let categoriaLicencia = null;
    if (tipoDocumento === 'LICENCIA_CONDUCIR') {
      categoriaLicencia = datos.categoriaLicencia
        ? exigirEnum('categoriaLicencia', datos.categoriaLicencia, CATEGORIAS_LICENCIA)
        : null;
    }
    return this.repo.agregarAChofer({
      choferId,
      tipoDocumento,
      numeroDocumento: textoOpcional(datos.numeroDocumento),
      categoriaLicencia,
      fechaEmision: fechaOpcional(datos.fechaEmision, 'fechaEmision'),
      fechaVencimiento: fechaObligatoria(datos.fechaVencimiento)
    });
  }

  async eliminarDeUnidad(empresaId, unidadId, docId) {
    await this._unidadDe(empresaId, unidadId);
    return this.repo.eliminarDeUnidad(docId);
  }

  async eliminarDeChofer(empresaId, choferId, docId) {
    await this._choferDe(empresaId, choferId);
    return this.repo.eliminarDeChofer(docId);
  }

  /** Documentos vencidos o por vencer dentro de `dias` (1..365, default 30). */
  async vencimientosProximos(empresaId, dias) {
    let n = Number(dias);
    if (!Number.isFinite(n) || n <= 0) n = 30;
    n = Math.min(Math.round(n), 365);
    return this.repo.vencimientosProximos(empresaId, n);
  }

  /** Para la emisión de la GRE: nº de licencia vigente del chofer (o null). */
  licenciaVigenteDeChofer(choferId) {
    return this.repo.licenciaVigenteDeChofer(choferId);
  }
}

function exigirEnum(campo, valor, permitidos) {
  const v = String(valor || '').toUpperCase().trim();
  // categoría de licencia conserva mayúsculas/minúsculas ("A-IIa")
  const match = permitidos.find((p) => p.toUpperCase() === v);
  if (!match) throw new Error(`${campo} debe ser uno de: ${permitidos.join(', ')}`);
  return match;
}
function textoOpcional(v) {
  return v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim();
}
function fechaObligatoria(v) {
  const s = String(v || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
    throw new Error('fechaVencimiento es obligatoria y debe tener formato AAAA-MM-DD');
  }
  return s;
}
function fechaOpcional(v, campo) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
    throw new Error(`${campo} debe tener formato AAAA-MM-DD`);
  }
  return s;
}

module.exports = { DocumentosService, TIPOS_UNIDAD, TIPOS_CHOFER, CATEGORIAS_LICENCIA };
