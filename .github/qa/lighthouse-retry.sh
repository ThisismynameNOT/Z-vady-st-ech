#!/usr/bin/env bash
set -uo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: lighthouse-retry.sh <output-path> <command> [args...]" >&2
  exit 2
fi

output_path="$1"
shift
max_attempts="${LIGHTHOUSE_MAX_ATTEMPTS:-3}"

if ! [[ "$max_attempts" =~ ^[1-9][0-9]*$ ]]; then
  echo "LIGHTHOUSE_MAX_ATTEMPTS must be a positive integer" >&2
  exit 2
fi

is_transient_failure() {
  local log_file="$1"
  grep -Eiq 'NO_NAVSTART|Something went wrong with recording the trace over your page load' "$log_file"
}

attempt=1
while (( attempt <= max_attempts )); do
  rm -f "$output_path"
  log_file="$(mktemp)"

  "$@" >"$log_file" 2>&1
  rc=$?
  cat "$log_file"

  if (( rc == 0 )); then
    if [[ ! -s "$output_path" ]]; then
      echo "LIGHTHOUSE RETRY: FAIL — command succeeded but expected JSON was not produced: $output_path" >&2
      rm -f "$log_file" "$output_path"
      exit 1
    fi
    rm -f "$log_file"
    exit 0
  fi

  if is_transient_failure "$log_file"; then
    rm -f "$output_path"
    if (( attempt < max_attempts )); then
      echo "LIGHTHOUSE RETRY: transient collection failure on attempt $attempt/$max_attempts; retrying same measurement" >&2
      rm -f "$log_file"
      attempt=$((attempt + 1))
      continue
    fi
    echo "LIGHTHOUSE RETRY: FAIL — transient collection failure exhausted $max_attempts attempts" >&2
    rm -f "$log_file"
    exit "$rc"
  fi

  rm -f "$log_file" "$output_path"
  echo "LIGHTHOUSE RETRY: FAIL — non-transient Lighthouse failure; not retrying" >&2
  exit "$rc"
done

exit 1
