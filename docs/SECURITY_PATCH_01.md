# 보안 패치 01 — 관리자 권한 검사와 이미지 XSS

2026-10-23 KST · 브랜치 codex-dev · **로컬 검증 통과 / 실제 서버 미반영**.

## 범위와 변경 파일

- `app.js`: HTTPS/레거시 raster data URL만 사용자 이미지로 허용. 사용자 제공 SVG/HTML/스크립트·인증정보 포함 URL은 기본 표지로 대체. CSS URL 인코딩 + HTML 속성 이스케이프로 artLayer 경계를 보호한다. 자체 표지의 제목/심벌은 XML escape. 기존 라이브러리의 배경/심벌도 동일 문맥에서 보호한다.
- `supabase/migrations/202610230001_admin_null_guards.sql`: 기존 admin RPC 2개와 공동 가수 sync 트리거 함수 1개를 새 migration으로 보강. 과거 버전 SQL/곡/계정/role 값은 수정하지 않는다.
- `supabase/verification/security_patch_01.sql`: 수동 검토용 읽기 전용 catalog 쿼리.
- `tests/admin-rpc.test.cjs`: PGlite(in-memory PostgreSQL)의 가짜 사용자/auth.uid fixture와 기존 V2.6.8/곡/공동 가수 SQL로 함수·권한 회귀검증.
- `tests/artwork.test.cjs`: JSDOM에서 실제 app.js를 실행해 HTML 속성/DOM/CSS·표지·검색 회귀검증. 외부 리소스 요청 및 이미지/이벤트 핸들러 실행은 하지 않는다.
- `scripts/check.cjs`, `package.json`, `package-lock.json`, `.gitignore`: 재현 가능한 로컬 검사와 비밀값/의존성 추적 제외. 추가 패키지는 개발 의존성이며 서비스 페이지에 포함하지 않는다.
- `AGENTS.md`, `docs/`의 상태·백로그·환경·완료 기준·최초 프롬프트 안내: 사용자 최신 8단계 계획과 codex-dev 규칙 반영.

정상 HTTPS 이미지·YouTube 썸네일·자체 표지·기존 raster 업로드 데이터는 유지한다. 디자인/기능을 대규모 변경하지 않는다. 안전하지 않은 이미지 입력은 대체 표지로 표시하므로 데이터가 자동 삭제되지 않는다. 브라우저가 추가 거부하는 이미지 주소도 있을 수 있어 실제 화면 확인은 별도 필요하다.

## 해결 방식

1. 관리자 RPC는 auth.uid 없음, 프로필 없음, NULL/비허용 role을 42501로 거부한다. 클라이언트 role 숨김에 의존하지 않는다.
2. NULL action/가수 이름과 NULL 대상 role도 명시 거부한다. admin/super_admin 계정을 streamer로 바꾸지 못한다.
3. 공동 가수 sync의 관리자 예외는 role이 명시적으로 admin/super_admin일 때만 적용된다. 트리거 함수의 PUBLIC/anon/authenticated EXECUTE를 제거한다. 트리거 자체 실행은 유지한다.
4. 이미지 주소를 그대로 HTML 속성에 조합하던 경로에서 URL 검증·CSS 문자열 직렬화·HTML escape를 각각 수행한다. SVG 제목/심벌은 XML 텍스트로만 들어간다.

기존 취약점 재현에서 프로필 없는 계정은 streamer grant를 호출할 수 있었다. 가수 link는 verified_by FK가 막을 수 있지만 unlink는 통과했고, 프로필은 있으나 role이 NULL인 계정의 link도 통과했다. 패치 후에는 함수 입구에서 이 경로 모두 거부한다.

## 실행한 로컬 검증

요구사항: Node >=22.8, npm. 패키지 설치 때만 npm registry 접근이 필요하다.

```sh
npm ci --ignore-scripts
npm run check
npm test
```

- 정적 문법 검사: 앱 JS 9개 + 콜백 인라인 스크립트 1개, **10개 통과**.
- 회귀 테스트: **33개 통과, 실패/skip 0**.
- DB 18개: 비로그인·UID 없음·프로필 없음·NULL/알 수 없는 역할·viewer/streamer 거부, 관리자 정상 승인/해제, 가수 연결/해제, NULL 입력, 권한 철회, 소유자/공동 가수 RLS, verified credit 제거 차단, trigger EXECUTE/search_path.
- DOM 15개: 속성 탈출·CSS 삽입·스크립트/SVG 주소·제어문자·인증정보 URL 거부, 정상 HTTPS·인코딩·raster·자체 SVG·기존 배경/심벌·공개곡 로드·검색 회귀.
- 동일 migration 2회 실행도 로컬에서 통과한다. 기존 취약 함수로 우회가 재현되는 fixture를 만든 뒤 새 SQL을 적용해 테스트가 결함을 탐지하는지 확인했다.

메모리 DB에는 가짜 UUID/테스트 데이터만 있으며 SUPABASE_URL/service key/실제 관리자 계정을 사용하지 않는다. 실제 Supabase DB·JWT 검증·PostgREST·실행 가능한 브라우저·로그인/YouTube 재생은 이번 테스트에 포함되지 않는다. JSDOM의 DOM 검사와 실제 브라우저 E2E 통과를 혼동하지 않는다.

