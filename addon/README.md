# Raidbots Legion Export (addon de WoW 7.3.5)

Exporta tu personaje en formato SimulationCraft **incluyendo lo que llevas en
las bolsas y en el banco**, que es justo lo que necesita Top Gear.

## Instalación

1. Copia la carpeta `RaidbotsLegion` a la de addons de tu cliente:
   `World of Warcraft/Interface/AddOns/RaidbotsLegion`
2. Entra al juego y asegúrate de que está activado en el selector de addons.
3. Escribe `/rbl`.

No necesita Ace3, LibStub ni ninguna otra librería: se copia y funciona.

## Uso

```
/rbl        genera el perfil y abre la ventana para copiarlo
/rbl help   ayuda
```

Se abre una ventana con el texto ya seleccionado: `Ctrl+C` y pégalo en la
pantalla de Personajes de la app.

Dos detalles que cambian lo que sale:

- **Abre el banco antes de exportar** si quieres que incluya lo que guardas
  ahí. El cliente solo deja leer los contenedores del banco mientras está
  abierto; si no lo está, el perfil lo dice en un comentario.
- El addon **abre y cierra la ventana del artefacto** al exportar. Es la única
  forma de leer los rangos de los rasgos: la API solo responde con esa interfaz
  abierta. Si la tenías abierta, se queda abierta.

## Qué exporta

```
mage="Nyxa"
level=110
race=dwarf
region=eu
server=mi_servidor
role=spell
professions=alchemy=800/herbalism=800
talents=2033021
spec=frost
artifact=53:0:0:0:0:783:1:784:4:786:4
crucible=1739/1739/1739

head=,id=152138,enchant_id=5429,bonus_id=3612/1502
...
main_hand=,id=128862,gem_id=155850/155846/155850,bonus_id=731,relic_id=3612:1512/3612:1512/3612:1512

### Gear from Bags
# Crown of Relentless Annihilation (930, bolsas)
#head=,id=151943,bonus_id=3610/1502
# Meditation Spheres of Chi-Ji (930, bolsas)
#trinket1=,id=152147,bonus_id=3612/1502
```

Las piezas de las bolsas van comentadas con `#` para que el perfil siga siendo
válido en SimulationCraft y en Raidbots, pero llevan el slot delante, así que la
app las lee y las mete en el inventario del personaje.

## Cómo está hecho

| Fichero | Qué hace |
|---|---|
| `Data.lua` | Tablas de consulta (artefactos, specs, profesiones, regiones). |
| `Items.lua` | Convierte un enlace de ítem del cliente a una línea `.simc`. |
| `Core.lua` | Recolecta personaje, equipo, bolsas, banco, talentos y artefacto. |
| `UI.lua` | Ventana de copiado y comandos. |

Decisiones que conviene conocer:

- **La lectura del enlace de ítem sigue la del addon oficial de SimulationCraft
  para Legion** (que es de dominio público). No es capricho: los campos que van
  detrás de los `bonus_id` son de longitud variable y solo están según los bits
  de `flags`, y es ahí donde viven las reliquias del artefacto. Las tablas de
  consulta se extraen de ahí tal cual, sin copiarlas a mano, para no meter
  erratas en ids del cliente.
- **Las bolsas se recorren contenedor a contenedor** en vez de usar
  `EquipmentManager_UnpackLocation`, que necesita un número mágico para los
  huecos del banco y ese número cambió entre versiones del cliente. Recorrer
  contenedores es más predecible, sobre todo en un servidor privado.
- **El Crisol distingue "no tiene rasgos" de "no he podido leerlo".** Para saber
  qué rasgos añade el Crisol hay que comparar con los que daría la reliquia
  recién puesta, y para eso hace falta el ítem base; si el cliente no lo tiene
  en caché, la API devuelve nada. Escribir un `0` ahí sería mentirle al
  simulador, así que el perfil incluye un aviso y te pide abrir el Crisol una
  vez.

## Pruebas

El addon se puede ejecutar fuera del juego contra una API de WoW simulada:

```bash
lua5.4 addon/test/run.lua           # imprime el perfil de un personaje de ejemplo
lua5.4 addon/test/run.lua --check   # 25 comprobaciones sobre esa salida
```

Eso verifica la lectura de enlaces (bonus_id, gemas, reliquias), el mapeo de
`INVTYPE` a slot, el recorrido de bolsas y banco, el deduplicado y el formato
final. **Lo que no puede verificar es que el cliente devuelva lo que
esperamos**: eso solo se comprueba en el juego, y es donde conviene mirar si
algo sale raro.
