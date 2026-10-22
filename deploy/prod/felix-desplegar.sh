#!/usr/bin/env bash
# Despliegue de Prod (172.16.99.160): trae lo nuevo de `main` y lo publica.
# Se instala en /usr/local/bin/felix-desplegar y lo dispara la llave SSH de QA
# (en authorized_keys con command="..."), que no puede hacer nada más.
#
#   felix-desplegar estado     -> solo muestra la versión y el health (no cambia nada)
#   felix-desplegar desplegar  -> despliega lo que haya nuevo en origin/main
#
# Pasos al desplegar (se detiene en el primer error):
#   1. Revisa que Prod esté limpio, en `main`, y que lo nuevo avance sin conflictos.
#   2. Revisa que no venga el navbar rojo de QA (solo vive en la rama qa).
#   3. Instala dependencias solo si cambió el package-lock.
#   4. Compila el portal en una carpeta aparte (el portal publicado no se toca aún).
#   5. Corre las migraciones pendientes del esquema Prod.
#   6. Cambia el portal publicado por el nuevo, reinicia la API y revisa /api/health.
#   7. Si el health falla, vuelve a la versión anterior y lo avisa.
set -euo pipefail

DIR=/opt/Belleza
SVC=api-factura
HEALTH=http://127.0.0.1:3001/api/health
LOG=/var/log/felix-desplegar.log
export PATH=/opt/node-22/bin:$PATH

# Por SSH llega en SSH_ORIGINAL_COMMAND; a mano, como argumento.
ACCION=${SSH_ORIGINAL_COMMAND:-${1:-estado}}

health_ok() {
  for _ in $(seq 1 30); do
    if curl -sf -m 3 "$HEALTH" | grep -q '"status":"ok"'; then return 0; fi
    sleep 1
  done
  return 1
}

cd "$DIR"

if [ "$ACCION" = estado ]; then
  echo "Prod en: $(git log --oneline -1)"
  echo "Health: $(curl -s -m 5 "$HEALTH" || echo 'sin respuesta')"
  exit 0
fi
if [ "$ACCION" != desplegar ]; then
  echo "Acción no permitida: «$ACCION». Solo «estado» o «desplegar»."
  exit 2
fi

# Un despliegue a la vez; todo queda también en el log.
exec 9>/run/felix-desplegar.lock
flock -n 9 || { echo "Ya hay un despliegue en curso."; exit 1; }
exec > >(tee -a "$LOG") 2>&1
echo "===== $(date '+%F %T') Despliegue de Prod"

# 1. Estado de partida
if [ "$(git branch --show-current)" != main ]; then
  echo "ERROR: Prod no está en la rama main. No se cambió nada."; exit 1
fi
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "ERROR: hay archivos modificados a mano en Prod. No se cambió nada:"; git status --short --untracked-files=no; exit 1
fi
ANTES=$(git rev-parse HEAD)
git fetch -q origin main
NUEVO=$(git rev-parse origin/main)
if [ "$ANTES" = "$NUEVO" ]; then
  echo "Prod ya está al día: $(git log --oneline -1)"; exit 0
fi
if ! git merge-base --is-ancestor "$ANTES" "$NUEVO"; then
  echo "ERROR: origin/main no continúa desde lo que tiene Prod (historia distinta). No se cambió nada."; exit 1
fi

# 2. El navbar rojo es solo de QA
if git cat-file -e "$NUEVO:portal/src/lib/useAmbiente.ts" 2>/dev/null; then
  echo "ERROR: main trae el navbar rojo de QA (portal/src/lib/useAmbiente.ts). No se cambió nada."; exit 1
fi

echo "Se pasa a Prod:"; git log --oneline "$ANTES..$NUEVO"
CAMBIOS=$(git diff --name-only "$ANTES" "$NUEVO")

volver() {
  echo "!!! $1 Volviendo a $(git log --oneline -1 "$ANTES")"
  git reset -q --hard "$ANTES"
  if grep -qx 'package-lock.json' <<<"$CAMBIOS"; then npm ci --omit=dev --no-audit --no-fund; fi
  if grep -qx 'portal/package-lock.json' <<<"$CAMBIOS"; then (cd portal && npm ci --no-audit --no-fund); fi
  if [ -d portal/dist.anterior ]; then rm -rf portal/dist && mv portal/dist.anterior portal/dist; fi
  rm -rf portal/dist.nuevo
  systemctl restart "$SVC"
  if health_ok; then echo "Prod quedó en la versión anterior y responde bien."; else echo "ATENCIÓN: la versión anterior tampoco responde. Revisar: journalctl -u $SVC"; fi
  exit 1
}

git merge -q --ff-only "$NUEVO"

# 3. Dependencias
if grep -qx 'package-lock.json' <<<"$CAMBIOS"; then
  echo "-- Dependencias de la API"; npm ci --omit=dev --no-audit --no-fund || volver "Falló npm ci de la API."
fi
if grep -qx 'portal/package-lock.json' <<<"$CAMBIOS"; then
  echo "-- Dependencias del portal"; (cd portal && npm ci --no-audit --no-fund) || volver "Falló npm ci del portal."
fi

# 4. Portal en carpeta aparte
echo "-- Compilando el portal"
rm -rf portal/dist.nuevo
(cd portal && npm run build -- --outDir dist.nuevo --emptyOutDir) || volver "Falló la compilación del portal."

# 5. Migraciones (cada una es idempotente; las ya aplicadas se saltan)
echo "-- Migraciones de Prod"
node sql/migrate.js Prod || volver "Falló una migración (revisar el log; lo ya aplicado en la base no se deshace)."

# 6. Publicar y reiniciar
echo "-- Publicando"
rm -rf portal/dist.anterior
mv portal/dist portal/dist.anterior
mv portal/dist.nuevo portal/dist
systemctl restart "$SVC"
health_ok || volver "La API no respondió bien después de reiniciar."

echo "OK: Prod quedó en $(git log --oneline -1)"
echo "Health: $(curl -s -m 5 "$HEALTH")"
