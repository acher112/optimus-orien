"""Dependency-free artifact integrity validation; NOT a replacement for Django tests."""
import ast,hashlib,pathlib,py_compile,sys
root=pathlib.Path(__file__).resolve().parents[1]
errors=[]
for p in (root/'backend').rglob('*.py'):
 try:
  ast.parse(p.read_text(encoding='utf-8'))
  compile(p.read_bytes(),str(p),'exec')
 except Exception as e:errors.append(f'{p}: {e}')
print('Python syntax files checked:',len(list((root/'backend').rglob('*.py'))))
for path in ['backend/core/services/access.py','backend/core/services/audit.py','backend/core/migrations/0001_initial.py','backend/core/tests/test_phase1.py','frontend/src/main.tsx','frontend/src/style.css','docs/REQUIREMENTS_MATRIX.csv']:
 p=root/path
 if not p.exists():errors.append('Missing: '+path)
 else:print(path,hashlib.sha256(p.read_bytes()).hexdigest()[:14])
if errors:
 print('FAIL:','; '.join(errors));sys.exit(1)
print('PASS: Dependency-free source syntax and required files exist')
