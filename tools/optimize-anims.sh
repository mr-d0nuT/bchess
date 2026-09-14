#!/usr/bin/env bash
# Uso: bash tools/optimize-anims.sh <entrada.glb> <nombre> [clave1,clave2,…]
# Deja solo las animaciones de un GLB exportado de Tripo (tools/strip-anim.mjs), o solo las de
# la lista, y las comprime en assets/models/<nombre>.glb, el mismo fichero para móvil y ordenador.
set -euo pipefail
input="$1"; name="$2"; keep="${3:-}"
cd "$(dirname "$0")/.."
g() { npx --yes @gltf-transform/cli@4.5.0 "$@"; }
[ -d node_modules/@gltf-transform/functions ] || npm install --no-save @gltf-transform/core@4.5.0 @gltf-transform/functions@4.5.0
tmp="raw/tmp/opt"; mkdir -p "$tmp" assets/models
t="$tmp/$name"
node tools/strip-anim.mjs "$input" "$t-1.glb" ${keep:+"$keep"}
g resample "$t-1.glb" "$t-2.glb"
g meshopt "$t-2.glb" "assets/models/$name.glb" --level medium
ls -l "assets/models/$name.glb"
