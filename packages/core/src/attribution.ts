/**
 * Atribuição de causa.
 *
 * Regras determinísticas, na ordem em que aparecem — cada uma exige combinação
 * de verificações independentes, porque um único desvio nunca identifica causa.
 * A ordem é a do princípio físico: primeiro o dado existe?, depois o fluido
 * está cavitando?, depois o instrumento concorda consigo mesmo?, e só então o
 * equipamento.
 *
 * Ver docs/ARQUITETURA.md para a tabela de separabilidade usada para fixar os
 * limiares (e por que "sensor ou desgaste?" é uma pergunta identificável aqui).
 */

import { clamp } from './pump.ts';
import type { Attribution, CheckResult, FaultLabel, OperatingPoint } from './types.ts';

export interface AttributionInput {
  checks: CheckResult[];
  operating: OperatingPoint;
}

function check(checks: CheckResult[], id: string): CheckResult | undefined {
  return checks.find((c) => c.id === id);
}

function value(checks: CheckResult[], id: string): number {
  return check(checks, id)?.value ?? NaN;
}

/** Preço e parada declarados como PREMISSA do cenário, não como dado de mercado. */
const COST = {
  calibrarMedidor: { cost: 1800, downtime: 1 },
  substituirRotor: { cost: 38_000, downtime: 12 },
  inspecionarSucao: { cost: 3500, downtime: 2 },
  revalidarEnvelope: { cost: 900, downtime: 0 },
  repararAquisicao: { cost: 2500, downtime: 0 },
} as const;

