// Ejecutar con:  node resembrar-demo-catalogos.js
//
// Adapta los tickets YA EXISTENTES de las dos empresas de demo a los
// catálogos nuevos del ticket (src/tickets/catalogos.js):
//   - mercancía  -> una de las 5 del catálogo
//   - origen     -> uno de los 4 centros de origen
//   - destino    -> uno de los 3 destinos
// Además ajusta el peso a un rango de carga a granel (materiales pesados),
// para que el dashboard de "toneladas por material" quede coherente.
//
// El reparto es al azar pero con semilla fija: correr el script dos veces
// deja exactamente los mismos valores. Solo toca las empresas de demo.
//
// Se limpia junto con el resto:  node borrar-datos-demo.js

require('dotenv').config();
const { pool } = require('./src/db/pool');
const { MERCANCIAS, CENTROS_ORIGEN, DESTINOS } = require('./src/tickets/catalogos');

const RUCS_DEMO = ['20548712369', '20600123456'];

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

(async () => {
  const { rows: empresas } = await pool.query(
    'select id from empresas where ruc = any($1)', [RUCS_DEMO]
  );
  if (empresas.length === 0) {
    console.log('(no hay empresas de demo; corré antes "node sembrar-datos.js")');
    await pool.end();
    return;
  }
  const ids = empresas.map((e) => e.id);

  // Orden estable para que la semilla reparta siempre igual.
  const { rows: tickets } = await pool.query(
    `select id from tickets_traslado where empresa_id = any($1) order by codigo_interno`,
    [ids]
  );

  for (const t of tickets) {
    await pool.query(
      `update tickets_traslado
         set descripcion_mercancia = $1, origen = $2, destino = $3, peso_bruto_kg = $4
       where id = $5`,
      [elegir(MERCANCIAS), elegir(CENTROS_ORIGEN), elegir(DESTINOS), entero(18000, 32000), t.id]
    );
  }
  console.log(`${tickets.length} tickets adaptados a los catálogos nuevos.`);

  const resumen = async (col, titulo) => {
    const { rows } = await pool.query(
      `select ${col} v, count(*)::int n from tickets_traslado
       where empresa_id = any($1) group by 1 order by 2 desc`, [ids]
    );
    console.log(`\n${titulo}`);
    console.table(rows);
  };
  await resumen('descripcion_mercancia', 'Mercancía');
  await resumen('origen', 'Centro de origen');
  await resumen('destino', 'Destino');

  await pool.end();
})().catch((error) => {
  console.error('[error]', error.message);
  process.exit(1);
});
