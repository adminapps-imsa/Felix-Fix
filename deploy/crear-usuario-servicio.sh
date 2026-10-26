#!/usr/bin/env bash
# Usuario propio con el que CORRE el servicio del portal (api-factura), en vez
# de www-data (que es también el de nginx). Nadie puede entrar con él: sin
# contraseña, sin shell, sin sudo. Solo él (y root) lee el .env y escribe en
# uploads/. Se corre como root, en QA y en Prod:
#
#   bash deploy/crear-usuario-servicio.sh            # usuario «felixops»
#
# Si el servicio no arranca con el usuario nuevo, se deja todo como estaba.
set -euo pipefail

USUARIO="${1:-felixops}"
SERVICIO="api-factura"
APP="/opt/Belleza"
DROPIN="/etc/systemd/system/$SERVICIO.service.d/usuario.conf"

if [ "$(id -u)" -ne 0 ]; then
  echo "Córrelo como root (su -)." >&2
  exit 1
fi
systemctl cat "$SERVICIO" >/dev/null 2>&1 || { echo "No existe el servicio $SERVICIO." >&2; exit 1; }
ANTES="$(systemctl show -p User --value "$SERVICIO")"
ANTES="${ANTES:-root}"

# 1. Cuenta de servicio sin entrada: sin shell, sin contraseña, sin sudo, sin logs.
if id "$USUARIO" >/dev/null 2>&1; then
  usermod -s /usr/sbin/nologin "$USUARIO"
  gpasswd -d "$USUARIO" systemd-journal >/dev/null 2>&1 || true
else
  useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin -c "Servicio $SERVICIO" "$USUARIO"
fi
passwd -l "$USUARIO" >/dev/null
rm -f "/etc/sudoers.d/$USUARIO"
rm -rf "/home/$USUARIO/.ssh"

# 2. Lo que el servicio necesita: leer el .env y escribir en uploads/.
chgrp "$USUARIO" "$APP/.env"
chmod 640 "$APP/.env"
chown -R "$USUARIO:$USUARIO" "$APP/uploads"

# 3. El servicio corre con ese usuario (archivo aparte: el .service no se toca).
mkdir -p "$(dirname "$DROPIN")"
printf '[Service]\nUser=%s\nGroup=%s\n' "$USUARIO" "$USUARIO" >"$DROPIN"

# 4. felixdev corre las migraciones de QA como el usuario del servicio.
if [ -f /etc/sudoers.d/felixdev ] && grep -q "(${ANTES})" /etc/sudoers.d/felixdev; then
  TMP="$(mktemp)"
  sed "s/(${ANTES})/(${USUARIO})/" /etc/sudoers.d/felixdev >"$TMP"
  visudo -cf "$TMP" >/dev/null && install -m 0440 -o root -g root "$TMP" /etc/sudoers.d/felixdev
  rm -f "$TMP"
fi

systemctl daemon-reload
systemctl restart "$SERVICIO"
sleep 6

if systemctl is-active --quiet "$SERVICIO" && curl -fsS -m 5 http://127.0.0.1:3001/api/health >/dev/null; then
  echo "OK: $SERVICIO corre como $(systemctl show -p User --value "$SERVICIO")."
  curl -s http://127.0.0.1:3001/api/health; echo
  echo "Usuario $USUARIO: $(getent passwd "$USUARIO" | cut -d: -f7), contraseña bloqueada, sin sudo."
else
  echo "El servicio no arrancó con $USUARIO: se deja como estaba ($ANTES)." >&2
  rm -f "$DROPIN"
  chgrp "$ANTES" "$APP/.env"
  chown -R "$ANTES:$ANTES" "$APP/uploads"
  [ -f /etc/sudoers.d/felixdev ] && sed -i "s/(${USUARIO})/(${ANTES})/" /etc/sudoers.d/felixdev
  systemctl daemon-reload
  systemctl restart "$SERVICIO"
  journalctl -u "$SERVICIO" -n 20 --no-pager >&2
  exit 1
fi
