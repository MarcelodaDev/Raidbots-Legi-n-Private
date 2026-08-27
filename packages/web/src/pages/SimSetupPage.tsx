import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  DEFAULT_SIM_OPTIONS,
  SLOT_LABELS,
  type CandidateItem,
  type Character,
  type ConsumableDb,
  type FightStyle,
  type ServerMeta,
  type SimConfig,
  type SimOptions,
  type SimType,
} from '@rbl/shared';
import { api } from '../api.js';
import { ItemPicker } from '../components/ItemPicker.js';

const TABS: { type: SimType; label: string; hint: string }[] = [
  {
    type: 'quick',
    label: 'Sim rápida',
    hint: 'DPS del personaje tal y como está, con desglose por habilidad y pesos de estadística.',
  },
  {
    type: 'droptimizer',
    label: 'Droptimizer',
    hint: 'Simula ítems sueltos uno a uno y los ordena por ganancia de DPS.',
  },
  {
    type: 'topgear',
    label: 'Top Gear',
    hint: 'Combina el equipo actual con el inventario y busca la mejor configuración.',
  },
  {
    type: 'talents',
    label: 'Talentos',
    hint: 'Compara filas de talentos o todas las combinaciones.',
  },
  {
    type: 'consumables',
    label: 'Consumibles',
    hint: 'Compara frascos, comida, pociones y runas.',
  },
];

