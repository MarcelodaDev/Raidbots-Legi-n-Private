-- Ventana de copiado y comandos del addon.
--
-- WoW no deja escribir en el portapapeles desde un addon, así que lo que se
-- hace es lo de siempre: volcar el texto en un cuadro de edición con todo
-- seleccionado para que el jugador haga Ctrl+C.

local ADDON_NAME, RBL = ...

local frame

local function createFrame()
  local f = CreateFrame('Frame', 'RaidbotsLegionFrame', UIParent, 'BasicFrameTemplateWithInset')
  f:SetSize(700, 460)
  f:SetPoint('CENTER')
  f:SetMovable(true)
  f:EnableMouse(true)
  f:RegisterForDrag('LeftButton')
  f:SetScript('OnDragStart', f.StartMoving)
  f:SetScript('OnDragStop', f.StopMovingOrSizing)
  f:SetFrameStrata('DIALOG')

  f.title = f:CreateFontString(nil, 'OVERLAY', 'GameFontHighlight')
  f.title:SetPoint('TOP', f, 'TOP', 0, -6)
  f.title:SetText('Raidbots Legion · perfil para el simulador')

  f.hint = f:CreateFontString(nil, 'OVERLAY', 'GameFontDisableSmall')
  f.hint:SetPoint('TOPLEFT', f, 'TOPLEFT', 14, -30)
  f.hint:SetPoint('TOPRIGHT', f, 'TOPRIGHT', -14, -30)
  f.hint:SetJustifyH('LEFT')

  local scroll = CreateFrame('ScrollFrame', 'RaidbotsLegionScroll', f, 'UIPanelScrollFrameTemplate')
  scroll:SetPoint('TOPLEFT', f, 'TOPLEFT', 14, -52)
  scroll:SetPoint('BOTTOMRIGHT', f, 'BOTTOMRIGHT', -34, 44)

  local edit = CreateFrame('EditBox', 'RaidbotsLegionEditBox', scroll)
  edit:SetMultiLine(true)
  edit:SetAutoFocus(false)
  edit:SetFontObject(ChatFontNormal)
  edit:SetWidth(630)
  edit:SetScript('OnEscapePressed', function()
    f:Hide()
  end)
  -- Que no se pueda editar de verdad: cualquier cambio revierte al texto.
  edit:SetScript('OnTextChanged', function(self, userInput)
    if userInput then
      self:SetText(RBL.lastProfile or '')
      self:HighlightText()
    end
  end)
  scroll:SetScrollChild(edit)
  f.edit = edit

  local close = CreateFrame('Button', nil, f, 'UIPanelButtonTemplate')
  close:SetSize(100, 22)
  close:SetPoint('BOTTOMRIGHT', f, 'BOTTOMRIGHT', -14, 14)
  close:SetText('Cerrar')
  close:SetScript('OnClick', function()
    f:Hide()
  end)

  local selectAll = CreateFrame('Button', nil, f, 'UIPanelButtonTemplate')
  selectAll:SetSize(140, 22)
  selectAll:SetPoint('RIGHT', close, 'LEFT', -8, 0)
  selectAll:SetText('Seleccionar todo')
  selectAll:SetScript('OnClick', function()
    edit:SetFocus()
    edit:HighlightText()
  end)

  f:Hide()
  return f
end

--- Enseña un texto cualquiera listo para copiar.
local function showText(title, hint, text)
  if not frame then
    frame = createFrame()
  end
  RBL.lastProfile = text
  frame.title:SetText(title)
  frame.hint:SetText(hint)
  frame.edit:SetText(text)
  frame:Show()
  frame.edit:SetFocus()
  frame.edit:HighlightText()
end

--- Genera el perfil y lo muestra listo para copiar.
function RBL.Show()
  if not frame then
    frame = createFrame()
  end

  local ok, profile, equipped, bagged = pcall(RBL.BuildProfile)
  if not ok then
    -- `profile` trae el mensaje de error cuando pcall falla.
    print('|cffff5555Raidbots Legion:|r no se pudo generar el perfil: ' .. tostring(profile))
    return
  end

  showText(
    'Raidbots Legion · perfil para el simulador',
    equipped ..
      ' piezas equipadas · ' ..
      bagged ..
      ' en bolsas' ..
      (RBL.bankOpen and ' y banco' or ' (banco cerrado)') ..
      '. Ctrl+C para copiar y pégalo en la app.',
    profile
  )
end

