/**
 * Narrativa por LLM — opcional e sempre subordinada às verificações.
 *
 * O modelo recebe apenas o resultado das verificações e é instruído a citar o
 * id da verificação em cada afirmação. O que volta é validado pelo núcleo
 * (`validateClaims`); se qualquer frase citar número que nenhuma verificação
 * mediu, o texto é descartado e o relatório determinístico prevalece.
 */

import type { Claim, Diagnosis } from '@afero/core';

const MODEL = process.env.AFERO_MODEL ?? 'claude-sonnet-5-5';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';

const SYSTEM = `Você escreve laudos técnicos de manutenção em português do Brasil, para engenheiros de planta.

Regras absolutas:
1. Só afirme o que estiver no JSON de verificações fornecido. Nada de conhecimento externo.
2. Toda frase numérica deve citar o id da verificação que a sustenta em "checkId".
3. Nunca invente número, causa ou peça. Se a verificação não rodou, diga que não rodou.
4. Se o diagnóstico for de dados insuficientes, escreva isso e não conclua sobre o equipamento.

Responda SOMENTE com JSON válido no formato:
{"narrative": "<texto corrido, 3 a 6 frases>", "claims": [{"id": "c1", "text": "<afirmação>", "checkId": "<id da verificação>", "value": <número ou null>, "unit": "<unidade>"}]}`;

export async function requestNarrative(
  diagnosis: Diagnosis,
): Promise<{ narrative: string; claims: Claim[] } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const checks = diagnosis.checks
    .filter((c) => c.status !== 'not_run')
    .map((c) => ({
      id: c.id,
      status: c.status,
      title: c.title,
      value: c.value,
      unit: c.unit,
      threshold: c.threshold,
      evidence: c.evidence,
    }));

  const user = JSON.stringify(
    {
      ativo: diagnosis.window.assetName,
      diagnostico_deterministico: diagnosis.attribution.label,
      confianca_atribuicao: Number(diagnosis.attribution.confidence.toFixed(2)),
      indice_confianca: diagnosis.trust.score,
      cobertura: diagnosis.trust.coverage,
      verificacoes: checks,
    },
    null,
    2,
  );

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        system: SYSTEM,
        messages: [{ role: 'user', content: user }],
      }),
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = payload.content?.find((c) => c.type === 'text')?.text ?? '';
    const parsed = JSON.parse(text) as { narrative?: string; claims?: Claim[] };
    if (typeof parsed.narrative !== 'string' || !Array.isArray(parsed.claims)) return null;
    return { narrative: parsed.narrative, claims: parsed.claims };
  } catch {
    // Qualquer falha do provedor cai no relatório determinístico.
    return null;
  }
}
