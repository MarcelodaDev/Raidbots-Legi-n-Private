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
  type SimPlan,
  type SimType,
} from '@rbl/shared';
import { api } from '../api.js';
import { ItemPicker } from '../components/ItemPicker.js';
import { EnhancementEditor } from '../components/EnhancementEditor.js';
import { ItemLabel } from '../components/ItemIcon.js';
import { FieldLabel, Help } from '../components/Help.js';
import { TopGearBudget } from '../components/TopGearBudget.js';
import type { GlossaryKey } from '../glossary.js';

/**
 * Las pestañas de la pantalla.
 *
 * Casi todas son un tipo de simulación del servidor, pero «Abalorios» no: por
 * dentro es «Mejor combinación» acotada a los dos huecos de abalorio. Se
 * presenta aparte porque la pregunta del jugador es distinta —qué pareja llevar—
 * y porque los abalorios son el único hueco donde el buscador de mejoras no
 * puede ayudar: su valor está en el proc, no en las estadísticas.
 */
type TabId = SimType | 'trinkets';

const TRINKET_SLOTS: GearSlot[] = ['trinket1', 'trinket2'];

/**
 * Los tipos de simulación, presentados por la pregunta que responde cada uno.
 *
 * El nombre técnico («Droptimizer») se mantiene como etiqueta pequeña porque es
 * el que se usa fuera de la app, pero lo que se lee primero es para qué sirve.
 */
const SIM_TYPES: {
  type: TabId;
  label: string;
  /** Nombre por el que se conoce fuera, si es distinto. */
  alias?: string;
  /** La pregunta que responde, en el idioma del jugador. */
  question: string;
  /** Explicación larga, si la hay. */
  term?: GlossaryKey;
}[] = [
  {
    type: 'quick',
    label: 'Cuánto pego',
    question: '¿Cuánto DPS hago ahora mismo y de dónde sale mi daño?',
  },
  {
    type: 'droptimizer',
    label: 'Probar piezas',
    alias: 'Droptimizer',
    question: '¿Me pongo esta pieza que me ha caído?',
    term: 'droptimizer',
  },
  {
    type: 'upgrades',
    label: 'Qué me mejora',
    question: '¿Qué piezas de mi fase me subirían el DPS y desde qué ilvl?',
    term: 'upgrades',
  },
  {
    type: 'topgear',
    label: 'Mejor combinación',
    alias: 'Top Gear',
    question: '¿Cuál es el mejor conjunto con todo lo que tengo?',
    term: 'topgear',
  },
  {
    type: 'trinkets',
    label: 'Abalorios',
    question: '¿Qué pareja de abalorios me renta más?',
    term: 'trinkets',
  },
  {
    type: 'talents',
    label: 'Talentos',
    question: '¿Qué talentos me convienen?',
    term: 'talents',
  },
  {
    type: 'consumables',
    label: 'Consumibles',
    question: '¿Qué frasco, comida y poción me renta llevar?',
  },
  {
    type: 'relics',
    label: 'Reliquias',
    question: '¿Qué reliquia del artefacto me interesa más?',
    term: 'artifactTraits',
  },
  {
    type: 'enchants',
    label: 'Encantamientos',
    question: '¿Con qué encanto esta pieza?',
    term: 'enchants',
  },
  {
    type: 'gems',
    label: 'Gemas',
    question: '¿Qué gema pongo en este hueco?',
    term: 'gems',
  },
];

/**
 * Qué significa cada estilo de combate, que si no son nombres sueltos en
 * inglés. Los que no estén se enseñan tal cual llegan del motor.
 */
const FIGHT_STYLES: Record<string, string> = {
  Patchwerk: 'un muñeco quieto, sin moverte',
  LightMovement: 'con algo de movimiento',
  HeavyMovement: 'moviéndote mucho',
  HelterSkelter: 'movimiento, aturdimientos y enemigos que aparecen',
  Ultraxion: 'sin movimiento, con fases de daño fuerte',
  CleaveAdd: 'un jefe y un añadido que aparece de vez en cuando',
  HecticAddCleave: 'un jefe con oleadas constantes de añadidos',
  Beastlord: 'muchos enemigos entrando y saliendo',
  DungeonSlice: 'como una mazmorra: grupos pequeños seguidos',
  DungeonRoute: 'una ruta de mazmorra completa',
};

