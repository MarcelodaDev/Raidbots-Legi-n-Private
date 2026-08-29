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

function GetItemInfo(linkOrId)
  local id = tonumber(linkOrId) or itemIdOf(linkOrId)
  local info = ITEM_INFO[id]
  if not info then
    return nil
  end
  local name, quality, ilevel, equipSlot = info[1], info[2], info[3], info[4]
  -- name, link, quality, iLevel, reqLevel, class, subclass, maxStack, equipSlot
  return name, 'item:' .. id, quality, ilevel, 110, '', '', 1, equipSlot
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

-- El cliente solo llena los datos del artefacto cuando este addon está cargado.
function LoadAddOn(name)
  return true, nil
end

return M
