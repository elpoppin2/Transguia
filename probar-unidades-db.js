// Ejecutar con:  node probar-unidades-db.js
//
// Comprueba que registrar y listar UNIDADES (vehículos) ya funciona
// contra la base de datos real de Supabase, no en memoria. Mismo estilo
// que probar-conexion-db.js.

require('dotenv').config();
const { pool } = require('./src/db/pool');
const { UnidadesService } = require('./src/unidades/unidadesService');
const { UnidadesRepositorioPostgres } = require('./src/unidades/unidadesRepoPostgres');

(async () => {
  const { rows: empresas } = await pool.query('select id, razon_social from empresas limit 1');
  if (empresas.length === 0) {
    console.log('No hay ninguna empresa registrada. Corre primero probar-conexion-db.js.');
    await pool.end();
    return;
  }
  const empresa = empresas[0];
  console.log('[empresa]', empresa.razon_social);

  const unidades = new UnidadesService(new UnidadesRepositorioPostgres());

  // Placa distinta en cada corrida para no chocar con la anterior.
  const sufijo = String(Date.now()).slice(-3);
  const placa = `TG${sufijo[0]}-${sufijo}`;

  const creada = await unidades.registrarUnidad({
    empresaId: empresa.id,
    placa,
    rucPropietario: '20548712369',
    dniTransportista: '45678912',
    marca: 'Volvo',
    modelo: 'FH 460',
    anioFabricacion: 2021,
    categoriaMtc: 'N3',
    configuracionVehicular: 'T3S3',
    tipoVehiculo: 'Tracto',
    nroEjes: 3,
    pesoSecoKg: 14500,
    tolvaCerrada: 'NO'
  });
  console.log('[unidad creada en Supabase, de verdad] estado_registro =', creada.estadoRegistro,
    creada.estadoRegistro === 'PENDIENTE' ? '[OK: nace pendiente]' : '[ERROR: debió nacer pendiente]');

  // El superadmin la rechaza y después la libera.
  const rechazada = await unidades.rechazarUnidad(creada.id, 'Falta el N° de CITV', { usuarioId: null });
  console.log('[rechazada]', rechazada.estadoRegistro, '-', rechazada.motivoRechazo);
  const aprobada = await unidades.aprobarUnidad(creada.id, { usuarioId: null });
  console.log('[liberada]', aprobada.estadoRegistro,
    aprobada.estadoRegistro === 'APROBADA' && !aprobada.motivoRechazo ? '[OK]' : '[ERROR]');

  const lista = await unidades.listarUnidades(empresa.id);
  console.log(`[unidades de la empresa: ${lista.length}]`);
  console.log(lista.map((u) => `  ${u.placa}  ${u.marca} ${u.modelo}  (${u.categoriaMtc}, ${u.configuracionVehicular})${u.activo ? '' : '  [inactiva]'}`).join('\n'));

  const desactivada = await unidades.desactivarUnidad(creada.id);
  console.log('[unidad desactivada (baja lógica, no se borra)]', { placa: desactivada.placa, activo: desactivada.activo });

  // Comprobamos que rechaza una placa repetida.
  try {
    await unidades.registrarUnidad({
      empresaId: empresa.id,
      placa,
      rucPropietario: '20548712369',
      dniTransportista: '45678912',
      marca: 'X'
    });
    console.log('[ERROR] debió rechazar la placa duplicada y no lo hizo');
  } catch (error) {
    console.log('[OK] rechazó la placa duplicada:', error.message);
  }

  await pool.end();
})().catch((error) => {
  console.error('[error inesperado]', error.message);
  process.exit(1);
});
