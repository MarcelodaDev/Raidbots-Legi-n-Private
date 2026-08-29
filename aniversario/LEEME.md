# Un año y nueve meses — Marcelo & Maddy

Página de aniversario. Es un solo archivo (`index.html`) sin dependencias ni
build: se abre con doble clic y funciona.

## Cómo verla

Abre `index.html` en el navegador. Las tipografías (Fraunces, Karla, DM Mono)
se cargan de Google Fonts, así que con internet se ve como está pensada; sin
internet cae a serifas del sistema y sigue viéndose bien.

## Cómo añadir las fotos

Mete tus imágenes en `fotos/` con los nombres `01.jpg` … `12.jpg`. Las que
falten se quedan como huecos de hoja de contactos, así que puedes ir
subiéndolas de a poco. Los detalles de proporción están en `fotos/LEEME.md`.

## La música

Suena `audio/cancion.mp3` («Lo hago todo solo con los dos en la cabeza», de
Pedro Guerra, Cruz Cafuné y Hye Ji) **empezando en el 2:45**, que es donde la
canción se queda en silencio un instante y vuelve a entrar. Al llegar al final
vuelve a ese mismo punto en vez de al principio.

Ningún navegador deja sonar audio sin que la persona toque la página primero,
así que la página lo intenta al cargar y, si la bloquean, arranca sola con el
primer clic, toque o tecla. Mientras tanto el botón de abajo a la derecha late
para invitar a pulsarlo. Ese botón también sirve para silenciarla.

Para cambiar el punto de arranque, busca esta línea en `index.html`:

```js
var AUDIO_INICIO  = 165;   // segundos: 165 = 2:45
var AUDIO_VOLUMEN = 0.55;
```

Para cambiar de canción, sustituye `audio/cancion.mp3` por otro archivo con el
mismo nombre. Conviene exportarlo a 128 kbps: el original de 320 kbps pesaba
9,3 MB y el mismo audio a 128 kbps pesa 3,6 MB, sin diferencia audible por los
altavoces de un móvil.

## Qué se puede editar

Todo está dentro de `index.html`, marcado con comentarios `EDITA:`:

- **Fecha, título y nombres** — en el bloque `<header class="title-card">`
- **Los meses y recuerdos de cada foto** — en el `<figcaption>` de cada una
- **El cierre** — en `<section class="closing">`
- **Los colores** — en el bloque `:root` del CSS, arriba del todo

## Cómo compartirla

Al ser un archivo suelto sirve cualquier hosting estático. Lo más rápido:
subir la carpeta `aniversario/` a Netlify Drop, o activar GitHub Pages en el
repositorio y entrar a `…/aniversario/`.

## Detalles de la página

- Una **enredadera** crece por el margen izquierdo a medida que bajas, siempre
  un poco por delante de donde vas leyendo, y las flores se abren justo cuando
  la punta del tallo las alcanza. Va por detrás de las fotos, así que se pierde
  detrás de los marcos y reaparece en los huecos. Se dibuja sola según la
  altura de la página: si añades o quitas fotos, se rehace al vuelo.
- Las fotos **se revelan** al entrar en pantalla: aparecen apagadas y
  desaturadas y van ganando luz y color, como un positivado.
- Al hacer clic se abren a pantalla completa. Funcionan las flechas del
  teclado, `Esc` para cerrar y deslizar el dedo en el móvil.
- Respeta `prefers-reduced-motion`: si el sistema pide menos movimiento, todo
  aparece quieto y ya revelado.
