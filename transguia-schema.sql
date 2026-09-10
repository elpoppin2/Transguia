-- ============================================================
-- TransGuía — modelo de datos persistente
-- PostgreSQL 14+
-- ============================================================
-- Convenciones:
--   - IDs como uuid (gen_random_uuid()), salvo catálogos con código natural.
--   - Nada de contraseñas en texto plano: password_hash con bcrypt/argon2.
--   - Los "vencimientos" viven en tablas aparte (documentos_unidad /
--     documentos_chofer), no como columnas fijas, para poder agregar
--     nuevos tipos de documento sin alterar el esquema.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Tipos enumerados ----------

create type rol_usuario as enum ('admin_empresa', 'operador');
create type categoria_mtc as enum ('N1', 'N2', 'N3');
create type categoria_licencia as enum ('A-I','A-IIa','A-IIb','A-IIIa','A-IIIb','A-IIIc');
create type tipo_documento_unidad as enum ('SOAT','REVISION_TECNICA','TARJETA_CIRCULACION','PERMISO_OPERACION','OTRO');
create type tipo_documento_chofer as enum ('LICENCIA_CONDUCIR','CERTIFICADO_MEDICO','OTRO');
create type estado_operativo_ticket as enum ('GENERADO','EN_TRANSITO','ENTREGADO','ANULADO');
create type estado_gre as enum ('ENVIANDO','ACEPTADO','RECHAZADO','OBSERVADO');
create type motivo_traslado as enum ('VENTA','TRASLADO_ENTRE_ESTABLECIMIENTOS','OTROS');
create type proveedor_gre as enum ('demo','pse','directo');

-- ---------- Catálogo: configuraciones vehiculares ----------

create table configuraciones_vehiculares (
  codigo text primary key,
  descripcion text not null,
  peso_bruto_maximo_kg integer,
  fuente_normativa text default 'RNV - DS 058-2003-MTC, Anexo IV'
);

comment on column configuraciones_vehiculares.peso_bruto_maximo_kg is
  'Completar con el valor exacto del Anexo IV (Pesos y Medidas) del Reglamento '
  'Nacional de Vehiculos vigente. No asumir valores: el unico limite que se '
  'puede afirmar sin verificar la tabla es el tope general del articulo 37 '
  '(48000 kg para cualquier combinacion vehicular).';

insert into configuraciones_vehiculares (codigo, descripcion) values
  ('C2',   'Camión de 2 ejes'),
  ('C3',   'Camión de 3 ejes'),
  ('C4',   'Camión de 4 ejes'),
  ('T2S1', 'Tracto de 2 ejes + semirremolque de 1 eje'),
  ('T2S2', 'Tracto de 2 ejes + semirremolque de 2 ejes'),
  ('T2S3', 'Tracto de 2 ejes + semirremolque de 3 ejes'),
  ('T3S1', 'Tracto de 3 ejes + semirremolque de 1 eje'),
  ('T3S2', 'Tracto de 3 ejes + semirremolque de 2 ejes'),
  ('T3S3', 'Tracto de 3 ejes + semirremolque de 3 ejes'),
  ('C2R2', 'Camión de 2 ejes + remolque de 2 ejes'),
  ('C2R3', 'Camión de 2 ejes + remolque de 3 ejes'),
  ('C3R2', 'Camión de 3 ejes + remolque de 2 ejes'),
  ('C3R3', 'Camión de 3 ejes + remolque de 3 ejes');

-- ---------- Empresas y usuarios ----------

create table empresas (
  id uuid primary key default gen_random_uuid(),
  ruc char(11) not null unique,
  razon_social text not null,
  direccion text,
  telefono text,
  email_contacto text,
  creado_en timestamptz not null default now()
);

create table usuarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  username text not null unique,
  password_hash text not null,
  nombre_completo text not null,
  rol rol_usuario not null default 'operador',
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  ultimo_acceso timestamptz
);

-- ---------- Unidades ----------

create table unidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  placa varchar(8) not null unique,

  -- Dueño del vehículo (se consulta por RUC).
  ruc_propietario char(11),
  nombre_propietario text,
  direccion_propietario text,

  -- Transportista responsable (se consulta por DNI) y su ubicación.
  dni_transportista char(8),
  departamento text,
  provincia text,
  distrito text,

  -- Ficha técnica.
  tipo_vehiculo text,
  marca text,
  modelo text,
  anio_fabricacion smallint,
  categoria_mtc categoria_mtc,
  configuracion_vehicular text references configuraciones_vehiculares(codigo),
  nro_ejes smallint,
  rodada_eje_delantero text,
  rodada_c1 text,
  rodada_c2 text,
  peso_seco_kg numeric(10,2),
  tolva_cerrada boolean,
  carreta_con_piston boolean,
  unidad_a_gas boolean,
  forma_apertura text,

  -- Dimensiones en metros.
  altura_m numeric(5,2),
  ancho_m numeric(5,2),
  largo_m numeric(5,2),
  altura_plataforma_m numeric(5,2),

  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create index idx_unidades_empresa on unidades(empresa_id);
