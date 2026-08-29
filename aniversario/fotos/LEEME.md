# Fotos

Las dieciséis fotos de la galería, en orden. Cada hueco de la página tiene
**la proporción exacta de su foto**, así que ninguna se recorta.

| Archivo | Mes | Píxeles | Proporción |
|---|---|---|---|
| 01.jpg | Diciembre 2024 | 1170×2080 | 9:16 |
| 02.jpg | Febrero 2025 | 1500×2000 | 3:4 |
| 03.jpg | Marzo 2025 | 1500×2000 | 3:4 |
| 04.jpg | Junio 2025 | 2000×1500 | 4:3 |
| 05.jpg | Julio 2025 | 1500×2000 | 3:4 |
| 06.jpg | Agosto 2025 | 1500×2000 | 3:4 |
| 07.jpg | Septiembre 2025 | 1500×2000 | 3:4 |
| 08.jpg | Septiembre 2025 | 1427×2000 | 1427:2000 |
| 09.jpg | Octubre 2025 | 1125×2000 | 9:16 |
| 10.jpg | Noviembre 2025 | 1277×2000 | 1277:2000 |
| 11.jpg | Noviembre 2025 | 2000×1500 | 4:3 |
| 12.jpg | Febrero 2026 | 960×1280 | 3:4 |
| 13.jpg | Mayo 2026 | 1500×2000 | 3:4 |
| 14.jpg | Junio 2026 | 2000×1500 | 4:3 |
| 15.jpg | Agosto 2026 | 1500×2000 | 3:4 |
| 16.jpg | Agosto 2026 | 2000×1500 | 4:3 |

## Cómo se prepararon

Ninguna traía fecha en los metadatos: habían pasado por WhatsApp o Instagram,
que borran el EXIF al comprimir. Las fechas están puestas a mano.

De cada original se hizo lo siguiente:

1. **Aplicar la orientación EXIF al píxel.** Muchas venían con etiquetas de
   giro (`Rotated 90 CW`, `Mirrored vertical`…). Aplicarlas y borrarlas
   garantiza que se vean igual en cualquier visor.
2. **Borrar el resto de metadatos**, para que no viaje información de más si
   algún día se comparte la página.
3. **Reescalar** a 2000 px como máximo y recomprimir a calidad 82.

## Cambiar o añadir fotos

Si sustituyes un archivo por otro de proporción distinta, hay que actualizar
también el `--ratio` de su `<figure>` en `../index.html`, o la foto se
recortará. El valor es la proporción en píxeles, por ejemplo
`style="--ratio: 1427 / 2000"`.

Para añadir una foto nueva hay que insertar su `<figure>` y cuadrar las
columnas: cada fila de la galería suma 12 (`c4`, `c5`, `c6`, `c7`, `c8`, `c12`).
