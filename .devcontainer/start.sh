#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# postCreateCommand and postStartCommand can overlap during initial creation.
# A process lock makes the bootstrap safe to invoke from both lifecycle hooks.
exec 9>"${TMPDIR:-/tmp}/twitter-2020-codespaces-start.lock"
if ! flock -n 9; then
  echo "Twitter 2020 startup is already in progress."
  exit 0
fi

for attempt in $(seq 1 60); do
  if docker info >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "Docker did not become ready within 60 seconds." >&2
    exit 1
  fi
  sleep 1
done

codespace_name="${CODESPACE_NAME:-}"
forwarding_domain="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}"

if [ -n "$codespace_name" ] && [ -n "$forwarding_domain" ]; then
  case "$codespace_name" in
    *[!A-Za-z0-9-]*)
      echo "CODESPACE_NAME contains an unexpected character." >&2
      exit 1
      ;;
  esac
  case "$forwarding_domain" in
    *[!A-Za-z0-9.-]*)
      echo "GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN contains an unexpected character." >&2
      exit 1
      ;;
  esac
  app_url="https://${codespace_name}-80.${forwarding_domain}"
else
  echo "Codespaces URL variables are absent; using localhost URLs."
  app_url="http://localhost"
fi

env_file="$repo_root/.devcontainer/.env.codespaces"
umask 077

read_existing_secret() {
  local key="$1"
  if [ -f "$env_file" ]; then
    sed -n "s/^${key}=//p" "$env_file" | tail -n 1
  fi
}

better_auth_secret="$(read_existing_secret BETTER_AUTH_SECRET)"
realtime_shared_secret="$(read_existing_secret REALTIME_SHARED_SECRET)"
s3_secret_key="$(read_existing_secret S3_SECRET_KEY)"

if [ "${#better_auth_secret}" -lt 32 ]; then
  better_auth_secret="$(openssl rand -hex 32)"
fi
if [ "${#realtime_shared_secret}" -lt 32 ]; then
  realtime_shared_secret="$(openssl rand -hex 32)"
fi
if [ "${#s3_secret_key}" -lt 32 ]; then
  s3_secret_key="$(openssl rand -hex 32)"
fi

env_temp="$(mktemp "${TMPDIR:-/tmp}/twitter-2020-codespaces-env.XXXXXX")"
trap 'rm -f "$env_temp"' EXIT
cat >"$env_temp" <<EOF
BETTER_AUTH_SECRET=${better_auth_secret}
REALTIME_SHARED_SECRET=${realtime_shared_secret}
S3_ACCESS_KEY=twitter
S3_SECRET_KEY=${s3_secret_key}
CODESPACES_APP_URL=${app_url}
EOF
chmod 600 "$env_temp"
mv "$env_temp" "$env_file"

compose_build_args=()
if [ "${1:-}" = "--build" ] || ! docker image inspect twitter-2020-web:latest >/dev/null 2>&1; then
  compose_build_args+=(--build)
fi

docker compose \
  --env-file "$env_file" \
  -f docker-compose.yml \
  -f docker-compose.codespaces.yml \
  up "${compose_build_args[@]}" --detach --remove-orphans

for attempt in $(seq 1 60); do
  if curl --fail --silent --show-error "http://127.0.0.1/api/health/ready" >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "Twitter did not become ready within 120 seconds." >&2
    exit 1
  fi
  sleep 2
done

publish_codespaces_port() {
  [ "${CODESPACES:-}" = "true" ] || return 0

  if [ -z "${CODESPACE_NAME:-}" ] || [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "Codespaces credentials are unavailable; set port 80 to Public in the Ports panel." >&2
    return 0
  fi

  local visibility
  for attempt in $(seq 1 12); do
    if GH_TOKEN="$GITHUB_TOKEN" GH_PROMPT_DISABLED=1 \
      gh codespace ports visibility 80:public \
      --codespace "$CODESPACE_NAME" >/dev/null 2>&1; then
      visibility="$(
        GH_TOKEN="$GITHUB_TOKEN" GH_PROMPT_DISABLED=1 \
          gh codespace ports \
          --codespace "$CODESPACE_NAME" \
          --json sourcePort,visibility \
          --jq '.[] | select(.sourcePort == 80) | .visibility' \
          2>/dev/null || true
      )"
      if [ "$visibility" = "public" ]; then
        echo "Codespaces port 80 is public."
        return 0
      fi
    fi
    sleep 5
  done

  echo "Port 80 could not be made public automatically; set it to Public in the Ports panel." >&2
}

publish_codespaces_port

echo "Twitter 2020 is available at ${app_url}"
