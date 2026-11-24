#!/usr/bin/env bash
# Sync Convex "agents" table: cloud (careful-elephant-671) → self-hosted Pi (:3210)
# Usage:
#   ./scripts/sync-agents-cloud-to-pi.sh export          # Mac + Internet → agents-cloud.jsonl
#   ./scripts/sync-agents-cloud-to-pi.sh import         # Pi (or Mac via 10.42.0.1) → local DB
#   ./scripts/sync-agents-cloud-to-pi.sh upsert         # One agent via env vars (see below)
#   ./scripts/sync-agents-cloud-to-pi.sh deploy         # Push convex/ to self-hosted only
#   ./scripts/sync-agents-cloud-to-pi.sh test-login     # agents:login smoke test
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

AGENTS_FILE="${AGENTS_FILE:-agents-cloud.jsonl}"
CLOUD_DEPLOYMENT="${CLOUD_DEPLOYMENT:-dev:careful-elephant-671}"
CLOUD_URL="${CLOUD_URL:-https://careful-elephant-671.convex.cloud}"
PI_URL="${PI_URL:-http://127.0.0.1:3210}"

usage() {
  cat <<EOF
Sync agents for mobile login (agents:login) on Convex self-hosted.

Commands:
  export       Export agents from Convex Cloud to ${AGENTS_FILE}
  import       Import ${AGENTS_FILE} into self-hosted (requires deploy + .env.local)
  upsert       Create/update one agent on self-hosted (password preserved if known)
  deploy       npx convex deploy → self-hosted only
  test-login   Run agents:login (needs AGENT_EMAIL + AGENT_PASSWORD)

Environment (upsert):
  AGENT_ID, AUTH_USER_ID, AGENT_EMAIL, AGENT_NOM
  AGENT_ROLE=agent|admin  AGENT_STATUT=actif|inactif
  AGENT_PASSWORD          (min 8 chars, same as cloud for mobile login)

Environment (import / deploy / test-login on Mac → Pi hotspot):
  CONVEX_SELF_HOSTED_URL=http://10.42.0.1:3210
  CONVEX_SELF_HOSTED_ADMIN_KEY=<from Pi: docker compose exec backend ./generate_admin_key.sh>

Examples:
  ./scripts/sync-agents-cloud-to-pi.sh export
  scp agents-cloud.jsonl pi@10.42.0.1:/home/emna/Backend-pfe/
  ./scripts/sync-agents-cloud-to-pi.sh import

  AGENT_ID=AG-001 AUTH_USER_ID=xxx AGENT_EMAIL=you@x.com AGENT_NOM="Agent" \\
    AGENT_PASSWORD='YourPass8' ./scripts/sync-agents-cloud-to-pi.sh upsert
EOF
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1"; exit 1; }
}

load_selfhosted_env() {
  if [[ -f .env.local ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env.local
    set +a
  fi
  if [[ -z "${CONVEX_SELF_HOSTED_URL:-}" || -z "${CONVEX_SELF_HOSTED_ADMIN_KEY:-}" ]]; then
    echo "Set CONVEX_SELF_HOSTED_URL and CONVEX_SELF_HOSTED_ADMIN_KEY in .env.local"
    echo "Admin key: cd self-hosted/docker && docker compose exec backend ./generate_admin_key.sh"
    exit 1
  fi
  export CONVEX_URL="${CONVEX_SELF_HOSTED_URL}"
}

with_cloud_env() {
  if [[ ! -f .env.cloud ]]; then
    echo "Copy .env.cloud.example to .env.cloud (cloud URLs only, no self-hosted vars)."
    exit 1
  fi
  local had_local=0
  if [[ -f .env.local ]]; then
    had_local=1
    mv .env.local .env.local.selfhosted.bak
  fi
  set -a
  # shellcheck disable=SC1091
  source .env.cloud
  set +a
  "$@"
  local status=$?
  if [[ "$had_local" -eq 1 ]]; then
    mv .env.local.selfhosted.bak .env.local
  fi
  return "$status"
}

cmd_export() {
  require_cmd npx
  echo "Exporting agents from cloud → ${AGENTS_FILE}"
  with_cloud_env npx convex data agents --format jsonLines --limit "${EXPORT_LIMIT:-1000}" >"$AGENTS_FILE"
  echo "Done. Lines: $(wc -l <"$AGENTS_FILE" | tr -d ' ')"
  echo "Transfer to Pi:"
  echo "  scp ${AGENTS_FILE} scripts/sync-agents-cloud-to-pi.sh emna@10.42.0.1:/home/emna/Backend-pfe/"
  echo "  ssh emna@10.42.0.1 'chmod +x /home/emna/Backend-pfe/scripts/sync-agents-cloud-to-pi.sh'"
}

cmd_import() {
  require_cmd npx
  load_selfhosted_env
  if [[ ! -f "$AGENTS_FILE" ]]; then
    echo "Missing ${AGENTS_FILE}. Run: $0 export (on Mac with Internet)"
    exit 1
  fi
  echo "Deploying convex functions to ${CONVEX_SELF_HOSTED_URL}..."
  npx convex deploy
  echo "Importing agents (--replace)..."
  npx convex import --table agents --replace "$AGENTS_FILE" -y
  echo "Agents on self-hosted:"
  npx convex data agents --format pretty --limit 20
}

cmd_deploy() {
  require_cmd npx
  load_selfhosted_env
  npx convex deploy
}

cmd_upsert() {
  require_cmd npx
  load_selfhosted_env
  : "${AGENT_ID:?Set AGENT_ID}"
  : "${AUTH_USER_ID:?Set AUTH_USER_ID}"
  : "${AGENT_EMAIL:?Set AGENT_EMAIL}"
  : "${AGENT_NOM:?Set AGENT_NOM}"
  : "${AGENT_PASSWORD:?Set AGENT_PASSWORD (min 8)}"
  AGENT_ROLE="${AGENT_ROLE:-agent}"
  AGENT_STATUT="${AGENT_STATUT:-actif}"
  npx convex deploy
  npx convex run agents:upsertAgent "$(node -e "
    console.log(JSON.stringify({
      agentId: process.env.AGENT_ID,
      authUserId: process.env.AUTH_USER_ID,
      email: process.env.AGENT_EMAIL,
      nom: process.env.AGENT_NOM,
      role: process.env.AGENT_ROLE,
      statut: process.env.AGENT_STATUT,
      password: process.env.AGENT_PASSWORD,
    }));
  ")"
  echo "Upserted ${AGENT_EMAIL} (${AGENT_ID})"
}

cmd_test_login() {
  require_cmd npx
  load_selfhosted_env
  : "${AGENT_EMAIL:?Set AGENT_EMAIL}"
  : "${AGENT_PASSWORD:?Set AGENT_PASSWORD}"
  npx convex run agents:login "$(node -e "
    console.log(JSON.stringify({
      email: process.env.AGENT_EMAIL,
      password: process.env.AGENT_PASSWORD,
      deviceInfo: 'sync-agents-cloud-to-pi.sh',
    }));
  ")"
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    export) cmd_export ;;
    import) cmd_import ;;
    upsert) cmd_upsert ;;
    deploy) cmd_deploy ;;
    test-login) cmd_test_login ;;
    -h|--help|help|"") usage ;;
    *)
      echo "Unknown command: $cmd"
      usage
      exit 1
      ;;
  esac
}

main "$@"
