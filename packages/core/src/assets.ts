/**
 * O ativo de referência do Afero: conjunto motobomba P-101.
 *
 * Todos os parâmetros abaixo são de um equipamento sintético, declarados como
 * premissa no relatório. Não é dado de planta real.
 */

import type { PumpSpec, SystemSpec } from './types.ts';

export const PUMP_P101: PumpSpec = {
  id: 'P-101',
  name: 'Bomba centrífuga P-101 (120 m³/h @ 45 m)',
  n0: 3550,
  h0: 55,
  a: 6.944e-4,
  qBep: 120,
  etaMax: 0.72,
  etaWidth: 132,
  npshrBep: 4.5,
  motorEta: 0.93,
  motorRatedKw: 30,
  rho: 998,
  vaporPressurePa: 3169, // água a 25 °C
  cThJK: 198_000,
  rThKW: 0.0367,
  g: 9.81,
};

export const SYSTEM_S101: SystemSpec = {
  staticHeadM: 20,
  kFriction: 1.736e-3,
};

/** Rótulos legíveis das verificações, usados no relatório. */
export const CHECK_TITLES: Record<string, string> = {
  'dados.qualidade': 'Qualidade dos dados',
  'massa.continuidade': 'Continuidade de massa',
  'energia.balanco': 'Balanço de energia',
  'redundancia.vazao': 'Redundância de vazão (potência)',
  'curva.bomba': 'Aderência à curva da bomba',
  'termico.regime': 'Modelo térmico do motor',
  'npsh.margem': 'Margem de NPSH',
  'dominio.operacao': 'Domínio de operação validado',
  'calibracao.curva': 'Calibração da curva em campo',
};
