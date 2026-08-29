-- Raidbots Legion Export
--
-- Genera un perfil en formato SimulationCraft con todo lo que necesita el
-- simulador, incluyendo el contenido de bolsas y banco.
--
-- Diferencias a propósito con el addon oficial:
--   * No depende de ninguna librería (ni Ace3 ni LibStub): se copia la carpeta
--     y funciona, que en un servidor privado es una ventaja.
--   * Las bolsas y el banco se recorren contenedor a contenedor, en vez de
--     usar EquipmentManager_UnpackLocation, que necesita un número mágico para
--     el banco que cambia entre versiones del cliente.
--   * El bloque de bolsas sale siempre y con el slot ya resuelto, que es lo
--     que necesita la app para Top Gear.

local ADDON_NAME, RBL = ...

RBL.version = GetAddOnMetadata(ADDON_NAME, 'Version') or 'desconocida'

-- Slots equipados, en el orden en que los escribe simc.
local EQUIPPED_SLOTS = {
  { name = 'HeadSlot', simc = 'head' },
  { name = 'NeckSlot', simc = 'neck' },
  { name = 'ShoulderSlot', simc = 'shoulder' },
  { name = 'BackSlot', simc = 'back' },
  { name = 'ChestSlot', simc = 'chest' },
  { name = 'WristSlot', simc = 'wrist' },
  { name = 'HandsSlot', simc = 'hands' },
  { name = 'WaistSlot', simc = 'waist' },
  { name = 'LegsSlot', simc = 'legs' },
  { name = 'FeetSlot', simc = 'feet' },
  { name = 'Finger0Slot', simc = 'finger1' },
  { name = 'Finger1Slot', simc = 'finger2' },
  { name = 'Trinket0Slot', simc = 'trinket1' },
  { name = 'Trinket1Slot', simc = 'trinket2' },
  { name = 'MainHandSlot', simc = 'main_hand' },
  { name = 'SecondaryHandSlot', simc = 'off_hand' },
}

-- INVTYPE del cliente -> slot de simc. Los que tienen dos huecos usan el
-- primero: la app ya prueba anillos y abalorios en los dos.
local INVTYPE_TO_SLOT = {
  INVTYPE_HEAD = 'head',
  INVTYPE_NECK = 'neck',
  INVTYPE_SHOULDER = 'shoulder',
  INVTYPE_CLOAK = 'back',
  INVTYPE_CHEST = 'chest',
  INVTYPE_ROBE = 'chest',
  INVTYPE_WRIST = 'wrist',
  INVTYPE_HAND = 'hands',
  INVTYPE_WAIST = 'waist',
  INVTYPE_LEGS = 'legs',
  INVTYPE_FEET = 'feet',
  INVTYPE_FINGER = 'finger1',
  INVTYPE_TRINKET = 'trinket1',
  INVTYPE_WEAPON = 'main_hand',
  INVTYPE_2HWEAPON = 'main_hand',
  INVTYPE_WEAPONMAINHAND = 'main_hand',
  INVTYPE_RANGED = 'main_hand',
  INVTYPE_RANGEDRIGHT = 'main_hand',
  INVTYPE_WEAPONOFFHAND = 'off_hand',
  INVTYPE_SHIELD = 'off_hand',
  INVTYPE_HOLDABLE = 'off_hand',
}

-- Contenedores a recorrer: mochila, las cuatro bolsas y el banco con las suyas.
local BAG_CONTAINERS = { 0, 1, 2, 3, 4 }
local BANK_CONTAINERS = { -1, 5, 6, 7, 8, 9, 10, 11 }

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------

--- Normaliza el resultado de una API que puede devolver tabla o varargs.
--
-- `C_ArtifactUI.GetPowers()` devuelve una tabla, mientras que
-- `GetPowersAffectedByRelic()` devuelve varargs. Envolver la primera en `{}`
-- daba una tabla dentro de otra y acababa pasándole la tabla entera a
-- `GetPowerInfo`, que fallaba con "Usage: C_ArtifactUI.GetPowerInfo(powerID)".
local function toList(first, ...)
  if type(first) == 'table' then
    return first
  end
  if first == nil then
    return {}
  end
  return { first, ... }
end