export function attribute(input: AttributionInput): Attribution {
  const { checks, operating } = input;

  const massPct = Math.abs(value(checks, 'massa.continuidade'));
  const redundancyPct = Math.abs(value(checks, 'redundancia.vazao'));
  const curveDeficit = Math.abs(value(checks, 'curva.bomba'));
  const energyPct = Math.abs(value(checks, 'energia.balanco'));
  const npshMargin = value(checks, 'npsh.margem');
  const variation = check(checks, 'dominio.operacao')?.evidence.variacao_vazao_pct ?? 0;
  const qRel = check(checks, 'dominio.operacao')?.evidence.q_rel_bep ?? 1;

  const dataCheck = check(checks, 'dados.qualidade');

  // 1. O dado existe e é confiável?
  if (dataCheck !== undefined && dataCheck.status === 'fail') {
    const stuck = dataCheck.evidence.canais_travados > 0;
    return {
      label: 'DADOS_INSUFICIENTES',
      confidence: 0.95,
      severity: 'atencao',
      rationale: [
        `A aquisição não sustenta conclusão: cobertura de ${(dataCheck.evidence.cobertura * 100).toFixed(0)}% e ${dataCheck.evidence.lacunas} lacuna(s).`,
        stuck
          ? 'Há canal com desvio padrão nulo — sensor travado, não processo estável.'
          : 'A janela tem lacunas maiores que o intervalo de aquisição.',
        'Nenhuma conclusão sobre o equipamento é emitida com dados nessa condição.',
      ],
      actions: [
        {
          kind: 'coletar_dado',
          title: 'Restabelecer a aquisição antes de decidir',
          rationale:
            'Sem cobertura e com canal travado, qualquer laudo seria inventado. Pedir leitura manual e reparar o canal.',
          estimatedCostBrl: COST.repararAquisicao.cost,
          estimatedDowntimeH: COST.repararAquisicao.downtime,
        },
      ],
      nextBestAction:
        'Reparar o canal travado e recoletar 2 h contínuas antes de reavaliar o ativo.',
    };
  }

  // 2. Cavitação: causa física que domina as demais.
  if (npshMargin < 0.5) {
    return {
      label: 'CAVITACAO',
      confidence: clamp(0.7 + (0.5 - npshMargin) * 0.6, 0, 0.97),
      severity: 'critico',
      rationale: [
        `NPSH disponível ${operating.npshAvailableM.toFixed(2)} m contra ${operating.npshRequiredM.toFixed(2)} m requeridos: margem de ${npshMargin.toFixed(2)} m.`,
        'A bomba está operando no regime em que o fluido vaporiza na entrada — perda de altura e de rendimento são consequência, não causa.',
        `O balanço de energia confirma o efeito (${energyPct.toFixed(1)}% de desvio) enquanto os dois medidores de vazão continuam concordando entre si (${massPct.toFixed(1)}%).`,
      ],
      actions: [
        {
          kind: 'inspecionar',
          title: 'Elevar a pressão de sucção',
          rationale:
            'Abrir a válvula de sucção, limpar filtro/grade ou reduzir a vazão até a margem de NPSH voltar acima de 1 m. Não é problema de rotor.',
          estimatedCostBrl: COST.inspecionarSucao.cost,
          estimatedDowntimeH: COST.inspecionarSucao.downtime,
        },
      ],
      nextBestAction:
        'Medir a pressão na flange de sucção após limpar o filtro e confirmar margem de NPSH acima de 1 m.',
    };
  }

  // 3. Instrumento: os dois medidores de vazão discordam, e a curva não.
  if (massPct > 3.0 && redundancyPct > 3.0 && curveDeficit < 4.0) {
    return {
      label: 'SENSOR_VAZAO_FORA_DE_CALIBRACAO',
      confidence: clamp(0.6 + massPct / 40 + Math.min(redundancyPct, 10) / 60, 0, 0.97),
      severity: 'atencao',
      rationale: [
        `Os dois medidores de vazão discordam ${massPct.toFixed(1)}% entre si — em regime permanente, massa não se cria nem desaparece.`,
        `A estimativa independente pela potência elétrica confirma: ${operating.qFromPower.toFixed(1)} m³/h contra ${operating.qMeasured.toFixed(1)} m³/h no medidor.`,
        `Na vazão efetiva de ${operating.qFromPower.toFixed(1)} m³/h a altura medida bate com a curva nominal em ${curveDeficit.toFixed(2)}% — a bomba está sadia.`,
        `O desvio de energia (${energyPct.toFixed(1)}%) nasce do mesmo erro de medição, não de perda de rendimento.`,
      ],
      actions: [
        {
          kind: 'calibrar',
          title: 'Calibrar o medidor de vazão do recalque',
          rationale:
            'O equipamento está bom; substituir rotor agora seria trocar a peça certa pelo motivo errado.',
          estimatedCostBrl: COST.calibrarMedidor.cost,
          estimatedDowntimeH: COST.calibrarMedidor.downtime,
        },
        {
          kind: 'inspecionar',
          title: 'Verificar a linha entre os dois medidores',
          rationale:
            'Uma tomada de pressão obstruída produz o mesmo desvio. Verificar antes de descartar a hipótese de vazamento interno.',
          estimatedCostBrl: null,
          estimatedDowntimeH: null,
        },
      ],
      nextBestAction:
        'Calibrar o medidor do recalque em campo e repetir a janela: se o balanço de massa voltar a zero com a curva intacta, a causa estava confirmada.',
    };
  }

  // 4. Equipamento: a curva caiu, os medidores concordam.
  if (curveDeficit > 4.0 && massPct < 3.0) {
    return {
      label: 'DEGRADACAO_HIDRAULICA',
      confidence: clamp(0.6 + curveDeficit / 30 + energyPct / 40, 0, 0.96),
      severity: 'critico',
      rationale: [
        `Na vazão efetiva de ${operating.qFromPower.toFixed(1)} m³/h a bomba entrega ${operating.headMeasured.toFixed(2)} m contra ${operating.headNominalAtQFromPower.toFixed(2)} m da curva — déficit de ${curveDeficit.toFixed(1)}%.`,
        `Os dois medidores de vazão concordam (${massPct.toFixed(1)}%), então não é erro de instrumento.`,
        `O balanço de energia acusa ${energyPct.toFixed(1)}% de potência acima do necessário para o mesmo ponto: perda de rendimento real.`,
      ],
      actions: [
        {
          kind: 'inspecionar',
          title: 'Inspecionar folga e desgaste do rotor',
          rationale:
            'Déficit de altura com eficiência em queda e instrumentos consistentes é a assinatura de desgaste de rotor/anéis de desgaste.',
          estimatedCostBrl: COST.substituirRotor.cost,
          estimatedDowntimeH: COST.substituirRotor.downtime,
        },
      ],
      nextBestAction:
        'Abrir a bomba e medir folga do rotor antes de comprar peça: confirmar desgaste com o rotor em mãos.',
    };
  }

  // 5. Fora do domínio validado.
  const domainCheck = check(checks, 'dominio.operacao');
  if (domainCheck !== undefined && domainCheck.status !== 'pass') {
    return {
      label: 'OPERACAO_FORA_DE_DOMINIO',
      confidence: clamp(0.6 + variation / 40, 0, 0.95),
      severity: 'atencao',
      rationale: [
        `O ponto de operação está em ${(qRel * 100).toFixed(0)}% do BEP, com variação de vazão de ${variation.toFixed(1)}% dentro da mesma janela.`,
        'A curva e as verificações foram validadas na faixa de 75% a 115% do BEP em regime estável; fora dela o modelo não foi demonstrado.',
        'As demais verificações não acusam falha — o que falta é envelope, não equipamento.',
      ],
      actions: [
        {
          kind: 'coletar_dado',
          title: 'Reavaliar em ponto nominal ou ampliar o envelope',
          rationale:
            'Duas opções honestas: coletar nova janela perto do BEP, ou validar o modelo na faixa estrangulada antes de concluir.',
          estimatedCostBrl: COST.revalidarEnvelope.cost,
          estimatedDowntimeH: COST.revalidarEnvelope.downtime,
        },
      ],
      nextBestAction:
        'Coletar 2 h de telemetria com a válvula em 100% e repetir o diagnóstico nesse envelope.',
    };
  }

  // 6. Nada a apontar.
  return {
    label: 'NORMAL',
    confidence: 0.9,
    severity: 'info',
    rationale: [
      'Todos os balanços fecham dentro dos limites declarados: massa, energia, curva da bomba e modelo térmico.',
      `Ponto de operação em ${(qRel * 100).toFixed(0)}% do BEP, margem de NPSH de ${npshMargin.toFixed(2)} m.`,
    ],
    actions: [
      {
        kind: 'nenhuma',
        title: 'Nenhuma ação de manutenção',
        rationale: 'Nenhuma evidência de falha. Manter monitoramento.',
        estimatedCostBrl: 0,
        estimatedDowntimeH: 0,
      },
    ],
    nextBestAction: 'Manter a janela de monitoramento e reavaliar na próxima parada programada.',
  };
}

export const LABEL_TEXT: Record<FaultLabel, string> = {
  NORMAL: 'Operação normal',
  SENSOR_VAZAO_FORA_DE_CALIBRACAO: 'Medidor de vazão fora de calibração',
  DEGRADACAO_HIDRAULICA: 'Degradação hidráulica do conjunto',
  CAVITACAO: 'Cavitação por NPSH insuficiente',
  OPERACAO_FORA_DE_DOMINIO: 'Operação fora do domínio validado',
  DADOS_INSUFICIENTES: 'Dados insuficientes para concluir',
};
