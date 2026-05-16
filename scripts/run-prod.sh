#!/bin/sh

# Container entrypoint command. Pulls Doppler secrets into .env, then
# boots the Bun server. Bun reads .env from cwd at startup.

set -e

rootDir="$(dirname "$0")/../"

"$rootDir/scripts/load-doppler-secrets.sh"

cd "$rootDir" || exit 1

exec bun run server/index.ts
