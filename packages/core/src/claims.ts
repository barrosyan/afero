/**
 * Rastreabilidade das afirmações.
 *
 * Regra do produto: nenhuma frase do relatório pode afirmar um número que não
 * venha de uma verificação executada. Vale para o narrador determinístico e,
 * principalmente, para o texto gerado por LLM — que é validado aqui e, se
 * falhar, é descartado em favor do narrador determinístico.
 */

import type { CheckResult, Claim, Provenance } from './types.ts';

export interface ValidationResult extends Provenance {
  /** afirmações que passaram, prontas para exibição */
  accepted: Claim[];
  /** afirmações rejeitadas com o motivo */
  rejected: Array<{ claim: Claim; reason: string }>;
}

function tolerance(checkValue: number): number {
  return Math.max(Math.abs(checkValue) * 0.03, 0.05);
}

export function validateClaims(claims: Claim[], checks: CheckResult[]): ValidationResult {
  const problems: string[] = [];
  const accepted: Claim[] = [];
  const rejected: Array<{ claim: Claim; reason: string }> = [];

  for (const claim of claims) {
    if (claim.checkId === null) {
      const reason = `afirmação "${claim.id}" não cita verificação`;
      problems.push(reason);
      rejected.push({ claim, reason });
      continue;
    }
    const check = checks.find((c) => c.id === claim.checkId);
    if (check === undefined) {
      const reason = `afirmação "${claim.id}" cita verificação inexistente (${claim.checkId})`;
      problems.push(reason);
      rejected.push({ claim, reason });
      continue;
    }
    if (check.status === 'not_run') {
      const reason = `afirmação "${claim.id}" cita verificação não executada (${claim.checkId})`;
      problems.push(reason);
      rejected.push({ claim, reason });
      continue;
    }
    if (claim.value !== null && check.value !== null) {
      const diff = Math.abs(claim.value - check.value);
      if (diff > tolerance(check.value)) {
        const reason = `afirmação "${claim.id}" diz ${claim.value} mas a verificação ${claim.checkId} mediu ${check.value}`;
        problems.push(reason);
        rejected.push({ claim, reason });
        continue;
      }
    }
    accepted.push(claim);
  }

  return {
    total: claims.length,
    traced: accepted.length,
    ok: claims.length > 0 && accepted.length === claims.length,
    problems,
    accepted,
    rejected,
  };
}
