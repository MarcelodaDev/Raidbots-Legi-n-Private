import type {
  ArtifactTrait,
  Character,
  PatchPhase,
  PatchSpecGear,
  ConsumableDb,
  CustomItemEntry,
  CustomItemsStatus,
  EnhancementDb,
  GearItem,
  ItemMedia,
  ItemRecord,
  Job,
  LootStatus,
  ServerMeta,
  SimPlan,
  SimRequest,
  SimResult,
} from '@rbl/shared';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  if (!response.ok) {
    let message = `Error ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // respuesta sin JSON: nos quedamos con el código
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export const api = {
  meta: () => request<ServerMeta>('/api/meta'),
  refreshMeta: () => request<unknown>('/api/meta/refresh', { method: 'POST' }),
  consumables: () => request<ConsumableDb>('/api/consumables'),
  enhancements: () => request<EnhancementDb>('/api/enhancements'),

  patches: () => request<PatchPhase[]>('/api/patches'),
  patchGear: (patchId: string, className: string, spec: string) =>
    request<PatchSpecGear>(
      `/api/patches/${patchId}/gear?class=${encodeURIComponent(className)}&spec=${encodeURIComponent(spec)}`,
    ),

  characters: () => request<Character[]>('/api/characters'),
  character: (id: string) => request<Character>(`/api/characters/${id}`),
  importCharacter: (simc: string) =>
    request<{ character: Character; warnings: string[] }>('/api/characters/import', {
      method: 'POST',
      body: JSON.stringify({ simc }),
    }),
  updateCharacter: (id: string, patch: Partial<Character>) =>
    request<Character>(`/api/characters/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  readArtifact: (id: string) =>
    request<{
      character: Character;
      traits: ArtifactTrait[];
      weaponIlevel?: number;
      estimatedRelicIlevel?: number;
      relicIlevelExact?: boolean;
    }>(`/api/characters/${id}/artifact`, { method: 'POST' }),
  updateBag: (id: string, bag: GearItem[]) =>
    request<Character>(`/api/characters/${id}/bag`, {
      method: 'PUT',
      body: JSON.stringify({ bag }),
    }),
  deleteCharacter: (id: string) =>
    request<{ ok: true }>(`/api/characters/${id}`, { method: 'DELETE' }),

  itemMedia: (ids: number[]) =>
    request<Record<number, ItemMedia>>(`/api/items/media?ids=${ids.join(',')}`),

  customItems: () =>
    request<{ status: CustomItemsStatus; items: CustomItemEntry[] }>('/api/custom-items'),
  importCustomItems: (text: string) =>
    request<{ status: CustomItemsStatus; added: number; skipped: number; withoutStats: number }>(
      '/api/custom-items/import',
      { method: 'POST', body: JSON.stringify({ text }) },
    ),
  saveCustomItem: (entry: CustomItemEntry) =>
    request<CustomItemEntry>(`/api/custom-items/${entry.itemId}`, {
      method: 'PUT',
      body: JSON.stringify(entry),
    }),
  deleteCustomItem: (itemId: number) =>
    request<CustomItemsStatus>(`/api/custom-items/${itemId}`, { method: 'DELETE' }),

  importLoot: (text: string) =>
    request<LootStatus>('/api/loot', { method: 'POST', body: JSON.stringify({ text }) }),
  clearLoot: () => request<LootStatus>('/api/loot', { method: 'DELETE' }),

  /** De estos ids, cuáles no puede construir el simulador. */
  unknownItems: (ids: number[]) =>
    request<{ unknown: number[] }>(`/api/items/unknown?ids=${ids.join(',')}`),

  items: (params: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') search.set(key, String(value));
    }
    return request<ItemRecord[]>(`/api/items?${search.toString()}`);
  },

  planSim: (body: SimRequest) =>
    request<SimPlan>('/api/sims/plan', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createSim: (body: SimRequest) =>
    request<Job>('/api/sims', { method: 'POST', body: JSON.stringify(body) }),

  jobs: () => request<Job[]>('/api/jobs'),
  job: (id: string) => request<{ job: Job; log: string[] }>(`/api/jobs/${id}`),
  cancelJob: (id: string) =>
    request<{ ok: true }>(`/api/jobs/${id}/cancel`, { method: 'POST' }),
  result: (id: string) => request<SimResult>(`/api/results/${id}`),
};

/** Suscripción al progreso de un trabajo vía Server-Sent Events. */
export function subscribeToJob(
  jobId: string,
  handlers: { onJob?: (job: Job) => void; onLog?: (line: string) => void },
): () => void {
  const source = new EventSource(`/api/jobs/${jobId}/events`);

  source.addEventListener('job', (event) => {
    handlers.onJob?.(JSON.parse((event as MessageEvent).data) as Job);
  });
  source.addEventListener('log', (event) => {
    const data = JSON.parse((event as MessageEvent).data) as { line: string };
    handlers.onLog?.(data.line);
  });

  return () => source.close();
}
