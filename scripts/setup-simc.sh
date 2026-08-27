#!/usr/bin/env bash
#
# Descarga y compila SimulationCraft 7.3.5 (rama legion-dev) en vendor/simc.
#
# El binario resultante queda en vendor/simc/engine/simc, que es donde lo busca
# el servidor. Se puede saltar todo esto definiendo SIMC_PATH a un binario ya
# compilado.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$ROOT/vendor"
SIMC_DIR="$VENDOR/simc"
BRANCH="${SIMC_BRANCH:-legion-dev}"
JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)}"

echo "==> SimulationCraft $BRANCH (WoW 7.3.5)"
echo "    destino: $SIMC_DIR"
echo "    hilos de compilación: $JOBS"

for tool in git make g++; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "ERROR: falta '$tool'." >&2
    echo "  Debian/Ubuntu: sudo apt install build-essential git" >&2
    echo "  macOS:         xcode-select --install" >&2
    exit 1
  fi
done

mkdir -p "$VENDOR"

if [ -d "$SIMC_DIR/.git" ]; then
  echo "==> Repositorio ya presente, actualizando…"
  git -C "$SIMC_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$SIMC_DIR" checkout -B "$BRANCH" "origin/$BRANCH"
  git -C "$SIMC_DIR" checkout -- . 2>/dev/null || true
else
  echo "==> Clonando (esto tarda un par de minutos)…"
  git clone --depth 1 --branch "$BRANCH" https://github.com/simulationcraft/simc.git "$SIMC_DIR"
fi

# El código de 2018 compila con GCC/Clang modernos salvo por algunos includes
# que antes llegaban de forma transitiva. Los parches viven en scripts/patches.
echo "==> Aplicando parches de compatibilidad"
for patch in "$ROOT"/scripts/patches/*.patch; do
  [ -e "$patch" ] || continue
  if git -C "$SIMC_DIR" apply --check "$patch" 2>/dev/null; then
    git -C "$SIMC_DIR" apply "$patch"
    echo "    aplicado: $(basename "$patch")"
  else
    echo "    ya aplicado (o no aplicable): $(basename "$patch")"
  fi
done

echo "==> Compilando el motor (puede tardar 10-20 minutos)…"
make -C "$SIMC_DIR/engine" -j"$JOBS" optimized

BIN="$SIMC_DIR/engine/simc"
if [ ! -x "$BIN" ]; then
  echo "ERROR: la compilación terminó pero no hay binario en $BIN" >&2
  exit 1
fi

echo "==> Listo:"
"$BIN" 2>&1 | head -1 || true

echo
echo "Siguiente paso: npm run build:itemdb  (genera la base de ítems y consumibles)"
