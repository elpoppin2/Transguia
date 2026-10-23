// Ejecutar con:  node sembrar-proveedores.js   (después de sembrar-datos.js)
//
// Agranda la demo del lado de los PROVEEDORES de materiales con flota
// propia y deja trabajo pendiente para el superadmin:
//   - Completa "Agregados y Canteras Lurín S.A.C." (más volquetes, choferes,
//     documentos y un usuario operador).
//   - Crea un segundo proveedor, "Concretos y Agregados Chilca S.A.C.".
//   - Agenda ~90 días de viajes programados (y 10 a futuro) para los dos.
//   - Deja solicitudes PENDIENTES y una RECHAZADA en los transportistas,
//     para que el superadmin tenga algo que revisar.
//
// Todo es ficticio. Es idempotente y reproducible: no recrea lo que ya
// existe (por RUC, placa, DNI, usuario o fecha de viaje) y usa azar con
// semilla fija. Se borra con:  node borrar-datos-demo.js

require('dotenv').config();
const { pool } = require('./src/db/pool');
const { prepararEsquema } = require('./src/db/migraciones');
const { AuthService } = require('./src/auth/authService');
const { UsuariosRepositorioPostgres } = require('./src/auth/usuariosRepoPostgres');
const { EmpresasService } = require('./src/empresas/empresasService');
const { EmpresasRepositorioPostgres } = require('./src/empresas/empresasRepoPostgres');
const { UnidadesService } = require('./src/unidades/unidadesService');
const { UnidadesRepositorioPostgres } = require('./src/unidades/unidadesRepoPostgres');
const { ChoferesService } = require('./src/choferes/choferesService');
const { ChoferesRepositorioPostgres } = require('./src/choferes/choferesRepoPostgres');
const { DocumentosService } = require('./src/documentos/documentosService');
const { DocumentosRepositorioPostgres } = require('./src/documentos/documentosRepoPostgres');
const { fichaVehiculoDemo } = require('./demo-ficha-vehiculo');

let _semilla = 20261023;
const rand = () => {
  _semilla = (_semilla * 1664525 + 1013904223) >>> 0;
  return _semilla / 4294967296;
};
const entre = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const barajar = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const dia = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

