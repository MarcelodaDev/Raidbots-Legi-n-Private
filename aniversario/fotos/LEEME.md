# Fotos

Pon aquí tus imágenes con estos nombres exactos:

```
01.jpg   02.jpg   03.jpg   04.jpg
05.jpg   06.jpg   07.jpg   08.jpg
09.jpg   10.jpg   11.jpg   12.jpg
```

Cada hueco de la galería tiene una proporción pensada, así que la foto se
verá mejor si se acerca a ella (la página recorta lo que sobre, centrado):

| Archivo | Proporción | Orientación |
|---|---|---|
| 01.jpg | 3:2 | horizontal |
| 02.jpg | 4:5 | vertical |
| 03.jpg | 4:5 | vertical |
| 04.jpg | 16:10 | horizontal |
| 05.jpg | 1:1 | cuadrada |
| 06.jpg | 1:1 | cuadrada |
| 07.jpg | 21:9 | panorámica |
| 08.jpg | 4:5 | vertical |
| 09.jpg | 3:2 | horizontal |
| 10.jpg | 16:10 | horizontal |
| 11.jpg | 4:5 | vertical |
| 12.jpg | 2:1 | horizontal ancha |

Si falta alguna, esa casilla se queda como hueco de hoja de contactos en vez
de romper la página, así que puedes ir subiéndolas poco a poco.

**Consejo:** exporta cada foto a un ancho máximo de ~2000 px y calidad 80 %.
La página carga mucho más rápido y no se nota la diferencia en pantalla.

## Cambiar los textos

Los meses y los recuerdos de cada foto están en `../index.html`, en el
`<figcaption>` de cada una:

```html
<figcaption><b>Diciembre 2024</b><span class="note"></span></figcaption>
```

Escribe el recuerdo dentro del `<span class="note">`. Si lo dejas vacío, no
se muestra nada y solo se ve la fecha.
