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

check('avisa de que el banco estaba cerrado', contains(profile, 'banco no estaba abierto'))
check('sin banco cerrado no aparece su contenido', not contains(profile, '154176'))

-- Ahora con el banco abierto
stub.bankOpen = true
RBL.bankOpen = true
local withBank = RBL.BuildProfile()
check('con el banco abierto entra su contenido', contains(withBank, '#trinket1=,id=154176'))
check('y ya no avisa', not contains(withBank, 'banco no estaba abierto'))

print(string.format('\n%d comprobaciones, %d fallos', checks, failures))
os.exit(failures == 0 and 0 or 1)
