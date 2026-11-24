#!/usr/bin/env bash
# Automatisation mteaa pi
# Depuis le Mac (si SSH OK) :
#   scp scripts/verify_pi_plug_and_play.sh emna@10.42.0.1:~/
#   ssh emna@10.42.0.1 'bash ~/verify_pi_plug_and_play.sh'

set -euo pipefail

BACKEND_PORT="${BACKEND_PORT:-8000}"
CONVEX_HTTP="${CONVEX_HTTP:-3210}"
CONVEX_DEPLOY="${CONVEX_DEPLOY:-3211}"
# Surcharge optionnelle : BACKEND_URL="http://127.0.0.1:8000/health"
BACKEND_URL="${BACKEND_URL:-}"

# curl peut échouer silencieusement ; on journalise stderr.
CURL_ERR="${TMPDIR:-/tmp}/verify_pi_curl_err.$$"

curl_http_code() {
  local url="$1"
  local extra="${2:-}"
  rm -f "${CURL_ERR}"
  # Pas de --interface : sur certaines Pi ça provoque des timeouts de connexion (ex. 2002 ms).
  # -q : ignore ~/.curlrc
  # shellcheck disable=SC2086
  env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u all_proxy \
    curl -q -sS -4 --noproxy '*' --connect-timeout 6 --max-time 18 \
    ${extra} -o /dev/null -w '%{http_code}' "${url}" 2>"${CURL_ERR}" || true
}

# urllib peut être lent ou capricieux ; socket brut = même logique qu'un « nc » en Python.
python_socket_health_code() {
  python3 -c "
import re, socket, sys
port = int('${BACKEND_PORT}')
try:
    s = socket.create_connection(('127.0.0.1', port), 8)
    s.sendall(b'GET /health HTTP/1.0\\r\\nHost: 127.0.0.1\\r\\n\\r\\n')
    s.settimeout(12)
    buf = b''
    for _ in range(32):
        chunk = s.recv(512)
        if not chunk:
            break
        buf += chunk
        if len(buf) >= 800 or b'\\r\\n\\r\\n' in buf:
            break
    s.close()
    m = re.search(br'HTTP/[0-9.]+\\s+([0-9]{3})', buf[:500])
    if not m:
        sys.exit(1)
    code = int(m.group(1))
    print(code)
    if code < 200 or code >= 300:
        sys.exit(1)
except Exception:
    sys.exit(1)
" 2>/dev/null || echo "000"
}

python_http_code() {
  local path="$1"
  python3 -c "
import sys
try:
    import urllib.request
    r = urllib.request.urlopen('http://127.0.0.1:${BACKEND_PORT}${path}', timeout=15)
    print(r.status)
except Exception:
    sys.exit(1)
" 2>/dev/null || echo "000"
}

# Réponse HTTP brute (bash /dev/tcp) — lit avec timeout+cat (read -N peut rester vide selon buffering).
bash_http_snippet() {
  local path="${1:-/}"
  exec 3<>/dev/tcp/127.0.0.1/"${BACKEND_PORT}" 2>/dev/null || {
    printf '%s' ""
    return 1
  }
  printf 'GET %s HTTP/1.1\r\nHost: 127.0.0.1\r\nUser-Agent: verify-pi/1\r\nAccept: */*\r\nConnection: close\r\n\r\n' "${path}" >&3 || true
  local buf=""
  if command -v timeout >/dev/null 2>&1; then
    buf="$(timeout 15 cat <&3 2>/dev/null | head -c 4000 || true)"
  else
    local line=""
    IFS= read -r -t 15 line <&3 2>/dev/null || line=""
    buf="${line}"
  fi
  exec 3<&- 2>/dev/null || true
  exec 3>&- 2>/dev/null || true
  printf '%s' "${buf:-}"
}

http_snippet_has_2xx() {
  local s="$1"
  printf '%s' "${s}" | grep -aEo 'HTTP/[0-9.]+[[:space:]]+2[0-9]{2}' >/dev/null 2>&1
}

