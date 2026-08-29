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
| **Encantamientos** | Compara los encantamientos de un hueco, incluido el perfil sin encantar. |
| **Gemas** | Compara las gemas de un hueco, incluido el perfil sin gema. |

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
npm run build:enhancements # genera el catálogo de gemas y encantamientos
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

## Instalación en Windows

En Windows lo único que no se resuelve con `npm` es SimulationCraft, porque hay
que compilarlo. Hay tres caminos, de más fácil a más laborioso.

### 1. Paquete ya preparado (recomendado)

Trae `simc.exe` compilado y las bases de datos ya generadas, así que te saltas
la compilación entera.

1. Instala [Node.js 20+](https://nodejs.org).
2. Descarga el proyecto y descomprímelo, por ejemplo en `C:\raidbots-legion`.
3. Descomprime el paquete de Windows **dentro** de la carpeta del proyecto. Las
   carpetas `bin` y `data` tienen que quedar al mismo nivel que `package.json`,
   no dentro de otra carpeta:

   ```
   C:\raidbots-legion\bin\simc.exe
   C:\raidbots-legion\data\items.json
   C:\raidbots-legion\package.json
   ```
4. Abre PowerShell ahí y ejecuta:

   ```powershell
   npm install
   npm run build
   npm start
   ```

5. Abre <http://localhost:7331>.

Para comprobar que todo está en su sitio: `npm run check:simc`. Si no encuentra
el binario, te dice **en qué rutas exactas ha buscado**, que casi siempre basta
para ver que quedó una carpeta más adentro de lo debido.

> El `simc.exe` del paquete está compilado de forma estática: no necesita
> Visual C++ ni ninguna otra librería. Se ha comprobado ejecutándolo (arranca y
> completa una simulación real a varios hilos), aunque bajo Wine y no sobre
> Windows de verdad. Si diera problemas, tira de cualquiera de los dos caminos
> siguientes.

> **Si lo recompilas tú** (`npm run build:simc-windows`), hay dos trampas, y
> las dos dan el mismo síntoma: un ejecutable que no imprime nada.
>
> 1. **`-march=native`**, que el objetivo `optimized` del Makefile de
>    SimulationCraft añade por su cuenta. Compila para la CPU de la máquina que
>    compila, así que en cualquier otra muere en la primera instrucción que no
>    soporte. El script pasa `OPTS` por línea de comandos para anularlo y
>    después comprueba sobre el binario que no haya quedado ni una instrucción
>    AVX.
> 2. **El modelo de hilos del compilador.** Hace falta
>    `x86_64-w64-mingw32-g++-posix`; con la variante `win32` que traen
>    Debian y Ubuntu por defecto, `std::thread` queda inservible y
>    SimulationCraft es multihilo entero. El script se planta si el modelo no es
>    el correcto.

### 2. WSL

Si tienes o quieres tener WSL, es el camino más parecido a lo probado:

```powershell
wsl --install          # solo la primera vez, reinicia después
```

Y ya dentro de Ubuntu, exactamente los mismos pasos que en Linux:

```bash
sudo apt install build-essential git nodejs npm
git clone <este repo> && cd raidbots-legion
npm install && npm run setup:simc && npm run build:itemdb
npm run build:patchdb && npm run build:enhancements
npm run build && npm start
```

La app queda igualmente en <http://localhost:7331>, y se abre desde el navegador
de Windows con normalidad.

### 3. Compilar SimulationCraft en Windows

Necesitas Visual Studio con las herramientas de C++. Clona
`https://github.com/simulationcraft/simc` en la rama `legion-dev`, abre
`simc_vs2017.sln`, compila en Release x64 y copia el `simc.exe` resultante a
`bin\simc.exe` dentro del proyecto. Luego genera las bases de datos:

```powershell
npm run build:itemdb -- --simc C:\ruta\a\simc
npm run build:patchdb -- --simc C:\ruta\a\simc
npm run build:enhancements -- --simc C:\ruta\a\simc
```

### Dónde busca la app el binario

Por orden: la variable de entorno `SIMC_PATH`, luego
`vendor\simc\engine\simc.exe`, luego `bin\simc.exe`. Para fijarla a mano:

```powershell
$env:SIMC_PATH = "C:\ruta\a\simc.exe"
npm start
```

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
  build-enhancements-db.mjs  Genera data/enhancements.json (gemas y encantamientos)
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
- **Gemas y encantamientos se validan antes de simular.** SimulationCraft
  ignora en silencio un `enchant_id` que no conoce y devuelve el DPS sin
  encantar, que parece un resultado bueno. Las listas por hueco salen de los
  perfiles por tier (qué se pone de verdad en un anillo), y el catálogo completo
  queda detrás de un interruptor.
- **Las gemas solo cuentan si la pieza tiene engarce.** Comprobado: si no lo
  tiene, el motor las ignora, así que heredarlas al cambiar de ítem no inventa
  estadísticas. La app avisa cuando el hueco no parece tener engarce.
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

**El tope de legendarias no se deduce, se declara.** Se intentó sacarlo contando
las legendarias de los perfiles BiS de simc, pero los de T19 no llevan ninguna y
salía 0 — cuando en Bastión Nocturno ya se llevaban dos. Ahora cada fase declara
el valor histórico (1 · 2 · 3 · 3) y el deducido queda solo como suelo. En un
servidor privado esto cambia a menudo, así que es editable desde la app.

## Qué me mejora

Recorre las piezas de tu fase que tu clase puede llevar y te dice cuáles te
suben el DPS, con las **3 mejores por hueco** y **desde qué ilvl** compensan.

Para un mago con tope 970 hay unas 2.700 candidatas: simularlas todas serían
horas. Así que se ordenan antes sin simular, usando los tipos de estadística que
trae la DBC y los pesos que calculó tu propia simulación (por eso hace falta
haber lanzado antes «Cuánto pego» con la casilla de estadísticas marcada).

Dos decisiones que conviene conocer:

- **Se leen los tipos de estadística, no los importes.** Calcular los importes
  exigiría reimplementar el presupuesto por ilvl de SimulationCraft, con el
  riesgo de sacar números creíbles y equivocados. Para ordenar basta con saber
  qué estadísticas lleva la pieza; quien decide de verdad es la simulación.
- **Mitad por estadísticas, mitad por ilvl.** Una pieza puede ser mejor por
  llevar lo que te renta o por tener más presupuesto bruto. Ordenar solo por un
  criterio pierde el otro, así que se cogen las mejores de cada lista.

`npm run test:upgrades` cubre el ordenador de candidatos. Existe porque si se
equivoca no hay error: la pieza buena simplemente nunca se simula y nadie se
entera.

### De dónde salen los candidatos

De **todo** lo que quepa en la fase: banda, mazmorras normales y míticas,
misiones de mundo, artesanía y PvP. No hay filtro por origen porque la DBC de
SimulationCraft no trae tabla de botín, así que la app no sabe de dónde cae cada
pieza.

Eso deja mucho ruido en un sitio concreto: para un guerrero en T19 hay 280
abalorios candidatos y **156 son de temporada de PvP** (Gladiator, Combatant,
Aspirant). Se detectan por el nombre y se dejan fuera salvo que se pidan con la
casilla correspondiente.

### Legendarias y el tope de dos

Una legendaria gana casi siempre por potencia bruta, así que sin filtrar el
primer puesto de **todos** los huecos sería una legendaria — y en Legion solo se
llevan dos. La lista daría a entender que puedes ponértelas todas.

Por defecto las legendarias solo se prueban en los huecos donde **ya llevas
una**: ahí el cambio es justo, porque el total no varía. Hay una casilla para
verlas en todos los huecos, y entonces los resultados avisan de cuántas se
proponen y marcan cada una.

Comprobado con un mago que lleva una legendaria en el anillo 2: apagada salen 2
candidatas legendarias y solo en ese hueco; encendida salen 13 repartidas por 11
huecos.

### Abalorios, aparte

Los abalorios no entran en el buscador de mejoras: casi todo su valor está en el
efecto que disparan, no en sus estadísticas, así que ordenarlos sin simularlos
daría una lista sin sentido. De los 8.202 ítems de la base solo 11 no declaran
estadísticas, y 7 son abalorios.

Tienen su propia pestaña, que los prueba **por parejas** — que es lo que decide,
porque dos buenos por separado pueden solaparse. Por dentro es «Mejor
combinación» acotada a los dos huecos de abalorio: misma lógica ya probada, sin
código nuevo.

### De dónde cae cada pieza

La DBC que genera SimulationCraft no incluye la tabla de botín:
`engine/dbc/generated/` solo trae ítems, hechizos, talentos y escalados. El
cliente sí la tiene, porque es lo que enseña el Diario de Mazmorras, así que la
vuelca el addon con `/rbl botin` y se pega en la app.

Dos cosas hacen que ese escaneo no sea un bucle y ya:

- **El botín llega de forma asíncrona.** Justo después de `EJ_SelectEncounter`,
  `EJ_GetNumLoot()` casi siempre devuelve 0 porque los datos aún no han bajado.
  Por eso el escaneo va por pasos con `C_Timer.NewTicker` y reintenta cada jefe
  hasta ocho veces en vez de recorrerlo todo de una sentada.
- **El Diario se carga bajo demanda.** Sin `LoadAddOn('Blizzard_EncounterJournal')`
  todo devuelve vacío y ninguna llamada da error — el mismo fallo silencioso que
  ya costó caro con las reliquias del artefacto.

El id de cada pieza se saca buscando el enlace entre *todo* lo que devuelve
`EJ_GetLootInfoByIndex`, sin fiarse de la posición: el orden de esa respuesta ha
cambiado entre versiones del cliente.

La tabla se guarda en `.rbl/loot.json`, no por personaje: qué jefe suelta qué
pieza es igual para todos. El buscador de mejoras la consulta y añade una
columna «Dónde cae».

**Límite honesto:** sale del Diario del cliente, así que refleja las tablas de
Blizzard en 7.3.5. Si un servidor privado ha movido el botín de un jefe, la
pieza aparecerá donde la puso Blizzard.

## El límite de «Mejor combinación» (Top Gear)

Top Gear prueba **todas** las mezclas de las piezas que le des, así que el número
de variantes es el **producto** de las opciones de cada hueco, no la suma. Un
hueco suelto aporta `1 + n` opciones (lo equipado más los candidatos); anillos y
abalorios comparten pool y aportan `C(n+2, 2)` parejas.

Con 12 huecos sueltos más anillos y abalorios:

| Candidatos por hueco | Combinaciones |
|---|---|
| 1 | 36.864 |
| 2 | 19.131.876 |
| 3 | 1.677.721.600 |

Lo que importa no es el tamaño sino cómo crece: partiendo de 2 candidatos por
hueco, **una** pieza más en un hueco suelto multiplica por 1,33, y un anillo más
por 1,67. Por eso se pasa de «va bien» a «millones» de golpe.

Esto no se arregla subiendo el tope: es la naturaleza del producto cartesiano.
Lo que hace la app es **enseñarlo mientras eliges**, en vez de dejarte llegar al
final y darte un error:

- El panel dice cuántas combinaciones llevas y de dónde salen, hueco por hueco,
  ordenados de mayor a menor.
- Estima el tiempo con el ritmo real de *este* ordenador, sacado de las
  simulaciones que ya se han hecho aquí (`secondsPerProfile()` en `store.ts`).
  Sin historial suficiente no estima, en vez de inventar una constante.
- Al pasarse del tope dice por dónde recortar y cuánto bajaría: «empieza por
  Anillos: con una pieza menos te quedarías en 8.064».

El código está en `describeTopGearSpace()` (`packages/server/src/sims/build.ts`),
que cuenta el espacio sin construirlo, y en `TopGearBudget.tsx`.

Si algún día hiciera falta abarcar el equipo entero, la salida no es un tope más
alto sino dejar de probar todas las combinaciones: una búsqueda por eliminación
(ir hueco por hueco arrastrando solo los N mejores conjuntos parciales) baja el
coste de exponencial a lineal — 13 huecos × 5 candidatos con haz de 20 son ~1.300
simulaciones en vez de 10¹². No está implementado.

## Cadena para Pawn

Cuando la simulación calcula el valor de cada estadística (la casilla
«Calcular también cuánto vale cada estadística»), debajo de la tabla sale la
cadena lista para el addon [Pawn](https://www.curseforge.com/wow/addons/pawn):

```
( Pawn: v1: "T21_Mage_Frost": Class=Mage, Spec=Frost, Intellect=1.00,
  CritRating=0.94, HasteRating=1.21, MasteryRating=0.79, Versatility=1.40 )
```

En el juego: `/pawn` → Escalas → Importar → pegar. A partir de ahí Pawn te dice
en el tooltip de cada pieza que te caiga si te mejora.

Detalles de la implementación (`packages/shared/src/pawn.ts`):

- Se reescala para que la estadística principal valga 1, que es como se leen
  normalmente («el crítico me vale 0,94 de lo que me vale el intelecto»). A Pawn
  solo le importan las proporciones, así que el resultado es el mismo.
- Los decimales van con punto. Formatearlos con `es-ES` metería comas y Pawn
  leería `1,25` como dos campos distintos.
- La especialización llega de simc como nombre para enseñar («Frost Mage»), así
  que se le quita la clase del final: Pawn espera `Spec=Frost`.
- Lo que Pawn no maneja (por ejemplo `SP`) se deja fuera y se dice cuál ha sido,
  en vez de dar por buena una cadena a la que le falta algo.

`npm run test:pawn` comprueba el formato carácter a carácter. Existe porque un
fallo aquí no se ve en la app: se ve dentro del juego, cuando Pawn dice que la
cadena no vale y no explica por qué.

## Nombres e iconos de los ítems

La app parte de los ids que ya tiene en su base de datos y les pone cara: pide
el nombre y el icono de cada ítem, los cachea en `data/item-media.json` y los
pinta con el color de calidad del juego.

```
npm run check:icons              # comprueba que la fuente responde
npm run check:icons -- 152138    # o un ítem concreto
```

Detalles que conviene saber:

- **Se pide en tandas.** Los ids que hay en pantalla van en una sola petición,
  no uno por uno, y lo que se descarga se guarda en disco: la segunda vez que
  abres la misma pantalla no hay red de por medio.
- **El nombre bueno gana.** El que trae el addon es el del perfil `.simc`, en
  minúsculas (`runebound collar`); el que se resuelve viene con sus mayúsculas
  (`Runebound Collar`) y es el que se enseña.
- **Sin internet la app funciona igual.** Si no hay icono se pinta un recuadro
  con las iniciales y el nombre que ya estaba en la base de datos. Los fallos se
  recuerdan seis horas para no reintentar en bucle.
- **Se puede apagar o cambiar de fuente:**

  | Variable | Para qué |
  |---|---|
  | `RBL_ICONS=off` | No sale nada a internet; solo nombres de la base local. |
  | `RBL_ICON_SOURCE="https://…/{id}"` | Otra fuente. Se lee `icon`/`iconName` y `name`/`name_enus`. |

Si `npm run check:icons` dice que la respuesta llega pero no encuentra el icono,
imprime las claves que sí trae: con eso se añade el nombre que use esa fuente en
`packages/server/src/data/media.ts`.

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
  ocupaba ese slot. Es la misma aproximación que usa Raidbots. No se modela que
  la pieza nueva tenga engarce y la vieja no: para eso está la pestaña de Gemas.
- **Límite de legendarias**: configurable (2 por defecto). Los servidores
  privados lo cambian a menudo, así que ajústalo a lo que tenga el tuyo.
- **Un solo personaje por simulación**: no hay sims de banda ni de varios
  jugadores a la vez.
- **Las fases no traen tablas de botín por jefe**: la referencia es el equipo BiS
  del tier según simc, no "qué suelta cada jefe". Tres perfiles de T20 (guerrero
  Armas y Furia, druida Feral) no se pueden cargar porque usan un ítem que no
  está en la DBC de 7.3.5, así que esas specs no tienen referencia en esa fase.

## Las reliquias del artefacto van en `gem_id`

El fallo más caro que ha tenido este proyecto, y el más silencioso.

En el cliente de 7.3.5 los campos de gema del **enlace** del arma artefacto
vienen a cero: las reliquias no se pueden leer de ahí, hay que pedirlas a
`C_ArtifactUI.GetRelicInfo()`. El addon las leía para el Crisol pero no las
escribía en la línea del arma, así que el perfil salía sin `gem_id=`.

SimulationCraft no protesta: deja el arma en su nivel base (750 en vez de ~900)
y devuelve un DPS perfectamente creíble. Medido con un guerrero Furia real:

| | ilvl del arma | DPS |
|---|---|---|
| Sin `gem_id` (lo que exportaba el addon) | 750 | 534.228 |
| Con `gem_id` | 933 | 900.476 (**+68,6%**) |

`relic_id=` **no** sirve para esto: son los bonus IDs de cada reliquia y no
suben el nivel del arma. Se comprobó que quitarlo del perfil no cambia el DPS
ni un punto.

La prueba del addon no lo detectaba porque el stub tenía el enlace del artefacto
**con los campos de gema rellenos**, o sea codificando una suposición distinta a
la del cliente real. Ahora el stub viene vacío como en el juego y hay dos
comprobaciones: que el `gem_id` sale de la interfaz del artefacto, y que no se
inventa gemas del enlace.

## Razas que SimulationCraft no conoce

Los servidores privados añaden razas propias. SimulationCraft acepta la cadena
sin protestar, la deja en `none` y simula **sin ningún bonus racial**: el DPS
sale creíble pero por debajo del real.

Medido con un guerrero Furia real, mismo equipo, `target_error=0.1`:

| Raza | DPS | Diferencia |
|---|---|---|
| `harronir` (desconocida → `none`) | 844.845 | — |
| `night_elf` | 850.138 | +0,63% |
| `orc` | 852.900 | +0,95% |
| `human` | 853.687 | +1,05% |
| `dwarf` | 857.169 | +1,46% |
| `tauren` | 857.491 | +1,50% |
| `troll` | 862.036 | +2,04% |
| `gnome` | 864.409 | +2,32% |

La app compara ahora la raza declarada con la que devuelve el motor y avisa
cuando no coinciden (`raceWarning()` en `simc/parse.ts`). Las comparaciones
entre piezas siguen siendo válidas: a todas les falta lo mismo.

Para el DPS absoluto, la ficha del personaje tiene un selector de **raza de
sustitución** (`raceOverride`). No inventa raciales —simc no lo permite— sino
que simula con la raza oficial cuyo racial más se parezca. Se escribe como una
línea `race=` **detrás** del perfil importado, porque en simc gana la última
asignación (comprobado, no supuesto).

Es lista blanca (`SIMC_RACES` en `packages/shared`), no una comprobación de
formato: el valor acaba escrito tal cual en un perfil que se ejecuta.

Y para saber qué elegir, el addon vuelca los raciales del personaje con su
descripción, que es lo único que dice qué hacen.

## Ítems que SimulationCraft no conoce

El mismo problema con el equipo, pero peor: una raza desconocida se degrada en
silencio, y un **id desconocido cancela el lote entero**.

    BCP API: Player 'X' unable to download item id '158311' at slot wrists.
    Unable to initialize item 'inactive' base data on player 'X'
    Simulation has been canceled during player setup!

No se pierde esa variante: se pierden todas las del lote. Pasó con un export
real en el que una sola pieza de un parche posterior tumbó 62 profilesets.

Hay dos catálogos, y usar el equivocado es el error fácil:

- `data/items.json` — lo que sale en el buscador. Filtra por ilvl 800 y calidad,
  así que **los artefactos no están** (ilvl base 750).
- `data/known-items.json` — todos los ids del DBC, sin filtrar. Solo responde
  «¿esto lo sabe construir simc?», que es la pregunta del guardia.

Comprobar con el primero rechazaría el arma de todo el mundo. El guardia
(`assertEquippable()` en `sims/build.ts`) usa el segundo.

### Describir una pieza a mano

simc sí acepta un ítem declarado a pelo, sin id, con sus estadísticas
explícitas. La ficha del personaje tiene un formulario para ello y genera:

    wrist=placas_de_esgrima,ilevel=885,stats=1052str_654crit_436haste
    trinket1=abalorio,ilevel=910,stats=1200crit,use=4500str_20dur_120cd
    trinket2=otro,ilevel=910,stats=1200haste,equip=3000crit_15dur_1.5rppm_procby/attack_procon/hit

Detalles que costaron un rato averiguar:

- El nombre va **delante de la primera coma**. No existe la opción `name=`.
- **Nada de `id=`**, ni siquiera `id=0`: simc lo buscaría en su DBC y cancelaría.
- `quality=` y `type=` hacen fallar la inicialización. Se omiten.
- Los disparadores del proc se escriben `procby/attack` y `procon/hit`, con
  barra: `parse_proc_flags()` parte por `/` y compara el nombre exacto.
- `enchant_id` y `gem_id` sí funcionan sobre un ítem a mano.
- Las estadísticas son literales, así que **no escalan con el ilvl**. Al usar
  «igualar el ilvl» en el droptimizer, la app avisa.

Las tres cadenas las escribe el jugador y acaban dentro de una línea de un
perfil que se ejecuta como proceso, así que se validan con lista blanca
(`validateCustomItem()` en `packages/shared`): sin comas, sin saltos de línea y
sin `=`, que abrirían una opción o una orden nuevas.

En la ficha del personaje, las piezas del inventario que el motor no conoce
salen marcadas «sin datos» y con un botón **Describir** que abre el formulario
ya relleno con lo que sabemos (nombre, hueco, ilvl) y sustituye esa entrada, en
vez de añadir una copia.

### El catálogo compartido

Describir una pieza es una sola vez, y para todo el mundo. Hay dos capas:

- `data/custom-items.json` — va **en el repositorio**. Es lo que alguien escaneó
  una vez para que no tenga que hacerlo nadie más.
- `.rbl/custom-items.json` — de esta instalación. Manda sobre la anterior, para
  poder corregir una entrada sin esperar a que se actualice el repositorio.

Se aplica en `buildCharacterProfile()`, que es el único sitio por el que pasan
todas las simulaciones: así también valen los personajes importados antes de que
la pieza estuviera descrita.

Y hay que aplicarlo ahí, no solo al objeto: **el equipo puesto va por el texto
del perfil**, no por `gearItemToLine()`. Resolver la pieza sin reescribir su
línea deja el `id=` en el perfil y la simulación se cancela igual
(`rewriteCustomGearLines()`).

### Escanear piezas que no tienes

Las de las mazmorras propias de un servidor no las tiene nadie hasta que caen,
así que no basta con leer lo que llevas puesto:

    /rbl escanear 150000 160000

Recorre un rango de ids preguntándole al servidor por cada uno. Lo que lo hace
no trivial: `GetItemInfo(id)` de un ítem que el cliente no tiene en caché
devuelve **nil** y, de paso, se lo pide al servidor; la respuesta llega más
tarde. Recorrer el rango de una sentada devolvería casi todo vacío y sin error,
así que el escaneo va en tandas de 25 ids cada 0,15 s y reintenta los que faltan.
Se pregunta por el id suelto a propósito: con un enlace ya montado el cliente
responde como si lo conociera y nunca dispararía la petición.

`/rbl botin` hace lo mismo sin saberse ningún número cuando las mazmorras
propias están en el Diario de Mazmorras.

El volcado se convierte en catálogo compartido con:

    node scripts/build-custom-items.mjs volcado.txt --merge

`--merge` conserva los efectos que alguien haya traducido a mano: el escáner
solo lee estadísticas y no debe borrarlos al volver a pasar.

### El addon lee las estadísticas por ti

El cliente sí sabe lo que da cada pieza: lo está enseñando en el tooltip. El
addon lo lee con `GetItemStats` y lo escribe en un bloque `### Item Stats`, ya
en el formato de simc, así que el formulario viene relleno y no hay que copiar
números a mano.

Un detalle que importa: `GetItemStats` devuelve una tabla indexada por el
**valor** de las globales `ITEM_MOD_*`, no por su nombre. Indexar por el nombre
devuelve una tabla vacía sin dar error. Como efecto secundario bueno, hacerlo
bien significa que el addon funciona igual en un cliente en español o en inglés.

Los efectos de «Uso» y «Equipar» solo existen como texto en el tooltip, así que
se copian **literales** y no se traducen solos: convertir prosa en
`4500str_20dur_120cd` es interpretar, y una interpretación mal hecha aquí da un
número creíble y falso. La app enseña el texto junto al formulario para que lo
traduzca una persona.

Lo leído se guarda como `scannedStats`/`scannedEffect`, separado de `custom`. Es
a propósito: una pieza que el motor sí conoce se sigue simulando por su id,
porque eso trae escalado, bonus y efectos de verdad, no una copia aproximada.

## Servidores privados

La app simula con los datos oficiales de 7.3.5. Si tu servidor tiene valores
retocados (daño de hechizos, tasas de proc, ilvl de la loot), los resultados
serán una aproximación: sirven perfectamente para comparar opciones entre sí
—que es para lo que se usa un simulador— pero el DPS absoluto puede no cuadrar
con el del servidor.
