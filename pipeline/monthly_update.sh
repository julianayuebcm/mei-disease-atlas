#!/bin/bash
# Cron wrapper for pipeline/monthly_update.py: cron runs with a minimal PATH, so set the tools explicitly.
export PATH="/home/julianay/.local/bin:/home/julianay/workspace/tools/node-v24.15.0-linux-x64/bin:/home/julianay/anaconda3/bin:/usr/bin:/bin"
cd /home/julianay/workspace/mei_disease_atlas || exit 1
exec python3 pipeline/monthly_update.py "$@"
