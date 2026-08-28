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

## Servidores privados

La app simula con los datos oficiales de 7.3.5. Si tu servidor tiene valores
retocados (daño de hechizos, tasas de proc, ilvl de la loot), los resultados
serán una aproximación: sirven perfectamente para comparar opciones entre sí
—que es para lo que se usa un simulador— pero el DPS absoluto puede no cuadrar
con el del servidor.
