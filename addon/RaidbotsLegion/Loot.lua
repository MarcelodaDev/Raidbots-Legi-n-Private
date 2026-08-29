-- Tabla de botín: qué jefe suelta cada pieza.
--
-- El motor no lo sabe. La DBC que genera SimulationCraft trae ítems, hechizos y
-- escalados, pero no la tabla de botín, así que la app podía decirte que una
-- pieza te sube el DPS y no de dónde sacarla. El cliente sí lo sabe: es lo que
-- enseña el Diario de Mazmorras.
--
-- Dos cosas hacen que esto no sea un bucle y ya:
--
--   * El botín se carga de forma asíncrona. Justo después de seleccionar un
--     jefe, EJ_GetNumLoot() suele devolver 0 porque los datos todavía no han
--     llegado. Hay que reintentar, y por eso el escaneo va por pasos con un
--     temporizador en vez de de una sentada.
--   * La interfaz del Diario vive en un addon de Blizzard que se carga bajo
--     demanda. Sin cargarlo antes, todo devuelve vacío sin dar ningún error;
--     es el mismo fallo que ya nos costó caro con las reliquias del artefacto.

local _, RBL = ...

--- Índice de la expansión Legion en el Diario. Se busca por nombre y no por
--- número: el número cambia en cuanto sale una expansión nueva.
local function findLegionTier()
  if not EJ_GetNumTiers or not EJ_GetTierInfo then
    return nil
  end
  local total = EJ_GetNumTiers() or 0
  for index = 1, total do
    local name = EJ_GetTierInfo(index)
    if type(name) == 'string' and name:lower():find('legion', 1, true) then
      return index
    end
  end
  -- Si no se reconoce por nombre, la última suele ser la vigente.
  return total > 0 and total or nil
end

--- Id de ítem de una entrada de botín, sin fiarse del orden de la respuesta.
--
-- EJ_GetLootInfoByIndex devuelve varios valores y su orden ha cambiado entre
-- versiones. Buscar el enlace entre todo lo que llegue es más aburrido pero no
-- se rompe: ya dimos por buena la forma de una respuesta de este cliente sin
-- comprobarla y salió mal.
local function lootItemId(index)
  local returns = { EJ_GetLootInfoByIndex(index) }
  for i = 1, select('#', EJ_GetLootInfoByIndex(index)) do
    local value = returns[i]
    if type(value) == 'string' then
      local id = tonumber(string.match(value, 'item:(%d+)'))
      if id and id > 0 then
        return id
      end
    end
  end
  -- Sin enlace, el primer número grande es el candidato razonable: los ids de
  -- ítem de Legion están muy por encima de cualquier índice o contador.
  for i = 1, select('#', EJ_GetLootInfoByIndex(index)) do
    local value = returns[i]
    if type(value) == 'number' and value > 1000 then
      return math.floor(value)
    end
  end
  return nil
end

--- Todos los jefes de Legion, en orden, con su instancia.
local function collectEncounters()
  local tier = findLegionTier()
  if not tier then
    return {}
  end
  EJ_SelectTier(tier)

  local encounters = {}
  for _, isRaid in ipairs({ false, true }) do
    local index = 1
    while true do
      local instanceId, instanceName = EJ_GetInstanceByIndex(index, isRaid)
      if not instanceId then
        break
      end
      EJ_SelectInstance(instanceId)

      local bossIndex = 1
      while true do
        local bossName, _, encounterId = EJ_GetEncounterInfoByIndex(bossIndex, instanceId)
        if not bossName then
          break
        end
        if encounterId then
          encounters[#encounters + 1] = {
            instance = instanceName or '?',
            boss = bossName,
            encounterId = encounterId,
            isRaid = isRaid,
          }
        end
        bossIndex = bossIndex + 1
      end

      index = index + 1
    end
  end
  return encounters
end

