/**
 * Narrador determinístico.
 *
 * Produz o relatório em pt-BR sem modelo de linguagem: mesma entrada, mesma
 * saída, e cada frase carrega o id da verificação que a sustenta. É o
 * fallback — e é também o padrão de referência contra o qual o texto de LLM é
 * comparado.
 */

import { LABEL_TEXT } from './attribution.ts';
import type { Attribution, CheckResult, Claim, OperatingPoint, TrustIndex } from './types.ts';

const n = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');

export interface Narrative {
  narrative: string;
  claims: Claim[];
}

export function narrate(
  checks: CheckResult[],
  attribution: Attribution,
  operating: OperatingPoint,
  trust: TrustIndex,
): Narrative {
  const energy = checks.find((c) => c.id === 'energia.balanco');
  const redundancy = checks.find((c) => c.id === 'redundancia.vazao');
  const curve = checks.find((c) => c.id === 'curva.bomba');
  const mass = checks.find((c) => c.id === 'massa.continuidade');
  const npsh = checks.find((c) => c.id === 'npsh.margem');
  const thermal = checks.find((c) => c.id === 'termico.regime');
  const data = checks.find((c) => c.id === 'dados.qualidade');

  const claims: Claim[] = [];

  const push = (
    id: string,
    text: string,
    checkId: string,
    value: number | null,
    unit: string,
  ) => {
    claims.push({ id, text, checkId, value, unit });
  };

  if (mass?.value !== null && mass !== undefined) {
    push(
      'c-massa',
      `Os dois medidores de vazão divergem ${n(Math.abs(mass.value))}% entre si (${n(operating.qSuction, 1)} m³/h na sucção contra ${n(operating.qMeasured, 1)} m³/h no recalque)`,
      'massa.continuidade',
      mass.value,
      '%',
    );
  }
  if (redundancy?.value !== null && redundancy !== undefined) {
    push(
      'c-redundancia',
      `A estimativa independente por potência elétrica dá ${n(operating.qFromPower, 1)} m³/h, contra ${n(operating.qMeasured, 1)} m³/h do medidor`,
      'redundancia.vazao',
      redundancy.value,
      '%',
    );
  }
  if (curve?.value !== null && curve !== undefined) {
    push(
      'c-curva',
      `Na vazão efetiva de ${n(operating.qFromPower, 1)} m³/h a altura medida é ${n(operating.headMeasured)} m contra ${n(operating.headNominalAtQFromPower)} m da curva nominal`,
      'curva.bomba',
      curve.value,
      '%',
    );
  }
  if (energy?.value !== null && energy !== undefined) {
    push(
      'c-energia',
      `A potência medida é ${n(operating.powerMeasuredKw)} kW, ${n(Math.abs(energy.value))}% acima do que o modelo nominal exigiria para o mesmo ponto`,
      'energia.balanco',
      energy.value,
      '%',
    );
  }
  if (npsh?.value !== null && npsh !== undefined) {
    push(
      'c-npsh',
      `A margem de NPSH é de ${n(npsh.value)} m (${n(operating.npshAvailableM)} m disponíveis contra ${n(operating.npshRequiredM)} m requeridos)`,
      'npsh.margem',
      npsh.value,
      'm',
    );
  }
  if (thermal?.value !== null && thermal !== undefined && thermal.status !== 'not_run') {
    push(
      'c-termico',
      `O modelo térmico do motor reproduz a temperatura medida com resíduo de ${n(thermal.value)} K`,
      'termico.regime',
      thermal.value,
      'K',
    );
  }
  if (data?.value !== null && data !== undefined) {
    push(
      'c-dados',
      `A aquisição cobre ${n(data.value, 0)}% do intervalo esperado, com ${data.evidence.lacunas ?? 0} lacuna(s)`,
      'dados.qualidade',
      data.value,
      '%',
    );
  }

  const head = `Diagnóstico: ${LABEL_TEXT[attribution.label]}. Índice de confiança nos números: ${trust.score}/100 (cobertura de verificações ${n(trust.coverage * 100, 0)}%).`;

  const body = attribution.rationale.map((r) => `— ${r}`).join('\n');
  const action = attribution.actions[0];
  const tail = action
    ? `\n\nAção recomendada: ${action.title}. ${action.rationale}\nPróximo passo: ${attribution.nextBestAction}`
    : `\n\nPróximo passo: ${attribution.nextBestAction}`;

  return {
    narrative: `${head}\n\n${body}${tail}`,
    claims,
  };
}
