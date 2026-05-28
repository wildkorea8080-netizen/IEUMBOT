# Render API Startup

Render shell access is not available in the deployed environment, so the API service should run migrations and seed local admin accounts during startup.

> **변경사항(P0-4)**: 앱 코드(`app/main.py`)의 자동 마이그레이션이 제거되었습니다.
> 이제 마이그레이션은 **반드시** 배포 진입점 스크립트에서 실행됩니다.
> 앱 시작 시점에는 스키마 버전을 alembic head와 비교하여 불일치 시 WARNING 로그만 남깁니다(절대 fail하지 않음).

## Required files

- `apps/api/.python-version`
  - `3.11.9`
- `apps/api/scripts/start.sh` — **신규 일반 진입점** (Render / Docker / Coolify 공통)
  - runs `alembic upgrade head`
  - runs `python -m app.scripts.seed_local_admins` (실패 허용)
  - starts `uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`
- `apps/api/scripts/render_start.sh` — Render 호환 위임 (start.sh 호출)
  - 기존 Render 서비스 설정 호환 유지
  - 신규 배포는 `start.sh` 직접 호출 권장
- `apps/api/apt.txt`
  - installs `poppler-utils` for `pdftoppm` and `pdfinfo`
  - installs `tesseract-ocr`, `tesseract-ocr-eng`, and `tesseract-ocr-kor` for OCR
- `.gitattributes`
  - forces `*.sh` to use `LF` line endings in Git

## Render service settings

- Root Directory: `apps/api`
- Start Command: `bash scripts/render_start.sh` (또는 `bash scripts/start.sh`)

## Coolify / iwinv

`infra/docker/api.Dockerfile`의 CMD는 `bash scripts/start.sh`를 사용합니다.
다중 인스턴스 배포 시 권장: 마이그레이션을 별도 deploy job으로 분리하고 CMD를 순수
`uvicorn app.main:app --host 0.0.0.0 --port 8000`로 단순화하여 마이그레이션 레이스 방지.

## Notes

- Using `bash scripts/render_start.sh` avoids depending on the executable bit for the script.
- `*.sh text eol=lf` helps prevent Windows checkouts from committing `CRLF` shell scripts that can fail on Render.
- This startup flow does not change application code paths. It only changes how Render boots the API service.
- OCR status for scanned PDFs requires both Python packages and system binaries. After Render redeploys with `apt.txt`, run reindexing so previously incomplete scanned PDFs are processed again.