# Repli : nc / netcat / ncat (souvent plus fiable que curl sur certaines images).
nc_http_snippet() {
  local path="$1"
  local nc_bin=""
  for c in nc netcat ncat; do
    if command -v "$c" >/dev/null 2>&1; then
      nc_bin="$c"
      break
    fi
  done
  [[ -z "${nc_bin}" ]] && return 1
  if ! command -v timeout >/dev/null 2>&1; then
    return 1
  fi
  printf 'GET %s HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n' "${path}" \
    | timeout 15 "${nc_bin}" 127.0.0.1 "${BACKEND_PORT}" 2>/dev/null | head -c 1200 || true
}

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

fail=0

ok() { echo -e "${GREEN}OK${NC}  $*"; }
warn() { echo -e "${YELLOW}WARN${NC} $*"; }
bad() { echo -e "${RED}KO${NC}  $*"; fail=1; }

echo "=== Vérification plug-and-play (stack sur cette machine) ==="
echo

if ! command -v docker >/dev/null 2>&1; then
  bad "Docker n'est pas installé ou pas dans le PATH."
else
  if systemctl is-active docker >/dev/null 2>&1; then
    ok "Service docker actif."
  else
    bad "Service docker inactif (sudo systemctl start docker)."
  fi
  if systemctl is-enabled docker >/dev/null 2>&1; then
    ok "Docker activé au boot (enabled)."
  else
    warn "Docker pas 'enabled' au boot — au redémarrage froid il faudra peut-être sudo systemctl start docker."
  fi
  echo "--- Conteneurs en cours ---"
  if docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null | head -20; then
    count="$(docker ps -q | wc -l | tr -d ' ')"
    if [[ "${count}" -gt 0 ]]; then
      ok "Au moins ${count} conteneur(s) en cours d'exécution."
    else
      bad "Aucun conteneur en cours (docker ps vide). La stack n'est pas montée."
    fi
  else
    bad "Impossible d'exécuter docker ps (droits ? groupe docker ?)."
  fi
fi

echo
echo "=== Ports (LISTEN attendus : ${BACKEND_PORT}, ${CONVEX_HTTP}, ${CONVEX_DEPLOY}) ==="
if command -v ss >/dev/null 2>&1; then
  for p in "${BACKEND_PORT}" "${CONVEX_HTTP}" "${CONVEX_DEPLOY}"; do
    if ss -tlnp 2>/dev/null | grep -q ":${p} "; then
      ok "Port ${p} en écoute."
    else
      bad "Port ${p} non détecté en LISTEN."
    fi
  done
else
  warn "ss absent — saute la vérification des ports."
fi

echo
echo "=== HTTP sur le port ${BACKEND_PORT} (/health en premier — certaines apps bloquent longtemps sur GET /) ==="
http_ok=0

if [[ -n "${BACKEND_URL}" ]]; then
  warn "BACKEND_URL est défini : seule cette URL est testée (curl + python)."
  if command -v curl >/dev/null 2>&1; then
    raw="$(curl_http_code "${BACKEND_URL}" "")"
    code="$(printf '%s' "${raw}" | tr -dc '0-9' | head -c 3)"
    [[ -z "${code}" ]] && code="000"
    if [[ "${code}" =~ ^2[0-9][0-9]$ ]]; then
      ok "HTTP ${code} sur ${BACKEND_URL}"
      http_ok=1
    fi
  fi
  if [[ "${http_ok}" -eq 0 ]] && command -v python3 >/dev/null 2>&1; then
    # python avec URL complète
    praw="$(
      python3 -c "
import sys, urllib.request
try:
    r = urllib.request.urlopen('${BACKEND_URL}', timeout=15)
    print(r.status)
except Exception:
    sys.exit(1)