-- El SOAT y el CITV (revisión técnica) con sus vencimientos van en
-- documentos_unidad, no como columnas de esta tabla.

create table documentos_unidad (
  id uuid primary key default gen_random_uuid(),
  unidad_id uuid not null references unidades(id) on delete cascade,
  tipo_documento tipo_documento_unidad not null,
  numero_documento text,
  fecha_emision date,
  fecha_vencimiento date not null,
  archivo_url text,
  creado_en timestamptz not null default now()
);
create index idx_documentos_unidad_vencimiento on documentos_unidad(fecha_vencimiento);
create index idx_documentos_unidad_unidad on documentos_unidad(unidad_id);

-- ---------- Choferes ----------

create table choferes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  dni char(8) not null,
  nombres text not null,
  apellidos text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (empresa_id, dni)
);
create index idx_choferes_empresa on choferes(empresa_id);

create table documentos_chofer (
  id uuid primary key default gen_random_uuid(),
  chofer_id uuid not null references choferes(id) on delete cascade,
  tipo_documento tipo_documento_chofer not null,
  numero_documento text,
  categoria_licencia categoria_licencia,
  fecha_emision date,
  fecha_vencimiento date not null,
  creado_en timestamptz not null default now()
);
create index idx_documentos_chofer_vencimiento on documentos_chofer(fecha_vencimiento);
create index idx_documentos_chofer_chofer on documentos_chofer(chofer_id);

alter table documentos_chofer add constraint chk_categoria_solo_licencia
  check (tipo_documento = 'LICENCIA_CONDUCIR' or categoria_licencia is null);

-- ---------- Tickets de traslado ----------

create table tickets_traslado (
  id uuid primary key default gen_random_uuid(),
  codigo_interno text not null unique,
  empresa_id uuid not null references empresas(id) on delete restrict,
  unidad_id uuid not null references unidades(id) on delete restrict,
  chofer_id uuid not null references choferes(id) on delete restrict,
  origen text not null,
  destino text not null,
  motivo motivo_traslado not null default 'VENTA',
  descripcion_mercancia text not null,
  peso_bruto_kg numeric(10,2) not null check (peso_bruto_kg > 0),
  estado_operativo estado_operativo_ticket not null default 'GENERADO',
  creado_por uuid references usuarios(id),
  fecha_traslado timestamptz,
  fecha_entrega timestamptz,
  creado_en timestamptz not null default now()
);
create index idx_tickets_empresa on tickets_traslado(empresa_id);
create index idx_tickets_estado on tickets_traslado(estado_operativo);
create index idx_tickets_unidad on tickets_traslado(unidad_id);
create index idx_tickets_chofer on tickets_traslado(chofer_id);

create table emisiones_gre (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets_traslado(id) on delete cascade,
  proveedor proveedor_gre not null,
  estado estado_gre not null default 'ENVIANDO',
  serie_correlativo text,
  hash_cdr text,
  motivo_rechazo text,
  payload_enviado jsonb,
  respuesta_cruda jsonb,
  creado_en timestamptz not null default now()
);
create index idx_emisiones_ticket on emisiones_gre(ticket_id);

create table historial_estado_ticket (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets_traslado(id) on delete cascade,
  estado_anterior estado_operativo_ticket,
  estado_nuevo estado_operativo_ticket not null,
  usuario_id uuid references usuarios(id),
  creado_en timestamptz not null default now()
);
create index idx_historial_ticket on historial_estado_ticket(ticket_id);

-- ---------- Vista: vencimientos próximos (para el panel de alertas) ----------

create view vencimientos_proximos as
select
  'unidad'::text as tipo,
  u.empresa_id,
  u.placa as referencia,
  d.tipo_documento::text as documento,
  d.fecha_vencimiento
from documentos_unidad d
join unidades u on u.id = d.unidad_id
union all
select
  'chofer'::text as tipo,
  c.empresa_id,
  c.nombres || ' ' || c.apellidos as referencia,
  d.tipo_documento::text as documento,
  d.fecha_vencimiento
from documentos_chofer d
join choferes c on c.id = d.chofer_id;

-- Uso típico:
-- select * from vencimientos_proximos
-- where empresa_id = :empresa_id and fecha_vencimiento <= now() + interval '30 days'
-- order by fecha_vencimiento;

-- ---------- Ajustes que el backend aplica solo al arrancar ----------
-- (src/db/migraciones.js — todos idempotentes). No es obligatorio
-- correrlos a mano; están acá para dejar el esquema documentado.

-- Correlativo del código interno de ticket (TCK-000001).
create sequence if not exists transguia_ticket_codigo_seq;

-- Rol de plataforma: ve todas las empresas (dashboard a selección).
alter type rol_usuario add value if not exists 'superadmin';

-- El superadmin no pertenece a ninguna empresa.
alter table usuarios alter column empresa_id drop not null;
