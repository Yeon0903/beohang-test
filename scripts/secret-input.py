"""Supply local changed files/history to secret-scan.cjs via a pipe; never run alone for display."""
import json
import pathlib
import subprocess
import sys

def git(*args):
    return subprocess.check_output(['git', *args]).decode('utf-8')

items = []
files = set(git('ls-files', '-z').split('\0')) | set(git('ls-files', '--others', '--exclude-standard', '-z').split('\0'))
for name in sorted(files - {''}):
    if name.startswith('.env') and name != '.env.example':
        raise SystemExit('Tracked environment file detected; remove it before scanning')
    p = pathlib.Path(name)
    if p.is_file():
        items.append({'file': name, 'body': p.read_text(encoding='utf-8')})
for commit in git('rev-list', sys.argv[1] if len(sys.argv) > 1 else '32abcd9..HEAD').splitlines():
    items.append({'file': commit, 'body': git('show', '--format=', '--no-ext-diff', commit)})
json.dump(items, sys.stdout)
