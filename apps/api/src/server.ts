/**
 * Serviço HTTP do Afero — sem dependências, só a biblioteca padrão do Node.
 *
 *   POST /v1/diagnose     roda o núcleo sobre uma janela de telemetria
 *   POST /v1/workorders   encaminha uma ordem de serviço ao sistema de manutenção
 *   GET  /health
 *
 * A narrativa em linguagem natural é opcional: se ANTHROPIC_API_KEY existir, o
 * texto vem de um LLM e é validado contra as verificações do núcleo (o mesmo
 * validador que roda no navegador). Sem chave, o agente determinístico responde
 * — e o relatório declara qual dos dois gerou o texto.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PUMP_P101, diagnose, generateScenario, scenarioById } from '@afero/core';
import type { Claim, TelemetryWindow } from '@afero/core';
import { requestNarrative } from './llm.ts';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', '..', '..', 'data', 'scenarios');
const PORT = Number(process.env.PORT ?? 8787);
const WEBHOOK_URL = process.env.CMMS_WEBHOOK_URL ?? '';

async function loadWindow(scenarioId: string): Promise<TelemetryWindow> {
  try {
    const raw = await readFile(join(dataDir, `${scenarioId}.json`), 'utf8');
    return JSON.parse(raw) as TelemetryWindow;
  } catch {
    // sem arquivo: regenera do mesmo modelo determinístico
    return generateScenario(scenarioById(scenarioId), PUMP_P101, {
      staticHeadM: 20,
      kFriction: 1.736e-3,
    });
  }
}

function send(res: import('node:http').ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, GET, OPTIONS',
  });
  res.end(payload);
}

async function readJson(req: import('node:http').IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});

  try {
    if (req.method === 'GET' && req.url === '/health') {
      return send(res, 200, {
        ok: true,
        llm: process.env.ANTHROPIC_API_KEY ? 'configurado' : 'ausente (agente determinístico)',
        webhook: WEBHOOK_URL ? 'configurado' : 'ausente',
      });
    }

    if (req.method === 'POST' && req.url === '/v1/diagnose') {
      const body = (await readJson(req)) as { scenarioId?: string; window?: TelemetryWindow };
      const window = body.window ?? (await loadWindow(body.scenarioId ?? 'sensor-deriva'));

      // O núcleo roda primeiro: ele é a fonte de verdade dos números.
      const base = diagnose(window, PUMP_P101);

      let llmNarrative: { narrative: string; claims: Claim[] } | undefined;
      if (process.env.ANTHROPIC_API_KEY) {
        const generated = await requestNarrative(base);
        if (generated !== null) llmNarrative = generated;
      }

      const diagnosis = diagnose(window, PUMP_P101, { llmNarrative });

      return send(res, 200, {
        diagnosis: {
          label: diagnosis.attribution.label,
          confidence: Number(diagnosis.attribution.confidence.toFixed(2)),
          severity: diagnosis.attribution.severity,
          actions: diagnosis.attribution.actions,
          nextBestAction: diagnosis.attribution.nextBestAction,
        },
        trust: diagnosis.trust,
        checks: diagnosis.checks,
        narrative: diagnosis.narrative,
        narrativeSource: diagnosis.narrativeSource,
        claims: diagnosis.claims,
        provenance: diagnosis.provenance,
        baseline: diagnosis.baseline,
      });
    }

    if (req.method === 'POST' && req.url === '/v1/workorders') {
      const body = (await readJson(req)) as Record<string, unknown>;
      if (WEBHOOK_URL === '') {
        return send(res, 202, {
          delivered: false,
          reason: 'CMMS_WEBHOOK_URL não configurado: a ordem foi aceita mas não encaminhada.',
          workOrder: body,
        });
      }
      const upstream = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return send(res, 202, { delivered: upstream.ok, status: upstream.status, workOrder: body });
    }

    return send(res, 404, { error: 'rota não encontrada' });
  } catch (error) {
    return send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, () => {
  console.log(`Afero API em http://localhost:${PORT}`);
  console.log(`  LLM: ${process.env.ANTHROPIC_API_KEY ? 'configurado' : 'ausente'}`);
  console.log(`  webhook de manutenção: ${WEBHOOK_URL || 'ausente'}`);
});
