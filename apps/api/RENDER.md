# Render API Startup

Render shell access is not available in the deployed environment, so the API service should run migrations and seed local admin accounts during startup.

## Required files

- `apps/api/.python-version`
  - `3.11.9`
- `apps/api/scripts/render_start.sh`
  - runs `alembic upgrade head`
  - runs `python -m app.scripts.seed_local_admins`
  - starts `uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`
- `apps/api/apt.txt`
  - installs `poppler-utils` for `pdftoppm` and `pdfinfo`
  - installs `tesseract-ocr`, `tesseract-ocr-eng`, and `tesseract-ocr-kor` for OCR
- `.gitattributes`
  - forces `*.sh` to use `LF` line endings in Git

## Render service settings

- Root Directory: `apps/api`
- Start Command: `bash scripts/render_start.sh`

## Notes

- Using `bash scripts/render_start.sh` avoids depending on the executable bit for the script.
- `*.sh text eol=lf` helps prevent Windows checkouts from committing `CRLF` shell scripts that can fail on Render.
- This startup flow does not change application code paths. It only changes how Render boots the API service.
- OCR status for scanned PDFs requires both Python packages and system binaries. After Render redeploys with `apt.txt`, run reindexing so previously incomplete scanned PDFs are processed again.
