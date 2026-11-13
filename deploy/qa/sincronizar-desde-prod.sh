#!/usr/bin/env bash
# QA queda con los datos de Prod en un solo paso (pedido del 2026-11-13):
#   1. pide a Prod la exportación (solo lectura, `felix-desplegar exportar`);
#   2. la carga en QA (deploy/qa/importar-desde-prod.js, como felixops);
#   3. borra el paquete (tiene datos reales).
# Se corre como felixdev en QA:   deploy/qa/sincronizar-desde-prod.sh
# Necesita, una sola vez, esta regla de sudo (sudo visudo -f /etc/sudoers.d/felix-sincronizar):
#   felixdev ALL=(felixops) NOPASSWD: /opt/node-22/bin/node /opt/Belleza/deploy/qa/importar-desde-prod.js /tmp/felix-prod.tgz
set -euo pipefail

PAQUETE=/tmp/felix-prod.tgz
trap 'rm -f "$PAQUETE"' EXIT

echo "1/2 Exportando de Prod…"
umask 077
ssh -i /home/felixdev/.ssh/felix-desplegar root@172.16.99.160 exportar > "$PAQUETE" 2> >(grep -v -i 'deprecation' >&2)
if ! gzip -t "$PAQUETE" 2>/dev/null; then
  echo "✗ Prod no devolvió un paquete válido:" >&2
  head -c 300 "$PAQUETE" >&2
  exit 1
fi
chmod 644 "$PAQUETE"
echo "   $(du -h "$PAQUETE" | cut -f1) recibidos."

echo "2/2 Cargando en QA…"
sudo -n -u felixops /opt/node-22/bin/node /opt/Belleza/deploy/qa/importar-desde-prod.js "$PAQUETE" 2> >(grep -v -i 'deprecation' >&2)
