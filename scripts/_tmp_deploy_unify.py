#!/usr/bin/env python3
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(r"c:\Users\trind\Desktop\Lucas\financeiro")
REMOTE = "lucas@lucasservidor:/home/lucas/PROJETOS/financeiro"
FILES = [
    "public/js/app.js",
    "public/css/app.css",
    "public/css/mobile-bank.css",
    "src/services/financeService.js",
    "src/services/reportService.js",
    "src/controllers/financeController.js",
    "views/layouts/main.ejs",
    "views/layouts/app-mobile.ejs",
]

for rel in FILES:
    r = subprocess.run(["scp", str(ROOT / rel), f"{REMOTE}/{rel}"], capture_output=True)
    print(rel, r.returncode)
    if r.returncode != 0:
        sys.stderr.buffer.write(r.stderr)
        raise SystemExit(r.returncode)

r = subprocess.run(
    [
        "ssh",
        "lucas@lucasservidor",
        "cd /home/lucas/PROJETOS/financeiro && "
        "grep -n 'usaSaldoConta: true\\|Entrada em conta\\|comprovante-block\\|comprovanteDialog' "
        "public/js/app.js src/services/financeService.js views/layouts/main.ejs | head -20 && "
        "pm2 restart financeiro --update-env && echo DEPLOY_OK",
    ],
    capture_output=True,
)
sys.stdout.buffer.write(r.stdout)
sys.stderr.buffer.write(r.stderr)
raise SystemExit(r.returncode)
