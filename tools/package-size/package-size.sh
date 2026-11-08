#!/usr/bin/env bash
set -euo pipefail
# Linux equivalent of package-size.cmd: every back.js / front.js under the CURRENT folder bigger than 250000 bytes.
find . -type f \( -name back.js -o -name front.js \) -size +250000c -printf '%p %s\n'
