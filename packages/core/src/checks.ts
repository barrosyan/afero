/**
 * As verificações físicas do Afero.
 *
 * Cada uma responde a uma pergunta independente sobre a mesma janela de
 * telemetria. Nenhuma delas é um modelo treinado: são balanços, resíduos e
 * limites declarados. O valor de cada uma vai para o relatório com o limite
 * que a define, para que o engenheiro possa discordar com número na mão.
 */

import { CHECK_TITLES } from './assets.ts';
import { modelPowerKw } from './observables.ts';
import { clamp, headAt } from './pump.ts';
import { assessQuality, flowVariationPct, mean } from './telemetry.ts';
import type { CheckResult, CheckStatus, OperatingPoint, PumpSpec, TelemetryWindow } from './types.ts';

/** Limiares declarados. Estão aqui, num lugar só, para poderem ser auditados. */
export const THRESHOLDS = {
  massa: { warn: 2.0, fail: 3.5 },
  energia: { warn: 3.0, fail: 5.0 },
  redundancia: { warn: 2.0, fail: 3.5 },
  /** resíduo de altura contra a curva nominal, na vazão efetiva */
  curva: { warn: 3.0, fail: 4.0 },
  /** resíduo térmico médio nos últimos 30 min, K */
  termico: { warn: 3.0, fail: 6.0 },
  /** margem de NPSH, m */
  npsh: { warn: 1.5, fail: 0.5 },
  /** variação de regime na janela, % */
  regime: { warn: 6.0, fail: 10.0 },
  /** cobertura mínima da aquisição, fração */
  cobertura: { warn: 0.95, fail: 0.85 },
};

/** Nota 0..1 a partir de uma métrica "quanto menor, melhor". */
function scoreBelow(value: number, warn: number, fail: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= warn) return 1;
  const span = Math.max(fail * 2 - warn, 1e-9);
  return clamp(1 - (value - warn) / span, 0, 1);
}

function statusFrom(value: number, warn: number, fail: number): CheckStatus {
  if (!Number.isFinite(value)) return 'fail';
  if (value >= fail) return 'fail';
  if (value >= warn) return 'warn';
  return 'pass';
}

function build(
  id: string,
  weight: number,
  status: CheckStatus,
  value: number | null,
  unit: string,
  threshold: string,
  detail: string,
  evidence: Record<string, number>,
  score?: number,
): CheckResult {
  return {
    id,
    title: CHECK_TITLES[id] ?? id,
    weight,
    status,
    value,
    unit,
    threshold,
    score: score ?? (status === 'not_run' ? 0 : status === 'pass' ? 1 : status === 'warn' ? 0.6 : 0),
    detail,
    evidence,
  };
}

const f = (v: number, d = 2) => v.toFixed(d);

/** 1. Qualidade dos dados — sem isso, nada abaixo vale. */
export function checkDataQuality(window: TelemetryWindow): CheckResult {
  const q = assessQuality(window);
  const cobertura = q.coverage;
  const status: CheckStatus =
    q.stuckChannels.length > 0 || cobertura < THRESHOLDS.cobertura.warn
      ? 'fail'
      : q.gaps > 0 || cobertura < 1
        ? 'warn'
        : 'pass';

  const problems: string[] = [];
  if (q.stuckChannels.length > 0) problems.push(`canais travados: ${q.stuckChannels.join(', ')}`);
  if (q.gaps > 0) problems.push(`${q.gaps} lacuna(s), maior de ${f(q.maxGapS / 60, 0)} min`);
  if (q.outOfRangeChannels.length > 0)
    problems.push(`fora de faixa: ${q.outOfRangeChannels.join(', ')}`);

  const score =
    status === 'pass'
      ? 1
      : clamp(cobertura, 0, 1) * (q.stuckChannels.length > 0 ? 0.4 : 0.8);

  return build(
    'dados.qualidade',
    0.16,
    status,
    cobertura * 100,
    '%',
    `cobertura ≥ ${THRESHOLDS.cobertura.warn * 100}%, nenhum canal travado`,
    problems.length === 0
      ? `${q.sampleCount} amostras em ${f(q.durationS / 3600, 1)} h, sem lacunas e sem canal travado.`
      : `${problems.join('; ')}. Cobertura da aquisição: ${f(cobertura * 100, 0)}%.`,
    {
      amostras: q.sampleCount,
      duracao_h: q.durationS / 3600,
      lacunas: q.gaps,
      cobertura: cobertura,
      canais_travados: q.stuckChannels.length,
    },
    score,
  );
}

/** 2. Continuidade de massa: dois medidores independentes. */
export function checkMassBalance(op: OperatingPoint): CheckResult {
  const value = Math.abs((op.qMeasured - op.qSuction) / Math.max(op.qSuction, 1e-9)) * 100;
  const status = statusFrom(value, THRESHOLDS.massa.warn, THRESHOLDS.massa.fail);
  return build(
    'massa.continuidade',
    0.12,
    status,
    value,
    '%',
    `desvio ≤ ${THRESHOLDS.massa.warn}% entre sucção e recalque`,
    `Sucção ${f(op.qSuction, 1)} m³/h, recalque ${f(op.qMeasured, 1)} m³/h — desvio de ${f(value)}%.`,
    { succao_m3h: op.qSuction, recalque_m3h: op.qMeasured, desvio_pct: value },
    scoreBelow(value, THRESHOLDS.massa.warn, THRESHOLDS.massa.fail),
  );
}

