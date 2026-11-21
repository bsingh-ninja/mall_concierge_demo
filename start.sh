#!/usr/bin/env bash
# Start Mall Concierge: API (:8004) and web app (:3004, reachable from phones on the same Wi-Fi).
# No database: the mall lives in backend/app/data/mall.json (rebuild with: cd backend && .venv/bin/python scripts/build_mall.py).
# Restarting the API resets all sessions and the operator view.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x backend/.venv/bin/uvicorn ]; then
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install -q -r backend/requirements.txt
fi
[ -f backend/.env ] || cp backend/.env.example backend/.env
[ -d web/node_modules ] || (cd web && pnpm install --silent)

PIDS=()
(cd backend && .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8004 --reload --reload-dir app) &
PIDS+=($!)
(cd web && pnpm dev --port 3004 -H 0.0.0.0) &
PIDS+=($!)
trap 'kill "${PIDS[@]}" 2>/dev/null' EXIT INT TERM

echo
echo "Mall Concierge: http://localhost:3004   (press O to flip to the operator view)"
wait
