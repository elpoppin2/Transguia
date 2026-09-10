// Ejecutar con:  node borrar-datos-demo.js
//
// Borra TODO lo que siembra sembrar-datos.js para la empresa de demo
// (RUC 20548712369): sus tickets (con sus emisiones e historial), sus
// unidades, sus choferes y el usuario "andina".
//
// Por defecto NO borra la empresa. Para borrarla también:
//   node borrar-datos-demo.js --empresa

require('dotenv').config();
const { pool } = require('./src/db/pool');

const RUC_DEMO = '20548712369';
const BORRAR_EMPRESA = process.argv.includes('--empresa');

(async () => {
  const { rows } = await pool.query('select id, razon_social from empresas where ruc = $1', [RUC_DEMO]);
  if (rows.length === 0) {
    console.log('No existe la empresa de demo; no hay nada que borrar.');
    await pool.end();
    return;
  }
  const empresaId = rows[0].id;
  console.log('Empresa de demo:', rows[0].razon_social, `(${empresaId})`);

  const { rows: tickets } = await pool.query(
    'select id from tickets_traslado where empresa_id = $1', [empresaId]
  );
  for (const t of tickets) {
    await pool.query('delete from emisiones_gre where ticket_id = $1', [t.id]);
    await pool.query('delete from historial_estado_ticket where ticket_id = $1', [t.id]);
  }
  const borrados = await pool.query('delete from tickets_traslado where empresa_id = $1', [empresaId]);
  console.log(`tickets borrados: ${borrados.rowCount}`);

  const u = await pool.query('delete from unidades where empresa_id = $1', [empresaId]);
  console.log(`unidades borradas: ${u.rowCount}`);

  const c = await pool.query('delete from choferes where empresa_id = $1', [empresaId]);
  console.log(`choferes borrados: ${c.rowCount}`);

  const us = await pool.query('delete from usuarios where empresa_id = $1', [empresaId]);
  console.log(`usuarios borrados: ${us.rowCount}`);

  if (BORRAR_EMPRESA) {
    await pool.query('delete from empresas where id = $1', [empresaId]);
    console.log('empresa borrada');
  } else {
    console.log('empresa conservada (usa --empresa para borrarla también)');
  }

  await pool.end();
})().catch((error) => {
  console.error('[error]', error.message);
  process.exit(1);
});
