// Ejecutar con:  node sembrar-datos.js
//
// Deja la base de datos real (Supabase) con datos suficientes para
// demostrar el prototipo: una empresa, un usuario para ingresar, varias
// unidades y choferes, y un par de tickets con su GRE ya emitida.
//
// Es idempotente: si algo ya existe (por RUC, placa, DNI o usuario) no lo
// vuelve a crear. Se puede correr varias veces sin ensuciar nada.
//
// Para borrar lo sembrado:  node borrar-datos-demo.js

require('dotenv').config();
const { pool } = require('./src/db/pool');
const { prepararEsquema } = require('./src/db/migraciones');
const { crearEmisorGRE } = require('./src/gre/crearEmisorGRE');
const { AuthService } = require('./src/auth/authService');
const { UsuariosRepositorioPostgres } = require('./src/auth/usuariosRepoPostgres');
const { EmpresasService } = require('./src/empresas/empresasService');
const { EmpresasRepositorioPostgres } = require('./src/empresas/empresasRepoPostgres');
const { UnidadesService } = require('./src/unidades/unidadesService');
const { UnidadesRepositorioPostgres } = require('./src/unidades/unidadesRepoPostgres');
const { ChoferesService } = require('./src/choferes/choferesService');
const { ChoferesRepositorioPostgres } = require('./src/choferes/choferesRepoPostgres');
const { DocumentosService } = require('./src/documentos/documentosService');
const { DocumentosRepositorioPostgres } = require('./src/documentos/documentosRepoPostgres');
const { TicketService } = require('./src/tickets/ticketService');
const { TicketsRepositorioPostgres } = require('./src/tickets/ticketsRepoPostgres');

const EMPRESA = { ruc: '20548712369', razonSocial: 'Transportes Andina S.A.C.' };
const USUARIO = { username: 'andina', password: 'demo2026seguro', nombreCompleto: 'María Andina', rol: 'admin_empresa' };

// Usuario de plataforma: ve todas las empresas en el dashboard.
const SUPERADMIN = { username: 'super', password: 'superdemo2026', nombreCompleto: 'Plataforma TransGuía' };

// Segunda empresa (más chica) para que el dashboard tenga algo que elegir.
const EMPRESA_2 = {
  ruc: '20600123456',
  razonSocial: 'Logística del Sur E.I.R.L.',
  admin: { username: 'delsur', password: 'delsur2026seguro', nombreCompleto: 'Rosa Del Sur' },
  unidades: [
    { placa: 'B5T-221', marca: 'Iveco', modelo: 'Tector', anioFabricacion: 2020, categoriaMtc: 'N2', configuracionVehicular: 'C3' },
    { placa: 'G8M-770', marca: 'Volkswagen', modelo: 'Delivery', anioFabricacion: 2021, categoriaMtc: 'N1', configuracionVehicular: 'C2' }
  ],
  choferes: [
    { dni: '41222333', nombres: 'Elena', apellidos: 'Ticona Vilca' },
    { dni: '42555666', nombres: 'Raúl', apellidos: 'Condori Apaza' }
  ]
};

const UNIDADES = [
  { placa: 'ABC-756', marca: 'Volvo',      modelo: 'FH 460',   anioFabricacion: 2021, categoriaMtc: 'N3', configuracionVehicular: 'T3S3' },
  { placa: 'CDF-903', marca: 'Scania',     modelo: 'R 450',    anioFabricacion: 2019, categoriaMtc: 'N3', configuracionVehicular: 'T3S2' },
  { placa: 'D2W-118', marca: 'Freightliner', modelo: 'M2 106', anioFabricacion: 2020, categoriaMtc: 'N2', configuracionVehicular: 'C3'   },
  { placa: 'F7K-402', marca: 'Hyundai',    modelo: 'HD65',     anioFabricacion: 2022, categoriaMtc: 'N1', configuracionVehicular: 'C2'   }
];

const CHOFERES = [
  { dni: '45678912', nombres: 'Luis Alberto',  apellidos: 'Quispe Mamani' },
  { dni: '47001122', nombres: 'Jorge Luis',    apellidos: 'Ramos Sifuentes' },
  { dni: '43980017', nombres: 'Carlos Enrique', apellidos: 'Huamán Torres' },
  { dni: '46512388', nombres: 'Miguel Ángel',  apellidos: 'Flores Ccahua' }
];

