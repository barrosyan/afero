/**
 * Testes do núcleo.
 *
 * A regra que estes testes protegem: o diagnóstico é medida, não opinião.
 * Se um deles quebrar, o número que sai no relatório deixou de ser rastreável.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { diagnose, toWorkOrder } from '../src/agent.ts';
import { PUMP_P101, SYSTEM_S101 } from '../src/assets.ts';
import { validateClaims } from '../src/claims.ts';
import { etaAt, headAt, npshRequiredAt } from '../src/pump.ts';
import { generateScenario } from '../src/sim/generator.ts';
import { SCENARIOS, scenarioById } from '../src/sim/scenarios.ts';
import { impliedFlowFromHead, impliedFlowFromPower, solveOperatingPoint } from '../src/solver.ts';
import { assessQuality } from '../src/telemetry.ts';
import type { Claim } from '../src/types.ts';

const windowFor = (id: string) =>
  generateScenario(scenarioById(id), PUMP_P101, SYSTEM_S101);

describe('modelo hidráulico', () => {
  it('ponto de operação nominal fica em 120 m³/h e 45 m', () => {
    const op = solveOperatingPoint(PUMP_P101, SYSTEM_S101, PUMP_P101.n0, 100);
    assert.ok(op.converged, 'bisseção deve convergir');
    assert.ok(Math.abs(op.value.qM3h - 120) < 0.5, `vazão ${op.value.qM3h}`);
    assert.ok(Math.abs(op.value.headM - 45) < 0.5, `altura ${op.value.headM}`);
  });

  it('leis de semelhança: altura escala com o quadrado da rotação', () => {
    const h1 = headAt(0, PUMP_P101.n0, PUMP_P101);
    const h09 = headAt(0, 0.9 * PUMP_P101.n0, PUMP_P101);
    assert.ok(Math.abs(h09 / h1 - 0.81) < 1e-6);
  });

  it('a inversão da curva recupera a vazão de projeto', () => {
    const q = impliedFlowFromHead(45, PUMP_P101.n0, PUMP_P101);
    assert.ok(Math.abs(q - 120) < 0.5, `vazão recuperada ${q}`);
  });

  it('a estimativa de vazão por potência é coerente com o ponto nominal', () => {
    const ponto = solveOperatingPoint(PUMP_P101, SYSTEM_S101, PUMP_P101.n0, 100);
    const eta = etaAt(ponto.value.qM3h, PUMP_P101.n0, PUMP_P101);
    const potKw =
      (PUMP_P101.rho * PUMP_P101.g * (ponto.value.qM3h / 3600) * ponto.value.headM) /
      (eta * PUMP_P101.motorEta) /
      1000;
    const estimado = impliedFlowFromPower(potKw, PUMP_P101.n0, PUMP_P101);
    assert.ok(estimado.converged);
    assert.ok(Math.abs(estimado.value - ponto.value.qM3h) < 0.5, `estimado ${estimado.value}`);
  });

  it('NPSH requerido cresce com a vazão e vale o nominal no BEP', () => {
    assert.ok(Math.abs(npshRequiredAt(PUMP_P101.qBep, PUMP_P101.n0, PUMP_P101) - 4.5) < 1e-9);
    assert.ok(
      npshRequiredAt(2 * PUMP_P101.qBep, PUMP_P101.n0, PUMP_P101) >
        npshRequiredAt(PUMP_P101.qBep, PUMP_P101.n0, PUMP_P101),
    );
  });
});

describe('diagnóstico nos cenários', () => {
  it('cenário normal: tudo passa e a confiança é alta', () => {
    const d = diagnose(windowFor('normal'), PUMP_P101);
    assert.equal(d.attribution.label, 'NORMAL');
    assert.ok(d.trust.score >= 85, `trust ${d.trust.score}`);
    assert.ok(d.checks.every((c) => c.status === 'pass' || c.status === 'not_run'));
    assert.equal(d.baseline.label, 'NORMAL');
  });

  it('sensor descalibrado: acusa o instrumento e absolve a bomba', () => {
    const d = diagnose(windowFor('sensor-deriva'), PUMP_P101);
    assert.equal(d.attribution.label, 'SENSOR_VAZAO_FORA_DE_CALIBRACAO');
    const curva = d.checks.find((c) => c.id === 'curva.bomba');
    const massa = d.checks.find((c) => c.id === 'massa.continuidade');
    assert.equal(curva?.status, 'pass', 'a curva deve passar: a bomba está sadia');
    assert.equal(massa?.status, 'fail');
    assert.equal(d.attribution.actions[0].kind, 'calibrar');
    // o detector sem verificação erra este caso
    assert.equal(d.baseline.label, 'DEGRADACAO_HIDRAULICA');
  });

  it('desgaste real: acusa a bomba e não o instrumento', () => {
    const d = diagnose(windowFor('desgaste-rotor'), PUMP_P101);
    assert.equal(d.attribution.label, 'DEGRADACAO_HIDRAULICA');
    assert.equal(d.checks.find((c) => c.id === 'massa.continuidade')?.status, 'pass');
    assert.equal(d.checks.find((c) => c.id === 'curva.bomba')?.status, 'fail');
    assert.equal(d.attribution.actions[0].kind, 'inspecionar');
  });

  it('cavitação: o NPSH manda, mesmo sem falha nas outras verificações', () => {
    const d = diagnose(windowFor('cavitacao'), PUMP_P101);
    assert.equal(d.attribution.label, 'CAVITACAO');
    assert.equal(d.checks.find((c) => c.id === 'npsh.margem')?.status, 'fail');
    assert.equal(d.baseline.label, 'NORMAL', 'o detector de limiar não veria nada');
  });

  it('fora de domínio: recusa laudo de falha e pede nova janela', () => {
    const d = diagnose(windowFor('transiente'), PUMP_P101);
    assert.equal(d.attribution.label, 'OPERACAO_FORA_DE_DOMINIO');
    assert.equal(d.baseline.label, 'DEGRADACAO_HIDRAULICA');
  });

  it('dados ruins: recusa concluir em vez de adivinhar', () => {
    const w = windowFor('dados-ruins');
    const q = assessQuality(w);
    assert.ok(q.stuckChannels.length > 0, 'o cenário tem canal travado');
    assert.ok(q.gaps > 0, 'o cenário tem lacuna');

    const d = diagnose(w, PUMP_P101);
    assert.equal(d.attribution.label, 'DADOS_INSUFICIENTES');
    assert.ok(d.trust.refusesConclusion);
    assert.ok(d.trust.score <= 25, `trust ${d.trust.score}`);
  });

  it('acerta os seis cenários; o detector por limiar acerta um', () => {
    let acertosAfero = 0;
    let acertosBaseline = 0;
    for (const cfg of SCENARIOS) {
      const d = diagnose(generateScenario(cfg, PUMP_P101, SYSTEM_S101), PUMP_P101);
      if (d.attribution.label === cfg.truth) acertosAfero++;
      if (d.baseline.label === cfg.truth) acertosBaseline++;
    }
    assert.equal(acertosAfero, SCENARIOS.length);
    // O detector por limiar acerta apenas os casos em que o sintoma é a causa:
    // o desgaste real e a operação normal. Erra os quatro em que o defeito está
    // no instrumento, no NPSH, na janela ou nos dados.
    assert.equal(acertosBaseline, 2, `baseline acertou ${acertosBaseline}`);
  });

  it('é determinístico: mesma janela, mesmo laudo', () => {
    const a = diagnose(windowFor('desgaste-rotor'), PUMP_P101);
    const b = diagnose(windowFor('desgaste-rotor'), PUMP_P101);
    assert.equal(a.attribution.label, b.attribution.label);
    assert.equal(a.trust.score, b.trust.score);
    assert.deepEqual(
      a.checks.map((c) => c.value),
      b.checks.map((c) => c.value),
    );
  });
});

describe('rastreabilidade', () => {
  it('toda afirmação do relatório determinístico aponta para uma verificação executada', () => {
    for (const cfg of SCENARIOS) {
      const d = diagnose(generateScenario(cfg, PUMP_P101, SYSTEM_S101), PUMP_P101);
      assert.ok(d.claims.length > 0);
      assert.ok(d.provenance.ok, `problemas: ${d.provenance.problems.join(' | ')}`);
      for (const claim of d.claims) {
        const check = d.checks.find((c) => c.id === claim.checkId);
        assert.ok(check !== undefined, `afirmação ${claim.id} sem verificação`);
        assert.notEqual(check.status, 'not_run');
      }
    }
  });

  it('rejeita afirmação que inventa um número', () => {
    const d = diagnose(windowFor('sensor-deriva'), PUMP_P101);
    const inventada: Claim = {
      id: 'c-falsa',
      text: 'A eficiência caiu 42 %.',
      checkId: 'energia.balanco',
      value: 42,
      unit: '%',
    };
    const v = validateClaims([inventada], d.checks);
    assert.equal(v.ok, false);
    assert.equal(v.traced, 0);
  });

  it('rejeita afirmação que cita verificação não executada', () => {
    const d = diagnose(windowFor('normal'), PUMP_P101);
    const claim: Claim = {
      id: 'c-calib',
      text: 'A curva foi confirmada em campo.',
      checkId: 'calibracao.curva',
      value: 0,
      unit: '%',
    };
    assert.equal(validateClaims([claim], d.checks).ok, false);
  });

  it('narrativa de LLM aprovada é usada; reprovada cai no determinístico', () => {
    const w = windowFor('normal');
    const base = diagnose(w, PUMP_P101);

    const aprovada = diagnose(w, PUMP_P101, {
      llmNarrative: { narrative: 'Resumo aprovado.', claims: base.claims },
    });
    assert.equal(aprovada.narrativeSource, 'llm-validado');
    assert.equal(aprovada.narrative, 'Resumo aprovado.');

    const reprovada = diagnose(w, PUMP_P101, {
      llmNarrative: {
        narrative: 'A bomba está destruída.',
        claims: [
          { id: 'x', text: 'vazão 300 m³/h', checkId: 'massa.continuidade', value: 300, unit: '%' },
        ],
      },
    });
    assert.equal(reprovada.narrativeSource, 'llm-rejeitado-fallback');
    assert.notEqual(reprovada.narrative, 'A bomba está destruída.');
    assert.ok(reprovada.provenance.problems.length > 0);
  });
});

describe('ordem de serviço', () => {
  it('leva a evidência junto com a conclusão', () => {
    const d = diagnose(windowFor('desgaste-rotor'), PUMP_P101);
    const os = toWorkOrder(d) as {
      diagnosis: string;
      trustScore: number;
      evidence: Array<{ checkId: string; status: string }>;
      provenance: { traced: number; claims: number };
    };
    assert.equal(os.diagnosis, 'DEGRADACAO_HIDRAULICA');
    assert.ok(os.evidence.length >= 5);
    assert.ok(os.evidence.every((e) => e.checkId.length > 0));
    assert.equal(os.provenance.traced, os.provenance.claims);
  });
});
