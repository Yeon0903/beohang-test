# 소스 백업 생성·검증·복구

이 백업은 소스/Git 이력 보존용이다. 실제 회원·DB/Auth 덤프·Storage 파일·SMTP/OAuth secret을 포함하지 않는다.

기존 preservation-02 파일 9개의 SHA256과 bundle은 이번에 다시 검증했다. 기존 bundle은 32abcd9를 선행조건으로 요구한다. 새 백업의 `virhang-full.bundle`은 codex-dev 전체 이력을 포함하므로 선행 저장소 없이 clone할 수 있다.

## 생성

검토한 변경을 codex-dev에 커밋하고 작업 폴더가 깨끗한지 확인한다. 아래 경로는 모두 로컬이며 네트워크 push나 DB 접속이 없다.

```sh
set -o pipefail
python scripts/secret-input.py codex-dev | node scripts/secret-scan.cjs --stdin
python scripts/create-recovery.py --output /workspace/work/VirHang-Stage1-03-Recovery.zip --previous /workspace/work/virhang-preservation-02 --evidence /workspace/work/virhang-preflight-03
```

기존 파일을 덮어쓰지 않으므로 같은 이름이 있으면 다른 새 이름을 지정한다. 검사 범위는 추적 파일/새 파일 및 codex-dev 전체 이력이며, 패턴 검사 외에도 파일 목록을 검토한다. 백업 ZIP과 옆의 `.zip.sha256`을 **이 작업 환경 밖**의 안전한 저장소에 보관해야 환경 초기화에도 남는다.

## 내용

- `virhang-full.bundle`: codex-dev 전체 이력, 원래 커밋 ID 보존
- `virhang-source.zip`: 현재 커밋 소스, Git 메타데이터 없는 검토용 사본
- `all-local-patches/`: 32abcd9 이후 패치 순서
- `previous-preservation-02/`: 이전 파일을 변경 없이 보존
- `verification-reports/`: 알려진 검증 결과만 복사, 실제 DB 데이터 없음
- `MANIFEST.json`, `RESTORE_KO.md`: head/tree, 파일별 SHA256, 독립 복구 검사 결과 및 복구 방법

생성기는 전체 bundle을 임시 빈 폴더에 clone하고 원본 head/tree와 일치하는지 확인한 뒤 ZIP을 만든다. ZIP CRC도 검사한다. 다운로드 후 외부 SHA256과 내부 manifest를 다시 검사한다. MANIFEST 자체는 외부 ZIP SHA256으로 보호되므로 체크섬도 별도로 보관한다.

## 복구

압축을 푼 새 폴더에서 다음을 실행한다. 기존 작업 폴더나 main에 덮어쓰지 않는다.

```sh
git clone -b codex-dev /절대경로/virhang-full.bundle VirHang
git -C VirHang rev-parse HEAD
```

결과를 MANIFEST의 head와 대조한다. Node >=22.8에서 npm ci --ignore-scripts → npm run check → npm test를 실행한다. Git 이력/소스 복구는 오프라인 가능하지만 node_modules는 넣지 않았으므로 의존성 설치에는 네트워크 또는 별도 안전한 npm 캐시가 필요하다.

## 현재 파일 전달 제약

지정된 채팅 산출물 경로 `/codex/browser/projectless/0001-files-mentioned-by-the-user-uploaded-file-pointe/output`는 이 cloud 환경에 없고, 생성 요청도 Permission denied로 실패했다. 일반 업로드/파일 첨부 도구도 제공되지 않는다. 따라서 ZIP을 로컬 writable 영역인 `/workspace/work/`에 만들 수는 있지만 **이 대화에서 다운로드 첨부가 제공됐다고 표시할 수 없다**. 이 환경의 파일 내보내기/다운로드 기능으로 ZIP과 SHA256을 외부에 저장하거나, 첨부 가능한 산출물 경로가 제공된 뒤 복사해야 한다. 경로 문자열만으로 환경 초기화 후 보존이 보장되지는 않는다.