// `diasAtras` / `estado` / `horas*` son para que el dashboard tenga
// datos repartidos en el tiempo y en varios estados. En un uso real
// esto lo hace el operador desde la interfaz.
const TICKETS = [
  { placa: 'ABC-756', dni: '45678912', origen: 'Quri', destino: 'Atocongo', motivo: 'TRASLADO_ENTRE_ESTABLECIMIENTOS', descripcionMercancia: 'Caliza Roca Fuerte', pesoBrutoKg: 28200, diasAtras: 24, estado: 'ENTREGADO', horasTransito: 3, horasEntrega: 19 },
  { placa: 'CDF-903', dni: '47001122', origen: 'Transmilsa', destino: 'Condorcocha', motivo: 'TRASLADO_ENTRE_ESTABLECIMIENTOS', descripcionMercancia: 'Puzolana Ayacucho', pesoBrutoKg: 30500, diasAtras: 21, estado: 'ENTREGADO', horasTransito: 2, horasEntrega: 11 },
  { placa: 'D2W-118', dni: '43980017', origen: 'Atipax', destino: 'Muelle Conchán', motivo: 'TRASLADO_ENTRE_ESTABLECIMIENTOS', descripcionMercancia: 'Silice de Terceros', pesoBrutoKg: 24400, diasAtras: 18, estado: 'ENTREGADO', horasTransito: 4, horasEntrega: 26 },
  { placa: 'F7K-402', dni: '46512388', origen: 'Juscamaita', destino: 'Atocongo', motivo: 'TRASLADO_ENTRE_ESTABLECIMIENTOS', descripcionMercancia: 'Carbón Trujillo', pesoBrutoKg: 26100, diasAtras: 14, estado: 'ENTREGADO', horasTransito: 2, horasEntrega: 9 },
  { placa: 'ABC-756', dni: '45678912', origen: 'Quri', destino: 'Condorcocha', motivo: 'TRASLADO_ENTRE_ESTABLECIMIENTOS', descripcionMercancia: 'Puzolana Terceros', pesoBrutoKg: 29800, diasAtras: 10, estado: 'ENTREGADO', horasTransito: 3, horasEntrega: 22 },
  { placa: 'CDF-903', dni: '47001122', origen: 'Transmilsa', destino: 'Atocongo', motivo: 'TRASLADO_ENTRE_ESTABLECIMIENTOS', descripcionMercancia: 'Caliza Roca Fuerte', pesoBrutoKg: 27700, diasAtras: 6, estado: 'EN_TRANSITO', horasTransito: 3 },
  { placa: 'D2W-118', dni: '43980017', origen: 'Atipax', destino: 'Muelle Conchán', motivo: 'TRASLADO_ENTRE_ESTABLECIMIENTOS', descripcionMercancia: 'Puzolana Ayacucho', pesoBrutoKg: 25200, diasAtras: 3, estado: 'EN_TRANSITO', horasTransito: 5 },
  { placa: 'F7K-402', dni: '46512388', origen: 'Juscamaita', destino: 'Atocongo', motivo: 'TRASLADO_ENTRE_ESTABLECIMIENTOS', descripcionMercancia: 'Carbón Trujillo', pesoBrutoKg: 24300, diasAtras: 1, estado: 'GENERADO' }
];

const dias = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

// Documentos con vencimiento (algunos ya casi vencen, para que la
// pestaña "Vencimientos" del prototipo muestre algo).
const DOCS_UNIDAD = [
  { placa: 'ABC-756', tipoDocumento: 'SOAT', numeroDocumento: 'SOAT-ABC756', fechaVencimiento: dias(12) },
  { placa: 'ABC-756', tipoDocumento: 'REVISION_TECNICA', numeroDocumento: 'RT-ABC756', fechaVencimiento: dias(200) },
  { placa: 'CDF-903', tipoDocumento: 'SOAT', numeroDocumento: 'SOAT-CDF903', fechaVencimiento: dias(90) },
  { placa: 'D2W-118', tipoDocumento: 'SOAT', numeroDocumento: 'SOAT-D2W118', fechaVencimiento: dias(-5) }
];
const DOCS_CHOFER = [
  { dni: '45678912', tipoDocumento: 'LICENCIA_CONDUCIR', categoriaLicencia: 'A-IIIc', numeroDocumento: 'Q45678912', fechaVencimiento: dias(400) },
  { dni: '45678912', tipoDocumento: 'CERTIFICADO_MEDICO', numeroDocumento: 'CM-45678912', fechaVencimiento: dias(20) },
  { dni: '47001122', tipoDocumento: 'LICENCIA_CONDUCIR', categoriaLicencia: 'A-IIIb', numeroDocumento: 'Q47001122', fechaVencimiento: dias(150) }
];

