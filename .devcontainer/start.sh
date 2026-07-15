#!/usr/bin/env bash
set -euo pipefail

publish_codespaces_port_worker() {
  local runtime_dir="${TMPDIR:-/tmp}"
  local lock_file="${runtime_dir}/twitter-2020-codespaces-port.lock"
  local visibility

  exec 8>"$lock_file"
  if ! flock -n 8; then
    echo "Codespaces port publication is already running."
    return 0
  fi

  if [ "${CODESPACES:-}" != "true" ] || [ -z "${CODESPACE_NAME:-}" ] || [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "Codespaces credentials are unavailable; set port 80 to Public in the Ports panel."
    return 0
  fi

  if ! command -v gh >/dev/null 2>&1 || ! command -v timeout >/dev/null 2>&1; then
    echo "GitHub CLI or timeout is unavailable; set port 80 to Public in the Ports panel."
    return 0
  fi

  for attempt in $(seq 1 12); do
    GH_TOKEN="$GITHUB_TOKEN" GH_PROMPT_DISABLED=1 \
      timeout --kill-after=2s 10s \
      gh codespace ports visibility 80:public \
      --codespace "$CODESPACE_NAME" >/dev/null 2>&1 || true

    visibility="$(
      GH_TOKEN="$GITHUB_TOKEN" GH_PROMPT_DISABLED=1 \
        timeout --kill-after=2s 10s \
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

    echo "Port 80 is not public yet (attempt ${attempt}/12); retrying."
    sleep 5
  done

  echo "Automatic port publication stopped after 12 attempts; set port 80 to Public in the Codespaces Ports panel."
}

if [ "${1:-}" = "--publish-port-worker" ]; then
  publish_codespaces_port_worker
  exit 0
fi

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

app_image="twitter-2020-app:latest"
source_fingerprint="$(
  {
    git rev-parse HEAD
    git diff --no-ext-diff --binary HEAD --
    while IFS= read -r -d '' path; do
      printf '%s\0' "$path"
      sha256sum -- "$path"
    done < <(git ls-files --others --exclude-standard -z)
  } | sha256sum | cut -d ' ' -f 1
)"
image_fingerprint="$(
  docker image inspect \
    --format '{{ index .Config.Labels "com.twitter2020.source-fingerprint" }}' \
    "$app_image" 2>/dev/null || true
)"

if [ "${1:-}" = "--build" ] || [ "$image_fingerprint" != "$source_fingerprint" ]; then
  echo "Building the application image for the current source checkout."
  docker build \
    --target build \
    --label "com.twitter2020.source-fingerprint=${source_fingerprint}" \
    --tag "$app_image" \
    .
else
  echo "The application image already matches the current source checkout."
fi

docker compose \
  --env-file "$env_file" \
  -f docker-compose.yml \
  -f docker-compose.codespaces.yml \
  up --no-build --detach --remove-orphans

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

start_codespaces_port_publisher() {
  [ "${CODESPACES:-}" = "true" ] || return 0

  if [ -z "${CODESPACE_NAME:-}" ] || [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "Codespaces credentials are unavailable; set port 80 to Public in the Ports panel." >&2
    return 0
  fi

  local port_log="${TMPDIR:-/tmp}/twitter-2020-codespaces-port.log"
  touch "$port_log"
  chmod 600 "$port_log"

  if command -v setsid >/dev/null 2>&1; then
    nohup setsid bash "$repo_root/.devcontainer/start.sh" --publish-port-worker \
      </dev/null >>"$port_log" 2>&1 9>&- &
  else
    nohup bash "$repo_root/.devcontainer/start.sh" --publish-port-worker \
      </dev/null >>"$port_log" 2>&1 9>&- &
  fi
  disown || true

  echo "Publishing Codespaces port 80 in the background; progress is logged to ${port_log}."
  echo "If publication fails, set port 80 to Public in the Codespaces Ports panel."
}

start_codespaces_port_publisher

echo "Twitter 2020 is available at ${app_url}"
