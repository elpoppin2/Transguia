// Genera los campos "de ficha" de una unidad para los datos de demo
// (dueño, transportista + ubicación, técnica y medidas). Lo usan
// sembrar-datos.js y sembrar-volumen.js para que la demo tenga unidades
// completas sin tener que escribir 25 fichas a mano.
//
// `rand` es una función () => número en [0,1) — pasarle el generador con
// semilla del script para que la demo salga reproducible.

const { TIPOS_VEHICULO, TIPOS_RODADA, FORMAS_APERTURA } = require('./src/unidades/catalogosUnidad');

const DUENOS = [
  { ruc: '20601234561', nombre: 'Transportes Quri S.A.C.', direccion: 'Av. Los Frutales 1520, Ate, Lima' },
  { ruc: '20512348889', nombre: 'Inversiones Transmilsa E.I.R.L.', direccion: 'Carretera Central Km 22, Chaclacayo, Lima' },
  { ruc: '20487654322', nombre: 'Atipax Logística S.A.C.', direccion: 'Av. Néstor Gambetta 3900, Callao' },
  { ruc: '20609988771', nombre: 'Servicios Generales Juscamaita S.R.L.', direccion: 'Jr. Cusco 245, Ayacucho' },
  { ruc: '20554433210', nombre: 'Carga Pesada del Centro S.A.C.', direccion: 'Av. Ferrocarril 1200, El Tambo, Huancayo' }
];

const TRANSPORTISTAS = [
  { dni: '41258963', departamento: 'Lima', provincia: 'Lima', distrito: 'Ate' },
  { dni: '43987125', departamento: 'Lima', provincia: 'Lima', distrito: 'San Juan de Lurigancho' },
  { dni: '45612378', departamento: 'Callao', provincia: 'Callao', distrito: 'Callao' },
  { dni: '47893214', departamento: 'Junín', provincia: 'Huancayo', distrito: 'El Tambo' },
  { dni: '44125879', departamento: 'La Libertad', provincia: 'Trujillo', distrito: 'Trujillo' },
  { dni: '46753128', departamento: 'Ayacucho', provincia: 'Huamanga', distrito: 'Ayacucho' },
  { dni: '42369874', departamento: 'Lima', provincia: 'Huarochirí', distrito: 'Chaclacayo' }
];

function fichaVehiculoDemo(rand) {
  const elegir = (arr) => arr[Math.floor(rand() * arr.length)];
  const entre = (lo, hi, dec = 0) => {
    const v = lo + rand() * (hi - lo);
    return dec ? Number(v.toFixed(dec)) : Math.round(v);
  };
  const d = elegir(DUENOS);
  const t = elegir(TRANSPORTISTAS);
  return {
    rucPropietario: d.ruc,
    nombrePropietario: d.nombre,
    direccionPropietario: d.direccion,
    dniTransportista: t.dni,
    departamento: t.departamento,
    provincia: t.provincia,
    distrito: t.distrito,
    tipoVehiculo: elegir(TIPOS_VEHICULO),
    nroEjes: entre(2, 5),
    rodadaEjeDelantero: 'Simple',
    rodadaC1: elegir(TIPOS_RODADA),
    rodadaC2: elegir(TIPOS_RODADA),
    pesoSecoKg: entre(9000, 18000),
    tolvaCerrada: rand() < 0.5 ? 'SI' : 'NO',
    carretaConPiston: rand() < 0.6 ? 'SI' : 'NO',
    unidadAGas: rand() < 0.25 ? 'SI' : 'NO',
    formaApertura: elegir(FORMAS_APERTURA),
    alturaM: entre(3.0, 4.1, 2),
    anchoM: entre(2.4, 2.6, 2),
    largoM: entre(8, 14, 1),
    alturaPlataformaM: entre(1.0, 1.6, 2)
  };
}

module.exports = { fichaVehiculoDemo };
