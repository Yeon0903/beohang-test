"""Create an offline, self-contained source/Git recovery ZIP. No network, DB or deployment.
Run the repository secret scan before this command. Never include .env or DB dumps.
"""
import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess
import tempfile
import zipfile


def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args], stderr=subprocess.PIPE).decode().strip()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, help='New .zip path outside the source repository')
    parser.add_argument('--previous', help='Previous preservation folder with SHA256SUMS')
    parser.add_argument('--evidence', help='Preparation evidence folder; only known, non-secret reports are copied')
    args = parser.parse_args()
    repo = pathlib.Path(__file__).resolve().parents[1]
    out = pathlib.Path(args.output).resolve()
    if out.suffix != '.zip' or out.exists() or out.is_relative_to(repo):
        raise SystemExit('Choose a new .zip path outside the repository')
    if git(repo, 'branch', '--show-current') != 'codex-dev':
        raise SystemExit('Use codex-dev only')
    if git(repo, 'status', '--porcelain'):
        raise SystemExit('Commit reviewed changes first; the recovery archive captures committed files only')
    for commit in ['6e831f7', '797a8c1', '01355b3', '8275ad6']:
        subprocess.run(['git', '-C', str(repo), 'merge-base', '--is-ancestor', commit, 'HEAD'], check=True)
    names = git(repo, 'ls-files', '-z').split('\0')
    if any(pathlib.PurePosixPath(n).name.startswith('.env') and pathlib.PurePosixPath(n).name != '.env.example' for n in names):
        raise SystemExit('Tracked environment file found')
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='virhang-recovery-') as tmp:
        root = pathlib.Path(tmp)
        head = git(repo, 'rev-parse', 'HEAD')
        subprocess.run(['git', '-C', str(repo), 'bundle', 'create', str(root/'virhang-full.bundle'), 'codex-dev'], check=True, capture_output=True)
        subprocess.run(['git', '-C', str(repo), 'archive', '--format=zip', '--prefix=VirHang/', '--output='+str(root/'virhang-source.zip'), 'HEAD'], check=True)
        subprocess.run(['git', '-C', str(repo), 'format-patch', '--output-directory', str(root/'all-local-patches'), '32abcd9..codex-dev'], check=True, capture_output=True)
        # Verify that the bundle can restore without any existing repository/commit.
        restored = root/'restore-check'
        subprocess.run(['git', 'clone', '-b', 'codex-dev', str(root/'virhang-full.bundle'), str(restored)], check=True, capture_output=True)
        if git(restored, 'rev-parse', 'HEAD') != head or git(restored, 'rev-parse', 'HEAD^{tree}') != git(repo, 'rev-parse', 'HEAD^{tree}'):
            raise SystemExit('Bundle restore mismatch')
        shutil.rmtree(restored)
        previous_verified = []
        if args.previous:
            previous = pathlib.Path(args.previous).resolve()
            for line in (previous/'SHA256SUMS').read_text().splitlines():
                expected, name = line.split('  ', 1)
                item = (previous/name).resolve()
                if not item.is_relative_to(previous) or digest(item) != expected:
                    raise SystemExit('Previous backup checksum mismatch')
                previous_verified.append(name)
            shutil.copytree(previous, root/'previous-preservation-02')
        if args.evidence:
            evidence = pathlib.Path(args.evidence).resolve()
            (root/'verification-reports').mkdir()
            for name in ['baseline-161.txt', 'complete-test-results.txt', 'full-history-secret-scan.json', 'preservation-checks.json', 'git-remote-review.json']:
                item = (evidence/name).resolve()
                if item.is_relative_to(evidence) and item.is_file():
                    shutil.copyfile(item, root/'verification-reports'/name)
        manifest = {
            'branch': 'codex-dev', 'head': head, 'tree': git(repo, 'rev-parse', 'HEAD^{tree}'),
            'contains': 'committed source, full branch history, patch series; no live database or runtime secrets',
            'requires_prior_commit': False, 'offline_clone_verified': True,
            'previous_checksum_verified_files': previous_verified,
            'files': {str(p.relative_to(root)): digest(p) for p in sorted(root.rglob('*')) if p.is_file()}
        }
        (root/'RESTORE_KO.md').write_text('''# 오프라인 복구\n\n전체 bundle에는 선행 저장소 없이 복구 가능한 codex-dev 전체 이력이 있습니다. 소스 ZIP에는 .git이 없으며 코드 검토용입니다. 실제 DB, 회원 데이터, 환경 비밀값, node_modules는 포함하지 않습니다.\n\n1. 외부 SHA256과 내려받은 ZIP의 SHA256을 비교합니다. 압축 해제 후 MANIFEST.json의 파일별 SHA256도 확인합니다.\n2. 새 폴더에서 `git clone -b codex-dev /백업경로/virhang-full.bundle VirHang`을 실행합니다.\n3. `git -C VirHang rev-parse HEAD`를 MANIFEST의 head와 비교합니다.\n4. Node >=22.8 환경에서 `npm ci --ignore-scripts`, `npm run check`, `npm test`를 실행합니다. npm 의존성을 다시 받으려면 네트워크가 필요합니다.\n5. 기존 폴더에 덮어쓰거나 main에 병합하지 않습니다. 이미 git clone한 codex-dev를 원격에 푸시하기 전 Pages/Actions 배포 영향을 확인합니다.\n6. bundle을 clone하면 origin은 로컬 bundle 경로입니다. 원격 GitHub 연결을 추가하는 작업은 별도로 검토합니다.\n7. 실제 Supabase/Edge/Pages 반영은 docs/STAGING_ROLLOUT_03.md의 점검과 사용자 승인이 필요합니다. 이 백업은 데이터베이스 백업의 대체가 아닙니다.\n''')
        manifest['files'] = {str(p.relative_to(root)): digest(p) for p in sorted(root.rglob('*')) if p.is_file()}
        (root/'MANIFEST.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
        with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for p in sorted(root.rglob('*')):
                if p.is_file():
                    archive.write(p, p.relative_to(root))
        with zipfile.ZipFile(out) as archive:
            if archive.testzip() is not None:
                raise SystemExit('ZIP CRC check failed')
        checksum = digest(out)
        out.with_suffix('.zip.sha256').write_text(checksum+'  '+out.name+'\n')
        print(json.dumps({'archive': str(out), 'sha256': checksum, 'head': head, 'offline_clone_verified': True}, ensure_ascii=False))


if __name__ == '__main__':
    main()
