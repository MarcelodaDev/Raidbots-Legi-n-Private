import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  DEFAULT_SIM_OPTIONS,
  SLOT_LABELS,
  type ArtifactTrait,
  type CandidateItem,
  type Character,
  type ConsumableDb,
  type EnhancementDb,
  type GearSlot,
  type FightStyle,
  type ServerMeta,
  type SimConfig,
  type SimOptions,
  type SimType,
} from '@rbl/shared';
import { api } from '../api.js';
import { ItemPicker } from '../components/ItemPicker.js';
import { EnhancementEditor } from '../components/EnhancementEditor.js';

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
  {
    type: 'relics',
    label: 'Reliquias',
    hint: 'Qué rasgo del artefacto conviene subir y cuánto vale subir el ilvl de cada reliquia.',
  },
  {
    type: 'enchants',
    label: 'Encantamientos',
    hint: 'Compara los encantamientos de un hueco, incluido no llevar ninguno.',
  },
  {
    type: 'gems',
    label: 'Gemas',
    hint: 'Compara las gemas de un hueco. Ojo: si la pieza no tiene engarce, el motor las ignora.',
  },
];

/** ¿La pestaña está todavía sin rellenar? */
function isEmptySelection(tab: SimType, config: SimConfig): boolean {
  switch (config.type) {
    case 'droptimizer':
    case 'topgear':
      return config.items.length === 0;
    case 'consumables':
      return (
        config.flasks.length === 0 &&
        config.foods.length === 0 &&
        config.potions.length === 0 &&
        config.augmentations.length === 0
      );
    case 'relics':
      return config.traits.length === 0 && config.relicIlevels.length === 0;
    case 'enchants':
      return config.enchantIds.length === 0 && !config.includeNone;
    case 'gems':
      return config.gemIds.length === 0 && !config.includeNone;
    default:
      return false;
  }
}

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
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);
  const [extraRanks, setExtraRanks] = useState(1);
  const [relicIlevelInput, setRelicIlevelInput] = useState('');
  const [currentRelicIlevel, setCurrentRelicIlevel] = useState(0);
  const [enhancementDb, setEnhancementDb] = useState<EnhancementDb | null>(null);
  const [enhanceSlot, setEnhanceSlot] = useState<GearSlot>('finger1');
  const [enchantIds, setEnchantIds] = useState<number[]>([]);
  const [gemIds, setGemIds] = useState<number[]>([]);
  const [includeNone, setIncludeNone] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.character(id).then(setCharacter).catch((err: Error) => setError(err.message));
    api.consumables().then(setConsumableDb).catch(() => setConsumableDb(null));
    api.enhancements().then(setEnhancementDb).catch(() => setEnhancementDb(null));
  }, [id]);

  useEffect(() => {
    if (meta) setOptions((prev) => ({ ...prev, threads: meta.defaults.threads }));
  }, [meta]);

  // El límite de legendarias depende de la fase del servidor.
  useEffect(() => {
    if (!character || !meta) return;
    const phase = meta.patches.find((entry) => entry.id === character.patchId);
    if (phase?.maxLegendaries) setMaxLegendaries(phase.maxLegendaries);
  }, [character, meta]);

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

  // Al abrir Reliquias precargamos los rasgos que ya tienen rango y el ilvl de
  // reliquia que despejó la sonda del artefacto.
  useEffect(() => {
    if (tab !== 'relics' || !character) return;
    const traits = character.artifactTraits ?? [];
    setSelectedTraits((prev) =>
      prev.length ? prev : traits.filter((t) => t.totalRank > 0).map((t) => t.token),
    );
    setCurrentRelicIlevel((prev) => prev || character.estimatedRelicIlevel || 0);
  }, [tab, character]);

  // Al abrir Encantamientos o Gemas colocamos el cursor en un hueco que tenga
  // pieza y marcamos lo que se suele usar ahí.
  useEffect(() => {
    if ((tab !== 'enchants' && tab !== 'gems') || !character || !enhancementDb) return;

    const candidates: GearSlot[] = ['finger1', 'finger2', 'neck', 'back'];
    const slot =
      candidates.find((option) => character.gear[option]) ?? enhanceSlot;
    setEnhanceSlot(slot);

    const suggestions = enhancementDb.bySlot[slot];
    if (tab === 'enchants') {
      setEnchantIds((prev) => (prev.length ? prev : suggestions?.enchants ?? []));
    } else {
      setGemIds((prev) => (prev.length ? prev : suggestions?.gems ?? []));
    }
    // `enhanceSlot` se omite a propósito: solo queremos el valor inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, character, enhancementDb]);

  const relicIlevels = useMemo(
    () =>
      relicIlevelInput
        .split(/[\s,]+/)
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isFinite(value) && value > 0),
    [relicIlevelInput],
  );

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
      case 'enchants':
        return { type: 'enchants', slot: enhanceSlot, enchantIds, includeNone };
      case 'gems':
        return { type: 'gems', slot: enhanceSlot, gemIds, includeNone };
      case 'relics':
        return {
          type: 'relics',
          traits: selectedTraits,
          extraRanks,
          currentRelicIlevels: currentRelicIlevel
            ? [currentRelicIlevel, currentRelicIlevel, currentRelicIlevel]
            : [],
          relicIlevels,
        };
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
    selectedTraits,
    extraRanks,
    currentRelicIlevel,
    relicIlevels,
    enhanceSlot,
    enchantIds,
    gemIds,
    includeNone,
  ]);

  // Vista previa del coste: cuántos perfiles va a simular.
  useEffect(() => {
    if (!character || !config) return;
    if (tab === 'quick') {
      setPlan({ profilesetCount: 0, warnings: [] });
      setError(null);
      return;
    }
    // Sin nada seleccionado el servidor respondería con un error de validación
    // que no aporta: todavía no ha elegido nada, no es que se haya equivocado.
    if (isEmptySelection(tab, config)) {
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
            patchId={character.patchId}
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

        {tab === 'relics' && (
          <RelicsEditor
            character={character}
            selectedTraits={selectedTraits}
            setSelectedTraits={setSelectedTraits}
            extraRanks={extraRanks}
            setExtraRanks={setExtraRanks}
            currentRelicIlevel={currentRelicIlevel}
            setCurrentRelicIlevel={setCurrentRelicIlevel}
            relicIlevelInput={relicIlevelInput}
            setRelicIlevelInput={setRelicIlevelInput}
            onCharacterUpdate={setCharacter}
          />
        )}

        {(tab === 'enchants' || tab === 'gems') && enhancementDb && (
          <EnhancementEditor
            kind={tab}
            character={character}
            db={enhancementDb}
            slot={enhanceSlot}
            setSlot={(slot) => {
              setEnhanceSlot(slot);
              // Cada hueco tiene sus propias opciones habituales.
              const suggestions = enhancementDb.bySlot[slot];
              if (tab === 'enchants') setEnchantIds(suggestions?.enchants ?? []);
              else setGemIds(suggestions?.gems ?? []);
            }}
            selected={tab === 'enchants' ? enchantIds : gemIds}
            setSelected={tab === 'enchants' ? setEnchantIds : setGemIds}
            includeNone={includeNone}
            setIncludeNone={setIncludeNone}
          />
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
  patchId,
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
  patchId?: string;
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
        patchId={patchId}
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

/**
 * Configuración del comparador de reliquias.
 *
 * Los rasgos salen de la sonda del artefacto: son los que el motor reconoce.
 * No dejamos escribir nombres a mano a propósito, porque SimulationCraft ignora
 * en silencio un rasgo que no existe y devolvería el DPS base como si fuera un
 * resultado bueno.
 */
function RelicsEditor({
  character,
  selectedTraits,
  setSelectedTraits,
  extraRanks,
  setExtraRanks,
  currentRelicIlevel,
  setCurrentRelicIlevel,
  relicIlevelInput,
  setRelicIlevelInput,
  onCharacterUpdate,
}: {
  character: Character;
  selectedTraits: string[];
  setSelectedTraits: (traits: string[]) => void;
  extraRanks: number;
  setExtraRanks: (value: number) => void;
  currentRelicIlevel: number;
  setCurrentRelicIlevel: (value: number) => void;
  relicIlevelInput: string;
  setRelicIlevelInput: (value: string) => void;
  onCharacterUpdate: (character: Character) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const traits = character.artifactTraits ?? [];

  const readArtifact = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.readArtifact(character.id);
      onCharacterUpdate(result.character);
      setSelectedTraits(
        result.traits.filter((t) => t.totalRank > 0).map((t) => t.token),
      );
      if (result.estimatedRelicIlevel) {
        setCurrentRelicIlevel(result.estimatedRelicIlevel);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!traits.length) {
    return (
      <>
        {error && <div className="notice error">{error}</div>}
        <p className="hint">
          Primero hay que leer los rasgos del artefacto de este personaje. Es una
          simulación de una iteración: tarda menos de un segundo.
        </p>
        <button onClick={readArtifact} disabled={busy}>
          {busy ? 'Leyendo…' : 'Leer rasgos del artefacto'}
        </button>
      </>
    );
  }

  const toggle = (token: string) => {
    setSelectedTraits(
      selectedTraits.includes(token)
        ? selectedTraits.filter((value) => value !== token)
        : [...selectedTraits, token],
    );
  };

  const withRank = traits.filter((trait) => trait.totalRank > 0);

  return (
    <>
      {error && <div className="notice error">{error}</div>}

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <label className="field">
          Rangos que añade la reliquia
          <input
            type="number"
            min={1}
            max={4}
            value={extraRanks}
            onChange={(event) => setExtraRanks(Number(event.target.value) || 1)}
          />
        </label>
        <label className="field">
          ilvl actual de tus reliquias
          <input
            type="number"
            min={0}
            max={1100}
            value={currentRelicIlevel}
            onChange={(event) => setCurrentRelicIlevel(Number(event.target.value) || 0)}
          />
        </label>
        <label className="field">
          ilvl de reliquia a probar
          <input
            value={relicIlevelInput}
            placeholder="980, 995"
            onChange={(event) => setRelicIlevelInput(event.target.value)}
          />
        </label>
      </div>

      <p className="hint">
        El ilvl actual lo despeja la app a partir del ilvl que el motor calcula
        para tu arma ({character.weaponIlevel ?? '?'}). Si lo cambias a un valor
        que no es el tuyo, la fila «Reliquias actuales» se separará del perfil
        base y lo verás en la tabla de resultados.
      </p>

      <div className="slot-name" style={{ margin: '16px 0 8px' }}>
        Rasgos a comparar ({selectedTraits.length} de {withRank.length})
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <button
          className="secondary small"
          onClick={() => setSelectedTraits(withRank.map((trait) => trait.token))}
        >
          Todos
        </button>
        <button className="secondary small" onClick={() => setSelectedTraits([])}>
          Ninguno
        </button>
        <button className="secondary small" onClick={readArtifact} disabled={busy}>
          {busy ? 'Leyendo…' : 'Releer artefacto'}
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 4,
          maxHeight: 280,
          overflow: 'auto',
        }}
      >
        {withRank.map((trait: ArtifactTrait) => (
          <label
            key={trait.id}
            style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}
          >
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={selectedTraits.includes(trait.token)}
              onChange={() => toggle(trait.token)}
            />
            {trait.name}
            <span style={{ color: 'var(--ink-muted)' }}>
              {trait.totalRank} → {trait.totalRank + extraRanks}
            </span>
          </label>
        ))}
      </div>
    </>
  );
}