function esperarEmision(ticketService, datos) {
  return new Promise((resolve, reject) => {
    ticketService.crearTicket(datos, (t) => resolve(t)).catch(reject);
  });
}

(async () => {
  await prepararEsquema(); // rol superadmin, secuencia, etc.

  // --- Empresa ---
  let { rows } = await pool.query('select id, razon_social from empresas where ruc = $1', [EMPRESA.ruc]);
  if (rows.length === 0) {
    ({ rows } = await pool.query(
      'insert into empresas (ruc, razon_social) values ($1, $2) returning id, razon_social',
      [EMPRESA.ruc, EMPRESA.razonSocial]
    ));
    console.log('empresa creada:', rows[0].razon_social);
  } else {
    console.log('empresa ya existía:', rows[0].razon_social);
  }
  const empresaId = rows[0].id;

  // --- Usuario para ingresar al prototipo ---
  const usuariosRepo = new UsuariosRepositorioPostgres();
  const auth = new AuthService(usuariosRepo);
  let usuario = await usuariosRepo.buscarPorUsername(USUARIO.username);
  if (!usuario) {
    await auth.registrarUsuario({ empresaId, ...USUARIO });
    usuario = await usuariosRepo.buscarPorUsername(USUARIO.username);
    console.log('usuario creado:', USUARIO.username);
  } else {
    console.log('usuario ya existía:', USUARIO.username);
  }
  const adminId = usuario.id;

  // --- Unidades ---
  const unidadesRepo = new UnidadesRepositorioPostgres();
  const unidades = new UnidadesService(unidadesRepo);
  for (const u of UNIDADES) {
    const existe = await unidadesRepo.buscarPorPlaca(u.placa);
    if (existe) { console.log('unidad ya existía:', u.placa); continue; }
    await unidades.registrarUnidad({ empresaId, ...u });
    console.log('unidad creada:', u.placa);
  }

  // --- Choferes ---
  const choferesRepo = new ChoferesRepositorioPostgres();
  const choferes = new ChoferesService(choferesRepo);
  for (const c of CHOFERES) {
    const existe = await choferesRepo.buscarPorDni(empresaId, c.dni);
    if (existe) { console.log('chofer ya existía:', c.dni); continue; }
    await choferes.registrarChofer({ empresaId, ...c });
    console.log('chofer creado:', c.dni, '-', c.apellidos);
  }

  // --- Documentos (idempotente por unidad/chofer + tipo) ---
  const documentosRepo = new DocumentosRepositorioPostgres();
  const documentos = new DocumentosService({
    repositorioDocumentos: documentosRepo,
    repositorioUnidades: unidadesRepo,
    repositorioChoferes: choferesRepo
  });
  const mapaUnidades = Object.fromEntries((await unidades.listarUnidades(empresaId)).map((u) => [u.placa, u.id]));
  const mapaChoferes = Object.fromEntries((await choferes.listarChoferes(empresaId)).map((c) => [c.dni, c.id]));

  for (const d of DOCS_UNIDAD) {
    const unidadId = mapaUnidades[d.placa];
    if (!unidadId) continue;
    const yaTiene = (await documentosRepo.listarDeUnidad(unidadId)).some((x) => x.tipoDocumento === d.tipoDocumento);
    if (yaTiene) { console.log(`doc unidad ya existía: ${d.placa} ${d.tipoDocumento}`); continue; }
    await documentos.agregarAUnidad(empresaId, unidadId, d);
    console.log(`doc unidad creado: ${d.placa} ${d.tipoDocumento} (vence ${d.fechaVencimiento})`);
  }
  for (const d of DOCS_CHOFER) {
    const choferId = mapaChoferes[d.dni];
    if (!choferId) continue;
    const yaTiene = (await documentosRepo.listarDeChofer(choferId)).some((x) => x.tipoDocumento === d.tipoDocumento);
    if (yaTiene) { console.log(`doc chofer ya existía: ${d.dni} ${d.tipoDocumento}`); continue; }
    await documentos.agregarAChofer(empresaId, choferId, d);
    console.log(`doc chofer creado: ${d.dni} ${d.tipoDocumento} (vence ${d.fechaVencimiento})`);
  }

  // --- Tickets (solo si la empresa aún no tiene ninguno) ---
  const ticketsRepo = new TicketsRepositorioPostgres();
  await ticketsRepo.asegurarEsquema();
  const { rows: cuenta } = await pool.query(
    'select count(*)::int as n from tickets_traslado where empresa_id = $1', [empresaId]
  );
  if (cuenta[0].n > 0) {
    console.log(`la empresa ya tiene ${cuenta[0].n} ticket(s); no se crean más`);
  } else {
    // Emisor "demo" sin rechazos para que la siembra sea predecible.
    const { EmisorGREDemo } = require('./src/gre/EmisorGREDemo');
    const ticketService = new TicketService({
      emisorGRE: new EmisorGREDemo({ serie: 'T001', correlativoInicial: 160, probabilidadRechazo: 0, demoraMs: 20 }),
      repositorioTickets: ticketsRepo,
      repositorioUnidades: unidadesRepo,
      repositorioChoferes: choferesRepo,
      repositorioDocumentos: documentosRepo
    });
    for (const t of TICKETS) {
      const creado = await esperarEmision(ticketService, {
        empresaId,
        unidadId: mapaUnidades[t.placa],
        choferId: mapaChoferes[t.dni],
        creadoPor: adminId,
        origen: t.origen, destino: t.destino, motivo: t.motivo,
        descripcionMercancia: t.descripcionMercancia, pesoBrutoKg: t.pesoBrutoKg
      });

      // Backdatea y fija el estado directamente (es data de demo; en uso
      // real esto lo hace el operador con "avanzar").
      const creadoEn = `now() - interval '${t.diasAtras} days'`;
      const sets = [`creado_en = ${creadoEn}`, `estado_operativo = '${t.estado}'`];
      if (t.horasTransito != null) sets.push(`fecha_traslado = ${creadoEn} + interval '${t.horasTransito} hours'`);
      if (t.estado === 'ENTREGADO') sets.push(`fecha_entrega = ${creadoEn} + interval '${(t.horasTransito || 0) + t.horasEntrega} hours'`);
      await pool.query(`update tickets_traslado set ${sets.join(', ')} where id = $1`, [creado.id]);

      console.log(`ticket: ${creado.codigoInterno}  ${creado.origen}→${creado.destino}  ${t.estado}  (hace ${t.diasAtras} d)`);
    }
  }

  // --- Superadmin (ve todas las empresas) ---
  if (!(await usuariosRepo.buscarPorUsername(SUPERADMIN.username))) {
    await auth.registrarUsuario({ ...SUPERADMIN, rol: 'superadmin' });
    console.log('superadmin creado:', SUPERADMIN.username);
  } else {
    console.log('superadmin ya existía:', SUPERADMIN.username);
  }

  // --- Segunda empresa (para que el dashboard tenga otra opción) ---
  const empresasRepo = new EmpresasRepositorioPostgres();
  const empresasSvc = new EmpresasService({ repositorioEmpresas: empresasRepo, authService: auth });
  let empresa2 = await empresasRepo.buscarPorRuc(EMPRESA_2.ruc);
  if (!empresa2) {
    const creada = await empresasSvc.crearConAdmin({
      ruc: EMPRESA_2.ruc, razonSocial: EMPRESA_2.razonSocial, admin: EMPRESA_2.admin
    });
    empresa2 = creada.empresa;
    console.log('empresa 2 creada:', empresa2.razonSocial, '/ admin', EMPRESA_2.admin.username);
  } else {
    console.log('empresa 2 ya existía:', EMPRESA_2.razonSocial);
    if (!(await usuariosRepo.buscarPorUsername(EMPRESA_2.admin.username))) {
      await auth.registrarUsuario({ empresaId: empresa2.id, ...EMPRESA_2.admin, rol: 'admin_empresa' });
      console.log('  admin', EMPRESA_2.admin.username, 'recreado');
    }
  }
  for (const u of EMPRESA_2.unidades) {
    if (!(await unidadesRepo.buscarPorPlaca(u.placa))) {
      await unidades.registrarUnidad({ empresaId: empresa2.id, ...u });
      console.log('  unidad empresa 2:', u.placa);
    }
  }
  for (const c of EMPRESA_2.choferes) {
    if (!(await choferesRepo.buscarPorDni(empresa2.id, c.dni))) {
      await choferes.registrarChofer({ empresaId: empresa2.id, ...c });
      console.log('  chofer empresa 2:', c.dni);
    }
  }

  console.log('\nListo. Ingresá en http://localhost:3001');
  console.log(`  Empresa (admin):  ${USUARIO.username} / ${USUARIO.password}`);
  console.log(`  Segunda empresa:  ${EMPRESA_2.admin.username} / ${EMPRESA_2.admin.password}`);
  console.log(`  Superadmin:       ${SUPERADMIN.username} / ${SUPERADMIN.password}`);

  await pool.end();
})().catch((error) => {
  console.error('[error]', error.message);
  process.exit(1);
});
