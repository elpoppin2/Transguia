// Ejecutar con:  node sembrar-volumen.js
//
// Agranda la demo: suma flota, choferes, documentos y MUCHOS tickets de
// traslado repartidos en los últimos ~90 días, en varios estados y
// combinando los catálogos del ticket (mercancía / centro de origen /
// destino), para que el dashboard y los listados se vean con volumen.
//
// Requiere que antes se haya corrido `node sembrar-datos.js` (usa las dos
// empresas de demo: "Transportes Andina S.A.C." y "Logística del Sur E.I.R.L.").
//
// Es idempotente y reproducible:
//   - unidades/choferes/documentos: no se recrean si ya existen (placa/DNI).
//   - tickets: genera solo los que falten para llegar al objetivo por empresa.
//   - usa un generador de azar con semilla fija: la demo sale igual siempre.
//
// Se limpia junto con el resto:  node borrar-datos-demo.js

require('dotenv').config();
const { pool } = require('./src/db/pool');
const { prepararEsquema } = require('./src/db/migraciones');
const { UnidadesService } = require('./src/unidades/unidadesService');
const { UnidadesRepositorioPostgres } = require('./src/unidades/unidadesRepoPostgres');
const { ChoferesService } = require('./src/choferes/choferesService');
const { ChoferesRepositorioPostgres } = require('./src/choferes/choferesRepoPostgres');
const { DocumentosService } = require('./src/documentos/documentosService');
const { DocumentosRepositorioPostgres } = require('./src/documentos/documentosRepoPostgres');
const { TicketService } = require('./src/tickets/ticketService');
const { TicketsRepositorioPostgres } = require('./src/tickets/ticketsRepoPostgres');
const { EmisorGREDemo } = require('./src/gre/EmisorGREDemo');
const { fichaVehiculoDemo } = require('./demo-ficha-vehiculo');

// ------------------------------------------------------------------
// Azar con semilla: misma demo en cada corrida.
// ------------------------------------------------------------------
function mulberry32(semilla) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260910);
const elegir = (arr) => arr[Math.floor(rnd() * arr.length)];
const entero = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const dias = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

// ------------------------------------------------------------------
// Catálogos de la demo
// ------------------------------------------------------------------
const RUC_ANDINA = '20548712369';
const RUC_DELSUR = '20600123456';

// [placa, marca, modelo, año, categoríaMtc, configuraciónVehicular]
const UNIDADES_ANDINA = [
  ['H1J-337', 'Volvo', 'FH 500', 2022, 'N3', 'T3S3'],
  ['J4K-882', 'Scania', 'R 500', 2021, 'N3', 'T3S3'],
  ['K9L-450', 'Kenworth', 'T880', 2020, 'N3', 'T3S2'],
  ['L2M-006', 'International', 'LT625', 2019, 'N3', 'T3S2'],
  ['M7N-771', 'Mercedes-Benz', 'Actros 2646', 2023, 'N3', 'T3S3'],
  ['N3P-214', 'MAN', 'TGX 28.480', 2021, 'N3', 'T3S2'],
  ['P8Q-659', 'Volvo', 'FMX 460', 2020, 'N3', 'C4'],
  ['Q1R-093', 'Hino', '700 Series', 2022, 'N3', 'C3'],
  ['R6S-528', 'Iveco', 'Stralis', 2019, 'N2', 'C3'],
  ['S2T-874', 'Freightliner', 'Cascadia', 2021, 'N3', 'T3S3'],
  ['T7U-319', 'DAF', 'XF 480', 2022, 'N3', 'T3S2'],
  ['U4V-765', 'Volkswagen', 'Constellation 25.420', 2020, 'N2', 'C3'],
  ['V9W-201', 'Hyundai', 'Xcient', 2023, 'N2', 'C3'],
  ['W5X-647', 'Foton', 'Auman EST', 2021, 'N2', 'C2']
];
const UNIDADES_DELSUR = [
  ['C1D-330', 'Hyundai', 'HD78', 2021, 'N2', 'C2'],
  ['D6E-775', 'JAC', 'N-Series', 2022, 'N1', 'C2'],
  ['E2F-118', 'Isuzu', 'NQR', 2020, 'N2', 'C2'],
  ['F8G-560', 'Hino', '300 Series', 2021, 'N1', 'C2'],
  ['G3H-902', 'Foton', 'Aumark', 2019, 'N1', 'C2']
];

