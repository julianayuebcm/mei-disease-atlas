#!/bin/bash
# Cron wrapper for pipeline/update_literature.py. Cron starts with a minimal PATH, so put the folders that hold
# python3, node and claude in ~/.mei_atlas_env (e.g.  export PATH="$HOME/.local/bin:/path/to/node/bin:$PATH").
[ -f "$HOME/.mei_atlas_env" ] && . "$HOME/.mei_atlas_env"
cd "$(dirname "$0")/.." || exit 1
exec python3 pipeline/update_literature.py "$@"
