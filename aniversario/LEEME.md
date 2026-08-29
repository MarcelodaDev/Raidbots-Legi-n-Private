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

- Las fotos **se revelan** al entrar en pantalla: aparecen apagadas y
  desaturadas y van ganando luz y color, como un positivado.
- Al hacer clic se abren a pantalla completa. Funcionan las flechas del
  teclado, `Esc` para cerrar y deslizar el dedo en el móvil.
- Respeta `prefers-reduced-motion`: si el sistema pide menos movimiento, todo
  aparece quieto y ya revelado.
