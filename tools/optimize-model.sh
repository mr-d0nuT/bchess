#!/usr/bin/env bash
# Aligera un GLB (por ejemplo, de Tripo) para la web en los dos niveles de calidad del juego.
#
# Uso: bash tools/optimize-model.sh <entrada.glb> <nombre> [ratio_simplificación] [ratio_móvil]
#   bash tools/optimize-model.sh raw/tripo/pawn.glb pawn
#   bash tools/optimize-model.sh raw/tripo/shield.glb shield 0.01 0.004
#   bash tools/optimize-model.sh raw/tripo/alfil-blanco.glb bishop "" "" 1024 512
# Crea assets/models/<nombre>-ordenador.glb (texturas de 2048 px) y <nombre>-movil.glb (1024 px).
# Los dos últimos parámetros cambian esos tamaños de textura: con dibujos poco detallados, la mitad
# pesa la cuarta parte y no se nota.
# Los ratios opcionales reducen los polígonos (el segundo, solo en la versión para el móvil;
# si falta, se usa el primero). Úsalos solo con objetos sin esqueleto (escudo, peana).
set -euo pipefail

input="$1"
name="$2"
ratio="${3:-}"
ratio_movil="${4:-$ratio}"
textura="${5:-2048}"
textura_movil="${6:-1024}"
cd "$(dirname "$0")/.."

g() { npx --yes @gltf-transform/cli@4.5.0 "$@"; }

tmp="raw/tmp/opt"
mkdir -p "$tmp" assets/models

for level in "ordenador:$textura:0.001" "movil:$textura_movil:0.002"; do
  IFS=: read -r quality size max_error <<< "$level"
  t="$tmp/$name-$quality"
  if [ "$quality" = movil ]; then r="$ratio_movil"; else r="$ratio"; fi
  g dedup "$input" "$t-1.glb"
  if [ -n "$r" ]; then
    g simplify "$t-1.glb" "$t-1s.glb" --ratio "$r" --error "$max_error"
    mv "$t-1s.glb" "$t-1.glb"
  fi
  g prune "$t-1.glb" "$t-2.glb"
  g resample "$t-2.glb" "$t-3.glb"
  g resize "$t-3.glb" "$t-4.glb" --width "$size" --height "$size"
  g webp "$t-4.glb" "$t-5.glb" --quality 88
  g meshopt "$t-5.glb" "assets/models/$name-$quality.glb" --level medium
done

ls -l assets/models/"$name"-*.glb
