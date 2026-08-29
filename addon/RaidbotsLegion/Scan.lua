-- Escáner de ítems que no tienes.
--
-- El resto del addon lee lo que llevas puesto o en las bolsas. Esto es para lo
-- otro: las piezas de las mazmorras propias del servidor, que SimulationCraft
-- no conoce y que nadie puede simular hasta que alguien las describa. Con este
-- volcado se describen una vez y valen para todo el mundo.
--
-- Dos formas de sacarlas, según lo que tenga montado el servidor:
--
--   * `/rbl botin`, si las mazmorras propias están en el Diario de Mazmorras.
--     Es lo cómodo: no hay que saber ningún número.
--   * `/rbl escanear <desde> <hasta>`, si no lo están. Recorre un rango de ids
--     preguntándole al servidor por cada uno.
--
-- Lo que hace que esto no sea un bucle: `GetItemInfo` de un ítem que el cliente
-- no tiene en caché devuelve **nil** y, de paso, se lo pide al servidor. La
-- respuesta llega más tarde, por el evento GET_ITEM_INFO_RECEIVED. Recorrer el
-- rango de una sentada devolvería casi todo vacío sin dar ningún error.

local _, RBL = ...

--- INVTYPE que no son equipo de combate y no interesan en el catálogo.
local SKIP_INVTYPE = {
  [''] = true,
  INVTYPE_BAG = true,
  INVTYPE_TABARD = true,
  INVTYPE_BODY = true,
  INVTYPE_AMMO = true,
  INVTYPE_QUIVER = true,
  INVTYPE_RELIC = true,
}

--- Ids que se piden a la vez. Bajo a propósito: cada uno que no está en caché
--- es una consulta al servidor, y no hace falta agobiarlo.
local BATCH = 25
--- Segundos entre tandas.
local STEP = 0.15
--- Cuántas vueltas se espera a que llegue un ítem antes de darlo por inexistente.
local MAX_WAIT = 20

--- Una línea con todo lo que hace falta para simular la pieza.
--
-- El nombre va al final porque es lo único que puede contener casi cualquier
-- cosa; todo lo de delante son campos de posición fija.
local function describe(id, link)
  -- Siempre una cadena de ítem, nunca un id suelto: GetDetailedItemLevelInfo y
  -- GetItemStats esperan un enlace, y pasarles el número devuelve nil o cero
  -- sin dar ningún error. El ilvl saldría a 0 y nadie se enteraría.
  local itemString = link or ('item:' .. id)

  local name, _, quality, ilevel, _, _, _, _, invType, _, _, classId, subclassId =
    GetItemInfo(itemString)
  if not name or SKIP_INVTYPE[invType or ''] then
    return nil
  end

  local detailed = GetDetailedItemLevelInfo and GetDetailedItemLevelInfo(itemString)
  local stats = RBL.ItemStatsString and RBL.ItemStatsString(itemString)

  return table.concat({
    '# custom:' .. id,
    tostring(detailed or ilevel or 0),
    tostring(quality or 0),
    invType or '?',
    tostring(classId or 0) .. ':' .. tostring(subclassId or 0),
    stats or '',
    name,
  }, '|')
end

--- Escanea un rango de ids y llama a `onDone(lineas, encontrados, mirados)`.
function RBL.ScanItemRange(from, to, onDone, onProgress)
  from = math.floor(tonumber(from) or 0)
  to = math.floor(tonumber(to) or 0)
  if from <= 0 or to < from then
    onDone(nil, 0, 0, 'El rango no vale. Ejemplo: /rbl escanear 150000 160000')
    return
  end
  if to - from > 60000 then
    onDone(nil, 0, 0, 'Ese rango es enorme. Pruébalo por tramos de 20.000 como mucho.')
    return
  end

  local lines = {}
  local found = 0
  local cursor = from
  local waiting = {}
  local waited = 0
  local ticker
  -- El camino sin temporizador termina el bucle y además `step` puede dar por
  -- acabado el escaneo: sin esto, `onDone` se llamaría dos veces y el volcado
  -- saldría duplicado.
  local finished = false

  local function finish()
    if finished then
      return
    end
    finished = true
    if ticker then ticker:Cancel() end
    onDone(lines, found, to - from + 1)
  end

  local function take(id)
    local line = describe(id)
    if line then
      found = found + 1
      lines[#lines + 1] = line
      local effect = RBL.ItemEffectText and RBL.ItemEffectText('item:' .. id)
      if effect then
        lines[#lines + 1] = '# effect:' .. id .. '=' .. effect
      end
    end
  end

  local function step()
    -- Primero, los que estaban pendientes de que el servidor respondiera.
    local stillWaiting = {}
    local pending = 0
    for id in pairs(waiting) do
      if GetItemInfo(id) then
        take(id)
      else
        stillWaiting[id] = true
        pending = pending + 1
      end
    end
    waiting = stillWaiting

    if cursor > to then
      -- Ya no quedan ids nuevos: solo esperar a los que faltan, con un tope
      -- para no quedarse colgado por ids que sencillamente no existen.
      waited = waited + 1
      if pending == 0 or waited > MAX_WAIT then
        finish()
      end
      return
    end

    local last = math.min(cursor + BATCH - 1, to)
    for id = cursor, last do
      -- Se pregunta por el id suelto a propósito: es lo que dispara la
      -- petición al servidor cuando el ítem no está en caché. Con el enlace
      -- ya montado el cliente respondería como si lo conociera.
      if GetItemInfo(id) then
        take(id)
      else
        waiting[id] = true
      end
    end
    cursor = last + 1

    if onProgress then
      onProgress(last - from + 1, to - from + 1, found)
    end
  end

  if C_Timer and C_Timer.NewTicker then
    ticker = C_Timer.NewTicker(STEP, step)
  else
    -- Sin temporizador (las pruebas) se recorre entero. En el cliente real esto
    -- devolvería casi todo vacío: la carga asíncrona es justo el problema.
    while not finished do
      local before = cursor
      step()
      if cursor == before and not next(waiting) and cursor > to then break end
      if waited > MAX_WAIT then break end
    end
    finish()
  end
end

--- Describe los ítems que el Diario de Mazmorras lista para unos jefes.
--
-- Es el camino cómodo cuando el servidor sí ha metido sus mazmorras propias en
-- el Diario: no hay que saberse ningún rango de ids.
function RBL.DescribeLootItems(itemIds)
  local lines = {}
  local seen = {}
  for _, id in ipairs(itemIds or {}) do
    if not seen[id] then
      seen[id] = true
      local line = describe(id)
      if line then
        lines[#lines + 1] = line
        local effect = RBL.ItemEffectText and RBL.ItemEffectText('item:' .. id)
        if effect then
          lines[#lines + 1] = '# effect:' .. id .. '=' .. effect
        end
      end
    end
  end
  return lines
end

--- Cabecera del volcado.
function RBL.ScanHeader(found, looked)
  return {
    '# Raidbots Legion · ítems para el catálogo ' .. (RBL.version or '?'),
    '# ' .. date('%Y-%m-%d %H:%M') .. ' · ' .. (GetRealmName() or '?'),
    '# ' .. found .. ' piezas de ' .. looked .. ' ids mirados.',
    '#',
    '# Formato: id|ilvl|calidad|INVTYPE|clase:subclase|estadísticas|nombre',
    '',
  }
end