--- Escanea un rango de ids y describe cada pieza que encuentre.
--
-- Es para las mazmorras propias del servidor cuando no están en el Diario: sin
-- Diario no hay forma de saber qué ids usan, así que se barre un rango.
function RBL.ShowScan(from, to)
  print('|cff33bbffRaidbots Legion|r escaneando ids ' .. from .. '-' .. to .. '...')
  print('  Puede tardar: cada ítem que el cliente no tenga en caché hay que pedírselo al servidor.')
  RBL.ScanItemRange(from, to, function(lines, found, looked, err)
    if err then
      print('|cffff5555Raidbots Legion:|r ' .. err)
      return
    end
    local header = RBL.ScanHeader(found, looked)
    for _, line in ipairs(lines) do
      header[#header + 1] = line
    end
    print('|cff33bbffRaidbots Legion|r listo: ' .. found .. ' piezas de ' .. looked .. ' ids.')
    showText(
      'Raidbots Legion · ítems para el catálogo',
      found .. ' piezas encontradas en ' .. looked .. ' ids. Ctrl+C y mándalo para el catálogo.',
      table.concat(header, '\n')
    )
  end, function(done, total, found)
    if done % 2000 == 0 then
      print('|cff33bbffRaidbots Legion|r ' .. done .. '/' .. total .. ' ids, ' .. found .. ' piezas...')
    end
  end)
end

--- Escanea el botín de Legion y lo enseña para copiar.
--
-- Tarda: son unos cien jefes y hay que esperar a que llegue el botín de cada
-- uno, así que se va informando por el chat en vez de dejar la pantalla quieta.
function RBL.ShowLoot()
  print('|cff33bbffRaidbots Legion|r escaneando el Diario de Mazmorras...')
  RBL.ScanLoot(function(lines, bosses, items, err)
    if err then
      print('|cffff5555Raidbots Legion:|r ' .. err)
      return
    end
    local header = RBL.LootHeader(bosses, items)
    for _, line in ipairs(lines) do
      header[#header + 1] = line
    end
    local text = table.concat(header, '\n')
    print('|cff33bbffRaidbots Legion|r listo: ' .. items .. ' piezas de ' .. bosses .. ' jefes.')
    showText(
      'Raidbots Legion · tabla de botín',
      bosses .. ' jefes, ' .. items .. ' piezas. Ctrl+C y pégalo en la app, en Tabla de botín.',
      text
    )
  end, function(done, total)
    if done % 20 == 0 then
      print('|cff33bbffRaidbots Legion|r ' .. done .. '/' .. total .. ' jefes...')
    end
  end)
end

-- ---------------------------------------------------------------------------
-- Comandos y eventos
-- ---------------------------------------------------------------------------

SLASH_RAIDBOTSLEGION1 = '/rbl'
SLASH_RAIDBOTSLEGION2 = '/raidbots'
SlashCmdList['RAIDBOTSLEGION'] = function(msg)
  -- `strtrim` es el global que expone WoW; `string.trim` no siempre existe.
  local trim = _G.strtrim or function(value)
    return (string.gsub(value, '^%s*(.-)%s*$', '%1'))
  end
  local arg = string.lower(trim(msg or ''))
  if arg == 'help' or arg == 'ayuda' then
    print('|cff33bbffRaidbots Legion|r')
    print('  /rbl         genera el perfil y lo abre para copiar')
    print('  /rbl botin   vuelca el botín del Diario y describe cada pieza')
    print('  /rbl escanear <desde> <hasta>   describe los ítems de un rango de ids,')
    print('               para las mazmorras propias que no salen en el Diario')
    print('  Abre el banco antes si quieres que incluya lo que guardas ahí.')
    return
  end
  if arg == 'botin' or arg == 'loot' or arg == 'botín' then
    RBL.ShowLoot()
    return
  end
  local from, to = string.match(arg, '^escanear%s+(%d+)%s+(%d+)$')
  if from then
    RBL.ShowScan(tonumber(from), tonumber(to))
    return
  end
  if string.match(arg, '^escanear') then
    print('|cffff5555Raidbots Legion:|r hacen falta los dos extremos. Ejemplo: /rbl escanear 150000 160000')
    return
  end
  RBL.Show()
end

local events = CreateFrame('Frame')
events:RegisterEvent('BANKFRAME_OPENED')
events:RegisterEvent('BANKFRAME_CLOSED')
events:RegisterEvent('PLAYER_LOGIN')
events:SetScript('OnEvent', function(_, event)
  if event == 'BANKFRAME_OPENED' then
    RBL.bankOpen = true
  elseif event == 'BANKFRAME_CLOSED' then
    RBL.bankOpen = false
  elseif event == 'PLAYER_LOGIN' then
    print('|cff33bbffRaidbots Legion|r cargado. Escribe |cffffff00/rbl|r para exportar tu personaje.')
  end
end)
