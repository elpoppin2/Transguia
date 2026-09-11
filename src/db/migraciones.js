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
  `alter table usuarios alter column empresa_id drop not null`,

  // --- Unidades: ficha ampliada (dueño, transportista, técnica, medidas) ---
  // Los únicos obligatorios pasan a ser placa, ruc_propietario y
  // dni_transportista; el resto se puede completar después.
  `alter table unidades alter column marca drop not null`,
  `alter table unidades alter column modelo drop not null`,
  `alter table unidades alter column categoria_mtc drop not null`,
  `alter table unidades alter column configuracion_vehicular drop not null`,
  `alter table unidades add column if not exists ruc_propietario char(11)`,
  `alter table unidades add column if not exists nombre_propietario text`,
  `alter table unidades add column if not exists direccion_propietario text`,
  `alter table unidades add column if not exists dni_transportista char(8)`,
  `alter table unidades add column if not exists departamento text`,
  `alter table unidades add column if not exists provincia text`,
  `alter table unidades add column if not exists distrito text`,
  `alter table unidades add column if not exists tipo_vehiculo text`,
  `alter table unidades add column if not exists nro_ejes smallint`,
  `alter table unidades add column if not exists rodada_eje_delantero text`,
  `alter table unidades add column if not exists rodada_c1 text`,
  `alter table unidades add column if not exists rodada_c2 text`,
  `alter table unidades add column if not exists peso_seco_kg numeric(10,2)`,
  `alter table unidades add column if not exists tolva_cerrada boolean`,
  `alter table unidades add column if not exists carreta_con_piston boolean`,
  `alter table unidades add column if not exists unidad_a_gas boolean`,
  `alter table unidades add column if not exists forma_apertura text`,
  `alter table unidades add column if not exists altura_m numeric(5,2)`,
  `alter table unidades add column if not exists ancho_m numeric(5,2)`,
  `alter table unidades add column if not exists largo_m numeric(5,2)`,
  `alter table unidades add column if not exists altura_plataforma_m numeric(5,2)`,

  // --- Unidades: aprobación de la plataforma ---
  // El admin de empresa registra la unidad y queda PENDIENTE; el
  // superadmin la libera (APROBADA) o la rechaza con motivo (RECHAZADA).
  // Solo las APROBADAS se pueden usar para emitir tickets.
  `alter table unidades add column if not exists estado_registro text`,
  `update unidades set estado_registro = 'APROBADA' where estado_registro is null`,
  `alter table unidades alter column estado_registro set default 'PENDIENTE'`,
  `alter table unidades alter column estado_registro set not null`,
  `alter table unidades add column if not exists motivo_rechazo text`,
  `alter table unidades add column if not exists revisado_por uuid`,
  `alter table unidades add column if not exists revisado_en timestamptz`,

  // --- Choferes: ficha ampliada + aprobación de la plataforma ---
  // El "dni" pasa a ser el número de documento de identidad de cualquier
  // tipo (DNI / carné de extranjería / pasaporte), así que se ensancha.
  `alter table choferes alter column dni type varchar(15) using trim(dni)`,
  `alter table choferes alter column nombres drop not null`,
  `alter table choferes alter column apellidos drop not null`,
  `alter table choferes add column if not exists tipo_doc_identidad text`,
  `update choferes set tipo_doc_identidad = 'DNI' where tipo_doc_identidad is null`,
  `alter table choferes alter column tipo_doc_identidad set default 'DNI'`,
  `alter table choferes alter column tipo_doc_identidad set not null`,
  `alter table choferes add column if not exists apellido_paterno text`,
  `alter table choferes add column if not exists apellido_materno text`,
  `alter table choferes add column if not exists primer_nombre text`,
  `alter table choferes add column if not exists segundo_nombre text`,
  // Parte el nombre viejo (nombres/apellidos) en las 4 columnas nuevas.
  `update choferes set
     apellido_paterno = split_part(apellidos, ' ', 1),
     apellido_materno = nullif(btrim(substr(apellidos, length(split_part(apellidos, ' ', 1)) + 2)), ''),
     primer_nombre    = split_part(nombres, ' ', 1),
     segundo_nombre   = nullif(btrim(substr(nombres, length(split_part(nombres, ' ', 1)) + 2)), '')
   where apellido_paterno is null and coalesce(apellidos, nombres) is not null`,
  `alter table choferes add column if not exists celular text`,
  `alter table choferes add column if not exists departamento text`,
  `alter table choferes add column if not exists provincia text`,
  `alter table choferes add column if not exists distrito text`,
  `alter table choferes add column if not exists direccion text`,
  `alter table choferes add column if not exists estado_registro text`,
  `update choferes set estado_registro = 'APROBADA' where estado_registro is null`,
  `alter table choferes alter column estado_registro set default 'PENDIENTE'`,
  `alter table choferes alter column estado_registro set not null`,
  `alter table choferes add column if not exists motivo_rechazo text`,
  `alter table choferes add column if not exists revisado_por uuid`,
  `alter table choferes add column if not exists revisado_en timestamptz`,

  // --- Documentos de unidad: adjuntar el PDF + 3 tipos nuevos ---
  // Al registrar una placa, la plataforma exige el PDF de SOAT, CITV,
  // brevete y DNI del transportista, y la constancia de categoría MTC.
  // Estos 3 últimos no tienen vencimiento (son solo el archivo), así que
  // fecha_vencimiento deja de ser obligatoria en general y pasa a
  // exigirse solo para los tipos que sí vencen.
  `alter type tipo_documento_unidad add value if not exists 'DNI_TRANSPORTISTA'`,
  `alter type tipo_documento_unidad add value if not exists 'BREVETE_TRANSPORTISTA'`,
  `alter type tipo_documento_unidad add value if not exists 'CATEGORIA_MTC'`,
  `alter table documentos_unidad alter column fecha_vencimiento drop not null`,
  `alter table documentos_unidad add column if not exists archivo bytea`,
  `alter table documentos_unidad add column if not exists archivo_nombre text`,
  `alter table documentos_unidad add column if not exists archivo_tipo text`,
  `do $$ begin
     alter table documentos_unidad add constraint chk_vencimiento_segun_tipo
       check (
         fecha_vencimiento is not null
         or tipo_documento in ('DNI_TRANSPORTISTA', 'BREVETE_TRANSPORTISTA', 'CATEGORIA_MTC')
       );
   exception when duplicate_object then null; end $$`,

  // --- Programación de viajes ---
  // Agendar de antemano qué unidad/chofer va a qué ruta un día dado, para
  // no chocar (misma unidad o chofer en dos viajes el mismo día). No
  // reemplaza al ticket: es un paso previo, opcional, a la emisión.
  `create table if not exists viajes_programados (
     id uuid primary key default gen_random_uuid(),
     empresa_id uuid not null references empresas(id) on delete cascade,
     unidad_id uuid not null references unidades(id) on delete restrict,
     chofer_id uuid not null references choferes(id) on delete restrict,
     fecha_programada date not null,
     origen text not null,
     destino text not null,
     descripcion_mercancia text,
     observaciones text,
     estado text not null default 'PROGRAMADO',
     motivo_cancelacion text,
     creado_por uuid references usuarios(id),
     creado_en timestamptz not null default now()
   )`,
  `do $$ begin
     alter table viajes_programados add constraint chk_estado_viaje_programado
       check (estado in ('PROGRAMADO', 'CUMPLIDO', 'CANCELADO'));
   exception when duplicate_object then null; end $$`,
  `create index if not exists idx_viajes_prog_empresa_fecha on viajes_programados(empresa_id, fecha_programada)`,
  `create index if not exists idx_viajes_prog_unidad on viajes_programados(unidad_id)`,
  `create index if not exists idx_viajes_prog_chofer on viajes_programados(chofer_id)`
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
