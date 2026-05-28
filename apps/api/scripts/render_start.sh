#!/usr/bin/env bash
# Render 호환 진입점 — start.sh로 위임.
# 기존 Render 서비스 설정(`bash scripts/render_start.sh`) 호환 유지.
# 신규 배포는 scripts/start.sh를 직접 호출 권장.

set -euo pipefail
exec bash "$(dirname "$0")/start.sh"
