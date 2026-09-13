#!/usr/bin/env bash
# Aligera un GLB (por ejemplo, de Tripo) para la web en los dos niveles de calidad del juego.
#
# Uso: bash tools/optimize-model.sh <entrada.glb> <nombre> [ratio_simplificación]
#   bash tools/optimize-model.sh raw/tripo/pawn.glb pawn
#   bash tools/optimize-model.sh raw/tripo/shield.glb shield 0.2
# Crea assets/models/<nombre>-ordenador.glb (texturas de 2048 px) y <nombre>-movil.glb (1024 px).
# El ratio opcional reduce los polígonos; úsalo solo con objetos sin esqueleto (escudo, peana).
set -euo pipefail

input="$1"
name="$2"
ratio="${3:-}"
cd "$(dirname "$0")/.."

g() { npx --yes @gltf-transform/cli@4.5.0 "$@"; }

tmp="raw/tmp/opt"
mkdir -p "$tmp" assets/models

for level in ordenador:2048 movil:1024; do
  quality="${level%%:*}"
  size="${level##*:}"
  t="$tmp/$name-$quality"
  g dedup "$input" "$t-1.glb"
  if [ -n "$ratio" ]; then
    g simplify "$t-1.glb" "$t-1s.glb" --ratio "$ratio" --error 0.001
    mv "$t-1s.glb" "$t-1.glb"
  fi
  g prune "$t-1.glb" "$t-2.glb"
  g resample "$t-2.glb" "$t-3.glb"
  g resize "$t-3.glb" "$t-4.glb" --width "$size" --height "$size"
  g webp "$t-4.glb" "$t-5.glb" --quality 88
  g meshopt "$t-5.glb" "assets/models/$name-$quality.glb" --level medium
done

ls -l assets/models/"$name"-*.glb
