import fs from 'node:fs';
import path from 'node:path';
import type { PatchDetail, PatchPhase, PatchSpecGear } from '@rbl/shared';
import { config } from '../config.js';

interface RawPhase extends PatchDetail {
  specs: Record<string, PatchSpecGear>;
}

let phases: RawPhase[] = [];

function patchFile(): string {
  return path.join(config.dataDir, 'patches.json');
}

export function loadPatches(): void {
  const file = patchFile();
  if (!fs.existsSync(file)) {
    phases = [];
    return;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { phases: RawPhase[] };
    phases = Array.isArray(parsed?.phases) ? parsed.phases : [];
  } catch {
    phases = [];
  }
}

/** Resumen de cada fase, sin el catálogo de ítems ni el equipo por spec. */
export function listPhases(): PatchPhase[] {
  return phases.map(({ items, specs, ...phase }) => ({
    ...phase,
    itemCount: items?.length ?? 0,
    specCount: Object.keys(specs ?? {}).length,
  }));
}

export function getPhase(id: string): RawPhase | undefined {
  return phases.find((phase) => phase.id === id);
}

/** Equipo de referencia de una spec en una fase. */
export function getPhaseGear(
  phaseId: string,
  className: string,
  spec: string,
): PatchSpecGear | undefined {
  const phase = getPhase(phaseId);
  if (!phase) return undefined;
  return phase.specs?.[`${className}_${spec}`];
}

/**
 * Ítems que aparecen en los perfiles de referencia de una fase y de todas las
 * anteriores: en un servidor progresivo, lo de los tiers previos sigue estando.
 */
export function itemIdsUpTo(phaseId: string): Set<number> {
  const target = getPhase(phaseId);
  if (!target) return new Set();

  const ids = new Set<number>();
  for (const phase of phases) {
    if (phase.order > target.order) continue;
    for (const item of phase.items ?? []) ids.add(item.id);
  }
  return ids;
}

/** Tope de ilvl del equipo de una fase (sin contar el arma artefacto). */
export function ilevelCapOf(phaseId: string): number | undefined {
  return getPhase(phaseId)?.ilevelCap;
}

export function patchDbStatus(): { available: boolean; phases: number } {
  return { available: phases.length > 0, phases: phases.length };
}
