// Demo de consola: no requiere npm install ni credenciales, todo en memoria.
// Ejecutar con:  node demo.js

const { crearEmisorGRE } = require('./src/gre/crearEmisorGRE');
const { TicketService } = require('./src/tickets/ticketService');
const { TicketsRepositorioMemoria } = require('./src/tickets/ticketsRepoMemoria');
const { UnidadesRepositorioMemoria } = require('./src/unidades/unidadesRepoMemoria');
const { ChoferesRepositorioMemoria } = require('./src/choferes/choferesRepoMemoria');

process.env.GRE_PROVIDER = process.env.GRE_PROVIDER || 'demo';
process.env.GRE_SERIE = process.env.GRE_SERIE || 'T001';
process.env.GRE_CORRELATIVO_INICIAL = process.env.GRE_CORRELATIVO_INICIAL || '160';

const unidadesRepo = new UnidadesRepositorioMemoria();
const choferesRepo = new ChoferesRepositorioMemoria();
const ticketService = new TicketService({
  emisorGRE: crearEmisorGRE(),
  repositorioTickets: new TicketsRepositorioMemoria(),
  repositorioUnidades: unidadesRepo,
  repositorioChoferes: choferesRepo
});

const EMPRESA_ID = 'empresa-demo-1';

console.log(`Proveedor de GRE activo: ${process.env.GRE_PROVIDER}\n`);

(async () => {
  // Un ticket ahora referencia una unidad y un chofer YA registrados,
  // así que primero los damos de alta (en memoria).
  const unidad1 = await unidadesRepo.crearUnidad({
    empresaId: EMPRESA_ID,
    placa: 'ABC-756',
    marca: 'Volvo',
    modelo: 'FH 460',
    anioFabricacion: 2020,
    categoriaMtc: 'N3',
    configuracionVehicular: 'T3S3'
  });
  const unidad2 = await unidadesRepo.crearUnidad({
    empresaId: EMPRESA_ID,
    placa: 'CDF-903',
    marca: 'Scania',
    modelo: 'R 450',
    anioFabricacion: 2019,
    categoriaMtc: 'N3',
    configuracionVehicular: 'T3S2'
  });
  const chofer1 = await choferesRepo.crearChofer({
    empresaId: EMPRESA_ID, dni: '45678912', nombres: 'Luis Alberto', apellidos: 'Quispe Mamani'
  });
  const chofer2 = await choferesRepo.crearChofer({
    empresaId: EMPRESA_ID, dni: '47001122', nombres: 'Jorge Luis', apellidos: 'Ramos Sifuentes'
  });

  const traslados = [
    {
      empresaId: EMPRESA_ID,
      unidadId: unidad1.id,
      choferId: chofer1.id,
      origen: 'Lima',
      destino: 'Arequipa',
      motivo: 'Venta',
      descripcionMercancia: 'Repuestos industriales',
      pesoBrutoKg: 8200
    },
    {
      empresaId: EMPRESA_ID,
      unidadId: unidad2.id,
      choferId: chofer2.id,
      origen: 'Lima',
      destino: 'Trujillo',
      motivo: 'Traslado entre establecimientos',
      descripcionMercancia: 'Materiales de construcción',
      pesoBrutoKg: 15000
    }
  ];

  for (const datos of traslados) {
    const ticket = await ticketService.crearTicket(datos, (actualizado) => {
      console.log(`[actualizado] ${actualizado.codigoInterno} -> estado_sunat: ${actualizado.estadoSunat}` +
        (actualizado.serieCorrelativoGre ? ` (GRE ${actualizado.serieCorrelativoGre})` : '') +
        (actualizado.motivoRechazo ? ` — ${actualizado.motivoRechazo}` : ''));

      if (actualizado.estadoSunat === 'ACEPTADO') {
        ticketService
          .avanzarEstado(actualizado.id, 'EN_TRANSITO')
          .then((despachado) => {
            console.log(`[avance]     ${despachado.codigoInterno} -> estado_operativo: ${despachado.estadoOperativo}`);
          })
          .catch((error) => console.log(`[avance falló] ${error.message}`));
      }
    });
    console.log(`[creado]     ${ticket.codigoInterno} ${ticket.origen} -> ${ticket.destino} (${ticket.pesoBrutoKg} kg) — estado_sunat: ${ticket.estadoSunat}`);
  }
})();