/** 3. Balanço de energia: potência medida contra potência que a bomba nominal exigiria. */
export function checkEnergyBalance(op: OperatingPoint, spec: PumpSpec): CheckResult {
  const expectedKw = modelPowerKw(op.qMeasured, op.headMeasured, op.speedRpm, spec);
  const value = Math.abs((op.powerMeasuredKw - expectedKw) / Math.max(op.powerMeasuredKw, 1e-9)) * 100;
  const status = statusFrom(value, THRESHOLDS.energia.warn, THRESHOLDS.energia.fail);
  return build(
    'energia.balanco',
    0.15,
    status,
    value,
    '%',
    `desvio ≤ ${THRESHOLDS.energia.warn}% entre potência medida e modelo`,
    `Potência medida ${f(op.powerMeasuredKw)} kW; o modelo nominal exigiria ${f(expectedKw)} kW para o mesmo ponto — desvio de ${f(value)}%.`,
    { medido_kw: op.powerMeasuredKw, modelo_kw: expectedKw, desvio_pct: value },
    scoreBelow(value, THRESHOLDS.energia.warn, THRESHOLDS.energia.fail),
  );
}

/** 4. Redundância de vazão: medidor contra estimativa por potência (método do torque). */
export function checkFlowRedundancy(op: OperatingPoint): CheckResult {
  const value = Math.abs((op.qMeasured - op.qFromPower) / Math.max(op.qFromPower, 1e-9)) * 100;
  const status = statusFrom(value, THRESHOLDS.redundancia.warn, THRESHOLDS.redundancia.fail);
  return build(
    'redundancia.vazao',
    0.13,
    status,
    value,
    '%',
    `desvio ≤ ${THRESHOLDS.redundancia.warn}% entre medidor e estimativa por potência`,
    `Medidor ${f(op.qMeasured, 1)} m³/h; estimativa independente pela potência elétrica ${f(op.qFromPower, 1)} m³/h — desvio de ${f(value)}%.`,
    { medidor_m3h: op.qMeasured, estimativa_potencia_m3h: op.qFromPower, desvio_pct: value },
    scoreBelow(value, THRESHOLDS.redundancia.warn, THRESHOLDS.redundancia.fail),
  );
}

/**
 * 5. Aderência à curva da bomba.
 *
 * A altura medida é comparada com a altura que a curva nominal prevê na vazão
 * efetiva — a estimada pela potência, não a do medidor. Se o medidor estiver
 * descalibrado, esta verificação continua passando: é isso que separa erro de
 * instrumento de degradação real do equipamento.
 */
export function checkPumpCurve(op: OperatingPoint, spec: PumpSpec): CheckResult {
  const predicted = headAt(op.qFromPower, op.speedRpm, spec);
  const value = ((predicted - op.headMeasured) / Math.max(predicted, 1e-9)) * 100;
  const abs = Math.abs(value);
  const status = statusFrom(abs, THRESHOLDS.curva.warn, THRESHOLDS.curva.fail);
  return build(
    'curva.bomba',
    0.13,
    status,
    value,
    '%',
    `|déficit| ≤ ${THRESHOLDS.curva.warn}% contra a curva nominal`,
    `Na vazão efetiva de ${f(op.qFromPower, 1)} m³/h a curva prevê ${f(predicted)} m; mediu-se ${f(op.headMeasured)} m — déficit de ${f(value)}%.`,
    {
      vazao_efetiva_m3h: op.qFromPower,
      altura_prevista_m: predicted,
      altura_medida_m: op.headMeasured,
      deficit_pct: value,
      eficiencia_nominal: op.etaNominal,
    },
    scoreBelow(abs, THRESHOLDS.curva.warn, THRESHOLDS.curva.fail),
  );
}

/**
 * 6. Modelo térmico do motor: integra a equação de primeira ordem com a
 * potência efetivamente medida e compara com a temperatura medida.
 */
