// Ejecutar con:  node probar-choferes-db.js
//
// Comprueba que registrar y listar CHOFERES ya funciona contra la base
// de datos real de Supabase, no en memoria. Mismo estilo que
// probar-conexion-db.js y probar-unidades-db.js.

require('dotenv').config();
const { pool } = require('./src/db/pool');
const { ChoferesService } = require('./src/choferes/choferesService');
const { ChoferesRepositorioPostgres } = require('./src/choferes/choferesRepoPostgres');

(async () => {
  const { rows: empresas } = await pool.query('select id, razon_social from empresas limit 1');
  if (empresas.length === 0) {
    console.log('No hay ninguna empresa registrada. Corre primero probar-conexion-db.js.');
    await pool.end();
    return;
  }
  const empresa = empresas[0];
  console.log('[empresa]', empresa.razon_social);

  const choferes = new ChoferesService(new ChoferesRepositorioPostgres());

  // DNI distinto en cada corrida para no chocar con la anterior.
  const dni = String(Date.now()).slice(-8);

  const creado = await choferes.registrarChofer({
    empresaId: empresa.id,
    dni,
    nombres: 'Juan Carlos',
    apellidos: 'Quispe Mamani'
  });
  console.log('[chofer creado en Supabase, de verdad] estado_registro =', creado.estadoRegistro,
    creado.estadoRegistro === 'PENDIENTE' ? '[OK: nace pendiente]' : '[ERROR: debió nacer pendiente]');

  const rechazado = await choferes.rechazarChofer(creado.id, 'Falta el brevete', { usuarioId: null });
  console.log('[rechazado]', rechazado.estadoRegistro, '-', rechazado.motivoRechazo);
  const aprobado = await choferes.aprobarChofer(creado.id, { usuarioId: null });
  console.log('[liberado]', aprobado.estadoRegistro,
    aprobado.estadoRegistro === 'APROBADA' && !aprobado.motivoRechazo ? '[OK]' : '[ERROR]');

  const lista = await choferes.listarChoferes(empresa.id);
  console.log(`[choferes de la empresa: ${lista.length}]`);
  console.log(lista.map((c) => `  ${c.dni}  ${c.apellidos}, ${c.nombres}${c.activo ? '' : '  [inactivo]'}`).join('\n'));

  const desactivado = await choferes.desactivarChofer(creado.id);
  console.log('[chofer desactivado (baja lógica, no se borra)]', { dni: desactivado.dni, activo: desactivado.activo });

  // Comprueba que rechaza un DNI repetido en la misma empresa.
  try {
    await choferes.registrarChofer({ empresaId: empresa.id, dni, nombres: 'X', apellidos: 'Y' });
    console.log('[ERROR] debió rechazar el DNI duplicado y no lo hizo');
  } catch (error) {
    console.log('[OK] rechazó el DNI duplicado:', error.message);
  }

  // Comprueba que rechaza un DNI con formato inválido.
  try {
    await choferes.registrarChofer({ empresaId: empresa.id, dni: '123', nombres: 'X', apellidos: 'Y' });
    console.log('[ERROR] debió rechazar el DNI corto y no lo hizo');
  } catch (error) {
    console.log('[OK] rechazó el DNI mal formado:', error.message);
  }

  await pool.end();
})().catch((error) => {
  console.error('[error inesperado]', error.message);
  process.exit(1);
});
