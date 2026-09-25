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

# `prune` da por inservible el esqueleto de un modelo que no trae animaciones y lo tira, y con él la
# posibilidad de moverle un hueso. La reina es justo ese caso: va aparejada pero sin animaciones,
# porque se desliza y el movimiento se lo pone el juego. Así que si hay esqueleto y no hay
# animaciones, se salta ese paso.
aparejado_sin_animar() {
  node -e '
    const fs = require("fs");
    const b = fs.readFileSync(process.argv[1]);
    const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
    process.exit(json.skins?.length && !json.animations?.length ? 0 : 1);
  ' "$1"
}

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
  if aparejado_sin_animar "$input"; then cp "$t-1.glb" "$t-2.glb"; else g prune "$t-1.glb" "$t-2.glb"; fi
  g resample "$t-2.glb" "$t-3.glb"
  g resize "$t-3.glb" "$t-4.glb" --width "$size" --height "$size"
  # El color admite pérdida sin que se note, pero el mapa de normales y el de metal y rugosidad, NO:
  # ahí cada valor es un número —la inclinación de la superficie, cuánto brilla—, y el ruido de la
  # compresión se ve luego como churretes y manchas de grasa sobre la piel. Así que primero pasan
  # todas casi sin pérdida y después se aprieta solo la del color. (En dos pasadas y no en una con
  # varias ranuras, porque la CLI no traga la lista entre llaves.)
  g webp "$t-4.glb" "$t-4c.glb" --quality 100
  g webp "$t-4c.glb" "$t-5.glb" --slots baseColorTexture --quality 88
  g meshopt "$t-5.glb" "assets/models/$name-$quality.glb" --level medium
done

ls -l assets/models/"$name"-*.glb