" 2>/dev/null || echo "000"
    )"
    pcode="$(printf '%s' "${praw}" | tr -dc '0-9' | head -c 3)"
    [[ -z "${pcode}" ]] && pcode="000"
    if [[ "${pcode}" =~ ^2[0-9][0-9]$ ]]; then
      ok "HTTP ${pcode} via python3 sur ${BACKEND_URL}"
      http_ok=1
    fi
  fi
else
  # 0) Socket Python brut sur /health (évite urllib + évite curl --interface qui timeout chez toi).
  if command -v python3 >/dev/null 2>&1; then
    sock="$(python_socket_health_code)"
    scode="$(printf '%s' "${sock}" | tr -dc '0-9' | head -c 3)"
    [[ -z "${scode}" ]] && scode="000"
    if [[ "${scode}" =~ ^2[0-9][0-9]$ ]]; then
      ok "HTTP ${scode} via socket Python sur http://127.0.0.1:${BACKEND_PORT}/health"
      http_ok=1
    fi
  fi

  # 0b) urllib /health si la socket n'a pas suffi
  if [[ "${http_ok}" -eq 0 ]] && command -v python3 >/dev/null 2>&1; then
    praw="$(python_http_code /health)"
    pcode="$(printf '%s' "${praw}" | tr -dc '0-9' | head -c 3)"
    [[ -z "${pcode}" ]] && pcode="000"
    if [[ "${pcode}" =~ ^2[0-9][0-9]$ ]]; then
      ok "HTTP ${pcode} via python3 urllib sur http://127.0.0.1:${BACKEND_PORT}/health"
      http_ok=1
    fi
  fi

  if [[ "${http_ok}" -eq 0 ]]; then
  # 1) Sonde HTTP bash + nc — contourne curl (28) timeout sur certaines Pi.
  for path in /health /docs /openapi.json /; do
    snip="$(bash_http_snippet "${path}")"
    if http_snippet_has_2xx "${snip}"; then
      ok "HTTP 2xx (bash /dev/tcp) GET ${path}"
      http_ok=1
      break
    fi
    snip_nc="$(nc_http_snippet "${path}" 2>/dev/null || true)"
    if http_snippet_has_2xx "${snip_nc}"; then
      ok "HTTP 2xx (nc) GET ${path}"
      http_ok=1
      break
    fi
    if [[ -n "${snip}" ]]; then
      warn "bash GET ${path} : ${#snip} octets reçus, pas de ligne HTTP 2xx reconnue dans l'en-tête."
    fi
  done
  fi

  # 1b) Indice TLS (si le port parle HTTPS, curl http:// restera bloqué / timeout).
  if [[ "${http_ok}" -eq 0 ]] && command -v openssl >/dev/null 2>&1 && command -v timeout >/dev/null 2>&1; then
    if timeout 3 openssl s_client -connect "127.0.0.1:${BACKEND_PORT}" -tls1_2 </dev/null 2>/dev/null | grep -q 'BEGIN CERTIFICATE'; then
      warn "openssl : le port ${BACKEND_PORT} semble accepter du TLS — essayez la vérif en https:// (pas http://)."
    fi
  fi

  # 2) curl (optionnel)
  if [[ "${http_ok}" -eq 0 ]] && command -v curl >/dev/null 2>&1; then
    base="http://127.0.0.1:${BACKEND_PORT}"
    paths=(
      "${base}/health"
      "${base}/docs"
      "${base}/openapi.json"
      "${base}/"
    )
    for url in "${paths[@]}"; do
      for extra in "" "-L --max-redirs 8"; do
        raw="$(curl_http_code "${url}" "${extra}")"
        code="$(printf '%s' "${raw}" | tr -dc '0-9' | head -c 3)"
        [[ -z "${code}" ]] && code="000"
        if [[ "${code}" =~ ^2[0-9][0-9]$ ]]; then
          ok "HTTP ${code} sur ${url}${extra:+ (suivi redirections)}"
          http_ok=1
          break 2
        fi
      done
    done
    if [[ "${http_ok}" -eq 0 ]]; then
      hurl="https://127.0.0.1:${BACKEND_PORT}/docs"
      raw="$(curl_http_code "${hurl}" "-k")"
      code="$(printf '%s' "${raw}" | tr -dc '0-9' | head -c 3)"
      [[ -z "${code}" ]] && code="000"
      if [[ "${code}" =~ ^2[0-9][0-9]$ ]]; then
        ok "HTTP ${code} sur ${hurl} (TLS, -k)"
        http_ok=1
      fi
    fi
  fi

  # 3) Python
  if [[ "${http_ok}" -eq 0 ]] && command -v python3 >/dev/null 2>&1; then
    for p in /health /docs /openapi.json /; do
      praw="$(python_http_code "${p}")"
      pcode="$(printf '%s' "${praw}" | tr -dc '0-9' | head -c 3)"
      [[ -z "${pcode}" ]] && pcode="000"
      if [[ "${pcode}" =~ ^2[0-9][0-9]$ ]]; then
        ok "HTTP ${pcode} via python3 sur http://127.0.0.1:${BACKEND_PORT}${p}"
        http_ok=1
        break
      fi
    done
  fi