// soat/rt = días hasta el vencimiento (negativo = vencido, null = no tiene)
const PROVEEDORES = [
  {
    ruc: '20611888001',
    razonSocial: 'Agregados y Canteras Lurín S.A.C.',
    admin: { username: 'lurin', password: 'lurin2026seguro', nombreCompleto: 'Julio Lurín' },
    operador: { username: 'lurinop', password: 'operador2026', nombreCompleto: 'Rosa Quispe (despacho)' },
    unidades: [
      { placa: 'V1L-303', tipoVehiculo: 'Volquete', marca: 'Volvo', modelo: 'FMX 460', anioFabricacion: 2022, nroEjes: 3, soat: 240, rt: 300 },
      { placa: 'C4M-510', tipoVehiculo: 'Volquete', marca: 'Scania', modelo: 'P 410', anioFabricacion: 2020, nroEjes: 3, soat: 6, rt: 95 },
      { placa: 'D7T-226', tipoVehiculo: 'Cisterna', marca: 'Hino', modelo: '500 FM', anioFabricacion: 2018, nroEjes: 3, soat: 150, rt: null },
      { placa: 'F2K-990', tipoVehiculo: 'Bañera / tolva', marca: 'Freightliner', modelo: 'Cascadia', anioFabricacion: 2021, nroEjes: 5, soat: 330, rt: 40 }
    ],
    choferes: [
      { dni: '41933027', nombres: 'Edgar Martín', apellidos: 'Salazar Poma', celular: '981223344', licencia: 'A-IIIc', venceLic: 410, venceCert: 120 },
      { dni: '45501876', nombres: 'Juan Carlos', apellidos: 'Huanca Ticona', celular: '966552211', licencia: 'A-IIIb', venceLic: 12, venceCert: null },
      { dni: '48270914', nombres: 'Percy', apellidos: 'Rojas Villanueva', celular: '944118823', licencia: 'A-IIIc', venceLic: 630, venceCert: -4 }
    ],
    rutas: [
      ['Cantera Lurín', 'Planta Atocongo', 'Piedra chancada 1/2"'],
      ['Cantera Lurín', 'Obra Pachacámac', 'Arena gruesa'],
      ['Cantera Pucusana', 'Planta Atocongo', 'Hormigón'],
      ['Cantera Pucusana', 'Depósito Villa El Salvador', 'Piedra chancada 3/4"'],
      ['Cantera Lurín', 'Obra Punta Hermosa', 'Afirmado']
    ]
  },
  {
    ruc: '20611888002',
    razonSocial: 'Concretos y Agregados Chilca S.A.C.',
    admin: { username: 'chilca', password: 'chilca2026seguro', nombreCompleto: 'Marco Chilca' },
    operador: { username: 'chilcaop', password: 'operador2026', nombreCompleto: 'Diego Paucar (despacho)' },
    unidades: [
      { placa: 'H3C-101', tipoVehiculo: 'Volquete', marca: 'Volvo', modelo: 'FMX 440', anioFabricacion: 2023, nroEjes: 3, soat: 280, rt: 340 },
      { placa: 'H3C-102', tipoVehiculo: 'Volquete', marca: 'Volvo', modelo: 'FMX 440', anioFabricacion: 2023, nroEjes: 3, soat: 280, rt: 340 },
      { placa: 'H3C-103', tipoVehiculo: 'Volquete', marca: 'International', modelo: 'HV 607', anioFabricacion: 2019, nroEjes: 3, soat: 22, rt: 180 },
      { placa: 'J8P-440', tipoVehiculo: 'Otro', marca: 'Mercedes-Benz', modelo: 'Atego mixer 8 m³', anioFabricacion: 2021, nroEjes: 3, soat: 190, rt: -15 },
      { placa: 'K5R-219', tipoVehiculo: 'Cisterna', marca: 'Isuzu', modelo: 'FVR', anioFabricacion: 2017, nroEjes: 2, soat: 75, rt: 75 },
      { placa: 'M6A-077', tipoVehiculo: 'Volquete', marca: 'Sinotruk', modelo: 'Sitrak C7H', anioFabricacion: 2022, nroEjes: 3, soat: 360, rt: 25 }
    ],
    choferes: [
      { dni: '40128876', nombres: 'Hugo', apellidos: 'Cárdenas Quispe', celular: '987001122', licencia: 'A-IIIc', venceLic: 520, venceCert: 200 },
      { dni: '42651390', nombres: 'Walter Iván', apellidos: 'Chumpitaz Rivas', celular: '955300411', licencia: 'A-IIIc', venceLic: 300, venceCert: 90 },
      { dni: '44987012', nombres: 'Nelson', apellidos: 'Yupanqui Soto', celular: '921447856', licencia: 'A-IIIb', venceLic: 28, venceCert: 28 },
      { dni: '46320558', nombres: 'Alex Fernando', apellidos: 'Palomino Ccori', celular: '913556700', licencia: 'A-IIIc', venceLic: 700, venceCert: null },
      { dni: '47812266', nombres: 'Rubén', apellidos: 'Asto Galindo', celular: '988120034', licencia: 'A-IIIa', venceLic: -20, venceCert: 160 }
    ],
    rutas: [
      ['Cantera Chilca', 'Planta Atocongo', 'Piedra chancada 1/2"'],
      ['Cantera Chilca', 'Obra Asia - Condominio Playa', 'Concreto premezclado f\'c 210'],
      ['Planta de concreto Chilca', 'Obra Mala - Colegio', 'Concreto premezclado f\'c 280'],
      ['Cantera Chilca', 'Depósito San Antonio', 'Arena gruesa'],
      ['Cantera Papa León XIII', 'Planta Atocongo', 'Hormigón']
    ]
  }
];

// Solicitudes que el superadmin debe revisar (en las empresas transportistas).
const SOLICITUDES = {
  '20548712369': {
    unidades: [
      { placa: 'PEN-002', marca: 'Volvo', modelo: 'FH 500', anioFabricacion: 2024, tipoVehiculo: 'Tracto', nroEjes: 3 },
      { placa: 'PEN-003', marca: 'Kenworth', modelo: 'T800', anioFabricacion: 2018, tipoVehiculo: 'Volquete', nroEjes: 4 }
    ],
    choferes: [
      { dni: '76543211', apellidoPaterno: 'Valdivia', apellidoMaterno: 'Torres', primerNombre: 'Kevin', celular: '912345678', departamento: 'Lima' }
    ]
  },
  '20600123456': {
    unidades: [
      { placa: 'PEN-004', marca: 'Hino', modelo: '700', anioFabricacion: 2021, tipoVehiculo: 'Camión', nroEjes: 3 },
      { placa: 'RCH-001', marca: 'Foton', modelo: 'Auman', anioFabricacion: 2016, tipoVehiculo: 'Volquete', nroEjes: 3,
        rechazo: 'El PDF del CITV corresponde a otra placa. Vuelve a adjuntarlo.' }
    ],
    choferes: [
      { dni: '70112233', apellidoPaterno: 'Mamani', apellidoMaterno: 'Choque', primerNombre: 'Yesenia', celular: '951223344', departamento: 'Arequipa' }
    ]
  }
};

