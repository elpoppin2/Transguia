// Ejecutar con:  node borrar-datos-demo.js
//
// Borra TODO lo que siembra sembrar-datos.js: las dos empresas de demo
// (con sus tickets, documentos, unidades, choferes y usuarios) y el
// usuario superadmin "super".
//
// Por defecto NO borra las empresas (fila `empresas`). Para borrarlas:
//   node borrar-datos-demo.js --empresa

require('dotenv').config();
const { pool } = require('./src/db/pool');

const RUCS_DEMO = ['20548712369', '20600123456'];
const SUPERADMIN = 'super';
const BORRAR_EMPRESA = process.argv.includes('--empresa');

async function limpiarEmpresa(empresaId, nombre) {
  const { rows: tickets } = await pool.query(
    'select id from tickets_traslado where empresa_id = $1', [empresaId]
  );
  for (const t of tickets) {
    await pool.query('delete from emisiones_gre where ticket_id = $1', [t.id]);
    await pool.query('delete from historial_estado_ticket where ticket_id = $1', [t.id]);
  }
  const tk = await pool.query('delete from tickets_traslado where empresa_id = $1', [empresaId]);
  await pool.query('delete from documentos_unidad where unidad_id in (select id from unidades where empresa_id = $1)', [empresaId]);
  await pool.query('delete from documentos_chofer where chofer_id in (select id from choferes where empresa_id = $1)', [empresaId]);
  const un = await pool.query('delete from unidades where empresa_id = $1', [empresaId]);
  const ch = await pool.query('delete from choferes where empresa_id = $1', [empresaId]);
  const us = await pool.query('delete from usuarios where empresa_id = $1', [empresaId]);
  console.log(`${nombre}: ${tk.rowCount} tickets, ${un.rowCount} unidades, ${ch.rowCount} choferes, ${us.rowCount} usuarios`);
  if (BORRAR_EMPRESA) {
    await pool.query('delete from empresas where id = $1', [empresaId]);
    console.log(`  empresa borrada`);
  }
}

(async () => {
  for (const ruc of RUCS_DEMO) {
    const { rows } = await pool.query('select id, razon_social from empresas where ruc = $1', [ruc]);
    if (rows.length === 0) { console.log(`(RUC ${ruc}: no existe)`); continue; }
    await limpiarEmpresa(rows[0].id, rows[0].razon_social);
  }

  const sa = await pool.query('delete from usuarios where username = $1', [SUPERADMIN]);
  console.log(`superadmin borrado: ${sa.rowCount}`);

  if (!BORRAR_EMPRESA) console.log('\nempresas conservadas (usa --empresa para borrarlas también)');

  await pool.end();
})().catch((error) => {
  console.error('[error]', error.message);
  process.exit(1);
});
