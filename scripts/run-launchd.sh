#!/bin/bash
set -euo pipefail

readonly ROOT="$(
  cd "$(/usr/bin/dirname "${BASH_SOURCE[0]}")/.."
  /bin/pwd -P
)"
readonly PASSWORD_SERVICE="com.mengmota.web-terminal.password-hash"
readonly PASSWORD_ACCOUNT="web-terminal"
readonly PASSWORD_HASH_FILE="/Users/yeongyu/Library/Application Support/web-terminal-secrets/password-hash"
readonly PASSWORD_FILE="${ROOT}/.deploy-password.txt"

if [[ -r "${PASSWORD_HASH_FILE}" ]] && [[ "$(/usr/bin/stat -f '%OLp' "${PASSWORD_HASH_FILE}")" == "600" ]]; then
  password_hash="$(< "${PASSWORD_HASH_FILE}")"
  export WT_PASSWORD_HASH="${password_hash}"
  unset password_hash
elif password_hash="$(
  /usr/bin/security find-generic-password \
    -w \
    -s "${PASSWORD_SERVICE}" \
    -a "${PASSWORD_ACCOUNT}" \
    2>/dev/null
)"; then
  if [[ "${password_hash}" != '$argon2id$'* ]]; then
    printf 'web-terminal: Keychain item is not an Argon2id hash\n' >&2
    exit 1
  fi
  export WT_PASSWORD_HASH="${password_hash}"
  unset password_hash
else
  if [[ ! -r "${PASSWORD_FILE}" ]] || [[ "$(/usr/bin/stat -f '%OLp' "${PASSWORD_FILE}")" != "600" ]]; then
    printf 'web-terminal: password fallback must exist with mode 0600\n' >&2
    exit 1
  fi
  export WT_PASSWORD="$(< "${PASSWORD_FILE}")"
fi

export HOME="/Users/yeongyu"
export PATH="/Users/yeongyu/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export WT_FILES_ROOT="/Users/yeongyu"
export WT_HOST="127.0.0.1"
export WT_PORT="7820"

cd "${ROOT}"
exec /Users/yeongyu/.bun/bin/bun run src/server/index.ts
