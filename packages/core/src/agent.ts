/**
 * O agente do Afero.
 *
 * Orquestra na ordem que importa: mede, verifica, atribui, narra, valida a
 * narrativa. Ele não "acha" nada: se uma verificação não rodou, aparece como
 * não executada; se a cobertura cai, ele se recusa a concluir; se a narrativa
 * cita um número que nenhuma verificação produziu, a narrativa é descartada.
 */

import { attribute } from './attribution.ts';
import { baselineDetector } from './baseline.ts';
import { runChecks } from './checks.ts';
import { validateClaims } from './claims.ts';
import { narrate } from './narrator.ts';
import { deriveOperatingPoint } from './observables.ts';
import { computeTrust } from './trust.ts';
import type { Claim, Diagnosis, PumpSpec, TelemetryWindow } from './types.ts';

export interface DiagnoseOptions {
  /** existe ensaio de campo da curva para este ativo? */
  hasFieldCurveTest?: boolean;
  /**
   * Narrativa produzida por LLM (opcional). Ela NUNCA é aceita sem passar pelo
   * validador de rastreabilidade.
   */
  llmNarrative?: { narrative: string; claims: Claim[] };
}

export function diagnose(
  window: TelemetryWindow,
  spec: PumpSpec,
  options: DiagnoseOptions = {},
): Diagnosis {
  const operating = deriveOperatingPoint(window, spec);
  const checks = runChecks(window, operating, spec, {
    hasFieldCurveTest: options.hasFieldCurveTest ?? false,
  });
  const trust = computeTrust(checks);
  const attribution = attribute({ checks, operating });

  const deterministic = narrate(checks, attribution, operating, trust);

  let narrative = deterministic.narrative;
  let claims = deterministic.claims;
  let provenance = validateClaims(claims, checks);
  let narrativeSource: Diagnosis['narrativeSource'] = 'agente-deterministico';

  if (options.llmNarrative !== undefined) {
    const llmValidation = validateClaims(options.llmNarrative.claims, checks);
    if (llmValidation.ok && options.llmNarrative.narrative.trim().length > 0) {
      narrative = options.llmNarrative.narrative;
      claims = options.llmNarrative.claims;
      provenance = llmValidation;
      narrativeSource = 'llm-validado';
    } else {
      narrativeSource = 'llm-rejeitado-fallback';
      provenance = {
        ...llmValidation,
        problems: [
          'Narrativa gerada por LLM reprovada na validação de rastreabilidade e substituída pelo relatório determinístico.',
          ...llmValidation.problems,
        ],
      };
    }
  }

  return {
    window,
    operating,
    checks,
    trust,
    attribution,
    claims,
    provenance,
    narrative,
    narrativeSource,
    baseline: baselineDetector(operating),
  };
}

/** Payload da ordem de serviço — é o que atravessa para o sistema de manutenção. */
export function toWorkOrder(diagnosis: Diagnosis): Record<string, unknown> {
  const action = diagnosis.attribution.actions[0];
  return {
    assetId: diagnosis.window.assetId,
    assetName: diagnosis.window.assetName,
    createdAt: new Date().toISOString(),
    severity: diagnosis.attribution.severity,
    diagnosis: diagnosis.attribution.label,
    diagnosisLabel: diagnosis.attribution.label,
    confidence: Number(diagnosis.attribution.confidence.toFixed(2)),
    trustScore: diagnosis.trust.score,
    trustCoverage: Number(diagnosis.trust.coverage.toFixed(2)),
    title: action?.title ?? 'Sem ação',
    estimatedCostBrl: action?.estimatedCostBrl ?? null,
    estimatedDowntimeH: action?.estimatedDowntimeH ?? null,
    evidence: diagnosis.checks
      .filter((c) => c.status !== 'not_run')
      .map((c) => ({
        checkId: c.id,
        status: c.status,
        value: c.value,
        unit: c.unit,
        threshold: c.threshold,
      })),
    provenance: {
      claims: diagnosis.provenance.total,
      traced: diagnosis.provenance.traced,
      source: diagnosis.narrativeSource,
    },
  };
}
