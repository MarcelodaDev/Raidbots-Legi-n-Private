import {
  PAIRED_SLOTS,
  SIMMED_SLOTS,
  isPvpItem,
  pickSlotCandidates,
  slotFamily,
  weightsByStat,
  type CandidateItem,
  type Character,
  type ConsumablesConfig,
  type DroptimizerConfig,
  type GearItem,
  type GearSlot,
  type EnchantsConfig,
  type GemsConfig,
  type RelicsConfig,
  type SimRequest,
  type ScaleFactor,
  type ScoredItem,
  type TalentsConfig,
  type TopGearConfig,
  type TopGearSpace,
  type UpgradesConfig,
} from '@rbl/shared';
import {
  buildCharacterProfile,
  buildCliArgs,
  buildSimOptions,
  gearOverrideLine,
  renderProfileset,
  type ProfilesetSpec,
} from '../simc/profile.js';
import { gearItemToLine } from '../simc/import.js';
import {
  canClassEquip,
  getItem,
  getItemName,
  getItemQuality,
  slotCandidates,
} from '../data/itemdb.js';
import { ilevelCapOf } from '../data/patches.js';
import { latestScaleFactors } from '../store.js';
import { getEnchant, getGem } from '../data/enhancements.js';
import { config } from '../config.js';

