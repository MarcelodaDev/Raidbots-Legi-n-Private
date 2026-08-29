/**
 * Las explicaciones de la app, todas en el mismo sitio.
 *
 * La regla al escribirlas: que las entienda alguien que juega pero nunca ha
 * usado un simulador. Nada de "profileset", "scale factor" ni "DPS normalizado"
 * dentro del propio texto; si hace falta un término técnico, se explica aquí y
 * no se da por sabido en ningún otro lado.
 *
 * Están juntas a propósito: así la misma palabra se explica igual en todas las
 * pantallas y se corrige en un solo sitio.
 */

export interface GlossaryEntry {
  /** Título corto de la ayuda. */
  title: string;
  /** Explicación en dos o tres frases como mucho. */
  text: string;
}

export const GLOSSARY = {
  dps: {
    title: 'DPS',
    text: 'Daño por segundo. Es el número que resume cuánto daño haces: si sube, pegas más fuerte.',
  },

  dpsError: {
    title: 'El ± que va detrás',
    text: 'La simulación juega miles de combates y cada uno sale distinto. El ± es el margen de la media: si pone 500.000 ± 1.000, el número real está casi seguro entre 499.000 y 501.000. Cuanto más pequeño, más fiable.',
  },

  ilevel: {
    title: 'ilvl (nivel de objeto)',
    text: 'El "nivel" de una pieza. A más ilvl, más estadísticas da. Es lo que sube cuando una pieza te cae forjada.',
  },

  iterations: {
    title: 'Tope de repeticiones',
    text: 'Como mucho, cuántos combates pelea cada opción. Más repeticiones dan un resultado más estable, pero tardan más. Con 10.000 va de sobra para casi todo.',
  },

  targetError: {
    title: 'Precisión',
    text: 'Cuánto quieres afinar el resultado. Deja de pelear en cuanto llega a ese margen, sin gastar más tiempo del necesario. 0,2% está bien para comparar piezas; para diferencias muy pequeñas, baja a 0,1%.',
  },

  fightStyle: {
    title: 'Tipo de pelea',
    text: 'Qué tipo de pelea simula. Patchwerk es un muñeco quieto que no se mueve: sirve para comparar equipo sin que el resultado dependa de la mecánica del jefe. Los demás añaden movimiento o enemigos que van y vienen.',
  },

  targets: {
    title: 'Cuántos enemigos',
    text: 'Cuántos enemigos hay. Con 1 mides daño a un solo objetivo, que es lo normal para jefes. Sube el número si quieres saber cómo rindes en grupos.',
  },

  threads: {
    title: 'Núcleos a usar',
    text: 'Cuántos núcleos de tu procesador usa. Cuantos más, menos esperas. Deja uno libre si quieres seguir usando el ordenador mientras calcula.',
  },

  profiles: {
    title: 'Variantes',
    text: 'Cada versión de tu personaje que se va a probar. Si comparas 10 piezas, son 10 variantes más la tuya actual. Cuantas más, más tarda.',
  },

  statWeights: {
    title: 'Valor de cada estadística',
    text: 'Te dice cuánto DPS te da un punto de crítico, de celeridad, de maestría… Sirve para saber qué estadística te interesa más al elegir equipo. Tarda bastante más porque hay que simular una vez por estadística.',
  },

  droptimizer: {
    title: 'Probar piezas',
    text: 'Prueba cada pieza por separado, una a una, y las ordena por cuánto DPS te daría ponértela. Es lo que se usa para decidir si una pieza que te ha caído es mejor que la que llevas.',
  },

  topgear: {
    title: 'Mejor combinación',
    text: 'Prueba todas las formas de combinar las piezas que le des y te dice cuál es el mejor conjunto. Distinto de probar piezas sueltas: aquí dos piezas que por separado son peores pueden ser mejores juntas.',
  },

  targetIlevel: {
    title: 'Igualar el ilvl',
    text: 'Pone todas las piezas al mismo nivel antes de compararlas, para ver cuál es mejor "de base" sin que gane simplemente la que tiene el ilvl más alto. Déjalo en 0 para comparar las piezas tal y como son.',
  },

  keepEnchants: {
    title: 'Heredar encantamiento y gemas',
    text: 'Al probar una pieza nueva, le pone el encantamiento y las gemas que ya tienes en ese hueco. Es lo razonable: si te pones el anillo nuevo, lo vas a encantar igual. Quítalo si quieres verla sin nada.',
  },

  maxLegendaries: {
    title: 'Máximo de legendarias',
    text: 'Cuántas piezas legendarias puedes llevar puestas a la vez. Depende de la fase del servidor, y la app la rellena sola con la de tu fase.',
  },

  maxCombinations: {
    title: 'Tope de combinaciones',
    text: 'Un freno de seguridad. Con muchas piezas las combinaciones se disparan y la simulación no acabaría nunca, así que se corta en este número.',
  },

  talents: {
    title: 'Cómo comparar los talentos',
    text: 'Fila a fila cambia un talento cada vez y te dice cuál es el mejor de cada fila: rápido y suele bastar. Todas las combinaciones prueba los siete a la vez, por si dos talentos se potencian entre ellos, pero tarda muchísimo más.',
  },

  artifactTraits: {
    title: 'Rasgos del artefacto',
    text: 'Las mejoras de tu arma artefacto. Cada una se puede subir de rango, y las reliquias que le pones suben rangos concretos. Los lee el propio simulador, porque es quien sabe qué rangos te da el Crisol.',
  },

  relicIlevel: {
    title: 'ilvl de la reliquia',
    text: 'Las reliquias suben el nivel de tu arma además de dar rangos. Aquí pones el nivel de las que llevas ahora y los niveles que quieres probar, para ver cuánto te daría una reliquia mejor.',
  },

  extraRanks: {
    title: 'Rangos que suma',
    text: 'Cuántos rangos añadiría la reliquia nueva al rasgo. Normalmente 1: es lo que da una reliquia al cambiarla por otra del mismo tipo.',
  },

  enchants: {
    title: 'Encantamientos',
    text: 'Compara los encantamientos que puedes poner en un hueco, incluido no poner ninguno, para ver cuál renta más.',
  },

  gems: {
    title: 'Gemas',
    text: 'Compara las gemas de un hueco. Cuidado: si la pieza no tiene engarce, la gema no hace nada y todas las variantes darán el mismo resultado.',
  },

  phase: {
    title: 'Fase del servidor',
    text: 'En qué punto de Legion está tu servidor progresivo. Al elegirla, el buscador deja de enseñarte equipo que todavía no existe y las recomendaciones se ajustan a lo que sí puedes conseguir.',
  },

  bag: {
    title: 'Tu inventario',
    text: 'Las piezas que tienes guardadas para comparar. El addon de Legion no lee las bolsas de forma fiable, así que se añaden desde el buscador y se quedan guardadas con el personaje.',
  },

  baseline: {
    title: 'Tu personaje ahora',
    text: 'El DPS de tu personaje tal y como está equipado. Todas las diferencias de la tabla se miden contra este número.',
  },

  delta: {
    title: 'Ganancia',
    text: 'Cuánto DPS ganas o pierdes con ese cambio, comparado con tu personaje ahora mismo. En verde y con ▲ si mejora, en rojo y con ▼ si empeora.',
  },

  upgrades: {
    title: 'Qué me mejora',
    text: 'Repasa todas las piezas de tu fase que tu clase puede llevar, se queda con las más prometedoras de cada hueco y las simula de verdad. Te dice cuáles te suben el DPS y desde qué nivel de objeto empiezan a merecer la pena.',
  },

  pvpGear: {
    title: 'Equipo de PvP',
    text: 'Las piezas de temporada (Gladiator, Combatant, Aspirant) funcionan fuera de PvP como cualquier otra, así que el motor las simula igual. Pero si juegas bandas y mazmorras solo estorban: en una fase pueden ser más de la mitad de los abalorios candidatos. Por eso se dejan fuera salvo que las pidas.',
  },

  legendaryCap: {
    title: 'Legendarias y el tope de dos',
    text: 'Una legendaria gana casi siempre por potencia bruta, así que si se proponen en todos los huecos el primer puesto de cada uno sería una legendaria… y en Legion solo puedes llevar dos. Con esto apagado solo se prueban en los huecos donde ya llevas una, que es donde cambiarla no altera el total. Enciéndelo si quieres ver cuál te convendría conseguir.',
  },

  perSlot: {
    title: 'Candidatos por hueco',
    text: 'Cuántas piezas se pelean en cada hueco. Se eligen antes sin simular: la mitad por llevar las estadísticas que a ti te rentan y la mitad por tener más ilvl, para no perder ninguna de las dos formas de ser mejor. Más candidatos afinan más, pero tardan más.',
  },

  upgradeIlevels: {
    title: 'Niveles a probar',
    text: 'Cada pieza se simula a estos niveles de objeto. Sirve para saber desde cuál te compensa: una pieza puede no mejorarte a 940 y sí a 970. Cuantos más niveles, más tarda.',
  },

  trinkets: {
    title: 'Abalorios',
    text: 'Los abalorios se prueban por parejas, porque lo que decide es la combinación: dos que por separado son buenos pueden solaparse. Van aparte del buscador de mejoras porque casi todo su valor está en el efecto que disparan, no en sus estadísticas, así que ordenarlos sin simularlos no funcionaría.',
  },

  topgearSpace: {
    title: 'Por qué crece tan rápido',
    text: 'Se prueban todas las mezclas posibles, así que las opciones de cada hueco se multiplican entre sí, no se suman. Con 2 piezas de repuesto en cada hueco ya salen millones de combinaciones. Por eso funciona bien con los 3 o 4 huecos que dudas, y no con el equipo entero.',
  },

  pawn: {
    title: 'Pawn',
    text: 'Un addon que enseña en el tooltip de cada pieza si es mejor que la que llevas. Para acertar necesita saber cuánto vale para ti cada estadística, y eso es justo lo que acaba de calcular esta simulación: se pega la cadena y ya lo sabe.',
  },

  customCatalogue: {
    title: 'Catálogo de piezas propias del servidor',
    text: 'El motor solo conoce el equipo de Legion. Las piezas que tu servidor ha traído de parches posteriores hay que describirlas una vez: qué estadísticas dan. Aquí se guardan para todos los personajes y todas las simulaciones, así que se hace una sola vez. El addon las lee del juego con /rbl escanear, incluso las que no tienes.',
  },

  lootTable: {
    title: 'Tabla de botín',
    text: 'De dónde cae cada pieza. El simulador no lo sabe: su base de datos trae ítems y hechizos, pero no el botín de los jefes. El juego sí lo sabe, porque es lo que enseña el Diario de Mazmorras, así que el addon lo vuelca y se pega aquí. Con eso, el buscador de mejoras deja de decirte solo qué te sube el DPS y te dice también dónde conseguirlo.',
  },

  raceOverride: {
    title: 'Simular como otra raza',
    text: 'El motor solo conoce las razas oficiales de Legion. Si tu servidor tiene razas propias, la deja en «ninguna» y te simula sin racial, que son entre un 0,5% y un 2% de DPS que no aparecen. Eligiendo la raza oficial con el racial más parecido, el número se acerca. Para comparar piezas da igual: el racial es el mismo en las dos y se cancela.',
  },

  customItem: {
    title: 'Piezas que el simulador no conoce',
    text: 'El motor es el de la versión 7.3.5, así que solo sabe de equipo de Legion. Si tu servidor reparte piezas de parches posteriores, no tiene sus datos y no puede simularlas… salvo que se las describas tú. Con las estadísticas basta; el efecto es opcional.',
  },

  customStats: {
    title: 'Cómo escribir las estadísticas',
    text: 'Cada estadística es su número pegado a su abreviatura, separadas por guión bajo: 1052str_654crit_436haste. Valen str (fuerza), agi (agilidad), int (intelecto), sta (aguante), crit, haste (celeridad), mastery (maestría), vers (versatilidad), leech y speed. Cópialas del tooltip del juego.',
  },

  customUse: {
    title: 'Efecto de «Uso»',
    text: 'Si la pieza tiene un botón que se activa. Se escribe con lo que da, cuánto dura y cuánto tarda en recargar: 4500str_20dur_120cd son 4.500 de fuerza durante 20 segundos cada 2 minutos.',
  },

  customEquip: {
    title: 'Efecto pasivo con proc',
    text: 'Si la pieza salta sola al pegar. Igual que el de uso pero con la frecuencia en vez de la recarga, y diciendo qué lo dispara: 3000crit_15dur_1.5rppm_procby/attack_procon/hit son 3.000 de crítico durante 15 segundos, 1,5 veces por minuto, al acertar un ataque. Cambia attack por spell si eres de lanzar hechizos.',
  },

  breakdown: {
    title: 'Daño por habilidad',
    text: 'De dónde sale tu daño: qué porcentaje pone cada hechizo o ataque. Sirve para ver si algo importante se está usando menos de lo que debería.',
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;
