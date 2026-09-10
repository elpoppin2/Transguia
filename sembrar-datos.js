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
const { crearEmisorGRE } = require('./src/gre/crearEmisorGRE');
const { AuthService } = require('./src/auth/authService');
const { UsuariosRepositorioPostgres } = require('./src/auth/usuariosRepoPostgres');
const { UnidadesService } = require('./src/unidades/unidadesService');
const { UnidadesRepositorioPostgres } = require('./src/unidades/unidadesRepoPostgres');
const { ChoferesService } = require('./src/choferes/choferesService');
const { ChoferesRepositorioPostgres } = require('./src/choferes/choferesRepoPostgres');
const { TicketService } = require('./src/tickets/ticketService');
const { TicketsRepositorioPostgres } = require('./src/tickets/ticketsRepoPostgres');

const EMPRESA = { ruc: '20548712369', razonSocial: 'Transportes Andina S.A.C.' };
const USUARIO = { username: 'andina', password: 'demo2026seguro', nombreCompleto: 'María Andina', rol: 'admin_empresa' };

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

const TICKETS = [
  { placa: 'ABC-756', dni: '45678912', origen: 'Lima', destino: 'Arequipa', motivo: 'VENTA', descripcionMercancia: 'Repuestos industriales', pesoBrutoKg: 8200 },
  { placa: 'CDF-903', dni: '47001122', origen: 'Lima', destino: 'Trujillo', motivo: 'TRASLADO_ENTRE_ESTABLECIMIENTOS', descripcionMercancia: 'Materiales de construcción', pesoBrutoKg: 15000 }
];

function esperarEmision(ticketService, datos) {
  return new Promise((resolve, reject) => {
    ticketService.crearTicket(datos, (t) => resolve(t)).catch(reject);
  });
}

(async () => {
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
  const auth = new AuthService(new UsuariosRepositorioPostgres());
  const yaExiste = await new UsuariosRepositorioPostgres().buscarPorUsername(USUARIO.username);
  if (!yaExiste) {
    await auth.registrarUsuario({ empresaId, ...USUARIO });
    console.log('usuario creado:', USUARIO.username);
  } else {
    console.log('usuario ya existía:', USUARIO.username);
  }

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

  // --- Tickets (solo si la empresa aún no tiene ninguno) ---
  const ticketsRepo = new TicketsRepositorioPostgres();
  await ticketsRepo.asegurarEsquema();
  const { rows: cuenta } = await pool.query(
    'select count(*)::int as n from tickets_traslado where empresa_id = $1', [empresaId]
  );
  if (cuenta[0].n > 0) {
    console.log(`la empresa ya tiene ${cuenta[0].n} ticket(s); no se crean más`);
  } else {
    const ticketService = new TicketService({
      emisorGRE: crearEmisorGRE(),
      repositorioTickets: ticketsRepo,
      repositorioUnidades: unidadesRepo,
      repositorioChoferes: choferesRepo
    });
    const mapaU = Object.fromEntries((await unidades.listarUnidades(empresaId)).map((u) => [u.placa, u.id]));
    const mapaC = Object.fromEntries((await choferes.listarChoferes(empresaId)).map((c) => [c.dni, c.id]));
    for (const t of TICKETS) {
      const creado = await esperarEmision(ticketService, {
        empresaId,
        unidadId: mapaU[t.placa],
        choferId: mapaC[t.dni],
        origen: t.origen, destino: t.destino, motivo: t.motivo,
        descripcionMercancia: t.descripcionMercancia, pesoBrutoKg: t.pesoBrutoKg
      });
      console.log(`ticket creado: ${creado.codigoInterno}  ${creado.origen}→${creado.destino}  GRE ${creado.estadoSunat} ${creado.serieCorrelativoGre || ''}`);
    }
  }

  console.log('\nListo. Para el prototipo (transguia-prototipo.html):');
  console.log(`  Usuario:    ${USUARIO.username}`);
  console.log(`  Contraseña: ${USUARIO.password}`);
  console.log(`  Empresa ID: ${empresaId}`);

  await pool.end();
})().catch((error) => {
  console.error('[error]', error.message);
  process.exit(1);
});
