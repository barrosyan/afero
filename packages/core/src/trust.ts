/**
 * Índice de confiança.
 *
 * Duas coisas diferentes, que o relatório mantém separadas:
 *
 *  - `score`  — posso confiar nos NÚMEROS desta janela (dados + modelo)?
 *  - atribuição (em attribution.ts) — qual a confiança na CAUSA apontada?
 *
 * Uma janela pode ter números ruins e um diagnóstico firme: "seu medidor está
 * errado" é justamente esse caso. Misturar as duas coisas esconde informação.
 */

import type { CheckResult, TrustIndex } from './types.ts';

/** Cobertura mínima para emitir conclusão. Abaixo disso, o Afero se recusa. */
const COVERAGE_FLOOR = 0.6;

/** Teto aplicado quando a própria aquisição de dados falha. */
const DATA_FAILURE_CEILING = 25;

export function computeTrust(checks: CheckResult[]): TrustIndex {
  const totalWeight = checks.reduce((acc, c) => acc + c.weight, 0);
  const executed = checks.filter((c) => c.status !== 'not_run' && c.weight > 0);
  const executedWeight = executed.reduce((acc, c) => acc + c.weight, 0);

  const coverage = totalWeight > 0 ? executedWeight / totalWeight : 0;
  const weighted =
    executedWeight > 0
      ? executed.reduce((acc, c) => acc + c.score * c.weight, 0) / executedWeight
      : 0;

  let score = Math.round(weighted * coverage * 100);

  // Portão de dados: se a aquisição está comprometida, nenhuma nota alta é
  // legítima, por melhor que estejam as outras verificações.
  const dataCheck = checks.find((c) => c.id === 'dados.qualidade');
  const dataFailed = dataCheck !== undefined && dataCheck.status === 'fail';
  if (dataFailed) score = Math.min(score, DATA_FAILURE_CEILING);

  const refusesConclusion =
    coverage < COVERAGE_FLOOR || dataFailed;

  const verdict: TrustIndex['verdict'] = refusesConclusion || score < 45
    ? 'NAO_CONFIAVEL'
    : score >= 75
      ? 'CONFIAVEL'
      : 'ATENCAO';

  return { score, coverage, verdict, refusesConclusion };
}
