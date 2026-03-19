const assert = require('assert');
const Module = require('module');

const fakeRows = [
  { status_jornada: 'em_fila_espera', total: 4 },
  { status_jornada: 'entrevista_realizada', total: 3 },
  { status_jornada: 'em_avaliacao', total: 5 },
  { status_jornada: 'em_analise_vaga', total: 2 },
  { status_jornada: 'aprovado', total: 1 },
  { status_jornada: 'encaminhado', total: 1 },
  { status_jornada: 'matriculado', total: 6 },
  { status_jornada: 'ativo', total: 7 },
  { status_jornada: 'inativo_assistencial', total: 2 },
  { status_jornada: 'desligado', total: 1 },
  { status_jornada: '__unknown__', total: 2 },
];

const fakeSequelize = {
  async query(sql) {
    assert.ok(
      String(sql).includes('FROM public.patients'),
      'A rota de dashboard deve consultar public.patients'
    );
    return [fakeRows];
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../config/database') {
    return fakeSequelize;
  }
  return originalLoad.call(this, request, parent, isMain);
};

async function main() {
  try {
    const router = require('../institutoback/routes/stats');

    const routeLayer = router.stack.find(
      (layer) => layer.route && layer.route.path === '/' && layer.route.methods.get
    );

    assert.ok(routeLayer, 'Nao foi possivel localizar o GET / em routes/stats.js');

    const handler = routeLayer.route.stack[0].handle;

    const response = await new Promise((resolve, reject) => {
      const res = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          resolve({ statusCode: this.statusCode, payload });
        },
      };

      Promise.resolve(
        handler({}, res, (err) => {
          if (err) reject(err);
        })
      ).catch(reject);
    });

    assert.strictEqual(response.statusCode, 200, 'O smoke deve responder 200');
    assert.strictEqual(response.payload.success, true, 'A resposta deve sinalizar sucesso');
    assert.ok(response.payload.stats, 'A resposta deve conter stats');
    assert.strictEqual(response.payload.stats.totalAssistidos, 34);
    assert.strictEqual(response.payload.stats.unknownStatusCount, 2);
    assert.strictEqual(response.payload.stats.journeyTotals.em_triagem, 7);
    assert.strictEqual(response.payload.stats.journeyTotals.em_avaliacao_e_vaga, 7);
    assert.strictEqual(response.payload.stats.journeyTotals.decisao_vaga, 2);
    assert.strictEqual(response.payload.stats.journeyTotals.em_acompanhamento, 15);
    assert.strictEqual(response.payload.stats.journeyTotals.encerrados, 1);
    assert.strictEqual(response.payload.stats.journeyTotals.em_fluxo_institucional, 32);
    assert.strictEqual(response.payload.stats.journeyStatusSummary.length, 10);
    assert.ok(
      !Object.prototype.hasOwnProperty.call(response.payload.stats, 'agendamentosHoje'),
      'Nao deve existir dependencia de metricas legadas'
    );

    console.log('smoke-dashboard-stats: OK');
  } finally {
    Module._load = originalLoad;
  }
}

main().catch((error) => {
  console.error('smoke-dashboard-stats: FALHOU');
  console.error(error);
  process.exitCode = 1;
});
