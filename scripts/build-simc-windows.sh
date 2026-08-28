#!/usr/bin/env bash
#
# Compila SimulationCraft 7.3.5 para Windows desde Linux (cross-compile).
#
# Produce un simc.exe enlazado estático: no necesita ni Visual C++ ni el
# runtime de MinGW en la máquina destino.
#
# EL DETALLE QUE IMPORTA
# ----------------------
# Hay que usar la variante *posix* del compilador de mingw-w64:
#
#   x86_64-w64-mingw32-g++-posix   ✅  (Thread model: posix)
#   x86_64-w64-mingw32-g++         ❌  (Thread model: win32 en Debian/Ubuntu)
#
# Con el modelo win32 el binario compila y enlaza sin una sola advertencia,
# arranca... y no imprime nada, porque `std::thread` queda inservible y
# SimulationCraft es multihilo de arriba abajo. Es un fallo silencioso y caro
# de diagnosticar: se entregó una vez un binario así y el síntoma en la app era
# un simple "no se encontró SimC".
#
# Uso:
#   bash scripts/build-simc-windows.sh [<ruta al repo de simc>]
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${1:-$ROOT/vendor/simc}"
CXX_POSIX="x86_64-w64-mingw32-g++-posix"
JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)}"

if ! command -v "$CXX_POSIX" >/dev/null 2>&1; then
  echo "ERROR: falta $CXX_POSIX" >&2
  echo "  Debian/Ubuntu: sudo apt install mingw-w64" >&2
  exit 1
fi

if [ ! -d "$SOURCE/engine" ]; then
  echo "ERROR: no hay código de SimulationCraft en $SOURCE" >&2
  echo "  Ejecuta antes 'npm run setup:simc', o pasa la ruta como argumento." >&2
  exit 1
fi

# Comprobación explícita del modelo de hilos: es el fallo que costó el binario
# anterior, así que mejor detenerse aquí que entregar algo que no arranca.
MODEL="$("$CXX_POSIX" -v 2>&1 | grep -i 'thread model' | awk '{print $NF}')"
if [ "$MODEL" != "posix" ]; then
  echo "ERROR: $CXX_POSIX dice 'Thread model: $MODEL', se esperaba posix." >&2
  echo "  Con el modelo win32 el binario compila pero no funciona." >&2
  exit 1
fi

echo "==> Compilando SimulationCraft para Windows"
echo "    fuente: $SOURCE"
echo "    modelo de hilos: $MODEL"

# PATHSEP=/ es necesario porque el Makefile, en modo Windows, usa la barra
# invertida y eso rompe make cuando se ejecuta en Linux.
make -C "$SOURCE/engine" \
  OS=WINDOWS \
  PATHSEP=/ \
  CXX="$CXX_POSIX" \
  -j"$JOBS" \
  optimized

BIN="$SOURCE/engine/simc.exe"
if [ ! -s "$BIN" ]; then
  echo "ERROR: la compilación terminó pero no hay binario en $BIN" >&2
  exit 1
fi

mkdir -p "$ROOT/bin"
cp "$BIN" "$ROOT/bin/simc.exe"

echo "==> Listo: $ROOT/bin/simc.exe"
echo "    dependencias:"
objdump -p "$ROOT/bin/simc.exe" 2>/dev/null | grep -i 'DLL Name' | sed 's/^/      /' || true

if command -v wine64 >/dev/null 2>&1 || [ -x /usr/lib/wine/wine64 ]; then
  WINE="$(command -v wine64 || echo /usr/lib/wine/wine64)"
  echo "==> Comprobando con Wine"
  WINEDEBUG=-all "$WINE" "$ROOT/bin/simc.exe" 2>&1 | head -1 || true
else
  echo "    (instala wine64 si quieres comprobar aquí mismo que arranca)"
fi
