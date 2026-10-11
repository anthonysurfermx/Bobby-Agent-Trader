#!/bin/bash
# Signed, offline simulator evidence. See redesign-shots.py --help.
set -euo pipefail
exec python3 "$(cd "$(dirname "$0")" && pwd)/redesign-shots.py" "$@"