export function SimSetupPage() {
  const { id } = useParams<{ id: string }>();
  const meta = useOutletContext<ServerMeta | null>();
  const navigate = useNavigate();

  const [character, setCharacter] = useState<Character | null>(null);
  const [tab, setTab] = useState<SimType>('quick');
  const [options, setOptions] = useState<SimOptions>(DEFAULT_SIM_OPTIONS);
  const [consumableDb, setConsumableDb] = useState<ConsumableDb | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ profilesetCount: number; warnings: string[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  // Configuración específica de cada pestaña.
  const [statWeights, setStatWeights] = useState(true);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [targetIlevel, setTargetIlevel] = useState(0);
  const [keepEnchants, setKeepEnchants] = useState(true);
  const [maxLegendaries, setMaxLegendaries] = useState(2);
  const [maxCombinations, setMaxCombinations] = useState(2000);
  const [talentMode, setTalentMode] = useState<'rows' | 'full'>('rows');
  const [selectedConsumables, setSelectedConsumables] = useState<{
    flasks: string[];
    foods: string[];
    potions: string[];
    augmentations: string[];
  }>({ flasks: [], foods: [], potions: [], augmentations: [] });

  useEffect(() => {
    if (!id) return;
    api.character(id).then(setCharacter).catch((err: Error) => setError(err.message));
    api.consumables().then(setConsumableDb).catch(() => setConsumableDb(null));
  }, [id]);

  useEffect(() => {
    if (meta) setOptions((prev) => ({ ...prev, threads: meta.defaults.threads }));
  }, [meta]);

  // Al abrir Top Gear precargamos el inventario del personaje como candidatos.
  useEffect(() => {
    if (tab !== 'topgear' || !character) return;
    setCandidates(
      character.bag.map((item) => ({
        itemId: item.itemId,
        name: item.name ?? `Ítem ${item.itemId}`,
        slots: [item.slot],
        ilevel: item.ilevel ?? 0,
        source: 'inventario',
      })),
    );
  }, [tab, character]);

  const config: SimConfig | null = useMemo(() => {
    switch (tab) {
      case 'quick':
        return { type: 'quick', statWeights };
      case 'droptimizer':
        return { type: 'droptimizer', items: candidates, targetIlevel, keepEnchants };
      case 'topgear':
        return {
          type: 'topgear',
          items: candidates,
          slots: [],
          maxLegendaries,
          maxCombinations,
          keepEnchants,
        };
      case 'talents':
        return { type: 'talents', mode: talentMode, rows: [1, 2, 3, 4, 5, 6, 7] };
      case 'consumables':
        return { type: 'consumables', ...selectedConsumables };
      default:
        return null;
    }
  }, [
    tab,
    statWeights,
    candidates,
    targetIlevel,
    keepEnchants,
    maxLegendaries,
    maxCombinations,
    talentMode,
    selectedConsumables,
  ]);

  // Vista previa del coste: cuántos perfiles va a simular.
  useEffect(() => {
    if (!character || !config) return;
    if (tab === 'quick') {
      setPlan({ profilesetCount: 0, warnings: [] });
      setError(null);
      return;
    }
    let cancelled = false;
    api
      .planSim({ characterId: character.id, options, config })
      .then((result) => {
        if (cancelled) return;
        setPlan(result);
        setError(null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setPlan(null);
        setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [character, config, options, tab]);

  const launch = async () => {
    if (!character || !config) return;
    setBusy(true);
    setError(null);
    try {
      const job = await api.createSim({ characterId: character.id, options, config });
      navigate(`/sims/${job.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  if (!character) {
    return error ? <div className="notice error">{error}</div> : <div className="empty">Cargando…</div>;
  }

  const activeTab = TABS.find((entry) => entry.type === tab)!;

  return (
    <>
      <h1 className="page-title">Simular · {character.name}</h1>
      <p className="page-subtitle">
        {character.class.replace(/_/g, ' ')} · {character.spec}
      </p>

      <div className="tabs">
        {TABS.map((entry) => (
          <button
            key={entry.type}
            className={entry.type === tab ? 'active' : ''}
            onClick={() => setTab(entry.type)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="card">
        <h2>{activeTab.label}</h2>
        <p className="hint">{activeTab.hint}</p>

        {tab === 'quick' && (
          <label className="row" style={{ gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={statWeights}
              onChange={(event) => setStatWeights(event.target.checked)}
            />
            Calcular pesos de estadística (multiplica el tiempo de simulación)
          </label>
        )}

        {(tab === 'droptimizer' || tab === 'topgear') && (
          <CandidatesEditor
            characterClass={character.class}
            candidates={candidates}
            setCandidates={setCandidates}
            showIlevelTarget={tab === 'droptimizer'}
            targetIlevel={targetIlevel}
            setTargetIlevel={setTargetIlevel}
            keepEnchants={keepEnchants}
            setKeepEnchants={setKeepEnchants}
            topGear={tab === 'topgear'}
            maxLegendaries={maxLegendaries}
            setMaxLegendaries={setMaxLegendaries}
            maxCombinations={maxCombinations}
            setMaxCombinations={setMaxCombinations}
          />
        )}

        {tab === 'talents' && (
          <div className="grid-2">
            <label className="field">
              Modo
              <select
                value={talentMode}
                onChange={(event) => setTalentMode(event.target.value as 'rows' | 'full')}
              >
                <option value="rows">Fila a fila (21 perfiles)</option>
                <option value="full">Todas las combinaciones (2187 perfiles)</option>
              </select>
            </label>
            <div className="stat-tile">
              <div className="label">Talentos actuales</div>
              <div className="value">{character.talents || '—'}</div>
            </div>
          </div>
        )}

        {tab === 'consumables' && consumableDb && (
          <ConsumablesEditor
            db={consumableDb}
            selected={selectedConsumables}
            setSelected={setSelectedConsumables}
          />
        )}
      </div>

      <OptionsCard options={options} setOptions={setOptions} meta={meta} />

      {error && <div className="notice error">{error}</div>}

      {plan && plan.warnings.length > 0 && (
        <div className="notice">
          <ul>
            {plan.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
              {tab === 'quick'
                ? 'Un solo perfil'
                : `${(plan?.profilesetCount ?? 0).toLocaleString('es-ES')} perfiles a simular`}
            </div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              {options.targetError > 0
                ? `Hasta ${options.targetError}% de error, máx. ${options.iterations.toLocaleString('es-ES')} iteraciones`
                : `${options.iterations.toLocaleString('es-ES')} iteraciones fijas`}
            </div>
          </div>
          <button
            onClick={launch}
            disabled={busy || (tab !== 'quick' && !plan?.profilesetCount)}
          >
            {busy ? 'Lanzando…' : 'Lanzar simulación'}
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function OptionsCard({
  options,
  setOptions,
  meta,
}: {
  options: SimOptions;
  setOptions: (update: (prev: SimOptions) => SimOptions) => void;
  meta: ServerMeta | null;
}) {
  const set = <K extends keyof SimOptions>(key: K, value: SimOptions[K]) =>
    setOptions((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="card">
      <h2>Opciones de combate</h2>
      <p className="hint">Se aplican a todos los perfiles de esta simulación.</p>

      <div className="grid-3">
        <label className="field">
          Estilo de combate
          <select
            value={options.fightStyle}
            onChange={(event) => set('fightStyle', event.target.value as FightStyle)}
          >
            {(meta?.fightStyles ?? ['Patchwerk']).map((style) => (
              <option key={style} value={style}>
                {style}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Duración (s)
          <input
            type="number"
            value={options.fightLength}
            min={30}
            max={1200}
            onChange={(event) => set('fightLength', Number(event.target.value) || 300)}
          />
        </label>

        <label className="field">
          Objetivos
          <input
            type="number"
            value={options.targets}
            min={1}
            max={20}
            onChange={(event) => set('targets', Number(event.target.value) || 1)}
          />
        </label>

        <label className="field">
          Error objetivo (%)
          <input
            type="number"
            step={0.05}
            min={0}
            value={options.targetError}
            onChange={(event) => set('targetError', Number(event.target.value) || 0)}
          />
        </label>

        <label className="field">
          Iteraciones
          <input
            type="number"
            step={1000}
            min={100}
            value={options.iterations}
            onChange={(event) => set('iterations', Number(event.target.value) || 10000)}
          />
        </label>

        <label className="field">
          Hilos ({meta?.cpuCount ?? '?'} núcleos)
          <input
            type="number"
            min={0}
            max={64}
            value={options.threads}
            onChange={(event) => set('threads', Number(event.target.value) || 0)}
          />
        </label>
      </div>
    </div>
  );
}

function CandidatesEditor({
  characterClass,
  candidates,
  setCandidates,
  showIlevelTarget,
  targetIlevel,
  setTargetIlevel,
  keepEnchants,
  setKeepEnchants,
  topGear,
  maxLegendaries,
  setMaxLegendaries,
  maxCombinations,
  setMaxCombinations,
}: {
  characterClass: string;
  candidates: CandidateItem[];
  setCandidates: (items: CandidateItem[]) => void;
  showIlevelTarget: boolean;
  targetIlevel: number;
  setTargetIlevel: (value: number) => void;
  keepEnchants: boolean;
  setKeepEnchants: (value: boolean) => void;
  topGear: boolean;
  maxLegendaries: number;
  setMaxLegendaries: (value: number) => void;
  maxCombinations: number;
  setMaxCombinations: (value: number) => void;
}) {
  return (
    <>
      <div className="grid-3" style={{ marginBottom: 16 }}>
        {showIlevelTarget && (
          <label className="field">
            Normalizar ilvl a
            <input
              type="number"
              value={targetIlevel}
              min={0}
              max={1000}
              step={5}
              onChange={(event) => setTargetIlevel(Number(event.target.value) || 0)}
            />
          </label>
        )}

        {topGear && (
          <>
            <label className="field">
              Máx. legendarias
              <input
                type="number"
                value={maxLegendaries}
                min={0}
                max={5}
                onChange={(event) => setMaxLegendaries(Number(event.target.value) || 0)}
              />
            </label>
            <label className="field">
              Tope de combinaciones
              <input
                type="number"
                value={maxCombinations}
                min={1}
                max={10000}
                step={100}
                onChange={(event) => setMaxCombinations(Number(event.target.value) || 1)}
              />
            </label>
          </>
        )}

        <label className="field" style={{ justifyContent: 'flex-end' }}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={keepEnchants}
              onChange={(event) => setKeepEnchants(event.target.checked)}
            />
            Mantener encantamientos y gemas del slot
          </span>
        </label>
      </div>

      {candidates.length > 0 && (
        <table style={{ marginBottom: 16 }}>
          <thead>
            <tr>
              <th>Ítem candidato</th>
              <th>Slots</th>
              <th className="num">ilvl</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {candidates.map((item, index) => (
              <tr key={`${item.itemId}-${index}`}>
                <td>{item.name}</td>
                <td style={{ color: 'var(--ink-2)' }}>
                  {item.slots.map((slot) => SLOT_LABELS[slot]).join(' / ')}
                </td>
                <td className="num">{item.ilevel}</td>
                <td className="num">
                  <button
                    className="small danger"
                    onClick={() =>
                      setCandidates(candidates.filter((_, i) => i !== index))
                    }
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ItemPicker
        characterClass={characterClass}
        onPick={(item, ilevel) =>
          setCandidates([
            ...candidates,
            {
              itemId: item.id,
              name: item.name,
              slots: item.slots,
              ilevel,
              quality: item.quality,
            },
          ])
        }
      />
    </>
  );
}

function ConsumablesEditor({
  db,
  selected,
  setSelected,
}: {
  db: ConsumableDb;
  selected: { flasks: string[]; foods: string[]; potions: string[]; augmentations: string[] };
  setSelected: (value: typeof selected) => void;
}) {
  const groups: {
    key: keyof typeof selected;
    label: string;
    entries: { token: string; name: string }[];
  }[] = [
    { key: 'flasks', label: 'Frascos', entries: db.flasks },
    { key: 'potions', label: 'Pociones', entries: db.potions },
    { key: 'foods', label: 'Comida', entries: db.foods },
    { key: 'augmentations', label: 'Runas', entries: db.augmentations },
  ];

  const toggle = (key: keyof typeof selected, token: string) => {
    const current = selected[key];
    setSelected({
      ...selected,
      [key]: current.includes(token)
        ? current.filter((value) => value !== token)
        : [...current, token],
    });
  };

  return (
    <div className="grid-2">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="slot-name" style={{ marginBottom: 8 }}>
            {group.label}
          </div>
          <div style={{ maxHeight: 220, overflow: 'auto', display: 'grid', gap: 4 }}>
            {group.entries.map((entry) => (
              <label
                key={entry.token}
                style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}
              >
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={selected[group.key].includes(entry.token)}
                  onChange={() => toggle(group.key, entry.token)}
                />
                {entry.name}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