(async () => {
  await prepararEsquema();

  const usuariosRepo = new UsuariosRepositorioPostgres();
  const auth = new AuthService(usuariosRepo);
  const empresasRepo = new EmpresasRepositorioPostgres();
  const empresas = new EmpresasService({ repositorioEmpresas: empresasRepo, authService: auth });
  const unidadesRepo = new UnidadesRepositorioPostgres();
  const unidades = new UnidadesService(unidadesRepo);
  const choferesRepo = new ChoferesRepositorioPostgres();
  const choferes = new ChoferesService(choferesRepo);
  const documentosRepo = new DocumentosRepositorioPostgres();
  const documentos = new DocumentosService({
    repositorioDocumentos: documentosRepo, repositorioUnidades: unidadesRepo, repositorioChoferes: choferesRepo
  });

  const usuario = async (empresaId, u, rol) => {
    if (await usuariosRepo.buscarPorUsername(u.username)) return;
    await auth.registrarUsuario({ empresaId, ...u, rol });
    console.log(`  usuario ${rol}: ${u.username}`);
  };

  for (const P of PROVEEDORES) {
    // --- empresa + usuarios ---
    let empresa = await empresasRepo.buscarPorRuc(P.ruc);
    if (!empresa) {
      empresa = (await empresas.crearConAdmin({ ruc: P.ruc, razonSocial: P.razonSocial, tipoEmpresa: 'PROVEEDOR', admin: P.admin })).empresa;
      console.log(`proveedor creado: ${P.razonSocial}`);
    } else {
      await pool.query(`update empresas set tipo_empresa = 'PROVEEDOR' where id = $1`, [empresa.id]);
      console.log(`proveedor ya existía: ${P.razonSocial}`);
    }
    const empresaId = empresa.id;
    await usuario(empresaId, P.admin, 'admin_empresa');
    await usuario(empresaId, P.operador, 'operador');

    // --- unidades + SOAT / revisión técnica ---
    for (const { soat, rt, ...u } of P.unidades) {
      let unidad = await unidadesRepo.buscarPorPlaca(u.placa);
      if (!unidad) {
        unidad = await unidades.registrarUnidad({
          empresaId, rucPropietario: P.ruc, nombrePropietario: P.razonSocial,
          rodadaEjeDelantero: 'Simple', rodadaC1: 'Doble', rodadaC2: 'Doble', formaApertura: 'Volteo',
          pesoSecoKg: entre(9500, 16000), ...u
        }, { flotaPropia: true });
        console.log(`  unidad: ${u.placa}`);
      }
      const tiene = (await documentosRepo.listarDeUnidad(unidad.id)).map((d) => d.tipoDocumento);
      if (soat != null && !tiene.includes('SOAT')) {
        await documentos.agregarAUnidad(empresaId, unidad.id, { tipoDocumento: 'SOAT', numeroDocumento: `SOAT-${u.placa}`, fechaVencimiento: dia(soat) });
      }
      if (rt != null && !tiene.includes('REVISION_TECNICA')) {
        await documentos.agregarAUnidad(empresaId, unidad.id, { tipoDocumento: 'REVISION_TECNICA', numeroDocumento: `CITV-${u.placa}`, fechaVencimiento: dia(rt) });
      }
    }

    // --- choferes + licencia / certificado médico ---
    for (const { licencia, venceLic, venceCert, ...c } of P.choferes) {
      let chofer = await choferesRepo.buscarPorDni(empresaId, c.dni);
      if (!chofer) {
        chofer = await choferes.registrarChofer({ empresaId, departamento: 'Lima', ...c }, { flotaPropia: true });
        console.log(`  chofer: ${c.dni} ${c.apellidos}`);
      }
      const tiene = (await documentosRepo.listarDeChofer(chofer.id)).map((d) => d.tipoDocumento);
      if (!tiene.includes('LICENCIA_CONDUCIR')) {
        await documentos.agregarAChofer(empresaId, chofer.id, {
          tipoDocumento: 'LICENCIA_CONDUCIR', categoriaLicencia: licencia, numeroDocumento: `Q${c.dni}`, fechaVencimiento: dia(venceLic)
        });
      }
      if (venceCert != null && !tiene.includes('CERTIFICADO_MEDICO')) {
        await documentos.agregarAChofer(empresaId, chofer.id, {
          tipoDocumento: 'CERTIFICADO_MEDICO', numeroDocumento: `CM-${c.dni}`, fechaVencimiento: dia(venceCert)
        });
      }
    }

    // --- agenda: 90 días atrás y 10 adelante, solo en los días sin viajes ---
    const uds = (await unidades.listarUnidades(empresaId)).filter((u) => u.activo && u.estadoRegistro === 'APROBADA');
    const chs = (await choferes.listarChoferes(empresaId)).filter((c) => c.activo && c.estadoRegistro === 'APROBADA');
    const { rows: ocupados } = await pool.query(
      `select distinct to_char(fecha_programada, 'YYYY-MM-DD') as f from viajes_programados where empresa_id = $1`, [empresaId]
    );
    const conViajes = new Set(ocupados.map((r) => r.f));
    let creados = 0;
    for (let i = 90; i >= -10; i--) {
      const fecha = dia(-i);
      if (conViajes.has(fecha) || new Date(fecha + 'T12:00:00').getDay() === 0) continue; // domingo sin despacho
      const n = Math.min(uds.length, chs.length, entre(1, Math.max(2, Math.ceil(uds.length * 0.7))));
      const delDia = barajar(uds).slice(0, n);
      const choferesDelDia = barajar(chs).slice(0, n);
      for (let k = 0; k < n; k++) {
        const [origen, destino, mercancia] = P.rutas[entre(0, P.rutas.length - 1)];
        let estado = 'PROGRAMADO', motivo = null;
        if (i > 2) {
          const r = rand();
          if (r < 0.07) { estado = 'CANCELADO'; motivo = ['Cantera sin stock', 'Obra suspendió el pedido', 'Unidad en mantenimiento'][entre(0, 2)]; }
          else if (r < 0.95) estado = 'CUMPLIDO';
        }
        await pool.query(
          `insert into viajes_programados
             (empresa_id, unidad_id, chofer_id, fecha_programada, origen, destino, descripcion_mercancia, estado, motivo_cancelacion)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [empresaId, delDia[k].id, choferesDelDia[k].id, fecha, origen, destino, mercancia, estado, motivo]
        );
        creados++;
      }
    }
    console.log(`  ${creados} viajes programados nuevos`);
  }

  // --- solicitudes para el superadmin ---
  for (const [ruc, sol] of Object.entries(SOLICITUDES)) {
    const empresa = await empresasRepo.buscarPorRuc(ruc);
    if (!empresa) { console.log(`(RUC ${ruc} no existe: corre antes node sembrar-datos.js)`); continue; }
    for (const { rechazo, ...u } of sol.unidades) {
      if (await unidadesRepo.buscarPorPlaca(u.placa)) continue;
      const creada = await unidades.registrarUnidad({ empresaId: empresa.id, ...fichaVehiculoDemo(rand), ...u });
      if (rechazo) await unidades.rechazarUnidad(creada.id, rechazo, {});
      console.log(`solicitud de unidad ${rechazo ? 'RECHAZADA' : 'pendiente'}: ${u.placa}`);
    }
    for (const c of sol.choferes) {
      if (await choferesRepo.buscarPorDni(empresa.id, c.dni)) continue;
      await choferes.registrarChofer({ empresaId: empresa.id, tipoDocIdentidad: 'DNI', ...c });
      console.log(`solicitud de chofer pendiente: ${c.dni}`);
    }
  }

  console.log('\nListo. Usuarios de los proveedores:');
  for (const P of PROVEEDORES) {
    console.log(`  ${P.razonSocial}: admin ${P.admin.username} / ${P.admin.password}  ·  operador ${P.operador.username} / ${P.operador.password}`);
  }
  await pool.end();
})().catch((error) => {
  console.error('[error]', error.message);
  process.exit(1);
});