export interface BuiltSim {
  profileText: string;
  args: string[];
  /** Metadatos por nombre de profileset, para reconstruir el resultado. */
  meta: Record<string, Record<string, unknown>>;
  profilesetCount: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Droptimizer
// ---------------------------------------------------------------------------

function buildDroptimizer(
  character: Character,
  cfg: DroptimizerConfig,
): { specs: ProfilesetSpec[]; warnings: string[] } {
  const specs: ProfilesetSpec[] = [];
  const warnings: string[] = [];

  for (const item of cfg.items) {
    const slots = item.slots.length ? item.slots : [];
    if (!slots.length) {
      warnings.push(`El ítem "${item.name}" no tiene slot conocido; se omite.`);
      continue;
    }

    for (const slot of slots) {
      const equipped = character.gear[slot];
      const ilevel = cfg.targetIlevel > 0 ? cfg.targetIlevel : item.ilevel;
      const name = `${item.name} [${slot}] (${ilevel})`;
      specs.push({
        name,
        options: [
          gearOverrideLine(
            slot,
            { ...item, ilevel },
            equipped,
            cfg.keepEnchants,
          ),
        ],
        meta: {
          kind: 'item',
          itemId: item.itemId,
          itemName: item.name,
          slot,
          ilevel,
          source: item.source,
          replaces: equipped?.name ?? equipped?.itemId,
        },
      });
    }
  }

  return { specs, warnings };
}

// ---------------------------------------------------------------------------
// Buscador de mejoras
// ---------------------------------------------------------------------------

/**
 * Los abalorios se quedan fuera a propósito.
 *
 * Casi todo su valor está en un proc, no en las estadísticas, así que ordenarlos
 * por estadísticas daría una lista sin sentido justo donde más importa. Para
 * ellos está el apartado de Abalorios, que los pelea por parejas de verdad.
 */
const UPGRADE_SLOTS: GearSlot[] = SIMMED_SLOTS.filter(
  (slot) => slotFamily(slot) !== 'trinket' && slot !== 'main_hand' && slot !== 'off_hand',
);

/** Calidad de una pieza legendaria en la DBC. */
const LEGENDARY = 5;

export interface UpgradePlan {
  /** Candidatos elegidos por hueco, ya ordenados. */
  bySlot: { slot: GearSlot; candidates: ScoredItem[] }[];
  ilevels: number[];
  /** Cuántos perfiles saldrían. */
  total: number;
  /** Si no hay pesos guardados no se puede ordenar nada. */
  missingWeights: boolean;
  /** Legendarias que ya lleva puestas el personaje. */
  equippedLegendaries: number;
}

/** Los ilvls a probar, saneados: ordenados, sin repetidos y dentro de la fase. */
function upgradeIlevels(cfg: UpgradesConfig, cap: number | undefined): number[] {
  const clean = [...new Set(cfg.ilevels.filter((value) => value > 0))]
    .filter((value) => !cap || value <= cap)
    .sort((a, b) => a - b);
  return clean.length ? clean : [];
}

/**
 * Qué se va a probar, sin construir los perfiles.
 *
 * Se separa para poder enseñar el coste antes de lanzar, igual que en «Mejor
 * combinación»: aquí también el número sale de multiplicar huecos por
 * candidatos por ilvls, y conviene verlo antes de esperar diez minutos.
 */
export function describeUpgrades(
  character: Character,
  cfg: UpgradesConfig,
  factors: ScaleFactor[] | undefined,
): UpgradePlan {
  const ilevels = upgradeIlevels(cfg, ilevelCapOf(character.patchId ?? ''));

  const equippedLegendaries = SIMMED_SLOTS.filter((slot) => {
    const worn = character.gear[slot];
    return worn && getItemQuality(worn.itemId) === LEGENDARY;
  }).length;

  if (!factors?.length) {
    return {
      bySlot: [],
      ilevels,
      total: 0,
      missingWeights: true,
      equippedLegendaries,
    };
  }

  const weights = weightsByStat(factors);
  const slots = cfg.slots.length
    ? cfg.slots.filter((slot) => UPGRADE_SLOTS.includes(slot))
    : UPGRADE_SLOTS;

  const bySlot: UpgradePlan['bySlot'] = [];
  for (const slot of slots) {
    const equipped = character.gear[slot]?.itemId;
    const wearsLegendaryHere =
      equipped !== undefined && getItemQuality(equipped) === LEGENDARY;

    const pool = slotCandidates(slot, character.class, character.patchId).filter(
      (item) => {
        // Lo que ya llevas puesto no se prueba contra sí mismo.
        if (item.id === equipped) return false;
        if (!cfg.includePvp && isPvpItem(item.name)) return false;
        if (item.quality !== LEGENDARY) return true;

        // Una legendaria gana casi siempre por potencia bruta, pero en Legion
        // solo se llevan dos. Si en este hueco ya hay una, cambiarla por otra
        // es un cambio justo y se prueba igualmente; si no, solo entra cuando
        // el jugador ha dicho que quiere verlas.
        return wearsLegendaryHere || cfg.includeNewLegendaries;
      },
    );

    const candidates = pickSlotCandidates(pool, weights, cfg.perSlot);
    if (candidates.length) bySlot.push({ slot, candidates });
  }

  const perCandidate = ilevels.length || 1;
  const total = bySlot.reduce((acc, entry) => acc + entry.candidates.length * perCandidate, 0);
  return { bySlot, ilevels, total, missingWeights: false, equippedLegendaries };
}

function buildUpgrades(
  character: Character,
  cfg: UpgradesConfig,
  factors: ScaleFactor[] | undefined,
): { specs: ProfilesetSpec[]; warnings: string[] } {
  const plan = describeUpgrades(character, cfg, factors);
  const warnings: string[] = [];

  if (plan.missingWeights) {
    throw new Error(
      'Para buscar mejoras hacen falta tus pesos de estadística, y este ' +
        'personaje todavía no los tiene. Lanza antes «Cuánto pego» con la ' +
        'casilla «Calcular también cuánto vale cada estadística» marcada.',
    );
  }

  if (!plan.bySlot.length) {
    throw new Error(
      'No se han encontrado piezas que probar. Revisa la fase del personaje: ' +
        'si el tope de ilvl es muy bajo puede que no haya candidatos.',
    );
  }

  const specs: ProfilesetSpec[] = [];

  for (const { slot, candidates } of plan.bySlot) {
    const equipped = character.gear[slot];

    for (const { item, reason } of candidates) {
      // Sin escalera de ilvls se prueba la pieza tal y como es.
      const levels = plan.ilevels.length ? plan.ilevels : [item.ilevel];

      for (const ilevel of levels) {
        const candidate: CandidateItem = {
          itemId: item.id,
          name: item.name,
          slots: item.slots,
          ilevel,
          quality: item.quality,
        };

        specs.push({
          name: `${item.name} [${slot}] (${ilevel})`,
          options: [gearOverrideLine(slot, candidate, equipped, cfg.keepEnchants)],
          meta: {
            kind: 'upgrade',
            itemId: item.id,
            itemName: item.name,
            slot,
            ilevel,
            quality: item.quality,
            reason,
            replaces: equipped?.name ?? equipped?.itemId,
            replacesId: equipped?.itemId,
            replacesIlevel: equipped?.ilevel,
            replacesIsLegendary:
              equipped !== undefined && getItemQuality(equipped.itemId) === LEGENDARY,
          },
        });
      }
    }
  }

  return { specs, warnings };
}

// ---------------------------------------------------------------------------
// Top Gear
// ---------------------------------------------------------------------------

/**
 * Una pieza candidata para un slot, junto con la forma de escribir su línea
 * .simc en el slot que le toque.
 */
interface SlotOption {
  itemId: number;
  name: string;
  ilevel: number;
  quality: number;
  /** true si el personaje ya la lleva puesta. */
  equipped: boolean;
  /** Slot donde está equipada ahora mismo (solo si `equipped`). */
  originalSlot?: GearSlot;
  /** Línea de equipo para el slot destino. */
  lineFor: (slot: GearSlot) => string;
}

function candidateOption(
  item: CandidateItem,
  character: Character,
  keepEnchants: boolean,
): SlotOption {
  return {
    itemId: item.itemId,
    name: item.name,
    ilevel: item.ilevel,
    quality: item.quality ?? getItemQuality(item.itemId) ?? 4,
    equipped: false,
    lineFor: (slot) =>
      gearOverrideLine(slot, item, character.gear[slot], keepEnchants),
  };
}

function equippedOption(slot: GearSlot, item: GearItem): SlotOption {
  return {
    itemId: item.itemId,
    // El export del addon no trae nombres de lo equipado, así que se completa
    // con la base de datos: si no, en los resultados salen «Ítem 140806».
    name: item.name ?? getItemName(item.itemId) ?? `Ítem ${item.itemId}`,
    ilevel: item.ilevel ?? 0,
    quality: getItemQuality(item.itemId) ?? 4,
    equipped: true,
    originalSlot: slot,
    // Al reescribir un slot emparejado hay que volver a declarar también la
    // pieza equipada, con su encantamiento, gemas y reliquias intactos.
    lineFor: (target) => gearItemToLine(item, target),
  };
}

/** Una pieza colocada en un slot concreto dentro de una combinación. */
interface Placement {
  option: SlotOption;
  slot: GearSlot;
  /** true si la pieza sigue exactamente donde ya estaba. */
  unchanged: boolean;
}

function place(option: SlotOption, slot: GearSlot): Placement {
  return { option, slot, unchanged: option.originalSlot === slot };
}

/**
 * Combinaciones de dos ítems distintos para slots emparejados.
 *
 * Los dos huecos son intercambiables para simc, así que basta con parejas sin
 * orden. Si ambas piezas siguen en su hueco original, la pareja no aporta
 * ninguna línea: es el equipo base.
 */
function pairCombinations(options: SlotOption[], slots: GearSlot[]): Placement[][] {
  const result: Placement[][] = [];
  for (let i = 0; i < options.length; i++) {
    for (let j = i + 1; j < options.length; j++) {
      const a = options[i];
      const b = options[j];
      // No se pueden llevar dos copias del mismo ítem en anillos/abalorios.
      if (a.itemId === b.itemId) continue;

      // Los dos huecos son equivalentes para simc, así que colocamos cada
      // pieza en el suyo cuando ya está equipada: así una sustitución se lee
      // como "cambio un anillo", no como "muevo los dos".
      const flip = a.originalSlot === slots[1] || b.originalSlot === slots[0];
      const [first, second] = flip ? [b, a] : [a, b];

      result.push([place(first, slots[0]), place(second, slots[1])]);
    }
  }
  return result;
}

/** Una familia de slots y las configuraciones que admite. */
interface TopGearAxis {
  family: string;
  choices: Placement[][];
}

/**
 * Los ejes de la búsqueda: una familia de slots por eje.
 *
 * Se separa de `buildTopGear` porque hace falta contar las combinaciones sin
 * llegar a construirlas. El número crece multiplicándose y se dispara enseguida,
 * así que la app lo enseña mientras el jugador elige piezas en vez de dejarle
 * llegar hasta el final y darle un error.
 */
function topGearAxes(character: Character, cfg: TopGearConfig): TopGearAxis[] {
  // 1. Agrupamos candidatos por familia de slot.
  const families = new Map<string, GearSlot[]>();
  const wantedSlots = cfg.slots.length ? cfg.slots : undefined;
  const candidatesByFamily = new Map<string, CandidateItem[]>();

  for (const item of cfg.items) {
    for (const slot of item.slots) {
      if (wantedSlots && !wantedSlots.includes(slot)) continue;
      const family = slotFamily(slot);
      families.set(family, PAIRED_SLOTS[family] ?? [slot]);
      const list = candidatesByFamily.get(family) ?? [];
      if (!list.some((c) => c.itemId === item.itemId)) list.push(item);
      candidatesByFamily.set(family, list);
    }
  }

  // 2. Para cada familia, las configuraciones posibles de sus slots.
  const axes: TopGearAxis[] = [];

  for (const [family, slots] of families) {
    const candidates = candidatesByFamily.get(family) ?? [];

    if (slots.length === 2) {
      const pool: SlotOption[] = [];
      for (const slot of slots) {
        const equipped = character.gear[slot];
        if (equipped) pool.push(equippedOption(slot, equipped));
      }
      for (const candidate of candidates) {
        pool.push(candidateOption(candidate, character, cfg.keepEnchants));
      }
      const combos = pairCombinations(dedupeById(pool), slots);
      if (combos.length) axes.push({ family, choices: combos });
    } else {
      const slot = slots[0];
      const equipped = character.gear[slot];
      const choices: Placement[][] = [];
      if (equipped) {
        choices.push([place(equippedOption(slot, equipped), slot)]);
      }
      for (const candidate of candidates) {
        choices.push([
          place(candidateOption(candidate, character, cfg.keepEnchants), slot),
        ]);
      }
      if (choices.length > 1) axes.push({ family, choices });
    }
  }

  return axes;
}

/**
 * Cuántas combinaciones salen y de dónde vienen, sin construirlas.
 *
 * El total es el producto de los ejes, así que una pieza más no suma unas
 * cuantas variantes: multiplica todo lo demás. Devolver el desglose por familia
 * permite enseñar dónde está el problema («los anillos multiplican por 10») en
 * vez de un número enorme y ya.
 */
export function describeTopGearSpace(
  character: Character,
  cfg: TopGearConfig,
): TopGearSpace {
  const axes = topGearAxes(character, cfg);
  const limit = Math.min(cfg.maxCombinations, config.maxProfilesets);
  const total = axes.reduce((acc, axis) => acc * axis.choices.length, 1);

  return {
    axes: axes
      .map((axis) => ({ family: axis.family, options: axis.choices.length }))
      // De mayor a menor: el primero es el que más recorta si se toca.
      .sort((a, b) => b.options - a.options),
    total: axes.length ? total : 0,
    limit,
    overLimit: axes.length > 0 && total > limit,
  };
}

function buildTopGear(
  character: Character,
  cfg: TopGearConfig,
): { specs: ProfilesetSpec[]; warnings: string[] } {
  const warnings: string[] = [];
  const axes = topGearAxes(character, cfg);

  if (!axes.length) {
    throw new Error(
      'No hay ítems alternativos que combinar. Añade piezas al inventario del ' +
        'personaje o selecciona más candidatos.',
    );
  }

  // 3. Producto cartesiano con tope.
  const total = axes.reduce((acc, axis) => acc * axis.choices.length, 1);
  const limit = Math.min(cfg.maxCombinations, config.maxProfilesets);
  if (total > limit) {
    throw new Error(
      `La combinación pedida genera ${total.toLocaleString('es-ES')} perfiles, por ` +
        `encima del tope de ${limit.toLocaleString('es-ES')}. Reduce los slots o los ` +
        'ítems candidatos.',
    );
  }

  const specs: ProfilesetSpec[] = [];
  const equippedLegendaries = countEquippedLegendaries(character, axes);
  const seenCombos = new Set<string>();

  const walk = (index: number, current: Placement[]) => {
    if (index === axes.length) {
      const legendaries =
        equippedLegendaries.outside +
        current.filter((placement) => placement.option.quality === 5).length;

      if (cfg.maxLegendaries > 0 && legendaries > cfg.maxLegendaries) return;

      const changed = current.filter((placement) => !placement.unchanged);
      if (!changed.length) return; // es el perfil base

      // Un slot emparejado se reescribe entero: si cambia una pieza hay que
      // declarar también la otra para no perderla.
      const touchedFamilies = new Set(changed.map((p) => slotFamily(p.slot)));
      const options = current
        .filter((placement) => touchedFamilies.has(slotFamily(placement.slot)))
        .map((placement) => placement.option.lineFor(placement.slot))
        .filter(Boolean);

      if (!options.length) return;

      // Dos recorridos distintos pueden dar el mismo equipo final.
      const key = [...options].sort().join('|');
      if (seenCombos.has(key)) return;
      seenCombos.add(key);

      specs.push({
        name: changed
          .map((placement) => `${placement.option.name} (${placement.slot})`)
          .join(' + '),
        options,
        meta: {
          kind: 'combination',
          items: changed.map((placement) => ({
            itemId: placement.option.itemId,
            name: placement.option.name,
            slot: placement.slot,
            ilevel: placement.option.ilevel,
          })),
          /*
           * Las piezas del mismo hueco que NO cambian.
           *
           * Sin esto la tabla solo nombraba lo que se mueve, y en un hueco
           * doble eso engaña: al comparar abalorios, una fila que dice «Tiny
           * Oozeling (Abalorio 1)» lleva además el abalorio que ya tenías en el
           * otro sitio, pero no había forma de saberlo. Un usuario dio por
           * hecho que su Convergencia no se había incluido.
           */
          kept: current
            .filter(
              (placement) =>
                placement.unchanged && touchedFamilies.has(slotFamily(placement.slot)),
            )
            .map((placement) => ({
              itemId: placement.option.itemId,
              name: placement.option.name,
              slot: placement.slot,
              ilevel: placement.option.ilevel,
            })),
          legendaries,
        },
      });
      return;
    }

    for (const choice of axes[index].choices) {
      walk(index + 1, [...current, ...choice]);
    }
  };

  walk(0, []);

  // Quedarse sin ninguna combinación no es un resultado: es una configuración
  // imposible. Antes se dejaba correr y el jugador acababa en una pantalla de
  // resultados vacía, sin saber qué había pasado.
  if (!specs.length) {
    const legendaryCandidates = axes.some((axis) =>
      axis.choices.some((choice) =>
        choice.some((placement) => placement.option.quality === 5),
      ),
    );

    if (legendaryCandidates && cfg.maxLegendaries > 0) {
      throw new Error(
        `Ninguna combinación cabe dentro del límite de ${cfg.maxLegendaries} ` +
          `legendarias: ya llevas ${equippedLegendaries.outside} puestas en ` +
          'huecos que no se tocan, así que añadir otra se pasaría. Sube el ' +
          'límite si tu servidor permite más, o quita las piezas legendarias ' +
          'de la selección.',
      );
    }

    throw new Error(
      'Ninguna combinación de las piezas elegidas cambia nada respecto a lo que ' +
        'ya llevas puesto. Añade piezas distintas de las equipadas.',
    );
  }

  return { specs, warnings };
}

function dedupeById(options: SlotOption[]): SlotOption[] {
  const seen = new Map<number, SlotOption>();
  for (const option of options) {
    const existing = seen.get(option.itemId);
    // Preferimos la versión equipada: conserva encantamiento y gemas reales.
    if (!existing || (option.equipped && !existing.equipped)) {
      seen.set(option.itemId, option);
    }
  }
  return [...seen.values()];
}

/** Legendarias equipadas en slots que NO estamos combinando. */
function countEquippedLegendaries(
  character: Character,
  axes: { family: string; choices: Placement[][] }[],
): { outside: number } {
  const varying = new Set(axes.map((axis) => axis.family));
  let outside = 0;
  for (const item of Object.values(character.gear)) {
    if (!item) continue;
    if (varying.has(slotFamily(item.slot))) continue;
    if (getItemQuality(item.itemId) === 5) outside++;
  }
  return { outside };
}

// ---------------------------------------------------------------------------
// Talentos
// ---------------------------------------------------------------------------

function buildTalents(
  character: Character,
  cfg: TalentsConfig,
): { specs: ProfilesetSpec[]; warnings: string[] } {
  const warnings: string[] = [];
  const base = character.talents;

  if (!/^[0-3]{7}$/.test(base)) {
    throw new Error(
      `La cadena de talentos "${base}" no es válida. Debe tener 7 dígitos (0-3).`,
    );
  }

  const specs: ProfilesetSpec[] = [];
  const seen = new Set<string>([base]);

  const push = (talents: string, meta: Record<string, unknown>) => {
    if (seen.has(talents)) return;
    seen.add(talents);
    specs.push({ name: `Talentos ${talents}`, options: [`talents=${talents}`], meta });
  };

  if (cfg.mode === 'custom') {
    for (const talents of cfg.custom ?? []) {
      if (!/^[0-3]{7}$/.test(talents)) {
        warnings.push(`Se ignoró la cadena de talentos inválida "${talents}".`);
        continue;
      }
      push(talents, { kind: 'talents', talents });
    }
  } else if (cfg.mode === 'rows') {
    const rows = cfg.rows.length ? cfg.rows : [1, 2, 3, 4, 5, 6, 7];
    for (const row of rows) {
      if (row < 1 || row > 7) continue;
      for (let choice = 1; choice <= 3; choice++) {
        const chars = base.split('');
        chars[row - 1] = String(choice);
        push(chars.join(''), {
          kind: 'talents',
          talents: chars.join(''),
          row,
          choice,
        });
      }
    }
  } else {
    // Todas las combinaciones: 3^7 = 2187 perfiles.
    const total = 3 ** 7;
    for (let index = 0; index < total; index++) {
      let value = index;
      const chars: string[] = [];
      for (let row = 0; row < 7; row++) {
        chars.push(String((value % 3) + 1));
        value = Math.floor(value / 3);
      }
      const talents = chars.join('');
      push(talents, { kind: 'talents', talents });
    }
  }

  return { specs, warnings };
}

// ---------------------------------------------------------------------------
// Consumibles
// ---------------------------------------------------------------------------

function buildConsumables(cfg: ConsumablesConfig): {
  specs: ProfilesetSpec[];
  warnings: string[];
} {
  const specs: ProfilesetSpec[] = [];
  const axes: [string, string[], string][] = [
    ['flask', cfg.flasks, 'Frasco'],
    ['food', cfg.foods, 'Comida'],
    ['potion', cfg.potions, 'Poción'],
    ['augmentation', cfg.augmentations, 'Runa'],
  ];

  for (const [option, values, label] of axes) {
    for (const value of values) {
      if (!value) continue;
      specs.push({
        name: `${label}: ${value}`,
        options: [`${option}=${value}`],
        meta: { kind: 'consumable', category: option, value, label },
      });
    }
  }

  if (!specs.length) {
    throw new Error('Selecciona al menos un consumible para comparar.');
  }

  return { specs, warnings: [] };
}

// ---------------------------------------------------------------------------
// Reliquias y Crisol de Luznether
// ---------------------------------------------------------------------------

/**
 * Una reliquia sube un rango de un rasgo del artefacto y, de paso, el ilvl del
 * arma. Aquí se comparan las dos cosas por separado:
 *
 *  - Cada rasgo con `artifact_override=<rasgo>:<rango actual + N>`.
 *  - Cada ilvl de arma reescribiendo la línea de `main_hand`.
 *
 * Ojo con la validación: si el nombre del rasgo no existe, SimulationCraft
 * avisa por consola pero simula igual con el rango original, así que el perfil
 * saldría con el DPS base y parecería un resultado legítimo. Por eso se exige
 * que cada rasgo esté en la lista que leyó la sonda del artefacto.
 */
/** Un arma artefacto de Legion tiene tres huecos de reliquia. */
const RELIC_SLOTS = 3;

/** Normaliza los tres ilvl de reliquia; devuelve null si no son utilizables. */
function normalizeRelicIlevels(values: number[] | undefined): number[] | null {
  if (!Array.isArray(values)) return null;
  const usable = values
    .map((value) => Math.round(Number(value)))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (usable.length < RELIC_SLOTS) return null;
  return usable.slice(0, RELIC_SLOTS);
}

function buildRelics(
  character: Character,
  cfg: RelicsConfig,
): { specs: ProfilesetSpec[]; warnings: string[] } {
  const warnings: string[] = [];
  const specs: ProfilesetSpec[] = [];

  const known = character.artifactTraits ?? [];
  if (!known.length && cfg.traits.length) {
    throw new Error(
      'Todavía no se han leído los rasgos del artefacto de este personaje. ' +
        'Pulsa "Leer rasgos del artefacto" en la ficha antes de comparar reliquias.',
    );
  }

  const byToken = new Map(known.map((trait) => [trait.token, trait]));
  const extraRanks = Math.max(1, Math.round(cfg.extraRanks || 1));

  for (const token of cfg.traits) {
    const trait = byToken.get(token);
    if (!trait) {
      throw new Error(
        `El rasgo "${token}" no existe en el artefacto de este personaje. ` +
          'SimulationCraft lo ignoraría en silencio y el resultado saldría igual ' +
          'que el perfil base.',
      );
    }

    const target = trait.totalRank + extraRanks;
    specs.push({
      name: `${trait.name} ${trait.totalRank} → ${target}`,
      options: [`artifact_override=${trait.token}:${target}`],
      meta: {
        kind: 'relic',
        trait: trait.name,
        token: trait.token,
        fromRank: trait.totalRank,
        toRank: target,
      },
    });
  }

  // Segundo eje: cuánto vale subir el ilvl de cada reliquia.
  //
  // No vale con forzar `ilevel=` en el arma: en un artefacto el ilvl sale de
  // las reliquias, y fijarlo a mano lo baja de golpe (999 -> lo que pongas) y
  // da diferencias absurdas. La opción correcta es `relic_ilevel=`, que toma un
  // ilvl por cada uno de los tres slots.
  const weapon = character.gear.main_hand;
  if (cfg.relicIlevels.length) {
    if (!weapon) {
      warnings.push(
        'El personaje no tiene arma principal en el perfil: se omite la ' +
          'comparación de ilvl de reliquias.',
      );
    } else {
      const current = normalizeRelicIlevels(cfg.currentRelicIlevels);
      if (!current) {
        throw new Error(
          'Indica el ilvl actual de tus tres reliquias para poder comparar ' +
            'subidas de ilvl.',
        );
      }

      const line = (ilevels: number[]) =>
        `${gearItemToLine(weapon, 'main_hand')},relic_ilevel=${ilevels.join('/')}`;

      // Referencia con los valores actuales: si se aleja del perfil base es que
      // los ilvl declarados no son los reales.
      specs.push({
        name: `Reliquias actuales (${current.join('/')})`,
        options: [line(current)],
        meta: { kind: 'relic_ilevel_reference', ilevels: current },
      });

      for (let slot = 0; slot < RELIC_SLOTS; slot++) {
        for (const ilevel of cfg.relicIlevels) {
          if (!Number.isFinite(ilevel) || ilevel <= 0) continue;
          if (ilevel === current[slot]) continue;
          const next = [...current];
          next[slot] = Math.round(ilevel);
          specs.push({
            name: `Reliquia ${slot + 1} a ilvl ${next[slot]}`,
            options: [line(next)],
            meta: {
              kind: 'relic_ilevel',
              slot: slot + 1,
              ilevel: next[slot],
              from: current[slot],
            },
          });
        }
      }
    }
  }

  if (!specs.length) {
    throw new Error('Selecciona al menos un rasgo o un ilvl de reliquia que comparar.');
  }

  return { specs, warnings };
}

// ---------------------------------------------------------------------------
// Encantamientos y gemas
// ---------------------------------------------------------------------------

/** La pieza que ocupa el slot, o un error explicando que está vacío. */
function requireEquipped(character: Character, slot: GearSlot): GearItem {
  const item = character.gear[slot];
  if (!item) {
    throw new Error(
      `No llevas nada en ${slot}, así que no hay nada que encantar ni engarzar ahí.`,
    );
  }
  return item;
}

/**
 * Compara encantamientos de un slot.
 *
 * Cada perfil reescribe la pieza entera cambiando solo el `enchant_id`. Los ids
 * se validan contra el catálogo porque SimulationCraft ignora en silencio uno
 * que no conoce: el perfil saldría con el DPS sin encantar y parecería bueno.
 */
function buildEnchants(
  character: Character,
  cfg: EnchantsConfig,
): { specs: ProfilesetSpec[]; warnings: string[] } {
  const warnings: string[] = [];
  const equipped = requireEquipped(character, cfg.slot);
  const specs: ProfilesetSpec[] = [];

  if (cfg.includeNone) {
    specs.push({
      name: `${cfg.slot}: sin encantar`,
      options: [
        gearItemToLine(
          { ...equipped, enchantId: undefined, enchantName: undefined },
          cfg.slot,
        ),
      ],
      meta: { kind: 'enchant', slot: cfg.slot, enchantId: 0, name: 'Sin encantar' },
    });
  }

  for (const enchantId of cfg.enchantIds) {
    const enchant = getEnchant(enchantId);
    if (!enchant) {
      throw new Error(
        `El encantamiento ${enchantId} no está en el catálogo. SimulationCraft lo ` +
          'ignoraría en silencio y el resultado saldría igual que sin encantar.',
      );
    }

    specs.push({
      name: enchant.name,
      options: [
        gearItemToLine({ ...equipped, enchantId, enchantName: undefined }, cfg.slot),
      ],
      meta: { kind: 'enchant', slot: cfg.slot, enchantId, name: enchant.name },
    });
  }

  if (!specs.length) {
    throw new Error('Selecciona al menos un encantamiento que comparar.');
  }

  return { specs, warnings };
}

/**
 * Compara gemas de un slot.
 *
 * Si la pieza no tiene engarce, SimulationCraft ignora la gema y todos los
 * perfiles salen iguales. No se puede saber con certeza si lo tiene (en Legion
 * el engarce lo da un bonus_id), pero si ahora mismo no lleva ninguna gema es
 * el caso probable, así que se avisa.
 */
function buildGems(
  character: Character,
  cfg: GemsConfig,
): { specs: ProfilesetSpec[]; warnings: string[] } {
  const warnings: string[] = [];
  const equipped = requireEquipped(character, cfg.slot);
  const specs: ProfilesetSpec[] = [];

  if (!equipped.gemIds.length) {
    warnings.push(
      `La pieza de ${cfg.slot} no lleva ninguna gema ahora mismo. Si no tiene ` +
        'engarce, SimulationCraft ignorará las gemas y todos los perfiles ' +
        'saldrán con el mismo DPS.',
    );
  }

  if (cfg.includeNone) {
    specs.push({
      name: `${cfg.slot}: sin gema`,
      options: [gearItemToLine({ ...equipped, gemIds: [] }, cfg.slot)],
      meta: { kind: 'gem', slot: cfg.slot, gemId: 0, name: 'Sin gema' },
    });
  }

  for (const gemId of cfg.gemIds) {
    const gem = getGem(gemId);
    if (!gem) {
      throw new Error(
        `La gema ${gemId} no está en el catálogo. Comprueba el id: una gema ` +
          'desconocida no se aplicaría y el perfil saldría como si no la llevaras.',
      );
    }

    specs.push({
      name: gem.name,
      options: [gearItemToLine({ ...equipped, gemIds: [gemId] }, cfg.slot)],
      meta: { kind: 'gem', slot: cfg.slot, gemId, name: gem.name },
    });
  }

  if (!specs.length) {
    throw new Error('Selecciona al menos una gema que comparar.');
  }

  return { specs, warnings };
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

/**
 * SimulationCraft aborta el lote entero si un ítem no es equipable por la
 * clase, así que lo comprobamos antes de generar nada.
 */
function assertEquippable(character: Character, items: CandidateItem[]): void {
  for (const candidate of items) {
    const record = getItem(candidate.itemId);
    if (!record) continue; // no está en la base: que decida simc
    if (!canClassEquip(record, character.class)) {
      throw new Error(
        `"${record.name}" (id ${record.id}) no lo puede equipar un ${character.class.replace(/_/g, ' ')}. ` +
          'Quítalo de la selección: SimulationCraft cancelaría toda la simulación.',
      );
    }
  }
}

export function buildSim(character: Character, request: SimRequest): BuiltSim {
  const { options, config: cfg } = request;
  const warnings: string[] = [];
  let specs: ProfilesetSpec[] = [];
  let scaleFactors = false;
  let scaleStats: string[] | undefined;

  switch (cfg.type) {
    case 'quick':
      scaleFactors = cfg.statWeights;
      scaleStats = cfg.scaleStats;
      break;
    case 'droptimizer': {
      assertEquippable(character, cfg.items);
      const built = buildDroptimizer(character, cfg);
      specs = built.specs;
      warnings.push(...built.warnings);
      break;
    }
    case 'upgrades': {
      const built = buildUpgrades(character, cfg, latestScaleFactors(character.id));
      specs = built.specs;
      warnings.push(...built.warnings);
      break;
    }
    case 'topgear': {
      assertEquippable(character, cfg.items);
      const built = buildTopGear(character, cfg);
      specs = built.specs;
      warnings.push(...built.warnings);
      break;
    }
    case 'talents': {
      const built = buildTalents(character, cfg);
      specs = built.specs;
      warnings.push(...built.warnings);
      break;
    }
    case 'consumables': {
      const built = buildConsumables(cfg);
      specs = built.specs;
      warnings.push(...built.warnings);
      break;
    }
    case 'relics': {
      const built = buildRelics(character, cfg);
      specs = built.specs;
      warnings.push(...built.warnings);
      break;
    }
    case 'enchants': {
      const built = buildEnchants(character, cfg);
      specs = built.specs;
      warnings.push(...built.warnings);
      break;
    }
    case 'gems': {
      const built = buildGems(character, cfg);
      specs = built.specs;
      warnings.push(...built.warnings);
      break;
    }
  }

  if (specs.length > config.maxProfilesets) {
    throw new Error(
      `La simulación generaría ${specs.length} perfiles, por encima del tope de ` +
        `${config.maxProfilesets}. Reduce la selección.`,
    );
  }

  const meta: Record<string, Record<string, unknown>> = {};
  const lines: string[] = [
    buildCharacterProfile(character, options),
    ...buildSimOptions(options),
  ];

  const usedNames = new Set<string>();
  for (const spec of specs) {
    // Los nombres de profileset deben ser únicos: simc los usa como clave.
    let name = spec.name;
    let suffix = 2;
    while (usedNames.has(name)) name = `${spec.name} (${suffix++})`;
    usedNames.add(name);

    const finalSpec = { ...spec, name };
    lines.push(...renderProfileset(finalSpec));
    if (spec.meta) meta[name] = spec.meta;
  }

  return {
    profileText: `${lines.join('\n')}\n`,
    args: buildCliArgs(options, {
      profilesets: specs.length > 0,
      scaleFactors,
      scaleStats,
    }),
    meta,
    profilesetCount: specs.length,
    warnings,
  };
}
