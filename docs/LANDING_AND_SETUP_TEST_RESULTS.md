# New landing/setup increment — verification record

## Executed here

- Existing Phase 1 ZIP extracted and inspected: **PASS**.
- New Python modules compile with `compileall`: **PASS**.
- New TypeScript/TSX files transpile via global TypeScript parser without syntactic diagnostics: **PASS**.
- Public endpoint statically audited to return **only** explicitly approved aggregate fields: **CODE REVIEW COMPLETE** (not a runtime test).
- Added `test_onboarding.py` with regression scenarios for authorisation, validation, activation history and privacy: **AUTHORED, NOT EXECUTED**.

## Not executed / blocked

- Django runtime tests / migration apply / migration consistency: **NOT EXECUTED**. Required packages unavailable; pip network fetch failed DNS lookup.
- Frontend `npm run build`: **BLOCKED**, because `react`, `lucide-react`, `vite` and their types were not installed. `npm install --offline` also failed due to missing cache. Parser-only validation passed; a complete TypeScript type check and Vite build are still required.
- Visual browser testing: **NOT EXECUTED**, because full frontend dependencies were unavailable.

## Developer machine acceptance commands

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item ..\.env.example ..\.env
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py migrate
python manage.py test core
```

Then in a separate terminal:

```powershell
cd frontend
npm install
npm run build
npm run dev
```

For local verified acceptance: sign in as an org admin, create a school, configure a draft, ensure invalid drafts cannot activate, activate a valid draft and confirm version 1, edit and reactivate for version 2, then use an unauthenticated browser to confirm only approved aggregate school indicators are public. Verify responsive displays at desktop/tablet/mobile widths and test browser back/forward.