// [dni, nombres, apellidos]
const CHOFERES_ANDINA = [
  ['70110234', 'Pedro Martín', 'Alva Rojas'],
  ['70210345', 'Julio César', 'Bautista Ninaquispe'],
  ['70310456', 'Wálter', 'Cáceres Mendoza'],
  ['70410567', 'Néstor', 'Damián Quiroz'],
  ['70510678', 'Edwin', 'Espinoza Yupanqui'],
  ['70610789', 'Rómulo', 'Farfán Aguilar'],
  ['70710890', 'Grover', 'Gonzáles Pariona'],
  ['70810901', 'Hilario', 'Huanca Chávez'],
  ['70911012', 'Isaac', 'Ipenza Rivera'],
  ['71011123', 'Javier', 'Jara Montalvo'],
  ['71111234', 'Ketín', 'Curi Salazar'],
  ['71211345', 'Lucho', 'León Paredes'],
  ['71311456', 'Marcos', 'Meza Cárdenas'],
  ['71411567', 'Nilton', 'Nolasco Trujillo'],
  ['71511678', 'Óscar', 'Ochoa Bravo'],
  ['71611789', 'Percy', 'Puma Sánchez']
];
const CHOFERES_DELSUR = [
  ['72110111', 'Abel', 'Arce Mamani'],
  ['72210222', 'Braulio', 'Balcázar Quispe'],
  ['72310333', 'Ciro', 'Choque Vargas'],
  ['72410444', 'Dante', 'Delgado Roque'],
  ['72510555', 'Efraín', 'Escobar Ninanya'],
  ['72610666', 'Fausto', 'Fernández Toledo']
];

// Catálogos del ticket (ver src/tickets/catalogos.js).
const CENTROS_ORIGEN = ['Quri', 'Transmilsa', 'Atipax', 'Juscamaita'];

// [destino, horas de viaje aproximadas]
const DESTINOS = [
  ['Atocongo', 3],
  ['Muelle Conchán', 3],
  ['Condorcocha', 8]
];

// [mercancía del catálogo, pesoMín, pesoMáx] en kg. Son materiales a
// granel: viajan pesados (el tope legal general de una combinación es 48 000).
const MATERIALES = [
  ['Carbón Trujillo', 22000, 30000],
  ['Caliza Roca Fuerte', 24000, 32000],
  ['Silice de Terceros', 20000, 28000],
  ['Puzolana Terceros', 22000, 30000],
  ['Puzolana Ayacucho', 22000, 30000]
];
const MOTIVOS = [
  'TRASLADO_ENTRE_ESTABLECIMIENTOS', 'TRASLADO_ENTRE_ESTABLECIMIENTOS',
  'TRASLADO_ENTRE_ESTABLECIMIENTOS', 'TRASLADO_ENTRE_ESTABLECIMIENTOS',
  'VENTA', 'OTROS'
];

// Objetivo de tickets por empresa (total tras correr el script).
const OBJETIVO = { [RUC_ANDINA]: 140, [RUC_DELSUR]: 45 };
const DIAS_HISTORIA = 90;

// ------------------------------------------------------------------
function estadoSegunEdad(diasAtras) {
  const r = rnd();
  if (diasAtras <= 2) return r < 0.55 ? 'GENERADO' : 'EN_TRANSITO';
  if (diasAtras <= 7) {
    if (r < 0.5) return 'EN_TRANSITO';
    if (r < 0.94) return 'ENTREGADO';
    return 'ANULADO';
  }
  return r < 0.9 ? 'ENTREGADO' : 'ANULADO';
}

function esperarEmision(ticketService, datos) {
  return new Promise((resolve, reject) => {
    ticketService.crearTicket(datos, (t) => resolve(t)).catch(reject);
  });
}

async function altaUnidades(unidadesSvc, unidadesRepo, empresaId, lista, etiqueta) {
  let nuevas = 0;
  for (const [placa, marca, modelo, anio, cat, config] of lista) {
    if (await unidadesRepo.buscarPorPlaca(placa)) continue;
    await unidadesSvc.registrarUnidad({
      ...fichaVehiculoDemo(rnd),
      empresaId, placa, marca, modelo,
      anioFabricacion: anio, categoriaMtc: cat, configuracionVehicular: config
    });
    nuevas++;
  }
  console.log(`  ${etiqueta}: ${nuevas} unidad(es) nueva(s)`);
}