--- Pasa un nombre a la forma que usa simc: minúsculas y guiones bajos.
function RBL.Tokenize(str)
  if not str then
    return ''
  end
  str = string.lower(str)
  str = string.gsub(str, "'", '')
  str = string.gsub(str, '[^%w]+', '_')
  str = string.gsub(str, '^_+', '')
  str = string.gsub(str, '_+$', '')
  return str
end

local function raceToSimc(race)
  -- El cliente devuelve el nombre pegado; simc los quiere separados.
  if race == 'BloodElf' then
    return 'blood_elf'
  elseif race == 'NightElf' then
    return 'night_elf'
  elseif race == 'Scourge' then
    return 'undead'
  elseif race == 'HighmountainTauren' then
    return 'highmountain_tauren'
  elseif race == 'LightforgedDraenei' then
    return 'lightforged_draenei'
  elseif race == 'VoidElf' then
    return 'void_elf'
  end
  return RBL.Tokenize(race)
end

local function roleFor(specId, clientRole)
  local mapped = RBL.RoleTable and RBL.RoleTable[specId]
  if mapped then
    return mapped
  end
  if clientRole == 'TANK' then
    return 'tank'
  elseif clientRole == 'HEALER' then
    return 'heal'
  end
  return 'attack'
end

-- ---------------------------------------------------------------------------
-- Talentos
-- ---------------------------------------------------------------------------

local function talentString()
  local rows = {}
  for tier = 1, 7 do
    rows[tier] = '0'
    for column = 1, 3 do
      local _, _, _, selected = GetTalentInfo(tier, column, GetActiveSpecGroup())
      if selected then
        rows[tier] = tostring(column)
      end
    end
  end
  return table.concat(rows)
end

-- ---------------------------------------------------------------------------
-- Artefacto
--
-- Los rangos del artefacto solo se pueden leer con la interfaz del artefacto
-- abierta. Se abre a la fuerza con SocketInventoryItem, se lee y se cierra si
-- no estaba abierta ya. Si algo falla se devuelve nil y el perfil sale sin
-- artefacto en vez de romperse.
-- ---------------------------------------------------------------------------

local function artifactFrameOpen()
  local frame = _G.ArtifactFrame
  return (frame and frame:IsShown()) or false
end

local function openArtifact()
  if not HasArtifactEquipped or not HasArtifactEquipped() then
    return false, nil
  end

  -- `C_ArtifactUI` existe siempre, pero sus datos no se llenan hasta que está
  -- cargado el addon de Blizzard que gestiona la ventana del artefacto. Sin
  -- esto, en una sesión donde el jugador no haya abierto nunca su artefacto,
  -- las llamadas devuelven vacío sin dar ningún error.
  if LoadAddOn then
    LoadAddOn('Blizzard_ArtifactUI')
  end

  local wasOpen = artifactFrameOpen()
  if not wasOpen then
    SocketInventoryItem(INVSLOT_MAINHAND)
  end

  local itemId = C_ArtifactUI and select(1, C_ArtifactUI.GetArtifactInfo())
  if not itemId or itemId == 0 then
    if not wasOpen and _G.ArtifactFrame then
      HideUIPanel(_G.ArtifactFrame)
    end
    return false, nil
  end

  return wasOpen, itemId
end

local function closeArtifact(wasOpen)
  if not wasOpen and _G.ArtifactFrame then
    HideUIPanel(_G.ArtifactFrame)
  end
end