function fightStyleLabel(style: string): string {
  const plain = FIGHT_STYLES[style];
  return plain ? `${style} — ${plain}` : style;
}

/** ¿La pestaña está todavía sin rellenar? */
function isEmptySelection(tab: TabId, config: SimConfig): boolean {
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
  const [tab, setTab] = useState<TabId>('quick');
  const [options, setOptions] = useState<SimOptions>(DEFAULT_SIM_OPTIONS);
  const [consumableDb, setConsumableDb] = useState<ConsumableDb | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<SimPlan | null>(null);
  const [busy, setBusy] = useState(false);

  // Configuración específica de cada pestaña.
  const [statWeights, setStatWeights] = useState(true);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [targetIlevel, setTargetIlevel] = useState(0);
  const [keepEnchants, setKeepEnchants] = useState(true);
  const [maxLegendaries, setMaxLegendaries] = useState(2);
  const [maxCombinations, setMaxCombinations] = useState(2000);
  const [perSlot, setPerSlot] = useState(4);
  const [includeNewLegendaries, setIncludeNewLegendaries] = useState(false);
  const [upgradeIlevels, setUpgradeIlevels] = useState<number[]>([]);
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

  // La escalera de ilvls sale de la fase: no tiene sentido probar niveles que
  // en tu servidor todavía no existen.
  useEffect(() => {
    if (!character || !meta) return;
    const phase = meta.patches.find((entry) => entry.id === character.patchId);
    const cap = phase?.ilevelCap ?? 970;
    setUpgradeIlevels([cap - 30, cap - 15, cap].filter((value) => value > 0));
  }, [character, meta]);

  // El límite de legendarias depende de la fase del servidor.
  useEffect(() => {
    if (!character || !meta) return;
    const phase = meta.patches.find((entry) => entry.id === character.patchId);
    if (phase?.maxLegendaries) setMaxLegendaries(phase.maxLegendaries);
  }, [character, meta]);

  // Al abrir Abalorios se empieza en blanco: los candidatos se buscan a mano,
  // porque lo que se compara son parejas concretas.
  useEffect(() => {
    if (tab !== 'trinkets') return;
    setCandidates([]);
  }, [tab]);

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
      case 'upgrades':
        return {
          type: 'upgrades',
          perSlot,
          slots: [],
          ilevels: upgradeIlevels,
          includeNewLegendaries,
          keepEnchants,
        };
      case 'topgear':
        return {
          type: 'topgear',
          items: candidates,
          slots: [],
          maxLegendaries,
          maxCombinations,
          keepEnchants,
        };
      case 'trinkets':
        // Por dentro es Top Gear, pero solo con los dos huecos de abalorio: así
        // se prueban las parejas de verdad, que es lo que decide.
        return {
          type: 'topgear',
          items: candidates,
          slots: TRINKET_SLOTS,
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
    perSlot,
    upgradeIlevels,
    includeNewLegendaries,
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

  const activeTab = SIM_TYPES.find((entry) => entry.type === tab)!;
  // Pasado el tope no se puede lanzar: el motor lo rechazaría. El panel de
  // arriba ya explica de dónde sale el número y qué recortar.
  const overLimit = Boolean(plan?.space?.overLimit);

  return (
    <>
      <h1 className="page-title">Simular · {character.name}</h1>
      <p className="page-subtitle">
        {character.class.replace(/_/g, ' ')} · {character.spec}
      </p>

      <p className="lead">
        Elige qué quieres averiguar. La app monta con tu personaje todas las
        versiones que haya que comparar, las pelea muchas veces cada una y te
        dice cuánto daño hace cada opción.
      </p>

      <div className="sim-picker">
        {SIM_TYPES.map((entry) => (
          <button
            key={entry.type}
            type="button"
            className={`sim-card${entry.type === tab ? ' active' : ''}`}
            aria-pressed={entry.type === tab}
            onClick={() => setTab(entry.type)}
          >
            <div className="sim-card-title">
              {entry.label}
              {entry.alias && (
                <span
                  style={{
                    color: 'var(--ink-muted)',
                    fontWeight: 500,
                    fontSize: 12,
                    marginLeft: 6,
                  }}
                >
                  {entry.alias}
                </span>
              )}
            </div>
            <div className="sim-card-question">{entry.question}</div>
          </button>
        ))}
      </div>

      <div className="card">
        <h2>
          {activeTab.label}
          {activeTab.term && <Help term={activeTab.term} />}
        </h2>
        <p className="hint">{activeTab.question}</p>

        {tab === 'quick' && (
          <label className="row" style={{ gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={statWeights}
              onChange={(event) => setStatWeights(event.target.checked)}
            />
            <span className="field-label">
              Calcular también cuánto vale cada estadística
              <Help term="statWeights" />
            </span>
          </label>
        )}

        {tab === 'upgrades' && (
          <UpgradesEditor
            character={character}
            phaseCap={
              meta?.patches.find((entry) => entry.id === character.patchId)?.ilevelCap
            }
            perSlot={perSlot}
            setPerSlot={setPerSlot}
            ilevels={upgradeIlevels}
            setIlevels={setUpgradeIlevels}
            includeNewLegendaries={includeNewLegendaries}
            setIncludeNewLegendaries={setIncludeNewLegendaries}
            keepEnchants={keepEnchants}
            setKeepEnchants={setKeepEnchants}
            maxLegendaries={maxLegendaries}
            profilesetCount={plan?.profilesetCount ?? 0}
            secondsPerProfile={meta?.secondsPerProfile}
          />
        )}

        {tab === 'trinkets' && (
          <div className="notice" style={{ borderLeftColor: 'var(--series-1)' }}>
            <strong>Se prueban por parejas.</strong> Busca abajo los abalorios que
            quieras comparar y se pelearán todas las combinaciones con los dos que
            ya llevas puestos. Lo que decide es la pareja: dos abalorios buenos
            por separado pueden solaparse y rendir menos juntos.
          </div>
        )}

        {tab === 'topgear' && (
          <div className="notice" style={{ borderLeftColor: 'var(--series-1)' }}>
            <strong>Cómo sacarle partido.</strong> Esto prueba todas las mezclas
            posibles de las piezas que le des, así que el número de pruebas se
            multiplica por cada pieza que añades y se dispara enseguida. Rinde
            así:
            <ul>
              <li>
                Úsalo con los <strong>3 o 4 huecos que dudas</strong>, no con el
                equipo entero.
              </li>
              <li>
                Si no sabes cuáles dudar, lanza antes{' '}
                <strong>Probar piezas</strong>: te dice cuáles valen la pena una
                a una, y aquí traes solo esas.
              </li>
              <li>
                Sirve justo para lo que las pruebas sueltas no ven: dos piezas
                que por separado son peores pero juntas te suben.
              </li>
            </ul>
          </div>
        )}

        {(tab === 'droptimizer' || tab === 'topgear' || tab === 'trinkets') && (
          <CandidatesEditor
            pickerSlot={tab === 'trinkets' ? 'trinket1' : undefined}
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

        {tab === 'topgear' && (
          <TopGearBudget
            space={plan?.space}
            secondsPerProfile={meta?.secondsPerProfile}
          />
        )}

        {tab === 'talents' && (
          <div className="grid-2">
            <label className="field">
              <FieldLabel term="talents">Cómo compararlos</FieldLabel>
              <select
                value={talentMode}
                onChange={(event) => setTalentMode(event.target.value as 'rows' | 'full')}
              >
                <option value="rows">
                  El mejor de cada fila — rápido (21 pruebas)
                </option>
                <option value="full">
                  Todas las combinaciones — muy lento (2.187 pruebas)
                </option>
              </select>
            </label>
            <div className="stat-tile">
              <div className="label">Los que llevas ahora</div>
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
            <div className="field-label" style={{ fontSize: 14 }}>
              {tab === 'quick' ? (
                'Se va a probar tu personaje tal y como está.'
              ) : (
                <>
                  Se van a probar{' '}
                  <strong>
                    {(plan?.profilesetCount ?? 0).toLocaleString('es-ES')} variantes
                  </strong>{' '}
                  de tu personaje.
                  <Help term="profiles" />
                </>
              )}
            </div>
            <div style={{ color: 'var(--ink-muted)', fontSize: 13, marginTop: 4 }}>
              {options.targetError > 0
                ? `Cada una se pelea hasta afinar al ${options.targetError}%, como mucho ${options.iterations.toLocaleString('es-ES')} veces.`
                : `Cada una se pelea ${options.iterations.toLocaleString('es-ES')} veces.`}
            </div>
          </div>
          <button
            onClick={launch}
            disabled={
              busy ||
              overLimit ||
              (tab !== 'quick' && !plan?.profilesetCount)
            }
          >
            {busy ? 'Lanzando…' : 'Calcular'}
          </button>
        </div>

        {tab !== 'quick' && !plan?.profilesetCount && (
          <p className="hint" style={{ margin: '12px 0 0' }}>
            Todavía no has elegido nada que comparar, así que no hay nada que
            calcular.
          </p>
        )}

        {overLimit && (
          <p className="hint" style={{ margin: '12px 0 0' }}>
            Son demasiadas combinaciones para calcularlas. Arriba tienes de dónde
            sale el número y qué conviene quitar.
          </p>
        )}
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
      <h2>Cómo es la pelea</h2>
      <p className="hint">
        Con qué condiciones se simula. Los valores de fábrica sirven para
        comparar equipo de raid: si no sabes qué tocar, no toques nada.
      </p>

      <div className="grid-3">
        <label className="field">
          <FieldLabel term="fightStyle">Tipo de pelea</FieldLabel>
          <select
            value={options.fightStyle}
            onChange={(event) => set('fightStyle', event.target.value as FightStyle)}
          >
            {(meta?.fightStyles ?? ['Patchwerk']).map((style) => (
              <option key={style} value={style}>
                {fightStyleLabel(style)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <FieldLabel>Cuánto dura (segundos)</FieldLabel>
          <input
            type="number"
            value={options.fightLength}
            min={30}
            max={1200}
            onChange={(event) => set('fightLength', Number(event.target.value) || 300)}
          />
        </label>

        <label className="field">
          <FieldLabel term="targets">Cuántos enemigos</FieldLabel>
          <input
            type="number"
            value={options.targets}
            min={1}
            max={20}
            onChange={(event) => set('targets', Number(event.target.value) || 1)}
          />
        </label>

        <label className="field">
          <FieldLabel term="targetError">Precisión (%)</FieldLabel>
          <input
            type="number"
            step={0.05}
            min={0}
            value={options.targetError}
            onChange={(event) => set('targetError', Number(event.target.value) || 0)}
          />
        </label>

        <label className="field">
          <FieldLabel term="iterations">Tope de repeticiones</FieldLabel>
          <input
            type="number"
            step={1000}
            min={100}
            value={options.iterations}
            onChange={(event) => set('iterations', Number(event.target.value) || 10000)}
          />
        </label>

        <label className="field">
          <FieldLabel term="threads">
            Núcleos a usar (tienes {meta?.cpuCount ?? '?'})
          </FieldLabel>
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
  pickerSlot,
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
  /** Hueco al que se acota el buscador. Sin esto busca en todos. */
  pickerSlot?: GearSlot;
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
            <FieldLabel term="targetIlevel">Igualar todo a este ilvl</FieldLabel>
            <input
              type="number"
              value={targetIlevel}
              min={0}
              max={1000}
              step={5}
              onChange={(event) => setTargetIlevel(Number(event.target.value) || 0)}
            />
            <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>
              {targetIlevel > 0
                ? `Todas se compararán como si fueran ilvl ${targetIlevel}.`
                : 'Con 0 se comparan tal y como son.'}
            </span>
          </label>
        )}

        {topGear && (
          <>
            <label className="field">
              <FieldLabel term="maxLegendaries">Legendarias a la vez</FieldLabel>
              <input
                type="number"
                value={maxLegendaries}
                min={0}
                max={5}
                onChange={(event) => setMaxLegendaries(Number(event.target.value) || 0)}
              />
            </label>
            <label className="field">
              <FieldLabel term="maxCombinations">
                Tope de combinaciones
              </FieldLabel>
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
            <span className="field-label">
              Heredar encantamiento y gemas
              <Help term="keepEnchants" />
            </span>
          </span>
        </label>
      </div>

      {candidates.length > 0 && (
        <table style={{ marginBottom: 16 }}>
          <thead>
            <tr>
              <th>Pieza a probar</th>
              <th>Dónde va</th>
              <th className="num">
                <span className="field-label" style={{ justifyContent: 'flex-end' }}>
                  ilvl
                  <Help term="ilevel" />
                </span>
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {candidates.map((item, index) => (
              <tr key={`${item.itemId}-${index}`}>
                <td>
                  <ItemLabel
                    id={item.itemId}
                    name={item.name}
                    quality={item.quality}
                    size="sm"
                  />
                </td>
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
        slot={pickerSlot}
        characterClass={characterClass}
        patchId={patchId}
        onPick={(item, ilevel) => {
          // La misma pieza al mismo ilvl dos veces no compara nada: el motor la
          // descarta igualmente y aquí solo ensuciaría la lista, haciendo creer
          // que se están probando más cosas de las que se prueban. Al mismo ítem
          // con otro ilvl sí se le deja sitio: comparar 930 contra 940 es válido.
          const repetida = candidates.some(
            (entry) => entry.itemId === item.id && entry.ilevel === ilevel,
          );
          if (repetida) return;

          setCandidates([
            ...candidates,
            {
              itemId: item.id,
              name: item.name,
              slots: item.slots,
              ilevel,
              quality: item.quality,
            },
          ]);
        }}
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
          <FieldLabel term="extraRanks">Rangos que sumaría</FieldLabel>
          <input
            type="number"
            min={1}
            max={4}
            value={extraRanks}
            onChange={(event) => setExtraRanks(Number(event.target.value) || 1)}
          />
        </label>
        <label className="field">
          <FieldLabel term="relicIlevel">ilvl de las que llevas</FieldLabel>
          <input
            type="number"
            min={0}
            max={1100}
            value={currentRelicIlevel}
            onChange={(event) => setCurrentRelicIlevel(Number(event.target.value) || 0)}
          />
        </label>
        <label className="field">
          <FieldLabel>ilvl que quieres probar</FieldLabel>
          <input
            value={relicIlevelInput}
            placeholder="980, 995"
            onChange={(event) => setRelicIlevelInput(event.target.value)}
          />
        </label>
      </div>

      <p className="hint">
        El ilvl que llevas lo ha despejado la app sola, a partir del nivel que el
        simulador calcula para tu arma ({character.weaponIlevel ?? '?'}). Si lo
        cambias por uno que no es el tuyo, la fila «Reliquias actuales» dejará de
        coincidir con tu personaje y lo verás raro en los resultados.
      </p>

      <div className="slot-name" style={{ margin: '16px 0 8px' }}>
        Qué rasgos comparar ({selectedTraits.length} de {withRank.length})
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

/**
 * Configuración del buscador de mejoras.
 *
 * Solo tiene dos mandos, y los dos multiplican el tiempo: cuántas piezas se
 * prueban en cada hueco y a cuántos niveles. Por eso el coste se enseña aquí
 * mismo, antes de lanzar.
 */
function UpgradesEditor({
  character,
  phaseCap,
  perSlot,
  setPerSlot,
  ilevels,
  setIlevels,
  includeNewLegendaries,
  setIncludeNewLegendaries,
  keepEnchants,
  setKeepEnchants,
  maxLegendaries,
  profilesetCount,
  secondsPerProfile,
}: {
  character: Character;
  phaseCap?: number;
  perSlot: number;
  setPerSlot: (value: number) => void;
  ilevels: number[];
  setIlevels: (value: number[]) => void;
  includeNewLegendaries: boolean;
  setIncludeNewLegendaries: (value: boolean) => void;
  keepEnchants: boolean;
  setKeepEnchants: (value: boolean) => void;
  maxLegendaries: number;
  profilesetCount: number;
  secondsPerProfile?: number;
}) {
  const time = secondsPerProfile
    ? formatSeconds(profilesetCount * secondsPerProfile)
    : null;

  return (
    <>
      <div className="notice" style={{ borderLeftColor: 'var(--series-1)' }}>
        <strong>Cómo funciona.</strong> Repasa todas las piezas de tu fase que
        puedes llevar, se queda con las más prometedoras de cada hueco y esas sí
        las pelea de verdad. Necesita saber cuánto vale para ti cada estadística,
        así que hace falta haber lanzado antes <strong>Cuánto pego</strong> con la
        casilla de estadísticas marcada.
        <div style={{ marginTop: 6 }}>
          Los abalorios van aparte, en su propia pestaña: su valor está en el
          efecto que disparan, no en sus estadísticas, así que aquí no se pueden
          ordenar bien.
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <label className="field">
          <FieldLabel term="perSlot">Candidatos por hueco</FieldLabel>
          <input
            type="number"
            min={1}
            max={20}
            value={perSlot}
            onChange={(event) => setPerSlot(Number(event.target.value) || 1)}
          />
        </label>

        <label className="field">
          <FieldLabel term="upgradeIlevels">Niveles a probar</FieldLabel>
          <input
            value={ilevels.join(', ')}
            placeholder="940, 955, 970"
            onChange={(event) =>
              setIlevels(
                event.target.value
                  .split(/[\s,]+/)
                  .map((value) => Number.parseInt(value, 10))
                  .filter((value) => Number.isFinite(value) && value > 0),
              )
            }
          />
          <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>
            {phaseCap
              ? `Tu fase llega a ${phaseCap}; por encima no se prueba.`
              : 'Sin fase elegida no hay tope.'}
          </span>
        </label>

        <label className="field" style={{ justifyContent: 'flex-end' }}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={keepEnchants}
              onChange={(event) => setKeepEnchants(event.target.checked)}
            />
            <span className="field-label">
              Heredar encantamiento y gemas
              <Help term="keepEnchants" />
            </span>
          </span>
        </label>
      </div>

      <label
        style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}
      >
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          checked={includeNewLegendaries}
          onChange={(event) => setIncludeNewLegendaries(event.target.checked)}
        />
        <span className="field-label">
          Proponer legendarias en huecos donde no llevo ninguna
          <Help term="legendaryCap" />
        </span>
      </label>

      <p className="hint" style={{ marginTop: 0 }}>
        {includeNewLegendaries ? (
          <>
            Van a salir legendarias en todos los huecos. Ojo: en Legion solo se
            llevan <strong>{maxLegendaries}</strong> a la vez, así que de todas
            las que veas solo podrás quedarte con esas.
          </>
        ) : (
          <>
            Las legendarias solo se prueban en los huecos donde ya llevas una,
            que es donde el cambio es justo. Si no, el primer puesto de cada
            hueco sería una legendaria y no podrías ponértelas todas.
          </>
        )}
      </p>

      {profilesetCount > 0 && (
        <p className="hint" style={{ margin: 0 }}>
          Se van a pelear <strong>{profilesetCount.toLocaleString('es-ES')}</strong>{' '}
          piezas en total ({perSlot} por hueco ×{' '}
          {ilevels.length || 1} {ilevels.length === 1 ? 'nivel' : 'niveles'})
          {time ? `, unos ${time} en este ordenador` : ''}.
          {character.patchId
            ? ''
            : ' Sin fase elegida se busca en todo 7.3.5: elige una en la ficha para acotarlo.'}
        </p>
      )}
    </>
  );
}

/** «25 min», «4,4 h». */
function formatSeconds(total: number): string {
  if (total < 90) return `${Math.round(total)} s`;
  if (total < 5400) return `${Math.round(total / 60)} min`;
  if (total < 172800) return `${(total / 3600).toFixed(1)} h`;
  return `${Math.round(total / 86400)} días`;
}