async function altaChoferes(choferesSvc, choferesRepo, empresaId, lista, etiqueta) {
  let nuevos = 0;
  for (const [dni, nombres, apellidos] of lista) {
    if (await choferesRepo.buscarPorDni(empresaId, dni)) continue;
    await choferesSvc.registrarChofer({ empresaId, dni, nombres, apellidos });
    nuevos++;
  }
  console.log(`  ${etiqueta}: ${nuevos} chofer(es) nuevo(s)`);
}

async function altaDocumentos(documentosSvc, documentosRepo, empresaId, unidades, choferes) {
  let docs = 0;
  for (const u of unidades) {
    const yaTiene = new Set((await documentosRepo.listarDeUnidad(u.id)).map((d) => d.tipoDocumento));
    for (const [tipo, venc] of [
      ['SOAT', dias(entero(-20, 330))],
      ['REVISION_TECNICA', dias(entero(-10, 700))]
    ]) {
      if (yaTiene.has(tipo)) continue;
      await documentosSvc.agregarAUnidad(empresaId, u.id, {
        tipoDocumento: tipo,
        numeroDocumento: `${tipo === 'SOAT' ? 'SOAT' : 'RT'}-${u.placa.replace('-', '')}`,
        fechaVencimiento: venc
      });
      docs++;
    }
  }
  for (const c of choferes) {
    const yaTiene = new Set((await documentosRepo.listarDeChofer(c.id)).map((d) => d.tipoDocumento));
    if (!yaTiene.has('LICENCIA_CONDUCIR')) {
      await documentosSvc.agregarAChofer(empresaId, c.id, {
        tipoDocumento: 'LICENCIA_CONDUCIR',
        categoriaLicencia: elegir(['A-IIIa', 'A-IIIb', 'A-IIIc']),
        numeroDocumento: `Q${c.dni}`,
        fechaVencimiento: dias(entero(30, 900))
      });
      docs++;
    }
    if (!yaTiene.has('CERTIFICADO_MEDICO')) {
      await documentosSvc.agregarAChofer(empresaId, c.id, {
        tipoDocumento: 'CERTIFICADO_MEDICO',
        numeroDocumento: `CM-${c.dni}`,
        fechaVencimiento: dias(entero(-15, 400))
      });
      docs++;
    }
  }
  console.log(`  documentos nuevos: ${docs}`);
}

async function generarTickets(ctx, empresaId, ruc, adminId) {
  const { ticketService, unidadesSvc, choferesSvc } = ctx;
  const { rows: cuenta } = await pool.query(
    'select count(*)::int as n from tickets_traslado where empresa_id = $1', [empresaId]
  );
  const faltan = OBJETIVO[ruc] - cuenta[0].n;
  if (faltan <= 0) {
    console.log(`  tickets: la empresa ya tiene ${cuenta[0].n} (objetivo ${OBJETIVO[ruc]}); no se generan más`);
    return;
  }

  const unidades = (await unidadesSvc.listarUnidades(empresaId)).filter((u) => u.activo !== false);
  const choferes = (await choferesSvc.listarChoferes(empresaId)).filter((c) => c.activo !== false);
  if (!unidades.length || !choferes.length) {
    console.log('  tickets: no hay unidades/choferes activos; se omite');
    return;
  }
  console.log(`  tickets: generando ${faltan} (flota activa ${unidades.length}, choferes activos ${choferes.length})…`);

  let hechos = 0;
  for (let i = 0; i < faltan; i++) {
    const origen = elegir(CENTROS_ORIGEN);
    const [destino, horasRuta] = elegir(DESTINOS);
    const [material, pMin, pMax] = elegir(MATERIALES);
    const unidad = elegir(unidades);
    const chofer = elegir(choferes);
    const diasAtras = entero(1, DIAS_HISTORIA);
    const estado = estadoSegunEdad(diasAtras);

    let creado;
    try {
      creado = await esperarEmision(ticketService, {
        empresaId,
        unidadId: unidad.id,
        choferId: chofer.id,
        creadoPor: adminId,
        origen, destino,
        motivo: elegir(MOTIVOS),
        descripcionMercancia: material,
        pesoBrutoKg: entero(pMin, pMax)
      });
    } catch (e) {
      console.log(`    (ticket omitido: ${e.message})`);
      continue;
    }

    // Backdatea y fija el estado (data de demo; en real lo hace el operador).
    const base = `now() - interval '${diasAtras} days' + interval '${entero(0, 20)} hours'`;
    const sets = [`creado_en = ${base}`, `estado_operativo = '${estado}'`];
    if (estado === 'EN_TRANSITO' || estado === 'ENTREGADO') {
      sets.push(`fecha_traslado = ${base} + interval '${entero(1, 6)} hours'`);
    }
    if (estado === 'ENTREGADO') {
      const total = entero(1, 6) + Math.round(horasRuta * (0.8 + rnd() * 0.9));
      sets.push(`fecha_entrega = ${base} + interval '${total} hours'`);
    }
    await pool.query(`update tickets_traslado set ${sets.join(', ')} where id = $1`, [creado.id]);

    hechos++;
    if (hechos % 20 === 0) console.log(`    …${hechos}/${faltan}`);
  }
  console.log(`  tickets: ${hechos} creados`);
}

