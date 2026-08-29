-- Simulación mínima de la API de WoW 7.3.5 para poder probar el addon fuera
-- del juego.
--
-- No pretende ser fiel a todo el cliente: implementa solo lo que usa el addon,
-- con datos de un personaje de ejemplo, para verificar lo que sí se puede
-- verificar aquí (lectura de enlaces de ítem, mapeo de slots, recorrido de
-- bolsas, formato de salida). Lo que devuelva de verdad el cliente hay que
-- comprobarlo en el juego.

local M = {}

-- --- utilidades del entorno de WoW ----------------------------------------

function strsplit(sep, str)
  local out = {}
  local pattern = '([^' .. sep .. ']*)'
  for piece in string.gmatch(str .. sep, pattern .. sep) do
    out[#out + 1] = piece
  end
  return table.unpack(out)
end

function strtrim(s)
  return (string.gsub(s or '', '^%s*(.-)%s*$', '%1'))
end

bit = {
  band = function(a, b)
    return a & b
  end,
}

function date(fmt)
  return '2026-08-28 03:20'
end

function GetAddOnMetadata()
  return '1.0.0'
end

INVSLOT_MAINHAND = 16

-- --- personaje de ejemplo --------------------------------------------------

local SLOT_IDS = {
  HeadSlot = 1,
  NeckSlot = 2,
  ShoulderSlot = 3,
  BackSlot = 15,
  ChestSlot = 5,
  WristSlot = 9,
  HandsSlot = 10,
  WaistSlot = 6,
  LegsSlot = 7,
  FeetSlot = 8,
  Finger0Slot = 11,
  Finger1Slot = 12,
  Trinket0Slot = 13,
  Trinket1Slot = 14,
  MainHandSlot = 16,
  SecondaryHandSlot = 17,
}

--- Enlaces equipados, con la forma real de 7.3.5:
--- item:id:ench:g1:g2:g3:g4:suffix:unique:level:spec:flags:context:nBonus:bonus...
local EQUIPPED = {
  [1] = 'item:152138:5429:::::::110:64:0:0:2:3612:1502|h[Runebound Collar]',
  [2] = 'item:152283:5437:::::::110:64:0:0:2:3612:1502|h[Chain of the Unmaker]',
  [5] = 'item:152140::::::::110:64:0:0:2:3612:1502|h[Runebound Tunic]',
  [11] = 'item:152063::::::::110:64:0:0:1:3612|h[Band of the Sargerite Smith]',
  [13] = 'item:151955::::::::110:64:0:0:2:3612:1502|h[Acrid Catalyst Injector]',
  -- Artefacto: flags 0x100, con tres reliquias de dos bonus_id cada una.
  [16] = 'item:128862:0:::::::110:64:256:0:1:731:0:2:3612:1512:2:3612:1512:2:3612:1512|h[Ebonchill]',
}

--- Bolsas: mochila (0) y una bolsa (1). El banco (-1) solo se lee si está
--- "abierto", igual que en el cliente.
local CONTAINERS = {
  [0] = {
    'item:152147::::::::110:64:0:0:2:3612:1502|h[Meditation Spheres of Chi-Ji]',
    'item:151943::::::::110:64:0:0:2:3610:1502|h[Crown of Relentless Annihilation]',
    nil,
    'item:118700::::::::110:64:0:0:0|h[Poción de poder prolongado]', -- no equipable
  },
  [1] = {
    'item:152064::::::::110:64:0:0:1:3610|h[Band of the Sargerite Smith]',
    -- Repetido con el mismo enlace: debe salir una sola vez.
    'item:152064::::::::110:64:0:0:1:3610|h[Band of the Sargerite Smith]',
  },
  [-1] = {
    'item:154176::::::::110:64:0:0:2:3612:1502|h[Khazgoroth Courage]',
  },
}

-- Metadatos por id de ítem: nombre, calidad, ilvl y INVTYPE.
local ITEM_INFO = {
  [152138] = { 'Runebound Collar', 4, 960, 'INVTYPE_HEAD' },
  [152283] = { 'Chain of the Unmaker', 4, 970, 'INVTYPE_NECK' },
  [152140] = { 'Runebound Tunic', 4, 960, 'INVTYPE_CHEST' },
  [152063] = { 'Band of the Sargerite Smith', 4, 955, 'INVTYPE_FINGER' },
  [151955] = { 'Acrid Catalyst Injector', 4, 955, 'INVTYPE_TRINKET' },
  [128862] = { 'Ebonchill', 6, 999, 'INVTYPE_2HWEAPON' },
  [152147] = { 'Meditation Spheres of Chi-Ji', 4, 930, 'INVTYPE_TRINKET' },
  [151943] = { 'Crown of Relentless Annihilation', 4, 930, 'INVTYPE_HEAD' },
  [152064] = { 'Band of the Sargerite Smith', 4, 930, 'INVTYPE_FINGER' },
  [154176] = { "Khaz'goroth's Courage", 4, 940, 'INVTYPE_TRINKET' },
  [118700] = { 'Poción de poder prolongado', 3, 0, '' },
  [141271] = { 'Reliquia de ejemplo', 4, 910, '' },
  [141272] = { 'Reliquia de ejemplo 2', 4, 910, '' },
  [141273] = { 'Reliquia de ejemplo 3', 4, 910, '' },
  -- gemas
  [155850] = { 'Masterful Shadowruby', 4, 900, '' },
  [155846] = { 'Quick Shadowruby', 4, 900, '' },
}

local function itemIdOf(link)
  return tonumber(string.match(link or '', 'item:(%d+)'))
end

-- El cliente no tiene todos los ítems en caché. Al preguntar por uno que no
-- tiene, devuelve nil y se lo pide al servidor; la respuesta llega más tarde.
-- Se modela aquí porque es justo lo que hace que un escaneo de ids no pueda ser
-- un bucle: de una sentada saldría casi todo vacío, y sin ningún error.
-- Por defecto todo está en caché: lo que llevas puesto o en las bolsas el
-- cliente ya lo conoce. Los ids que se marquen aquí se comportan como los que
-- hay que pedirle al servidor.
M.uncached = {}
M.cacheDelay = 2

local pendingRequests = {}

function GetItemInfo(linkOrId)
  local id = tonumber(linkOrId) or itemIdOf(linkOrId)
  local info = ITEM_INFO[id]
  if not info then
    return nil
  end

  -- Lo que viene de un enlace ya está resuelto; un id suelto que no esté en
  -- caché devuelve nil las primeras veces, mientras llega la respuesta.
  if not itemIdOf(linkOrId) and M.uncached[id] then
    pendingRequests[id] = (pendingRequests[id] or 0) + 1
    if pendingRequests[id] <= M.cacheDelay then
      return nil
    end
    M.uncached[id] = nil
  end

  local name, quality, ilevel, equipSlot = info[1], info[2], info[3], info[4]
  -- name, link, quality, iLevel, reqLevel, type, subType, maxStack, equipSlot,
  -- texture, sellPrice, classID, subclassID
  return name, 'item:' .. id, quality, ilevel, 110, '', '', 1, equipSlot,
    nil, 0, info[5] or 4, info[6] or 6
end

--- Marca unos ids como no cacheados, para probar el escaneo por rango.
function M.setUncached(ids)
  M.uncached = {}
  pendingRequests = {}
  for _, id in ipairs(ids or {}) do
    M.uncached[id] = true
  end
end

function GetDetailedItemLevelInfo(link)
  local info = ITEM_INFO[itemIdOf(link)]
  return info and info[3] or 0
end

function IsEquippableItem(link)
  local info = ITEM_INFO[itemIdOf(link)]
  return info ~= nil and info[4] ~= ''
end

function GetItemGem(link, index)
  local parts = { strsplit(':', string.match(link, 'item:([%-?%d:]+)') or '') }
  local gemId = tonumber(parts[2 + index])
  if gemId and gemId > 0 then
    return 'Gema', 'item:' .. gemId
  end
  return nil, nil
end

function GetInventorySlotInfo(name)
  return SLOT_IDS[name]
end

function GetInventoryItemLink(_, slotId)
  return EQUIPPED[slotId]
end

M.bankOpen = false

function GetContainerNumSlots(bag)
  if bag < 0 or bag >= 5 then
    -- El banco solo responde con el banco abierto.
    if not M.bankOpen then
      return 0
    end
  end
  local container = CONTAINERS[bag]
  return container and 4 or 0
end

function GetContainerItemLink(bag, slot)
  local container = CONTAINERS[bag]
  return container and container[slot] or nil
end

-- --- personaje --------------------------------------------------------------

function UnitName()
  return 'Nyxa'
end
function UnitClass()
  return 'Mago', 'MAGE'
end
function UnitRace()
  return 'Enano', 'Dwarf'
end
function UnitLevel()
  return 110
end
function GetRealmName()
  return 'Mi Servidor'
end
function GetCurrentRegion()
  return 3
end
function GetSpecialization()
  return 3
end
function GetSpecializationInfo()
  -- id, name, description, icon, background, role
  return 64, 'Escarcha', '', '', '', 'DAMAGER'
end
function GetActiveSpecGroup()
  return 1
end

local TALENTS = { 2, 0, 3, 3, 0, 2, 1 }
function GetTalentInfo(tier, column)
  return 1, 'Talento', '', TALENTS[tier] == column
end

function GetProfessions()
  return 1, 2
end
function GetProfessionInfo(index)
  -- name, texture, rank, maxRank, numSpells, spelloffset, skillLine
  if index == 1 then
    return 'Alquimia', '', 800, 800, 0, 0, 171
  end
  return 'Herboristería', '', 800, 800, 0, 0, 182
end

-- --- artefacto --------------------------------------------------------------

M.artifactOpen = false
_G.ArtifactFrame = {
  IsShown = function()
    return M.artifactOpen
  end,
}

function HideUIPanel()
  M.artifactOpen = false
end

function SocketInventoryItem()
  M.artifactOpen = true
end

function HasArtifactEquipped()
  return true
end

local POWERS = {
  [783] = { currentRank = 1, bonusRanks = 0 },
  [784] = { currentRank = 4, bonusRanks = 0 },
  [786] = { currentRank = 6, bonusRanks = 2 }, -- 4 comprados + 2 de reliquia
  [1739] = { currentRank = 3, bonusRanks = 3 }, -- solo Crisol: 0 comprados
}

C_ArtifactUI = {
  GetArtifactInfo = function()
    return 128862
  end,
  -- Devuelve una TABLA, como el cliente de verdad. Antes devolvía varargs y
  -- eso escondía el fallo: el addon envolvía el resultado en {} y le pasaba la
  -- tabla entera a GetPowerInfo.
  GetPowers = function()
    return { 783, 784, 786, 1739 }
  end,
  GetPowerInfo = function(id)
    if type(id) ~= 'number' then
      error('Usage: local powerInfo = C_ArtifactUI.GetPowerInfo(powerID)')
    end
    return POWERS[id]
  end,
  GetNumRelicSlots = function()
    return 3
  end,
  -- Forma observada en el cliente real (7.3.5), imprimiendo todos los valores:
  --   nombre (texto), icono (número), tipo (texto), enlace
  -- El enlace no es el primer valor ni está en una posición garantizada, así
  -- que el addon lo busca entre todos en vez de fiarse de un índice.
  GetRelicInfo = function(index)
    local relics = {
      { 'Fogata en miniatura', 135805, 'Fire', 'item:141271::::::::110:64:0:0:0' },
      { 'Tempestad de los Cielos', 1350418, 'Wind', 'item:141272::::::::110:64:0:0:0' },
      { 'Llave de las Cámaras', 348554, 'Iron', 'item:141273::::::::110:64:0:0:0' },
    }
    local r = relics[index or 1]
    if not r then
      return nil
    end
    return r[1], r[2], r[3], r[4]
  end,
  GetPowersAffectedByRelicItemLink = function()
    return 786
  end,
  GetPowersAffectedByRelic = function()
    return 786, 1739
  end,
}

-- --- estadísticas, efectos y raciales ---------------------------------------

-- GetItemStats devuelve una tabla indexada por el VALOR de las globales
-- ITEM_MOD_*, no por su nombre. Se replica esa indirección aquí a propósito:
-- si el stub aceptara el nombre de la global, el addon podría estar
-- equivocándose y la prueba no lo vería.
ITEM_MOD_STRENGTH_SHORT = 'Fuerza'
ITEM_MOD_AGILITY_SHORT = 'Agilidad'
ITEM_MOD_INTELLECT_SHORT = 'Intelecto'
ITEM_MOD_STAMINA_SHORT = 'Aguante'
ITEM_MOD_CRIT_RATING_SHORT = 'Golpe crítico'
ITEM_MOD_HASTE_RATING_SHORT = 'Celeridad'
ITEM_MOD_MASTERY_RATING_SHORT = 'Maestría'
-- La única sin sufijo _SHORT, tal cual la nombra el cliente.
ITEM_MOD_VERSATILITY = 'Versatilidad'
ITEM_MOD_CR_LIFESTEAL_SHORT = 'Robo de vida'
ITEM_MOD_CR_SPEED_SHORT = 'Velocidad'
ITEM_MOD_CR_AVOIDANCE_SHORT = 'Evitación'
ITEM_MOD_ATTACK_POWER_SHORT = 'Poder de ataque'
ITEM_MOD_SPELL_POWER_SHORT = 'Poder con hechizos'

ITEM_SPELL_TRIGGER_ONUSE = 'Uso:'
ITEM_SPELL_TRIGGER_ONEQUIP = 'Equipar:'

local ITEM_STATS = {
  [152138] = {
    [ITEM_MOD_INTELLECT_SHORT] = 1052,
    [ITEM_MOD_CRIT_RATING_SHORT] = 654,
    [ITEM_MOD_HASTE_RATING_SHORT] = 436,
    -- El aguante también viene y a simc le da igual, pero se pasa porque es lo
    -- que devuelve el cliente: el filtro tiene que estar en el addon.
    [ITEM_MOD_STAMINA_SHORT] = 2103,
  },
  [152147] = {
    [ITEM_MOD_VERSATILITY] = 1017,
  },
  -- Pieza de bolsa, para comprobar que las bolsas también se leen.
  [151943] = {
    [ITEM_MOD_INTELLECT_SHORT] = 900,
    [ITEM_MOD_MASTERY_RATING_SHORT] = 500,
  },
  -- Sin ninguna estadística: no debe generar línea.
  [152140] = {},
}

function GetItemStats(link)
  local id = itemIdOf(link)
  return id and ITEM_STATS[id] or nil
end

local ITEM_TOOLTIP = {
  [152147] = {
    'Meditation Spheres of Chi-Ji',
    'Objeto nv. 930',
    'Equipar: Tus hechizos tienen la probabilidad de aumentar tu Intelecto en 4000 durante 15 s.',
  },
  [152138] = {
    'Runebound Collar',
    'Objeto nv. 960',
    'Uso: Aumenta tu Intelecto en 4500 durante 20 s. (2 min de reutilización)',
    'Se vende por 25 de oro',
  },
}

M.tooltipLines = nil

-- Tooltip de mentira: guarda las líneas del ítem en globales con el mismo
-- nombre que genera GameTooltipTemplate, que es de donde las lee el addon.
function CreateFrame(_, name, _, _)
  local frame = { lines = {} }
  function frame:SetOwner() end
  function frame:ClearLines()
    self.lines = {}
  end
  function frame:SetHyperlink(link)
    self.lines = ITEM_TOOLTIP[itemIdOf(link)] or {}
    for i = 1, 20 do
      local key = name .. 'TextLeft' .. i
      local text = self.lines[i]
      _G[key] = text and { GetText = function() return text end } or nil
    end
  end
  function frame:NumLines()
    return #self.lines
  end
  return frame
end

UIParent = {}

-- Libro de hechizos. La pestaña 1 es «General» y ahí viven los raciales; las
-- siguientes son las especializaciones y no deben salir en el export.
local SPELL_TABS = {
  { 'General', '', 0, 3 },
  { 'Furia', '', 3, 2 },
}

local SPELLBOOK = {
  [1] = { name = 'Sangre de la montaña', id = 999001,
          desc = 'Aumenta el daño de golpe crítico un 3%. Aumenta la sanación de golpe crítico un 3%.' },
  [2] = { name = 'Paso del bosque', id = 999002, desc = 'Aumenta la velocidad de movimiento un 4%.' },
  [3] = { name = 'Montar', id = 33388, desc = '' },
  [4] = { name = 'Golpe sangriento', id = 23881, desc = 'No debería salir: es de la spec.' },
  [5] = { name = 'Ira', id = 85288, desc = 'Tampoco.' },
}

function GetNumSpellTabs()
  return #SPELL_TABS
end

function GetSpellTabInfo(tab)
  local t = SPELL_TABS[tab]
  if not t then
    return nil
  end
  return t[1], t[2], t[3], t[4]
end

function GetSpellBookItemName(index)
  local entry = SPELLBOOK[index]
  return entry and entry.name or nil
end

function GetSpellBookItemInfo(index)
  local entry = SPELLBOOK[index]
  if not entry then
    return nil
  end
  return 'SPELL', entry.id
end

function GetSpellDescription(spellId)
  for _, entry in pairs(SPELLBOOK) do
    if entry.id == spellId then
      return entry.desc
    end
  end
  return nil
end

-- --- Diario de Mazmorras -----------------------------------------------------

-- Se modela lo que hace el cliente de verdad y que hace no trivial el escaneo:
--
--   * Hasta que no se carga Blizzard_EncounterJournal, todo devuelve vacío y
--     ninguna llamada da error.
--   * El botín de un jefe NO está disponible en la misma llamada en que se
--     selecciona: hace falta al menos un intento más.

M.journalLoaded = false

local TIERS = { 'Clásico', 'The Burning Crusade', 'Legion' }

local INSTANCES = {
  [false] = { -- mazmorras
    { id = 777, name = 'Corte de las Estrellas' },
    { id = 778, name = 'Catedral de la Noche Eterna' },
  },
  [true] = { -- bandas
    { id = 875, name = 'Bastión Nocturno' },
  },
}

local ENCOUNTERS = {
  [777] = { { id = 1, name = 'Patrona Velia' }, { id = 2, name = 'Advisor Melandrus' } },
  [778] = { { id = 3, name = 'Domatrax' } },
  [875] = { { id = 4, name = 'Skorpyron' }, { id = 5, name = 'Gul\'dan' } },
}

-- EJ_GetLootInfoByIndex devuelve varios valores y el orden ha cambiado entre
-- versiones. Aquí se devuelve con el id en una posición y el enlace en otra, a
-- propósito, para que el addon no pueda depender de una posición concreta.
local LOOT = {
  [1] = { 134542 },
  [2] = { 134542, 134530 },
  [3] = { 142124, 141545 },
  [4] = { 140894, 141481 },
  [5] = { 137088, 132452 },
}

-- Jefes cuyo botín ya se ha "descargado": el primer intento siempre falla.
local lootReady = {}
local selectedEncounter

function EJ_GetNumTiers()
  if not M.journalLoaded then return 0 end
  return #TIERS
end

function EJ_GetTierInfo(index)
  if not M.journalLoaded then return nil end
  return TIERS[index], nil
end

local selectedTier
function EJ_SelectTier(index)
  selectedTier = index
end

local selectedInstance
function EJ_GetInstanceByIndex(index, isRaid)
  if not M.journalLoaded then return nil end
  local list = INSTANCES[isRaid and true or false]
  local entry = list and list[index]
  if not entry then return nil end
  return entry.id, entry.name
end

function EJ_SelectInstance(id)
  selectedInstance = id
end

function EJ_GetEncounterInfoByIndex(index, instanceId)
  if not M.journalLoaded then return nil end
  local list = ENCOUNTERS[instanceId]
  local entry = list and list[index]
  if not entry then return nil end
  -- name, description, journalEncounterID, ...
  return entry.name, '', entry.id
end

function EJ_SelectEncounter(encounterId)
  selectedEncounter = encounterId
end

function EJ_ResetLootFilter() end

function EJ_GetNumLoot()
  if not selectedEncounter then return 0 end
  -- Primera consulta tras seleccionar: todavía no ha llegado nada.
  if not lootReady[selectedEncounter] then
    lootReady[selectedEncounter] = true
    return 0
  end
  return #(LOOT[selectedEncounter] or {})
end

function EJ_GetLootInfoByIndex(index)
  local list = LOOT[selectedEncounter] or {}
  local id = list[index]
  if not id then return nil end
  -- name, icon, slot, armorType, link: el id solo llega dentro del enlace, y
  -- va detrás de varios nils, como en las respuestas reales de este cliente.
  return 'Pieza ' .. id, nil, nil, nil, 'item:' .. id .. '::::::::110:64|h[Pieza]|h'
end

--- Reinicia el estado entre pruebas.
function M.resetJournal()
  lootReady = {}
  selectedEncounter = nil
end

-- El cliente solo llena los datos del artefacto cuando este addon está cargado.
function LoadAddOn(name)
  if name == 'Blizzard_EncounterJournal' then
    M.journalLoaded = true
  end
  return true, nil
end

return M
