-- Conversión de un enlace de ítem del cliente a una línea de perfil .simc.
--
-- El enlace de un ítem en 7.3.5 tiene esta pinta:
--   item:id:enchant:gem1:gem2:gem3:gem4:suffix:unique:level:specId:flags:
--        context:numBonusIds:bonusId1..N:[upgrade]:[datos de artefacto]
--
-- Los campos que van detrás de los bonus_id son de longitud variable y solo
-- están presentes según los bits de `flags`, así que hay que recorrerlos en
-- orden. La lógica sigue la del addon oficial de SimulationCraft para Legion
-- (dominio público): es la única forma de sacar bien las reliquias del
-- artefacto, que van codificadas al final del enlace.

local _, RBL = ...

local OFFSET_ITEM_ID = 1
local OFFSET_ENCHANT_ID = 2
local OFFSET_GEM_ID_1 = 3
local OFFSET_GEM_ID_4 = 6
local OFFSET_GEM_BASE = OFFSET_GEM_ID_1
local OFFSET_SUFFIX_ID = 7
local OFFSET_FLAGS = 11
local OFFSET_BONUS_ID = 13

local FLAG_UPGRADE = 0x4
local FLAG_ARTIFACT = 0x100
local FLAG_DROP_LEVEL = 0x200
local FLAG_EXTRA_TRAIT_RANKS = 0x1000000

--- Parte `item:...` en una tabla de números, tratando los huecos como 0.
function RBL.SplitItemLink(itemLink)
  local itemString = string.match(itemLink or '', 'item:([%-?%d:]+)')
  if not itemString then
    return nil
  end

  local parts = {}
  for _, value in ipairs({ strsplit(':', itemString) }) do
    parts[#parts + 1] = (value == '' or value == nil) and 0 or (tonumber(value) or 0)
  end
  return parts, itemString
end

--- Id del ítem de la gema que hay en el hueco `index`.
local function gemItemId(itemLink, index)
  local _, gemLink = GetItemGem(itemLink, index)
  if not gemLink then
    return 0
  end
  return tonumber(string.match(gemLink, 'item:(%d+)')) or 0
end

--- Quita los ceros del final de una lista (simc no los necesita).
local function trimTrailing(list, zero)
  while #list > 0 and list[#list] == zero do
    table.remove(list, #list)
  end
  return list
end

--- Construye `slot=,id=...` para un enlace de ítem.
-- @param simcSlot nombre del slot en simc (`head`, `finger1`, ...)
-- @param itemLink enlace del cliente
-- @return string la línea de perfil, o nil si el enlace no se puede leer
function RBL.ItemToSimc(simcSlot, itemLink)
  local parts = RBL.SplitItemLink(itemLink)
  if not parts or not parts[OFFSET_ITEM_ID] or parts[OFFSET_ITEM_ID] == 0 then
    return nil
  end

  local options = { ',id=' .. parts[OFFSET_ITEM_ID] }

  if (parts[OFFSET_ENCHANT_ID] or 0) > 0 then
    options[#options + 1] = 'enchant_id=' .. parts[OFFSET_ENCHANT_ID]
  end

  -- Gemas: el enlace trae un marcador, pero el id real de la gema se pide con
  -- GetItemGem, que devuelve el ítem engarzado.
  local gems = {}
  for offset = OFFSET_GEM_ID_1, OFFSET_GEM_ID_4 do
    local index = (offset - OFFSET_GEM_BASE) + 1
    if (parts[offset] or 0) > 0 then
      gems[index] = gemItemId(itemLink, index)
    else
      gems[index] = 0
    end
  end
  trimTrailing(gems, 0)
  if #gems > 0 then
    options[#options + 1] = 'gem_id=' .. table.concat(gems, '/')
  end

  if (parts[OFFSET_SUFFIX_ID] or 0) ~= 0 then
    options[#options + 1] = 'suffix=' .. parts[OFFSET_SUFFIX_ID]
  end

  local flags = parts[OFFSET_FLAGS] or 0

  local bonuses = {}
  for index = 1, (parts[OFFSET_BONUS_ID] or 0) do
    bonuses[#bonuses + 1] = parts[OFFSET_BONUS_ID + index]
  end
  if #bonuses > 0 then
    options[#options + 1] = 'bonus_id=' .. table.concat(bonuses, '/')
  end

  local offset = OFFSET_BONUS_ID + #bonuses + 1

  if bit.band(flags, FLAG_UPGRADE) == FLAG_UPGRADE then
    local upgradeId = parts[offset]
    local upgrade = RBL.UpgradeTable and RBL.UpgradeTable[upgradeId]
    if upgrade and upgrade > 0 then
      options[#options + 1] = 'upgrade=' .. upgrade
    end
    offset = offset + 1
  end

  -- Artefacto: al final del enlace vienen los bonus_id de cada reliquia.
  if bit.band(flags, FLAG_ARTIFACT) == FLAG_ARTIFACT then
    offset = offset + 1 -- campo desconocido
    if bit.band(flags, FLAG_EXTRA_TRAIT_RANKS) == FLAG_EXTRA_TRAIT_RANKS then
      offset = offset + 1
    end

    local relics = {}
    while offset < #parts do
      local count = parts[offset] or 0
      offset = offset + 1

      if count == 0 then
        relics[#relics + 1] = '0'
      else
        local ids = {}
        for _ = 1, count do
          ids[#ids + 1] = parts[offset]
          offset = offset + 1
        end
        relics[#relics + 1] = table.concat(ids, ':')
      end
    end

    trimTrailing(relics, '0')
    if #relics > 0 then
      options[#options + 1] = 'relic_id=' .. table.concat(relics, '/')
    end
  end

  if bit.band(flags, FLAG_DROP_LEVEL) == FLAG_DROP_LEVEL then
    options[#options + 1] = 'drop_level=' .. (parts[offset] or 0)
    offset = offset + 1
  end

  return simcSlot .. '=' .. table.concat(options, ',')
end