// ------------------------------------------------------------------
(async () => {
  await prepararEsquema();

  const unidadesRepo = new UnidadesRepositorioPostgres();
  const choferesRepo = new ChoferesRepositorioPostgres();
  const documentosRepo = new DocumentosRepositorioPostgres();
  const ticketsRepo = new TicketsRepositorioPostgres();
  await ticketsRepo.asegurarEsquema();

  const unidadesSvc = new UnidadesService(unidadesRepo);
  const choferesSvc = new ChoferesService(choferesRepo);
  const documentosSvc = new DocumentosService({
    repositorioDocumentos: documentosRepo,
    repositorioUnidades: unidadesRepo,
    repositorioChoferes: choferesRepo
  });
  const ticketService = new TicketService({
    // Emisor "demo" sin rechazos: la demo sale predecible y todos los
    // tickets quedan con GRE ACEPTADA para poder avanzar de estado.
    emisorGRE: new EmisorGREDemo({ serie: 'T001', correlativoInicial: 500, probabilidadRechazo: 0, demoraMs: 0 }),
    repositorioTickets: ticketsRepo,
    repositorioUnidades: unidadesRepo,
    repositorioChoferes: choferesRepo,
    repositorioDocumentos: documentosRepo,
    emisionSincrona: true
  });

  const ctx = { ticketService, unidadesSvc, choferesSvc };

  for (const [ruc, unidadesLista, choferesLista, etiqueta] of [
    [RUC_ANDINA, UNIDADES_ANDINA, CHOFERES_ANDINA, 'Andina'],
    [RUC_DELSUR, UNIDADES_DELSUR, CHOFERES_DELSUR, 'Del Sur']
  ]) {
    const { rows } = await pool.query('select id, razon_social from empresas where ruc = $1', [ruc]);
    if (rows.length === 0) {
      console.log(`(RUC ${ruc}: no existe — corré primero "node sembrar-datos.js")`);
      continue;
    }
    const empresaId = rows[0].id;
    console.log(`\n${rows[0].razon_social}`);

    await altaUnidades(unidadesSvc, unidadesRepo, empresaId, unidadesLista, etiqueta);
    await altaChoferes(choferesSvc, choferesRepo, empresaId, choferesLista, etiqueta);

    // Flota y choferes de demo: liberados (si no, no se pueden emitir tickets).
    await pool.query(
      `update unidades set estado_registro = 'APROBADA'
       where empresa_id = $1 and estado_registro <> 'APROBADA'`, [empresaId]);
    await pool.query(
      `update choferes set estado_registro = 'APROBADA'
       where empresa_id = $1 and estado_registro <> 'APROBADA'`, [empresaId]);

    const unidades = await unidadesSvc.listarUnidades(empresaId);
    const choferes = await choferesSvc.listarChoferes(empresaId);
    await altaDocumentos(documentosSvc, documentosRepo, empresaId, unidades, choferes);

    // El admin de la empresa, para el campo "creado_por".
    const { rows: admin } = await pool.query(
      `select id from usuarios where empresa_id = $1 and rol = 'admin_empresa' order by creado_en limit 1`,
      [empresaId]
    );
    await generarTickets(ctx, empresaId, ruc, admin[0] ? admin[0].id : null);
  }

  console.log('\nListo. Refrescá http://localhost:3001 → pestaña Dashboard.');
  await pool.end();
})().catch((error) => {
  console.error('[error]', error.message);
  process.exit(1);
});
