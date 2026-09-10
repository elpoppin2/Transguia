// Ejecutar con:  node remapear-mercancias-demo.js
//
// Reasigna la "descripción de mercancía" de los tickets de las dos
// empresas de demo al catálogo fijo nuevo (src/tickets/mercancias.js), de
// modo que el dashboard agrupe "toneladas por material" sin duplicados.
//
// Los tickets viejos se sembraron con textos libres ("Cemento en bolsas",
// "Repuestos industriales", …); acá se traducen a la categoría del
// catálogo. Lo que no reconozca queda como "Otros bienes".
//
// Es idempotente: si ya están traducidos, no cambia nada. Solo toca las
// empresas de demo (por RUC).

require('dotenv').config();
const { pool } = require('./src/db/pool');
const { MERCANCIAS, normalizarMercancia } = require('./src/tickets/mercancias');

const RUCS_DEMO = ['20548712369', '20600123456'];

// Textos libres usados por sembrar-datos.js / sembrar-volumen.js (versiones
// anteriores) y su equivalente en el catálogo.
const EQUIVALENCIAS = {
  'Repuestos industriales': 'Repuestos y autopartes',
  'Maquinaria agrícola': 'Maquinaria y equipos',
  'Alimentos envasados': 'Abarrotes y consumo masivo',
  'Productos de consumo masivo': 'Abarrotes y consumo masivo',
  'Cemento en bolsas': 'Cemento y agregados',
  'Electrodomésticos': 'Electrodomésticos y línea blanca',
  'Papel y cartón': 'Papel, cartón y editorial',
  'Insumos químicos': 'Insumos y productos químicos',
  'Equipos de cómputo': 'Maquinaria y equipos'
};

(async () => {
  const { rows: empresas } = await pool.query(
    'select id, razon_social from empresas where ruc = any($1)', [RUCS_DEMO]
  );
  if (empresas.length === 0) {
    console.log('(no hay empresas de demo; corré antes "node sembrar-datos.js")');
    await pool.end();
    return;
  }
  const ids = empresas.map((e) => e.id);

  const { rows: actuales } = await pool.query(
    `select distinct descripcion_mercancia as m from tickets_traslado where empresa_id = any($1)`,
    [ids]
  );

  let cambios = 0;
  for (const { m } of actuales) {
    const canon = normalizarMercancia(m) || EQUIVALENCIAS[m] || 'Otros bienes';
    if (canon === m) continue;
    const r = await pool.query(
      `update tickets_traslado set descripcion_mercancia = $1
       where empresa_id = any($2) and descripcion_mercancia = $3`,
      [canon, ids, m]
    );
    console.log(`  "${m}" -> "${canon}"  (${r.rowCount} ticket/s)`);
    cambios += r.rowCount;
  }

  if (cambios === 0) {
    console.log('Nada que cambiar: las mercancías ya están en el catálogo.');
  } else {
    console.log(`\n${cambios} tickets actualizados.`);
    const { rows } = await pool.query(
      `select descripcion_mercancia m, count(*)::int n
       from tickets_traslado where empresa_id = any($1)
       group by 1 order by 2 desc`, [ids]
    );
    console.table(rows);
  }

  // Aviso si algo quedó fuera del catálogo (no debería).
  const fuera = (await pool.query(
    `select distinct descripcion_mercancia m from tickets_traslado where empresa_id = any($1)`,
    [ids]
  )).rows.filter((r) => !MERCANCIAS.includes(r.m));
  if (fuera.length) console.log('[aviso] fuera del catálogo:', fuera.map((r) => r.m));

  await pool.end();
})().catch((error) => {
  console.error('[error]', error.message);
  process.exit(1);
});