## 적용 전 위험과 사전 조건

아래는 **사용자 승인 후 수행할 절차**이며 현재 실행하지 않았다.

- 실제 `virhang_users` 기본 스키마·제약·RLS는 저장소에 완전히 없다. 로컬 fixture가 원격 설정과 같다고 가정하지 않는다.
- 대상이 승인된 staging 프로젝트인지 확인하고 현재 Pages/원격 설정을 보존한다. 테스트 계정과 실제 최고관리자를 분리한다.
- V2.6.8 관리자 함수, V3.0 공동 가수 함수/트리거가 이미 있는지 확인한다. 누락 시 migration은 오류로 중단하며 자동 bootstrap하지 않는다.
- 실제 함수 정의/소유자/ACL/정책을 검토하고 승인된 비공개 백업 위치에 보관한다. 원격에 사용자별 커스텀 로직이 있으면 덮어쓰기 전에 diff를 검토한다.
- 새 migration은 함수 정의/실행 권한만 변경한다. 데이터 행 삭제·수정, 사용자/관리자 생성·승격, 로그인 제한 변경은 하지 않는다. 다만 동시 요청에서 DDL 대기·배포 전후 동작 차이가 있을 수 있다. 로그인 주체가 없는 유지보수 SQL도 인증된 참여 가수 제거 시 거부될 수 있으므로 해당 관리 흐름을 확인한다.
- lock_timeout 5초/statement_timeout 30초로 대기를 제한한다. 오류 시 해당 SQL 트랜잭션을 ROLLBACK하고 원인을 먼저 확인한다.
- 과거 SQL 전체를 재실행하면 취약 정의를 덮어쓸 수 있다. 루트 버전 SQL은 이력 참고용이다. DEV 제한 해제 SQL을 운영에 적용하지 않는다. 이를 자동 차단하는 CI/운영 allowlist는 후속 작업이다.

## 승인 후 실제 반영 순서

1. 구조/권한 백업과 복구 지점을 확인하고 최신 테스트를 실행한다.
2. 사용자 승인 후 staging SQL Editor에서 **새 migration 파일 하나만** 검토해 실행한다. 기존 버전 SQL의 일괄 실행·무차별 supabase db push는 하지 않는다.
3. verification SQL의 함수 owner/search_path/EXECUTE와 RLS를 대조한다. 관리자 RPC는 anon=false/authenticated=true, trigger 함수는 두 역할 모두 false여야 한다.
4. 별도 테스트 계정으로 직접 RPC를 호출한다. 프로필 없는 인증 계정/NULL role은 격리된 테스트 데이터로만 구성한다. 정상 관리자·공동 가수 작업, 기존 곡 ID/이력 보존을 확인한다.
5. 프런트 변경은 실제 브라우저에서 정상/악성 이미지·기본 표지·로그인·곡 관리·재생·랭킹을 검증한다. 실제 테스트 사이트 배포도 별도 승인 후 진행한다.
6. 검증 결과 검토 후에만 main 병합/실서비스 반영을 요청한다. codex-dev를 Pages 자동 배포 원본으로 바꾸지 않는다.

## 실패 시 복구

- COMMIT 전 오류: 같은 세션에서 `ROLLBACK;` 후 함수·권한이 원상태인지 확인한다. 실패한 트랜잭션을 임의 COMMIT하지 않는다.
- COMMIT 후 관리자 동작 이상: 관리자 기능을 잠시 격리하고 원인을 확인하는 것이 우선이다. 승인된 DB 관리자만 아래 명령으로 앱 호출을 막을 수 있다(데이터 변경 없음, 관리자 기능 중단 영향 있음).

```sql
BEGIN;
REVOKE EXECUTE ON FUNCTION public.virhang_admin_streamer_account(text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.virhang_admin_link_artist(text,text,text) FROM PUBLIC, anon, authenticated;
COMMIT;
```

- 이후 백업한 정의/ACL과 비교해 **보안 검사를 유지하는 수정 migration**을 작성·검증하고 승인 후 적용한다. 취약한 구버전 SQL의 자동 재적용은 복구 절차로 제공하지 않는다.
- 프런트 장애도 안전한 fallback/이전 안전 버전으로 수정 배포한다. 취약 artLayer로 되돌리는 롤백은 피한다. 새 파일들은 데이터 변경이 없어 데이터 역변환은 없다.

## 검토 결과와 다음 단위

- 기존 곡 권한 helper는 EXISTS 기반으로 프로필 없는 계정을 거부한다. 이번 로컬 fixture에서 소유자·검증된 공동 가수의 수정 권한은 유지됐다.
- 실제 users 테이블 직접 role 변경 보호, 공개 SELECT의 anon/helper EXECUTE 조합, direct DELETE cascade, 삭제곡 랭킹 노출은 미해결·미검증이다. 전체 RLS가 안전하다고 선언하지 않는다.
- 다음: S1-03 서버 곡 입력 검증 + S1-04 실제 스키마/RLS 대조 준비. 그 다음 S1-05 운영 migration 제한/로그인 방어, 환경 분리, SOOP 순서로 진행한다.