--- `artifact=<id>:0:0:0:0:<rasgo>:<rango>...` con los rangos comprados.
local function artifactString()
  local wasOpen, itemId = openArtifact()
  if not itemId then
    return nil
  end

  local artifactId = RBL.ArtifactTable and RBL.ArtifactTable[itemId]
  if not artifactId then
    closeArtifact(wasOpen)
    return nil
  end

  local ranks = {}
  for _, powerId in ipairs(toList(C_ArtifactUI.GetPowers())) do
    local info = powerId and C_ArtifactUI.GetPowerInfo(powerId)
    if info then
      -- `bonusRanks` son los que aportan las reliquias: simc los saca del
      -- propio arma, así que aquí solo van los comprados.
      local purchased = (info.currentRank or 0) - (info.bonusRanks or 0)
      if purchased > 0 then
        ranks[#ranks + 1] = powerId
        ranks[#ranks + 1] = purchased
      end
    end
  end

  closeArtifact(wasOpen)

  local str = 'artifact=' .. artifactId .. ':0:0:0:0'
  if #ranks > 0 then
    str = str .. ':' .. table.concat(ranks, ':')
  end
  return str
end

--- `crucible=<rasgos de la reliquia 1>/<reliquia 2>/<reliquia 3>`.
-- Los rasgos del Crisol son los que la reliquia otorga de más respecto a los
-- que daría esa misma reliquia recién puesta.
local function crucibleString()
  local wasOpen, itemId = openArtifact()
  if not itemId then
    return nil
  end
  if not (RBL.ArtifactTable and RBL.ArtifactTable[itemId]) then
    closeArtifact(wasOpen)
    return nil
  end

  local perRelic = {}
  local unreadable = 0

  for index = 1, C_ArtifactUI.GetNumRelicSlots() do
    local link = select(4, C_ArtifactUI.GetRelicInfo(index))
    local extra = {}
    local readable = true

    if link then
      local parts = RBL.SplitItemLink(link)
      -- Los rasgos del Crisol son los que la reliquia da de más respecto a los
      -- que daría recién puesta, así que hace falta el ítem base. Si el cliente
      -- todavía no lo tiene en caché, GetItemInfo devuelve nil: eso no es "esta
      -- reliquia no tiene Crisol", es "no lo sé", y hay que decirlo en vez de
      -- escribir un 0 que el simulador se creería.
      local baseLink = parts and select(2, GetItemInfo(parts[1]))
      if baseLink then
        local base = toList(C_ArtifactUI.GetPowersAffectedByRelicItemLink(baseLink))
        local current = toList(C_ArtifactUI.GetPowersAffectedByRelic(index))

        for _, power in ipairs(current) do
          local found = false
          for _, basePower in ipairs(base) do
            if power == basePower then
              found = true
              break
            end
          end
          if not found then
            extra[#extra + 1] = power
          end
        end
      else
        readable = false
      end
    end

    if readable then
      perRelic[index] = (#extra > 0) and table.concat(extra, ':') or '0'
    else
      perRelic[index] = '0'
      unreadable = unreadable + 1
    end
  end

  closeArtifact(wasOpen)

  if #perRelic == 0 then
    return nil
  end
  return 'crucible=' .. table.concat(perRelic, '/'), unreadable
end

-- ---------------------------------------------------------------------------
-- Equipo y bolsas
-- ---------------------------------------------------------------------------

--- Ids de ítem de las reliquias que lleva puestas el artefacto.
--
-- Hacen falta aparte porque en el enlace del arma los campos de gema vienen a
-- cero: las reliquias solo se pueden leer por la interfaz del artefacto. Sin
-- ellas SimulationCraft deja el arma en su nivel base (750) en vez del real, y
-- para un guerrero eso son casi 50% menos de DPS, sin ningún error de por
-- medio: el número sale creíble y es falso.
local function relicItemIds()
  if not C_ArtifactUI then
    return nil
  end

  local wasOpen = openArtifact()
  if not wasOpen and not (C_ArtifactUI.GetArtifactInfo and C_ArtifactUI.GetArtifactInfo()) then
    closeArtifact(wasOpen)
    return nil
  end

  local ids = {}
  local found = false
  for index = 1, (C_ArtifactUI.GetNumRelicSlots() or 0) do
    -- No se asume en qué posición viene el enlace: se busca entre todo lo que
    -- devuelva. Ya nos costó caro dar por buena la forma de una respuesta de
    -- esta misma API sin comprobarla.
    -- `select` y no `ipairs`: la respuesta trae nils por delante del enlace
    -- (`nil, nil, nil, link`) e `ipairs` se pararía en el primero.
    local id = 0
    local returns = { C_ArtifactUI.GetRelicInfo(index) }
    for i = 1, select('#', C_ArtifactUI.GetRelicInfo(index)) do
      local value = returns[i]
      if type(value) == 'string' then
        local parts = RBL.SplitItemLink(value)
        if parts and parts[1] and parts[1] > 0 then
          id = parts[1]
          break
        end
      end
    end
    ids[index] = id
    if id > 0 then
      found = true
    end
  end

  closeArtifact(wasOpen)
  return found and ids or nil
end

local function equippedLines(links)
  local lines = {}
  local relics = relicItemIds()

  for _, slot in ipairs(EQUIPPED_SLOTS) do
    local slotId = GetInventorySlotInfo(slot.name)
    local link = slotId and GetInventoryItemLink('player', slotId)
    if link then
      local line = RBL.ItemToSimc(slot.simc, link)
      if line then
        -- El arma artefacto necesita las reliquias como `gem_id=`, que es de
        -- donde SimulationCraft saca su nivel de objeto real.
        if slot.simc == 'main_hand' and relics and not line:find('gem_id=') then
          line = line .. ',gem_id=' .. table.concat(relics, '/')
        end
        lines[#lines + 1] = line
        if links then
          links[#links + 1] = link
        end
      end
    end
  end
  return lines
end

--- ilvl del ítem, para el comentario legible que acompaña a cada pieza.
local function itemLevel(link)
  if GetDetailedItemLevelInfo then
    local level = GetDetailedItemLevelInfo(link)
    if level and level > 0 then
      return level
    end
  end
  return select(4, GetItemInfo(link)) or 0
end

--- Recorre unos contenedores y devuelve las piezas equipables que encuentra.
local function scanContainers(containers, origin, seen, out)
  for _, bag in ipairs(containers) do
    local slots = GetContainerNumSlots(bag) or 0
    for slot = 1, slots do
      local link = GetContainerItemLink(bag, slot)
      if link and IsEquippableItem(link) then
        local name, _, quality, _, _, _, _, _, equipSlot = GetItemInfo(link)
        local simcSlot = equipSlot and INVTYPE_TO_SLOT[equipSlot]

        -- El artefacto (calidad 6) no se compara: es único y va en el arma.
        if simcSlot and quality ~= 6 then
          local line = RBL.ItemToSimc(simcSlot, link)
          -- Un mismo ítem puede estar repetido en varias bolsas; con la línea
          -- completa como clave se distinguen las versiones con distinto ilvl.
          if line and not seen[line] then
            seen[line] = true
            out[#out + 1] = {
              line = line,
              link = link,
              name = name or '?',
              ilevel = itemLevel(link),
              origin = origin,
            }
          end
        end
      end
    end
  end
end

--- Piezas equipables de bolsas y banco. El banco solo si está abierto.
local function bagItems()
  local items = {}
  local seen = {}

  scanContainers(BAG_CONTAINERS, 'bolsas', seen, items)

  -- Los contenedores del banco solo responden con el banco abierto: si no,
  -- GetContainerNumSlots devuelve 0 y no se puede leer nada.
  if RBL.bankOpen then
    scanContainers(BANK_CONTAINERS, 'banco', seen, items)
  end

  table.sort(items, function(a, b)
    if a.ilevel ~= b.ilevel then
      return a.ilevel > b.ilevel
    end
    return a.name < b.name
  end)

  return items
end

-- ---------------------------------------------------------------------------
-- Raciales y efectos: lo que el motor no puede saber
-- ---------------------------------------------------------------------------

--- Tooltip oculto para leer el texto de un ítem.
--
-- Los efectos de «Uso» y «Equipar» no están en ninguna API: solo existen como
-- texto en el tooltip, así que hay que pedirlo y leerlo línea a línea.
local scanTooltip
local function scanner()
  if scanTooltip then
    return scanTooltip
  end
  if not CreateFrame then
    return nil
  end
  scanTooltip = CreateFrame('GameTooltip', 'RBLScanTooltip', nil, 'GameTooltipTemplate')
  scanTooltip:SetOwner(UIParent, 'ANCHOR_NONE')
  return scanTooltip
end

--- Las líneas de «Uso:» y «Equipar:» del tooltip de un ítem, tal cual.
--
-- No se intentan traducir al formato de simc: convertir prosa en
-- `4500str_20dur_120cd` es adivinar, y adivinar mal aquí da un número creíble y
-- falso, que es justo lo que este proyecto lleva meses evitando. Se copian para
-- que la app las enseñe y el jugador o quien le ayude las traduzca a mano.
local function itemEffectText(itemLink)
  local tip = scanner()
  if not tip or not itemLink then
    return nil
  end

  local okSet = pcall(function()
    tip:ClearLines()
    tip:SetHyperlink(itemLink)
  end)
  if not okSet then
    return nil
  end

  local found = {}
  for i = 1, (tip:NumLines() or 0) do
    local fontString = _G and _G['RBLScanTooltipTextLeft' .. i]
    local text = fontString and fontString.GetText and fontString:GetText()
    -- ITEM_SPELL_TRIGGER_ONUSE y ONEQUIP son las globales del cliente con
    -- «Uso:» y «Equipar:», así que esto también funciona en un cliente en
    -- español sin tener que saber cómo están traducidas.
    if text and text ~= '' then
      for _, key in ipairs({ 'ITEM_SPELL_TRIGGER_ONUSE', 'ITEM_SPELL_TRIGGER_ONEQUIP' }) do
        local prefix = _G and _G[key]
        if prefix and prefix ~= '' and text:sub(1, #prefix) == prefix then
          found[#found + 1] = text:gsub('%s+', ' ')
        end
      end
    end
  end

  if #found == 0 then
    return nil
  end
  return table.concat(found, ' | ')
end

--- Hechizos de la pestaña «General» del libro de hechizos, con su descripción.
--
-- Ahí es donde viven los raciales. No hay forma fiable de distinguirlos del
-- resto de habilidades generales, así que se vuelca la pestaña entera y ya
-- decide quien lo lea: son media docena de líneas y es preferible eso a un
-- filtro que se deje fuera precisamente el racial raro de un servidor privado,
-- que es el único motivo por el que existe este bloque.
local function generalSpells()
  if not GetNumSpellTabs or not GetSpellTabInfo or not GetSpellBookItemName then
    return {}
  end

  local out = {}
  local tabs = GetNumSpellTabs() or 0
  for tab = 1, tabs do
    local tabName, _, offset, numSpells = GetSpellTabInfo(tab)
    -- Solo la primera pestaña: las demás son las especializaciones.
    if tab == 1 and offset and numSpells then
      for index = offset + 1, offset + numSpells do
        local spellName = GetSpellBookItemName(index, 'spell')
        -- Sin el `if`: `GetSpellBookItemInfo and GetSpellBookItemInfo(...)`
        -- parece equivalente pero no lo es, porque `and` recorta la respuesta a
        -- un solo valor y el id se perdería. Es el mismo tipo de fallo que el
        -- `ipairs` de las reliquias, y lo cazó la misma prueba.
        local spellId
        if GetSpellBookItemInfo then
          local _
          _, spellId = GetSpellBookItemInfo(index, 'spell')
        end
        local description = spellId and GetSpellDescription and GetSpellDescription(spellId)
        if spellName then
          out[#out + 1] = {
            tab = tabName or '?',
            name = spellName,
            id = spellId or 0,
            description = (description or ''):gsub('%s+', ' '),
          }
        end
      end
    end
  end
  return out
end

RBL.GeneralSpells = generalSpells
RBL.ItemEffectText = itemEffectText

-- ---------------------------------------------------------------------------
-- Perfil completo
-- ---------------------------------------------------------------------------

function RBL.BuildProfile()
  local name = UnitName('player')
  local _, class = UnitClass('player')
  local _, race = UnitRace('player')
  local level = UnitLevel('player')

  local specIndex = GetSpecialization()
  local specId, clientRole
  if specIndex then
    specId = GetSpecializationInfo(specIndex)
    clientRole = select(6, GetSpecializationInfo(specIndex))
  end
  local specName = specId and RBL.SpecNames and RBL.SpecNames[specId]

  local lines = {}
  local function add(line)
    lines[#lines + 1] = line
  end

  add('# Raidbots Legion Export ' .. RBL.version)
  add('# ' .. date('%Y-%m-%d %H:%M') .. ' · ' .. (GetRealmName() or '?'))
  add('')
  add(RBL.Tokenize(class) .. '="' .. (name or 'Personaje') .. '"')
  add('level=' .. (level or 110))
  add('race=' .. raceToSimc(race))

  local region = RBL.RegionString and RBL.RegionString[GetCurrentRegion()]
  if region then
    add('region=' .. RBL.Tokenize(region))
  end
  add('server=' .. RBL.Tokenize(GetRealmName()))
  add('role=' .. roleFor(specId, clientRole))

  -- Profesiones: simc las quiere como `profesion=nivel/profesion=nivel`.
  local prof1, prof2 = GetProfessions()
  local professions = {}
  for _, index in ipairs({ prof1, prof2 }) do
    if index then
      local _, _, rank, _, _, _, profId = GetProfessionInfo(index)
      local profName = RBL.ProfNames and RBL.ProfNames[profId]
      if profName then
        professions[#professions + 1] = RBL.Tokenize(profName) .. '=' .. (rank or 0)
      end
    end
  end
  if #professions > 0 then
    add('professions=' .. table.concat(professions, '/'))
  end

  add('talents=' .. talentString())
  if specName then
    add('spec=' .. RBL.Tokenize(specName))
  end

  local artifact = artifactString()
  if artifact then
    add(artifact)
  end
  local crucible, crucibleUnreadable = crucibleString()
  if crucible then
    add(crucible)
    if (crucibleUnreadable or 0) > 0 then
      add(
        '# Aviso: no se pudieron leer los datos del Crisol de '
          .. crucibleUnreadable
          .. ' reliquia(s). Abre el Crisol de Luznether una vez y vuelve a exportar.'
      )
    end
  end

  add('')
  local links = {}
  local equipped = equippedLines(links)
  for _, line in ipairs(equipped) do
    add(line)
  end

  -- Bolsas: comentadas para que el perfil siga siendo válido en simc, pero con
  -- el slot delante para que la app pueda leerlas.
  local bag = bagItems()
  add('')
  add('### Gear from Bags')
  if #bag == 0 then
    add('# (no se encontró equipo alternativo en las bolsas)')
  end
  for _, item in ipairs(bag) do
    add('# ' .. item.name .. ' (' .. item.ilevel .. ', ' .. item.origin .. ')')
    add('#' .. item.line)
  end

  if not RBL.bankOpen then
    add('# Nota: el banco no estaba abierto, así que no se ha incluido.')
  end

  -- Estadísticas leídas del cliente. Solo hacen falta para las piezas que
  -- SimulationCraft no conoce, pero el addon no sabe cuáles son —esa lista la
  -- tiene la app—, así que se mandan todas y allí se usan las que falten.
  for _, item in ipairs(bag) do
    if item.link then
      links[#links + 1] = item.link
    end
  end

  local statLines = {}
  local seenId = {}
  for _, link in ipairs(links) do
    local parts = RBL.SplitItemLink(link)
    local id = parts and parts[1]
    if id and id > 0 and not seenId[id] then
      seenId[id] = true
      local stats = RBL.ItemStatsString and RBL.ItemStatsString(link)
      if stats then
        statLines[#statLines + 1] = '# stats:' .. id .. '=' .. stats
      end
      local effect = RBL.ItemEffectText and RBL.ItemEffectText(link)
      if effect then
        statLines[#statLines + 1] = '# effect:' .. id .. '=' .. effect
      end
    end
  end

  if #statLines > 0 then
    add('')
    add('### Item Stats')
    add('# Lo que dice el cliente de cada pieza. La app lo usa para poder')
    add('# simular el equipo que este servidor ha traído de parches posteriores.')
    for _, line in ipairs(statLines) do
      add(line)
    end
  end

  -- Raciales. SimulationCraft no sabe de razas propias de un servidor, así que
  -- esto no se simula solo: se manda para poder elegir en la app una raza
  -- equivalente y saber cuánto se está aproximando.
  local spells = RBL.GeneralSpells and RBL.GeneralSpells() or {}
  if #spells > 0 then
    add('')
    add('### Racials')
    add('# Habilidades generales del personaje, raciales incluidos. El motor no')
    add('# entiende razas propias de un servidor: esto es para elegir a mano la')
    add('# raza estándar que más se parezca.')
    for _, spell in ipairs(spells) do
      add('# racial:' .. spell.id .. '=' .. spell.name)
      if spell.description ~= '' then
        add('#   ' .. spell.description)
      end
    end
  end

  return table.concat(lines, '\n'), #equipped, #bag
end
