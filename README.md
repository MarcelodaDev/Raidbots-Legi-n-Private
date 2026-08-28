# Raidbots Legion

Simulador de DPS local al estilo de [Raidbots](https://www.raidbots.com), pero
para **World of Warcraft: Legion 7.3.5**. Todo corre en tu máquina: no hace
falta cuenta, ni cola de espera, ni conexión a internet una vez instalado.

Por debajo usa el motor oficial de **SimulationCraft** (rama `legion-dev`,
versión `735-02`), que es el mismo que usaba Raidbots en su día para esa
expansión: las rotaciones, talentos, artefactos, set bonuses y legendarias de
Legion ya están implementados y validados ahí.

## Qué incluye

| Simulación | Qué hace |
|---|---|
| **Sim rápida** | DPS del personaje tal cual, desglose de daño por habilidad y pesos de estadística (Int/Crit/Celeridad/Maestría/Versatilidad). |
| **Droptimizer** | Simula ítems sueltos, cada uno en los slots donde encaja, y los ordena por ganancia de DPS. Permite normalizar todos los candidatos a un ilvl. |
| **Top Gear** | Combina el equipo puesto con el inventario y simula todas las configuraciones posibles, respetando el límite de legendarias. |
| **Talentos** | Compara fila a fila (21 perfiles) o las 2187 combinaciones completas. |
| **Consumibles** | Compara frascos, comida, pociones y runas de aumento de Legion. |
| **Reliquias** | Qué rasgo del artefacto conviene subir (cada reliquia da +1 rango) y cuánto vale subir el ilvl de cada una de las tres reliquias. |

Otras cosas que trae:

- **Fases de servidor progresivo**: eliges en qué tier va tu servidor (pre-banda,
  T19, T20, T21) y la app recorta el buscador de ítems a lo que existe en esa
  fase y te enseña el equipo de referencia de tu spec para ese tier, con la
  comparativa slot a slot contra lo que llevas puesto.
- Importación con la cadena del **addon SimulationCraft** (`/simc` en el juego).
- **Gestor de inventario propio**: el addon de Legion no exporta las bolsas de
  forma fiable, así que las piezas para Top Gear se añaden desde un buscador
  sobre la base de ítems, con ilvl ajustable (así se representa el titanforjado).
- **Lectura del artefacto**: la app le pregunta al motor los rasgos del arma,
  con sus rangos comprados, del Crisol y de reliquias, y además despeja el ilvl
  real de tus reliquias. Tarda menos de un segundo.
- Progreso en vivo de la simulación e historial de resultados.
- Filtrado de ítems por clase y tipo de armadura. **Esto importa**: si le pasas
  a SimulationCraft una pieza que tu clase no puede llevar, aborta el lote
  entero, así que la app lo bloquea antes de lanzar.

## Instalación

Necesitas **Node.js 20+** y un compilador de C++ (`build-essential` en
Debian/Ubuntu, `xcode-select --install` en macOS).

```bash
npm install          # dependencias de la app
npm run setup:simc   # clona y compila SimulationCraft 7.3.5 (10-20 min)
npm run build:itemdb # genera la base de ítems desde la DBC de simc
npm run build:patchdb # genera las fases de contenido desde los perfiles de simc
npm run check:simc   # comprueba que todo está en su sitio
```

`setup:simc` deja el binario en `vendor/simc/engine/simc`. Si ya tienes uno
compilado, sáltate ese paso y apunta a él:

```bash
export SIMC_PATH=/ruta/a/tu/simc
```

> El código de SimulationCraft es de 2018 y no compila tal cual con GCC/Clang
> modernos (faltan includes que entonces llegaban de forma transitiva). Los
> parches necesarios están en `scripts/patches/` y el script los aplica solo.

## Uso

```bash
npm run dev     # servidor + interfaz en modo desarrollo
```

- Interfaz: <http://localhost:5273>
- API: <http://localhost:7331>

Para usarlo como una app normal, compila la interfaz una vez y arranca solo el
servidor, que ya sirve todo desde el mismo puerto:

```bash
npm run build
npm start       # http://localhost:7331
```

### Importar un personaje

Con el addon que viene en `addon/` (recomendado, porque exporta también bolsas
y banco):

1. Copia `addon/RaidbotsLegion` a `Interface/AddOns/` de tu cliente.
2. Abre el banco si quieres incluir lo que guardas ahí, y escribe `/rbl`.
3. Copia el texto y pégalo en la pantalla de Personajes.

También vale la cadena del addon oficial de SimulationCraft (`/simc`); lo único
que cambia es que el inventario puede venir incompleto.

La app guarda el perfil `.simc` tal cual (saneado) y lo usa como base de todas
las simulaciones, igual que hace Raidbots.

## Cómo está montado

```
packages/
  shared/   Tipos compartidos entre servidor e interfaz
  server/   API Fastify, cola de simulación y envoltura de SimulationCraft
  web/      Interfaz React + Vite
addon/      Addon de WoW 7.3.5 que exporta el personaje con bolsas y banco
scripts/
  setup-simc.sh      Clona, parchea y compila SimulationCraft 7.3.5
  build-item-db.mjs  Genera data/items.json y data/consumables.json
  build-patch-db.mjs Genera data/patches.json (fases y equipo de referencia)
  check-simc.mjs     Diagnóstico de la instalación
data/       Base de ítems y consumibles (generados)
.rbl/       Personajes, historial y resultados (estado local)
```

Detalles que merece la pena conocer:

- **Los lotes usan `profileset`**, la función de SimulationCraft pensada
  justamente para esto: una sola invocación del motor simula el perfil base y
  todas las variantes, reutilizando la inicialización.
- **La base de ítems se genera desde `sc_item_data.inc`**, la propia DBC de
  simc. Así, cualquier ítem que aparezca en el buscador existe seguro en el
  motor; no hay ids inventados ni desincronización de versiones.
- **Las runas de aumento no salen de la DBC**: SimulationCraft 7.3.5 las
  resuelve por nombre en `sc_consumable.cpp`, así que están fijadas en el
  script de generación.
- **Los rasgos del artefacto se le preguntan al motor**, no se parsean de la
  cadena `artifact=`: ahí solo vienen ids y rangos comprados, sin nombres y sin
  los rangos que aportan el Crisol y las reliquias. El informe JSON de simc trae
  la lista completa, así que basta una simulación de una iteración.
- **El ilvl de las reliquias se despeja por bisección**: el addon no lo exporta
  (va codificado en los bonus_id de cada reliquia), pero el motor sí publica el
  ilvl resultante del arma y la relación es monótona, así que la app busca el
  valor de `relic_ilevel` que lo reproduce. Con eso el comparador de ilvl no
  depende de que el usuario adivine nada.
- **Las fases salen de los perfiles por tier de simc** (`profiles/PreRaids`,
  `Tier19`, `Tier20`, `Tier21`), que son los que mantiene la comunidad para cada
  tier de banda. Cada perfil se carga en el motor para que sea él quien resuelva
  el ilvl efectivo de cada pieza, y de ahí se deducen el tope de ilvl de la fase
  y cuántas legendarias equipa.
- **Los perfiles pegados se sanean**: un `.simc` puede escribir ficheros o hacer
  peticiones de red, y aquí se ejecuta un binario de verdad, así que esas
  opciones se filtran al importar.

## Fases de servidor progresivo

Cada personaje se asigna a una fase. Eso cambia tres cosas:

1. **El buscador de ítems** se limita al ilvl máximo de esa fase y descarta el
   equipo que parece de un tier posterior.
2. **Top Gear** usa como límite de legendarias el que se ve en los perfiles de
   esa fase.
3. **Aparece el equipo de referencia** de tu spec para ese tier, comparado slot a
   slot con lo que llevas, y puedes mandar de un clic las piezas que te faltan al
   inventario para simularlas.

| Fase | ilvl tope | Specs con referencia |
|---|---|---|
| Pre-banda | 865 | 28 |
| T19 · Sueño Esmeralda → Palacio Nocturno | 910 | 23 |
| T20 · Tumba de Sargeras | 970 | 21 |
| T21 · Antorus, el Trono Ardiente | 1000 | 28 |

Hay dos matices que conviene tener claros:

- Los perfiles de simc están escritos sobre el juego final de 7.3.5, así que su
  **equipo** es el del tier pero sus **mecánicas** son las de 7.3.5. Por eso los
  números de cada fase (tope de ilvl, legendarias) son valores por defecto
  editables, no una reconstrucción histórica del parche.
- Descartar el equipo de tiers posteriores se hace por rango de id de ítem: los
  ids se asignan por bloques según se desarrolla el contenido, así que funciona
  bien en la práctica, pero es una aproximación. Hay una casilla para desactivarlo
  y otra para ver solo las piezas que aparecen en los perfiles de referencia.

Las etiquetas de las fases se editan en `scripts/build-patch-db.mjs` sin tocar
nada más.

## Limitaciones conocidas

- **Reliquias**: se comparan por rasgo (`artifact_override`) y por ilvl
  (`relic_ilevel`), que son las dos decisiones reales. Lo que no hay es un
  catálogo de reliquias concretas por jefe: eliges el rasgo, no el ítem.
- **Crisol de Luznether**: los rangos del Crisol se importan y cuentan en el
  rango total de cada rasgo, así que el comparador ya los tiene en cuenta. No
  hay, en cambio, un optimizador de qué camino del Crisol elegir.
- **Bonus IDs**: al sustituir una pieza se usa `ilevel=` para fijar su nivel,
  que es lo que hace falta para el 99% de los casos, pero no se modelan
  bonus IDs concretos (socket extra, terciarias) salvo que los indiques a mano.
- **Encantamientos y gemas al cambiar de pieza**: se heredan del ítem que
  ocupaba ese slot. Es la misma aproximación que usa Raidbots, pero conviene
  saberlo al leer un Droptimizer.
- **Límite de legendarias**: configurable (2 por defecto). Los servidores
  privados lo cambian a menudo, así que ajústalo a lo que tenga el tuyo.
- **Un solo personaje por simulación**: no hay sims de banda ni de varios
  jugadores a la vez.
- **Las fases no traen tablas de botín por jefe**: la referencia es el equipo BiS
  del tier según simc, no "qué suelta cada jefe". Tres perfiles de T20 (guerrero
  Armas y Furia, druida Feral) no se pueden cargar porque usan un ítem que no
  está en la DBC de 7.3.5, así que esas specs no tienen referencia en esa fase.

## Servidores privados

La app simula con los datos oficiales de 7.3.5. Si tu servidor tiene valores
retocados (daño de hechizos, tasas de proc, ilvl de la loot), los resultados
serán una aproximación: sirven perfectamente para comparar opciones entre sí
—que es para lo que se usa un simulador— pero el DPS absoluto puede no cuadrar
con el del servidor.
