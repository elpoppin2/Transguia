const ESTADOS = ['GENERADO', 'EN_TRANSITO', 'ENTREGADO', 'ANULADO'];

// Ventanas móviles admitidas y su equivalente en días / etiqueta.
const VENTANAS = {
  '7d': { dias: 7, mensual: false, label: 'últimos 7 días', previo: '7 días previos' },
  '30d': { dias: 30, mensual: false, label: 'últimos 30 días', previo: '30 días previos' },
  '90d': { dias: 90, mensual: false, label: 'últimos 90 días', previo: '90 días previos' },
  '12m': { dias: 365, mensual: true, label: 'últimos 12 meses', previo: '12 meses previos' }
};

/**
 * Arma los indicadores de gestión del dashboard para una empresa (o todas
 * si empresaId es null). Todo se mide sobre una ventana móvil; los KPI
 * traen además la variación respecto de la ventana anterior.
 */
class DashboardService {
  constructor({ repositorioDashboard, repositorioEmpresas }) {
    if (!repositorioDashboard || !repositorioEmpresas) {
      throw new Error('DashboardService requiere repositorioDashboard y repositorioEmpresas');
    }
    this.repo = repositorioDashboard;
    this.empresas = repositorioEmpresas;
  }

  /** @param {{ empresaId: string|null, ventana?: string }} opciones */
  async generar({ empresaId = null, ventana }) {
    const v = VENTANAS[ventana] || VENTANAS['30d'];

    let alcance = 'Todas las empresas';
    if (empresaId) {
      const empresa = await this.empresas.buscarPorId(empresaId);
      if (!empresa) throw new Error('La empresa indicada no existe');
      alcance = empresa.razonSocial;
    }

    const [k, gre, flota, periodo, estado, materiales, unidades, corredores] = await Promise.all([
      this.repo.kpis(empresaId, v.dias),
      this.repo.gre(empresaId, v.dias),
      this.repo.flotaHabilitada(empresaId),
      this.repo.toneladasPorPeriodo(empresaId, v.dias, v.mensual),
      this.repo.porEstado(empresaId, v.dias),
      this.repo.toneladasPorMaterial(empresaId, v.dias),
      this.repo.viajesPorUnidad(empresaId, v.dias),
      this.repo.corredores(empresaId, v.dias)
    ]);

    const porEstadoOperativo = Object.fromEntries(ESTADOS.map((e) => [e, 0]));
    for (const r of estado) if (r.estado in porEstadoOperativo) porEstadoOperativo[r.estado] = r.cantidad;

    const num = (x) => (x == null ? null : Number(x));
    const tonAct = redondear(num(k.ton_act));
    const tonPrev = redondear(num(k.ton_prev));
    const cicloAct = k.ciclo_act == null ? null : redondear(num(k.ciclo_act));
    const cicloPrev = k.ciclo_prev == null ? null : redondear(num(k.ciclo_prev));
    const tasaAnulAct = k.total_act ? redondear((k.anulados_act / k.total_act) * 100) : 0;
    const tasaAnulPrev = k.total_prev ? redondear((k.anulados_prev / k.total_prev) * 100) : 0;
    const greAceptadas = num(gre.aceptadas) || 0;
    const greBase = num(gre.total) || 0;

    const kpis = {
      // valor actual, variación % vs. ventana previa, y si "subir" es bueno
      toneladas: {
        valor: tonAct, unidad: 't',
        delta: variacionPorc(tonAct, tonPrev), subirEsBueno: true
      },
      viajes: {
        valor: k.viajes_act,
        delta: variacionPorc(k.viajes_act, k.viajes_prev), subirEsBueno: true
      },
      cicloHoras: {
        valor: cicloAct, unidad: 'h',
        delta: variacionPorc(cicloAct, cicloPrev), subirEsBueno: false,
        despacho: k.despacho_act == null ? null : redondear(num(k.despacho_act)),
        transito: k.transito_act == null ? null : redondear(num(k.transito_act))
      },
      tasaAnulacion: {
        valor: tasaAnulAct, unidad: '%',
        deltaPuntos: redondear(tasaAnulAct - tasaAnulPrev), subirEsBueno: false,
        anulados: k.anulados_act, total: k.total_act,
        semaforo: umbral(tasaAnulAct, { bien: 5, atencion: 12 }, 'menorEsMejor')
      },
      utilizacionFlota: {
        valor: flota ? redondear((k.unidades_con_viaje / flota) * 100) : 0, unidad: '%',
        unidadesConViaje: k.unidades_con_viaje, flotaHabilitada: flota,
        semaforo: umbral(flota ? (k.unidades_con_viaje / flota) * 100 : 0, { bien: 85, atencion: 65 }, 'mayorEsMejor')
      },
      greAceptada: {
        valor: greBase ? redondear((greAceptadas / greBase) * 100) : null, unidad: '%',
        aceptadas: greAceptadas, rechazadas: num(gre.rechazadas) || 0, total: greBase,
        semaforo: greBase ? umbral((greAceptadas / greBase) * 100, { bien: 98, atencion: 92 }, 'mayorEsMejor') : 'sinDatos'
      }
    };

    return {
      alcance,
      ventana: Object.keys(VENTANAS).find((x) => VENTANAS[x] === v),
      ventanaLabel: v.label,
      ventanaPrevio: v.previo,
      mensual: v.mensual,
      kpis,
      toneladasPorPeriodo: periodo,        // [{ periodo, toneladas, viajes }]
      porEstadoOperativo,                  // { GENERADO, EN_TRANSITO, ENTREGADO, ANULADO } (en la ventana)
      toneladasPorMaterial: materiales,    // [{ material, toneladas, viajes }]
      viajesPorUnidad: unidades,           // [{ placa, viajes, toneladas }]
      corredores                           // [{ origen, destino, toneladas, viajes }]
    };
  }
}

const redondear = (n) => Math.round(n * 10) / 10;

/** Variación porcentual de `act` respecto de `prev` (null si no hay base). */
function variacionPorc(act, prev) {
  if (act == null || prev == null || prev === 0) return null;
  return Math.round(((act - prev) / prev) * 1000) / 10;
}

/** 'bien' | 'atencion' | 'critico' según el valor y la dirección buena. */
function umbral(valor, { bien, atencion }, direccion) {
  if (direccion === 'menorEsMejor') {
    if (valor <= bien) return 'bien';
    if (valor <= atencion) return 'atencion';
    return 'critico';
  }
  if (valor >= bien) return 'bien';
  if (valor >= atencion) return 'atencion';
  return 'critico';
}

module.exports = { DashboardService, VENTANAS };
