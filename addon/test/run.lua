-- Prueba del addon fuera del juego.
--
--   lua5.4 addon/test/run.lua            imprime el perfil generado
--   lua5.4 addon/test/run.lua --check    además comprueba lo que debe salir
--
-- Carga los ficheros del addon contra una API de WoW simulada. Verifica lo que
-- se puede verificar sin cliente: lectura de enlaces de ítem (bonus_id, gemas,
-- reliquias del artefacto), mapeo de INVTYPE a slot, recorrido de bolsas y
-- banco, deduplicado, y el formato final del perfil.

package.path = 'addon/test/?.lua;' .. package.path
local stub = require('wow-stub')

-- Los ficheros del addon reciben (nombre, tabla compartida) como en WoW.
local RBL = {}
local function loadAddonFile(path)
  local chunk = assert(loadfile(path))
  chunk('RaidbotsLegion', RBL)
end

loadAddonFile('addon/RaidbotsLegion/Data.lua')
loadAddonFile('addon/RaidbotsLegion/Items.lua')
loadAddonFile('addon/RaidbotsLegion/Core.lua')
loadAddonFile('addon/RaidbotsLegion/Loot.lua')

-- --- comprobaciones ---------------------------------------------------------

local failures = 0
local checks = 0

local function check(name, condition, detail)
  checks = checks + 1
  if condition then
    print(string.format('  ok    %s', name))
  else
    failures = failures + 1
    print(string.format('  FALLO %s%s', name, detail and ('\n        ' .. detail) or ''))
  end
end

local function contains(haystack, needle)
  return string.find(haystack, needle, 1, true) ~= nil
end

-- --- ejecución --------------------------------------------------------------

stub.bankOpen = false
RBL.bankOpen = false
local profile, equipped, bagged = RBL.BuildProfile()

print(profile)
print()
print(string.format('-- %d piezas equipadas, %d en bolsas --', equipped, bagged))

if not (arg and arg[1] == '--check') then
  return
end

print('\nComprobaciones:')

check('la línea de clase lleva el nombre', contains(profile, 'mage="Nyxa"'))
check('nivel', contains(profile, 'level=110'))
check('raza en formato simc', contains(profile, 'race=dwarf'))
-- Los tokens salen de las tablas de simc, en inglés, no del idioma del cliente.
check('spec en el token de simc', contains(profile, 'spec=frost'))
check('rol de la tabla de specs', contains(profile, 'role=spell'))
check('servidor tokenizado', contains(profile, 'server=mi_servidor'))
check('profesiones en inglés', contains(profile, 'professions=alchemy=800/herbalism=800'))

-- Talentos: la fila 2 y la 5 no tienen nada elegido -> 0
check('talentos con filas vacías a 0', contains(profile, 'talents=2033021'))

-- Equipo: bonus_id y encantamiento del enlace
check(
  'cabeza con bonus_id y encantamiento',
  contains(profile, 'head=,id=152138,enchant_id=5429,bonus_id=3612/1502')
)
check('pecho sin encantamiento', contains(profile, 'chest=,id=152140,bonus_id=3612/1502'))

-- El artefacto es lo más delicado, y aquí vive el fallo más caro que ha tenido
-- este addon: en el cliente real los campos de gema del enlace del arma vienen
-- a cero, así que las reliquias NO se pueden sacar de ahí. Hay que pedirlas a
-- la interfaz del artefacto y escribirlas como `gem_id`. Sin eso,
-- SimulationCraft deja el arma en su nivel base y el DPS sale casi un 50% por
-- debajo, sin dar ningún error.
check(
  'artefacto: reliquias como gem_id, leídas del artefacto y no del enlace',
  contains(
    profile,
    'main_hand=,id=128862,bonus_id=731,relic_id=3612:1512/3612:1512/3612:1512,gem_id=141271/141272/141273'
  )
)
check(
  'artefacto: no se inventa gemas del enlace (vienen vacías)',
  not contains(profile, 'gem_id=155850')
)

-- GetRelicInfo devuelve `nil, nil, nil, link`. Recorrer eso con `ipairs` no
-- encuentra nada, porque se para en el primer nil: hay que usar select. Este
-- fallo se coló en el propio arreglo de las reliquias y lo cazó esta prueba.
check(
  'artefacto: el enlace de la reliquia se encuentra entre nombre, icono y tipo',
  contains(profile, 'gem_id=141271/141272/141273')
)

-- Un nombre de reliquia nunca debe colarse como si fuera un id.
check(
  'artefacto: el nombre de la reliquia no se confunde con un enlace',
  not contains(profile, 'gem_id=Fogata')
)

-- Rangos del artefacto: solo los comprados (currentRank - bonusRanks)
check('artefacto: rangos comprados', contains(profile, 'artifact=53:0:0:0:0:783:1:784:4:786:4'))
check('artefacto: no cuela un rasgo solo del Crisol', not contains(profile, ':1739:'))
check('crisol', contains(profile, 'crucible=1739/1739/1739'))

-- Bolsas
check('sección de bolsas', contains(profile, '### Gear from Bags'))
check('pieza de bolsa comentada y con slot', contains(profile, '#head=,id=151943,bonus_id=3610/1502'))
check(
  'abalorio de bolsa mapeado desde INVTYPE_TRINKET',
  contains(profile, '#trinket1=,id=152147,bonus_id=3612/1502')
)
check('anillo de bolsa mapeado desde INVTYPE_FINGER', contains(profile, '#finger1=,id=152064'))
check('lo no equipable no entra', not contains(profile, '118700'))
check('el artefacto no se duplica desde la bolsa', not contains(profile, '#main_hand='))