fi

if [[ "${http_ok}" -eq 0 ]]; then
  bad "Aucune réponse HTTP 2xx sur le port ${BACKEND_PORT} (python/curl/bash/nc)."
  echo "    Variables proxy :"
  (env | grep -iE '^(http|https|all)_?proxy=' || true) | sed 's/^/      /'
  echo "    TCP vers 127.0.0.1:${BACKEND_PORT} :"
  if bash -c "echo >/dev/tcp/127.0.0.1/${BACKEND_PORT}" 2>/dev/null; then
    echo "      OK (bash /dev/tcp)"
  else
    echo "      KO (bash /dev/tcp) — essayez : nc -zv 127.0.0.1 ${BACKEND_PORT}"
  fi
  echo "    Qui écoute sur ${BACKEND_PORT} ?"
  ss -tlnp 2>/dev/null | grep ":${BACKEND_PORT} " || true
  if [[ -s "${CURL_ERR}" ]]; then
    echo "    Dernière erreur curl :"
    sed 's/^/      /' "${CURL_ERR}" | tail -8
  fi
  echo "    Début de réponse bash GET /health (120 car max) :"
  snip_dbg="$(bash_http_snippet /health)"
  if [[ -n "${snip_dbg}" ]]; then
    printf '      %q\n' "${snip_dbg:0:120}"
  else
    echo "      <vide> — pas d'octets HTTP lisibles sur /health (timeout court ? TLS ?)."
    echo "      Voir : journalctl -u pfe-backend -n 50   ou   ps -p 1307 -o args=   (adapter PID)"
  fi
  echo "    Test manuel : curl -q -4 --noproxy '*' -sS -o /dev/null -w '%{http_code}\\n' --max-time 3 \"http://127.0.0.1:${BACKEND_PORT}/health\""
  echo "    (GET / peut bloquer sur votre app ; /health est le bon test rapide.)"
fi

rm -f "${CURL_ERR}" 2>/dev/null || true

echo
if command -v vcgencmd >/dev/null 2>&1; then
  th="$(vcgencmd get_throttled 2>/dev/null || true)"
  echo "=== Alimentation (Pi) : ${th} ==="
  if echo "${th}" | grep -q 'throttled=0x0'; then
    ok "Pas de throttling signalé pour l'instant (0x0)."
  else
    warn "Throttling / undervoltage possible — vérifier alimentation officielle et câbles."
  fi
else
  echo "=== vcgencmd absent (normal si pas une Raspberry) ==="
fi

echo
if [[ "${fail}" -eq 0 ]]; then
  echo -e "${GREEN}Résultat : cette machine ressemble à une stack plug-and-play opérationnelle.${NC}"
  exit 0
else
  echo -e "${RED}Résultat : au moins un point échoue — ce n'est pas pleinement plug-and-play tant que ce n'est pas corrigé.${NC}"
  exit 1
fi
