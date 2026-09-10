const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error(
    'Falta DATABASE_URL en tu archivo .env. Copia .env.example a .env ' +
    'y complétalo con tu cadena de conexión real de Supabase.'
  );
}

// En serverless (Vercel) cada instancia atiende de a una petición y se
// congela; conviene un pool chico y que suelte las conexiones rápido.
// Para eso, además, en Vercel hay que usar la cadena "Transaction pooler"
// de Supabase (puerto 6543) en DATABASE_URL — ver DESPLIEGUE.md.
const esServerless = !!process.env.VERCEL;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // necesario para conectarse a Supabase
  max: esServerless ? 1 : 10,
  idleTimeoutMillis: esServerless ? 10000 : 30000,
  // El transaction pooler no admite prepared statements con nombre.
  ...(esServerless ? { statement_timeout: 15000 } : {})
});

/**
 * Ejecuta varias consultas dentro de una sola transacción: si cualquiera
 * falla, se deshacen todas (rollback). Se usa cuando un ticket toca
 * varias tablas a la vez (tickets_traslado + historial + emisiones_gre)
 * y no queremos que quede a medias.
 *
 * @param {(cliente: import('pg').PoolClient) => Promise<any>} trabajo
 */
async function enTransaccion(trabajo) {
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    const resultado = await trabajo(cliente);
    await cliente.query('commit');
    return resultado;
  } catch (error) {
    await cliente.query('rollback');
    throw error;
  } finally {
    cliente.release();
  }
}

module.exports = { pool, enTransaccion };
