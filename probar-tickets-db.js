// Ejecutar con:  node probar-tickets-db.js
//
// Comprueba que crear un ticket, emitir su GRE (simulada), listarlo y
// avanzar su estado ya funciona contra la base de datos real de
// Supabase, escribiendo en las 3 tablas (tickets_traslado,
// emisiones_gre, historial_estado_ticket).
//
// Usa el emisor "demo" configurado para NUNCA rechazar, así la prueba es
// predecible. Al final borra todo lo que creó, para no dejar basura.

require('dotenv').config();
const { pool } = require('./src/db/pool');
const { EmisorGREDemo } = require('./src/gre/EmisorGREDemo');
const { TicketService } = require('./src/tickets/ticketService');
const { TicketsRepositorioPostgres } = require('./src/tickets/ticketsRepoPostgres');
const { UnidadesService } = require('./src/unidades/unidadesService');
const { UnidadesRepositorioPostgres } = require('./src/unidades/unidadesRepoPostgres');
const { ChoferesService } = require('./src/choferes/choferesService');
const { ChoferesRepositorioPostgres } = require('./src/choferes/choferesRepoPostgres');

// Pequeña ayuda: espera a que el callback onCambio del ticket se dispare
// (es cuando la emisión de la GRE terminó).
function esperarEmision(ticketService, datos) {
  return new Promise((resolve, reject) => {
    ticketService.crearTicket(datos, (actualizado) => resolve(actualizado)).catch(reject);
  });
}

(async () => {
  const { rows: empresas } = await pool.query('select id, razon_social from empresas limit 1');
  if (empresas.length === 0) {
    console.log('No hay ninguna empresa registrada. Corre primero probar-conexion-db.js.');
    await pool.end();
    return;
  }
  const empresa = empresas[0];
  console.log('[empresa]', empresa.razon_social);

  const unidadesRepo = new UnidadesRepositorioPostgres();
  const choferesRepo = new ChoferesRepositorioPostgres();
  const ticketsRepo = new TicketsRepositorioPostgres();
  await ticketsRepo.asegurarEsquema();

  const unidades = new UnidadesService(unidadesRepo);
  const choferes = new ChoferesService(choferesRepo);

  // Unidad y chofer de prueba, frescos y activos.
  const s = String(Date.now()).slice(-6);
  const unidad = await unidades.registrarUnidad({
    empresaId: empresa.id,
    placa: `TT${s[0]}-${s.slice(1, 4)}`,
    marca: 'Scania', modelo: 'R 450', anioFabricacion: 2022,
    categoriaMtc: 'N3', configuracionVehicular: 'T3S3'
  });
  const chofer = await choferes.registrarChofer({
    empresaId: empresa.id,
    dni: ('4' + s + '0').slice(0, 8),
    nombres: 'Pedro', apellidos: 'Rojas Díaz'
  });
  console.log('[unidad de prueba]', unidad.placa, '  [chofer de prueba]', chofer.dni);

  const ticketService = new TicketService({
    emisorGRE: new EmisorGREDemo({ serie: 'T999', correlativoInicial: 1, probabilidadRechazo: 0, demoraMs: 200 }),
    repositorioTickets: ticketsRepo,
    repositorioUnidades: unidadesRepo,
    repositorioChoferes: choferesRepo,
    proveedorGre: 'demo'
  });

  const ticket = await esperarEmision(ticketService, {
    empresaId: empresa.id,
    unidadId: unidad.id,
    choferId: chofer.id,
    origen: 'Lima',
    destino: 'Cusco',
    motivo: 'Traslado entre establecimientos',
    descripcionMercancia: 'Maquinaria y equipos',
    pesoBrutoKg: 5400
  });
  console.log('[ticket creado en Supabase, de verdad]', {
    codigoInterno: ticket.codigoInterno,
    motivo: ticket.motivo,
    estadoSunat: ticket.estadoSunat,
    gre: ticket.serieCorrelativoGre
  });

  const lista = await ticketService.listarTickets(empresa.id);
  console.log(`[tickets de la empresa: ${lista.length}] el más reciente es ${lista[0].codigoInterno}`);

  const enTransito = await ticketService.avanzarEstado(ticket.id, 'EN_TRANSITO');
  console.log('[avance] estado_operativo:', enTransito.estadoOperativo, '| fecha_traslado:', enTransito.fechaTraslado);

  const entregado = await ticketService.avanzarEstado(ticket.id, 'ENTREGADO');
  console.log('[avance] estado_operativo:', entregado.estadoOperativo, '| fecha_entrega:', entregado.fechaEntrega);

  const { rows: hist } = await pool.query(
    'select estado_anterior, estado_nuevo from historial_estado_ticket where ticket_id = $1 order by creado_en',
    [ticket.id]
  );
  console.log('[historial de estados]', hist.map((h) => `${h.estado_anterior || '∅'}→${h.estado_nuevo}`).join('  '));

  // Debe rechazar un ticket con una unidad que no existe.
  try {
    await ticketService.crearTicket({
      empresaId: empresa.id,
      unidadId: '00000000-0000-0000-0000-000000000000',
      choferId: chofer.id,
      origen: 'A', destino: 'B', descripcionMercancia: 'Otros bienes', pesoBrutoKg: 1
    });
    console.log('[ERROR] debió rechazar la unidad inexistente');
  } catch (error) {
    console.log('[OK] rechazó la unidad inexistente:', error.message);
  }

  // Debe bloquear "avanzar" cuando la GRE fue RECHAZADA.
  const serviceRechaza = new TicketService({
    emisorGRE: new EmisorGREDemo({ probabilidadRechazo: 1, demoraMs: 200 }),
    repositorioTickets: ticketsRepo,
    repositorioUnidades: unidadesRepo,
    repositorioChoferes: choferesRepo,
    proveedorGre: 'demo'
  });
  const ticketRechazado = await esperarEmision(serviceRechaza, {
    empresaId: empresa.id,
    unidadId: unidad.id,
    choferId: chofer.id,
    origen: 'Lima', destino: 'Piura', descripcionMercancia: 'Otros bienes', pesoBrutoKg: 3000
  });
  console.log('[ticket con GRE rechazada]', ticketRechazado.codigoInterno, '-', ticketRechazado.estadoSunat);
  try {
    await serviceRechaza.avanzarEstado(ticketRechazado.id, 'EN_TRANSITO');
    console.log('[ERROR] debió bloquear el avance sin GRE aceptada');
  } catch (error) {
    console.log('[OK] bloqueó el avance sin GRE aceptada:', error.message);
  }

  // Limpieza: borra los 2 tickets de prueba (y sus filas hijas) + la
  // unidad y el chofer de prueba.
  for (const id of [ticket.id, ticketRechazado.id]) {
    await pool.query('delete from emisiones_gre where ticket_id = $1', [id]);
    await pool.query('delete from historial_estado_ticket where ticket_id = $1', [id]);
    await pool.query('delete from tickets_traslado where id = $1', [id]);
  }
  await pool.query('delete from unidades where id = $1', [unidad.id]);
  await pool.query('delete from choferes where id = $1', [chofer.id]);
  console.log('[limpieza] tickets, unidad y chofer de prueba borrados de Supabase');

  await pool.end();
})().catch((error) => {
  console.error('[error inesperado]', error.message);
  process.exit(1);
});