export function checkThermalModel(window: TelemetryWindow, spec: PumpSpec): CheckResult {
  const s = window.samples;
  if (s.length < 3) {
    return build('termico.regime', 0.09, 'not_run', null, 'K', 'resíduo ≤ 3 K', 'Amostras insuficientes.', {});
  }
  const tau = spec.rThKW * spec.cThJK;
  let rise = s[0].windingTempC - s[0].ambientTempC;
  const residuals: Array<{ tS: number; r: number }> = [];
  for (let i = 1; i < s.length; i++) {
    const dt = Math.max(s[i].tS - s[i - 1].tS, 1);
    const lossW = s[i].motorPowerKw * 1000 * (1 - spec.motorEta);
    const riseSteady = lossW * spec.rThKW;
    rise = riseSteady + (rise - riseSteady) * Math.exp(-dt / tau);
    residuals.push({ tS: s[i].tS, r: s[i].ambientTempC + rise - s[i].windingTempC });
  }
  const cutoff = residuals[residuals.length - 1].tS - 1800;
  const recent = residuals.filter((x) => x.tS >= cutoff).map((x) => x.r);
  const value = mean(recent.map((r) => Math.abs(r)));
  const status = statusFrom(value, THRESHOLDS.termico.warn, THRESHOLDS.termico.fail);
  return build(
    'termico.regime',
    0.09,
    status,
    value,
    'K',
    `resíduo médio ≤ ${THRESHOLDS.termico.warn} K nos últimos 30 min`,
    `Resíduo médio |T_modelo − T_medida| = ${f(value)} K (τ térmico de ${f(tau / 60, 0)} min).`,
    { residuo_k: value, tau_s: tau, potencia_perda_w: s[s.length - 1].motorPowerKw * 1000 * (1 - spec.motorEta) },
    scoreBelow(value, THRESHOLDS.termico.warn, THRESHOLDS.termico.fail),
  );
}

/** 7. Margem de NPSH. */
export function checkNpsh(op: OperatingPoint): CheckResult {
  const margin = op.npshAvailableM - op.npshRequiredM;
  const status: CheckStatus =
    margin < THRESHOLDS.npsh.fail ? 'fail' : margin < THRESHOLDS.npsh.warn ? 'warn' : 'pass';
  const score =
    status === 'pass' ? 1 : status === 'warn' ? clamp((margin - 0) / THRESHOLDS.npsh.warn, 0, 1) * 0.6 : 0;
  return build(
    'npsh.margem',
    0.09,
    status,
    margin,
    'm',
    `margem ≥ ${THRESHOLDS.npsh.fail} m`,
    `NPSH disponível ${f(op.npshAvailableM)} m contra ${f(op.npshRequiredM)} m requeridos — margem de ${f(margin)} m.`,
    {
      npsh_disponivel_m: op.npshAvailableM,
      npsh_requerido_m: op.npshRequiredM,
      margem_m: margin,
    },
    score,
  );
}

/** 8. Domínio de operação — onde o modelo foi validado. */
export function checkOperatingDomain(
  window: TelemetryWindow,
  op: OperatingPoint,
  spec: PumpSpec,
): CheckResult {
  const qRel = op.qFromPower / spec.qBep;
  const sRel = op.speedRpm / spec.n0;
  const variation = flowVariationPct(window.samples);
  const outsideQ = qRel < 0.75 || qRel > 1.15;
  const outsideN = sRel < 0.95 || sRel > 1.05;
  const regimeChange = variation > THRESHOLDS.regime.warn;
  const status: CheckStatus =
    outsideQ || outsideN || variation >= THRESHOLDS.regime.fail
      ? 'fail'
      : regimeChange
        ? 'warn'
        : 'pass';
  const score =
    status === 'pass' ? 1 : status === 'warn' ? 0.6 : clamp(1 - variation / 40, 0, 1) * 0.5;
  return build(
    'dominio.operacao',
    0.09,
    status,
    qRel * 100,
    '% do BEP',
    'Q entre 75 % e 115 % do BEP, rotação ±5 %, regime estável',
    `Ponto em ${f(qRel * 100, 0)} % do BEP, rotação em ${f(sRel * 100, 1)} % da nominal, variação de vazão na janela de ${f(variation, 1)}%.`,
    { q_rel_bep: qRel, s_rel: sRel, variacao_vazao_pct: variation },
    score,
  );
}

/**
 * 9. Calibração da curva em campo.
 *
 * Só roda quando existe ensaio de campo registrado para o ativo. Fica como
 * "não executada" — e aparece assim no relatório — em vez de virar nota
 * neutra inventada.
 */
export function checkCurveCalibration(hasFieldTest: boolean): CheckResult {
  if (!hasFieldTest) {
    return build(
      'calibracao.curva',
      0.04,
      'not_run',
      null,
      '%',
      'ensaio de campo nos últimos 12 meses',
      'Não executada: não há ensaio de campo registrado para o ativo. A curva usada é a do fabricante.',
      {},
      0,
    );
  }
  return build('calibracao.curva', 0.04, 'pass', 0, '%', 'ensaio de campo nos últimos 12 meses',
    'Curva confirmada por ensaio de campo.', {}, 1);
}

/** Roda todas as verificações aplicáveis à janela. */
export function runChecks(
  window: TelemetryWindow,
  op: OperatingPoint,
  spec: PumpSpec,
  options: { hasFieldCurveTest?: boolean } = {},
): CheckResult[] {
  return [
    checkDataQuality(window),
    checkMassBalance(op),
    checkEnergyBalance(op, spec),
    checkFlowRedundancy(op),
    checkPumpCurve(op, spec),
    checkThermalModel(window, spec),
    checkNpsh(op),
    checkOperatingDomain(window, op, spec),
    checkCurveCalibration(options.hasFieldCurveTest ?? false),
  ];
}
