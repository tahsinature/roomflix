#!/bin/sh

# Pulls the production secrets from Doppler and writes them to .env at
# the repo root. Bun's runtime auto-reads .env from cwd so the server
# picks them up without further wiring.
#
# Auth: expects DOPPLER_TOKEN to be set. As a convenience for local
# docker runs, also accepts DOPPLER_TOKEN_MY_PERSONAL.
#
# Project: roomflix · Config: prd

rootDir="$(dirname "$0")/../"

if [ -z "$DOPPLER_TOKEN" ]; then
  if [ -z "$DOPPLER_TOKEN_MY_PERSONAL" ]; then
    echo "Neither DOPPLER_TOKEN nor DOPPLER_TOKEN_MY_PERSONAL is set"
    exit 1
  else
    export DOPPLER_TOKEN="$DOPPLER_TOKEN_MY_PERSONAL"
    echo "Using DOPPLER_TOKEN_MY_PERSONAL"
  fi
else
  echo "DOPPLER_TOKEN is set"
fi

cd "$rootDir" || exit 1

if ! command -v doppler > /dev/null 2>&1; then
  echo "doppler CLI not found. Install it first."
  exit 1
fi

doppler secrets -p roomflix -c prd download --no-file --format env > .env || {
  echo "Failed to pull secrets"
  exit 1
}
echo "Secrets pulled successfully"
