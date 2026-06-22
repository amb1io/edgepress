#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV_VARS_FILE="${SCRIPT_DIR}/.dev.vars"
WRANGLER_CONFIG_FILE="${SCRIPT_DIR}/wrangler.toml"
TARGET_ENV=""
WORKER_NAME=""

usage() {
  cat <<'EOF'
Uso:
  bash ./upload-dev-secrets.sh [--env <ambiente>] [--file <arquivo>] [--name <worker>] [--config <arquivo>]

Ambientes no wrangler.toml deste projeto:
  (omitir --env)  production / default  ->  wrangler deploy
  preview         staging / branch      ->  wrangler deploy --env preview

Exemplos:
  bash ./upload-dev-secrets.sh
  bash ./upload-dev-secrets.sh --env preview
  bash ./upload-dev-secrets.sh --env preview --file .dev.vars

Variaveis publicas (nao viram secret) ficam em wrangler.toml [vars] / [env.preview.vars].
Segredos sao lidos de .dev.vars e enviados com wrangler secret put.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--env)
      [[ $# -lt 2 ]] && { echo "Erro: faltou valor para $1."; usage; exit 1; }
      TARGET_ENV="$2"
      shift 2
      ;;
    -f|--file)
      [[ $# -lt 2 ]] && { echo "Erro: faltou valor para $1."; usage; exit 1; }
      DEV_VARS_FILE="$2"
      if [[ "${DEV_VARS_FILE}" != /* ]]; then
        DEV_VARS_FILE="${SCRIPT_DIR}/${DEV_VARS_FILE}"
      fi
      shift 2
      ;;
    -c|--config)
      [[ $# -lt 2 ]] && { echo "Erro: faltou valor para $1."; usage; exit 1; }
      WRANGLER_CONFIG_FILE="$2"
      if [[ "${WRANGLER_CONFIG_FILE}" != /* ]]; then
        WRANGLER_CONFIG_FILE="${SCRIPT_DIR}/${WRANGLER_CONFIG_FILE}"
      fi
      shift 2
      ;;
    -n|--name)
      [[ $# -lt 2 ]] && { echo "Erro: faltou valor para $1."; usage; exit 1; }
      WORKER_NAME="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Erro: argumento desconhecido: $1"
      usage
      exit 1
      ;;
  esac
done

if ! command -v wrangler >/dev/null 2>&1; then
  echo "Erro: wrangler nao encontrado no PATH."
  exit 1
fi

if [[ ! -f "${DEV_VARS_FILE}" ]]; then
  echo "Erro: arquivo de variaveis nao encontrado em ${DEV_VARS_FILE}."
  exit 1
fi

if [[ ! -f "${WRANGLER_CONFIG_FILE}" ]]; then
  echo "Erro: arquivo de configuracao do wrangler nao encontrado em ${WRANGLER_CONFIG_FILE}."
  exit 1
fi

if [[ -z "${WORKER_NAME}" ]]; then
  WORKER_NAME="$(
    awk -F= '
      /^[[:space:]]*name[[:space:]]*=/ {
        value=$2
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
        gsub(/^"/, "", value)
        gsub(/"$/, "", value)
        print value
        exit
      }
    ' "${WRANGLER_CONFIG_FILE}"
  )"
fi

if [[ -z "${WORKER_NAME}" ]]; then
  echo "Erro: nao foi possivel identificar o nome do worker. Use --name <worker>."
  exit 1
fi

# Chaves que ficam em wrangler.toml [vars] ou sao so para tooling local — nao enviar como secret.
is_non_secret_key() {
  case "$1" in
    PUBLIC_*|EDGEPRESS_HOST|EDGEPRESS_THEME_PUBLIC) return 0 ;;
    BETTER_AUTH_URL|BETTER_AUTH_TRUSTED_ORIGINS) return 0 ;;
    RATE_LIMIT_* ) return 0 ;;
    RESEND_FROM) return 0 ;;
    THEME_IMPORT_DISPATCH_REPO|THEME_IMPORT_EVENT_TYPE|THEME_DEPLOY_EVENT_TYPE) return 0 ;;
    CLOUDFLARE_IMAGES_ACCOUNT_ID|CLOUDFLARE_IMAGES_BASE_URL|CLOUDFLARE_IMAGES_ACCOUNT_HASH) return 0 ;;
    CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_DATABASE_ID|CLOUDFLARE_D1_TOKEN) return 0 ;;
  esac

  return 1
}

trim_quotes() {
  local value="$1"
  if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "${value}"
}

uploaded=0
skipped=0
wrangler_args=(--name "${WORKER_NAME}" --config "${WRANGLER_CONFIG_FILE}")
if [[ -n "${TARGET_ENV}" ]]; then
  wrangler_args+=(--env "${TARGET_ENV}")
fi

while IFS= read -r raw_line || [[ -n "${raw_line}" ]]; do
  line="${raw_line#"${raw_line%%[![:space:]]*}"}"

  [[ -z "${line}" ]] && continue
  [[ "${line}" == \#* ]] && continue
  [[ "${line}" != *=* ]] && continue

  key="${line%%=*}"
  value="${line#*=}"

  key="${key%"${key##*[![:space:]]}"}"
  value="${value#"${value%%[![:space:]]*}"}"

  [[ -z "${key}" ]] && continue
  [[ -z "${value}" ]] && continue

  if is_non_secret_key "${key}"; then
    skipped=$((skipped + 1))
    continue
  fi

  value="$(trim_quotes "${value}")"

  if [[ -n "${TARGET_ENV}" ]]; then
    echo "-> enviando segredo: ${key} (worker: ${WORKER_NAME}, env: ${TARGET_ENV})"
  else
    echo "-> enviando segredo: ${key} (worker: ${WORKER_NAME}, env: default)"
  fi
  printf '%s' "${value}" | wrangler secret put "${key}" "${wrangler_args[@]}"
  uploaded=$((uploaded + 1))
done < "${DEV_VARS_FILE}"

echo
echo "Concluido. Segredos enviados: ${uploaded}. Variaveis ignoradas: ${skipped}."