-- El mismo anillo estaba dos veces en la bolsa
local _, repeticiones = string.gsub(profile, '#finger1=,id=152064', '')
check('los repetidos salen una sola vez', repeticiones == 1, 'apariciones: ' .. repeticiones)

-- Estadísticas leídas del cliente. Existen para las piezas que este servidor
-- ha traído de parches posteriores: el motor no las conoce, pero el cliente sí,
-- porque las está enseñando en el tooltip.
check('bloque de estadísticas', contains(profile, '### Item Stats'))
check(
  'estadísticas en el formato de simc, ordenadas como las escribe el addon',
  contains(profile, '# stats:152138=1052int_2103sta_654crit_436haste')
)
-- GetItemStats indexa por el VALOR de las globales ITEM_MOD_*, no por su
-- nombre. Si el addon usara el nombre, esto saldría vacío.
check(
  'las claves se resuelven por la global del cliente, no por su nombre',
  not contains(profile, 'ITEM_MOD_')
)
-- La versatilidad es la única global sin sufijo _SHORT.
check('versatilidad, que es la clave rara', contains(profile, '# stats:152147=1017vers'))
check('las piezas de bolsa también se leen', contains(profile, '# stats:151943=900int_500mastery'))
check(
  'una pieza sin estadísticas no genera línea',
  not contains(profile, '# stats:152140=')
)
check('cada pieza sale una sola vez', select(2, string.gsub(profile, '# stats:152138=', '')) == 1)

-- Los efectos se copian tal cual, sin traducirlos al formato de simc:
-- convertir prosa en `4500int_20dur_120cd` es adivinar, y adivinar aquí da un
-- número creíble y falso.
check(
  'efecto de uso, copiado literal',
  contains(profile, '# effect:152138=Uso: Aumenta tu Intelecto en 4500 durante 20 s.')
)
check(
  'efecto pasivo, copiado literal',
  contains(profile, '# effect:152147=Equipar: Tus hechizos tienen la probabilidad')
)
check(
  'del tooltip solo salen las líneas de efecto',
  not contains(profile, 'Se vende por')
)

-- Raciales. El motor no entiende razas propias de un servidor, así que esto no
-- se simula: se manda para poder elegir a mano una raza estándar parecida.
check('bloque de raciales', contains(profile, '### Racials'))
check('racial con su id', contains(profile, '# racial:999001=Sangre de la montaña'))
-- `GetSpellBookItemInfo and GetSpellBookItemInfo(...)` recorta la respuesta a
-- un valor y el id se pierde. Mismo fallo que el `ipairs` de las reliquias.
check('el id del hechizo no se pierde por el camino', not contains(profile, '# racial:0='))
check(
  'la descripción del racial, que es lo único que dice qué hace',
  contains(profile, 'Aumenta el daño de golpe crítico un 3%')
)
check(
  'las habilidades de la especialización no entran',
  not contains(profile, 'Golpe sangriento')
)

check('avisa de que el banco estaba cerrado', contains(profile, 'banco no estaba abierto'))
check('sin banco cerrado no aparece su contenido', not contains(profile, '154176'))

-- Ahora con el banco abierto
stub.bankOpen = true
RBL.bankOpen = true
local withBank = RBL.BuildProfile()
check('con el banco abierto entra su contenido', contains(withBank, '#trinket1=,id=154176'))
check('y ya no avisa', not contains(withBank, 'banco no estaba abierto'))

-- --- tabla de botín ---------------------------------------------------------
--
-- El Diario de Mazmorras vive en un addon que se carga bajo demanda y su botín
-- llega de forma asíncrona. Las dos cosas fallan en silencio: sin cargarlo,
-- todo sale vacío; sin reintentar, sale vacío la mitad. Por eso el stub simula
-- las dos y aquí se comprueban.

print()
stub.resetJournal()
stub.journalLoaded = false

local lootLines, bosses, items, lootErr
RBL.ScanLoot(function(l, b, i, e)
  lootLines, bosses, items, lootErr = l, b, i, e
end)

check('carga el addon del Diario antes de leerlo', stub.journalLoaded)
check('encuentra los jefes de Legion', (bosses or 0) == 5, 'jefes: ' .. tostring(bosses))
check('no se queda sin botín pese a la carga asíncrona', (items or 0) > 0, 'piezas: ' .. tostring(items))

local lootText = table.concat(lootLines or {}, '\n')
check(
  'cada pieza sale con su instancia y su jefe',
  contains(lootText, '# drop:142124=Catedral de la Noche Eterna / Domatrax')
)
check(
  'las bandas también entran, no solo las mazmorras',
  contains(lootText, '# drop:137088=Bastión Nocturno / Gul\'dan')
)
-- El id solo aparece dentro del enlace, detrás de varios nils. Recorrer la
-- respuesta con `ipairs` se pararía en el primero, igual que pasó con las
-- reliquias del artefacto.
check('el id se saca del enlace aunque venga detrás de nils', not contains(lootText, 'drop:nil'))
-- La misma pieza cae de dos jefes distintos: las dos líneas deben salir.
local _, veces = string.gsub(lootText, 'drop:134542=', '')
check('una pieza que cae de dos jefes sale dos veces', veces == 2, 'apariciones: ' .. veces)

-- Sin Diario disponible no se inventa una tabla vacía: se dice por qué.
local savedTiers = EJ_GetNumTiers
EJ_GetNumTiers = nil
local noJournalErr
RBL.ScanLoot(function(_, _, _, e) noJournalErr = e end)
check('sin Diario disponible avisa en vez de devolver una tabla vacía', noJournalErr ~= nil)
EJ_GetNumTiers = savedTiers

print(string.format('\n%d comprobaciones, %d fallos', checks, failures))
os.exit(failures == 0 and 0 or 1)