--- Lee el botín del jefe ya seleccionado. Devuelve nil si aún no ha llegado.
local function readLoot()
  local total = EJ_GetNumLoot and EJ_GetNumLoot() or 0
  if total == 0 then
    return nil
  end
  local ids = {}
  for index = 1, total do
    local id = lootItemId(index)
    if id then
      ids[#ids + 1] = id
    end
  end
  return ids
end

--- Cuántas veces se reintenta un jefe antes de darlo por vacío.
local MAX_RETRIES = 8
--- Segundos entre pasos. Suficiente para que llegue el botín sin congelar nada.
local STEP = 0.1

--- Escanea el botín de Legion y llama a `onDone(lineas, jefes, piezas)`.
--
-- @param onProgress función opcional (hechos, total) para ir informando
function RBL.ScanLoot(onDone, onProgress)
  if LoadAddOn then
    LoadAddOn('Blizzard_EncounterJournal')
  end

  if not EJ_GetNumTiers then
    onDone(nil, 0, 0, 'Este cliente no tiene el Diario de Mazmorras disponible.')
    return
  end

  -- Sin filtro de clase: la app ya sabe qué puede llevar cada una, y así la
  -- tabla vale para cualquier personaje de la cuenta.
  if EJ_ResetLootFilter then
    EJ_ResetLootFilter()
  end

  local encounters = collectEncounters()
  if #encounters == 0 then
    onDone(nil, 0, 0, 'No se encontró ningún jefe de Legion en el Diario.')
    return
  end

  local lines = {}
  local seen = {}
  local seenItem = {}
  local itemIds = {}
  local items = 0
  local current = 0
  local retries = 0

  local ticker
  local function step()
    if current > 0 then
      local ids = readLoot()
      if ids == nil and retries < MAX_RETRIES then
        -- El botín todavía no ha llegado: mismo jefe otra vez.
        retries = retries + 1
        return
      end
      local encounter = encounters[current]
      for _, id in ipairs(ids or {}) do
        local key = id .. '|' .. encounter.encounterId
        if not seen[key] then
          seen[key] = true
          items = items + 1
          lines[#lines + 1] = '# drop:' .. id .. '=' .. encounter.instance .. ' / ' .. encounter.boss
        end
        -- Además de dónde cae, hace falta qué es: para las mazmorras propias
        -- del servidor el motor no tiene ni idea de la pieza, y esto es lo que
        -- permite simularla.
        if not seenItem[id] then
          seenItem[id] = true
          itemIds[#itemIds + 1] = id
        end
      end
    end

    current = current + 1
    retries = 0

    if current > #encounters then
      if ticker then
        ticker:Cancel()
      end
      for _, line in ipairs(RBL.DescribeLootItems and RBL.DescribeLootItems(itemIds) or {}) do
        lines[#lines + 1] = line
      end
      onDone(lines, #encounters, items)
      return
    end

    if onProgress then
      onProgress(current, #encounters)
    end
    EJ_SelectEncounter(encounters[current].encounterId)
  end

  if C_Timer and C_Timer.NewTicker then
    ticker = C_Timer.NewTicker(STEP, step)
  else
    -- Sin temporizador (o en las pruebas) se hace de una sentada. En el cliente
    -- real esto devolvería casi todo vacío por la carga asíncrona, así que el
    -- temporizador es el camino bueno.
    while current <= #encounters do
      step()
    end
  end
end

--- Cabecera del volcado, para que el fichero se explique solo.
function RBL.LootHeader(bosses, items)
  return {
    '# Raidbots Legion · tabla de botín ' .. (RBL.version or '?'),
    '# ' .. date('%Y-%m-%d %H:%M') .. ' · ' .. (GetRealmName() or '?'),
    '# ' .. bosses .. ' jefes, ' .. items .. ' piezas.',
    '#',
    '# Sale del Diario de Mazmorras del cliente, así que refleja las tablas de',
    '# Blizzard en 7.3.5. Si tu servidor ha cambiado el botín de algún jefe, esa',
    '# pieza aparecerá donde la puso Blizzard, no donde la puso tu servidor.',
    '',
  }
end
