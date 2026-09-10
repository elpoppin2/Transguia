const { pool } = require('./pool');

/**
 * Ajustes de esquema que el backend aplica solo al arrancar (todos
 * idempotentes: se pueden correr muchas veces sin efecto). Evita tener
 * que entrar al SQL Editor de Supabase para cambios chicos.
 *
 * Lo grande (las 10 tablas) sigue en transguia-schema.sql.
 */
const PASOS = [
  // Correlativo del código interno de ticket (TCK-000001).
  `create sequence if not exists transguia_ticket_codigo_seq`,

  // Rol de plataforma: ve todas las empresas (dashboard a selección).
  `alter type rol_usuario add value if not exists 'superadmin'`,

  // El superadmin no pertenece a ninguna empresa.
  `alter table usuarios alter column empresa_id drop not null`
];

let listo = null;

async function prepararEsquema() {
  if (listo) return listo;
  listo = (async () => {
    for (const sql of PASOS) {
      await pool.query(sql);
    }
  })();
  return listo;
}

module.exports = { prepararEsquema };
