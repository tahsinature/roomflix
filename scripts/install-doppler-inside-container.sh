#!/bin/sh

# Installs the Doppler CLI inside the container. Runs at image-build
# time (Dockerfile), not per-start. The CLI is then used at runtime
# (load-doppler-secrets.sh) to pull secrets using DOPPLER_TOKEN.
#
# Package-manager-free installer — works the same on Alpine, Debian,
# AmazonLinux, BSD, macOS. Requires curl (or wget) + gnupg, both of
# which the Dockerfile installs before invoking this.

(curl -Ls --tlsv1.2 --proto "=https" --retry 3 https://cli.doppler.com/install.sh || wget -t 3 -qO- https://cli.doppler.com/install.sh) | sh
