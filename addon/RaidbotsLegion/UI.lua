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

  RBL.lastProfile = profile
  frame.hint:SetText(
    equipped ..
      ' piezas equipadas · ' ..
      bagged ..
      ' en bolsas' ..
      (RBL.bankOpen and ' y banco' or ' (banco cerrado)') ..
      '. Ctrl+C para copiar y pégalo en la app.'
  )
  frame.edit:SetText(profile)
  frame:Show()
  frame.edit:SetFocus()
  frame.edit:HighlightText()
end

-- ---------------------------------------------------------------------------
-- Comandos y eventos
-- ---------------------------------------------------------------------------

SLASH_RAIDBOTSLEGION1 = '/rbl'
SLASH_RAIDBOTSLEGION2 = '/raidbots'
SlashCmdList['RAIDBOTSLEGION'] = function(msg)
  local arg = string.lower(string.trim(msg or ''))
  if arg == 'help' or arg == 'ayuda' then
    print('|cff33bbffRaidbots Legion|r')
    print('  /rbl        genera el perfil y lo abre para copiar')
    print('  Abre el banco antes si quieres que incluya lo que guardas ahí.')
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
