# 보안 패치 02 — 곡 입력, 개인정보 RLS, 환경별 로그인 제한

2026-10-23 KST · codex-dev · 로컬 검증, 실제 DB/서버 미반영.

## 변경과 보존

기존 커밋 6e831f7/797a8c1과 원래 테스트 33개를 보존했다. 과거 버전 SQL과 patch 01 migration은 수정하지 않는다. 새 migration 3개를 작성했고 프런트는 입력 거부 안내/미디어 파서/삭제곡 공개목록 필터만 보강했다. 기존 디자인과 등록·수정·공동 가수 권한·30초 재집계 규칙은 유지한다.

사용자가 Pages 배포 원본을 확인할 수 없어 이번에는 **원격 푸시 대신 패치 보존**을 선택했다. main/Pages/GitHub 설정은 변경하지 않았다. 확인한 원격 ref는 codex-dev=32abcd9, main=c79ed5f이며 로컬 이전 두 커밋은 아직 원격에 없었다. Pages 조회는 접근 제한으로 실패했으며 배포 소스를 추정하지 않았다.

## 새 migration

| 파일 | 내용 |
|---|---|
| `202610230002_track_validation_and_soft_delete.sql` | DB BEFORE trigger로 곡 입력/변경 주체 검증, immutable ID/등록자/등록시각, 서버 타임스탬프, 직접 DELETE 차단, 제한적 RLS 가드, 삭제곡 재생/랭킹 차단 |
| `202610230003_profile_and_library_privacy.sql` | 회원 테이블 직접 role 변경/삭제 금지, 개인 정보 컬럼 최소화·본인만 조회, 프로필 없는 계정 library 차단, 타회원 library 접근 금지, 가수 내부 검증 UUID 비공개 |
| `202610230004_environment_login_policy.sql` | 비공개 환경 설정/원자적 계정 제한, production 기본 제한, staging 일반 테스트 계정만 선택적 완화, 관리자 항상 제한, limiter 정의 무결성 확인 |

002의 기존 데이터는 일괄 갱신하거나 삭제하지 않는다. 트리거 검증은 이후 INSERT/UPDATE에 적용된다. 이미 잘못된 metadata가 있는 곡은 그대로 soft-delete할 수 있지만 복구/다른 수정에는 값을 고쳐야 한다. 삭제곡의 이력은 남기고, 일반회원/anon 조회와 공개 랭킹에서는 제외한다. SQL 소유자/service_role의 별도 유지보수 권한은 일반 브라우저 권한과 구분한다.

### 입력 정책

| 값 | 허용 범위 |
|---|---|
| 제목/가수 | 공백뿐인 값 거부, 각각 1~80 / 1~50자 |
| 앨범/설명/가사 | 각각 최대 80 / 1,200 / 50,000자, 일반 텍스트 |
| 장르 | 기존 K-POP/J-POP/POP/보컬로이드 |
| 세부 장르 | 기존 9종 값의 배열, 최대 9개, NULL 원소 거부 |
| 종류 | 커버곡/오리지널곡 |
| 영상 | HTTPS의 공식 YouTube/Shorts/live/embed/단축 URL 또는 SOOP 클립/Catch/VOD, 플랫폼 일치 |
| 이미지 | 빈 값 또는 최대 2,000자의 HTTPS URL |
| 원곡 | 빈 값 또는 공식 YouTube URL |

스크립트/HTML 태그 및 비정상 제어문자, URL 내 따옴표·백슬래시·공백·인증정보·임의 포트·위장 도메인·인코딩된 제어문자를 거부한다. 외부 URL이 실제 존재하거나 특정 이미지 형식을 반환하는지는 확인하지 않는다. 브라우저 로컬의 기존 raster data 이미지는 patch 01 renderer에서 계속 지원하지만 공개곡 DB 입력에는 data URL을 허용하지 않는다.

## RLS 점검 결과

- 제공된 users 기본 테이블/실제 배포 스키마가 불완전하므로 원격 전체 보안 완료로 판정하지 않는다.
- 새 정책은 기존 permissive 정책과 OR 결합해 열리는 것을 막도록 RESTRICTIVE guard를 사용한다. users/library의 과거 컬럼별 grant도 제거한다.
- 일반회원은 직접 users.role UPDATE/INSERT/DELETE가 불가하고 가입 트리거는 user_metadata.role을 무시해 viewer로 생성한다. streamer 승격은 patch 01의 관리 RPC만 사용한다.
- 회원은 허용된 본인 프로필 컬럼만 읽는다. 관리자도 직접 타회원 private playlist를 읽을 수 없다. 직원의 회원 조회는 기존 권한 검증 RPC를 사용한다.
- 프로필 없는/NULL 역할 계정은 사적 데이터 쓰기·관리·재생 기록 시작이 거부된다. 공개 곡 둘러보기와 공개 랭킹 조회는 기존대로 허용한다.
- 공동 가수와 등록자의 수정/soft-delete 권한을 유지한다. 복구는 관리자만 허용한다. 검증된 참여 가수 제거는 기존 서버 규칙대로 관리자 확인이 필요하다.
- 가수 이름/credit은 공개하되 verified_user_id/verified_by 같은 내부 UUID는 직접 조회할 수 없게 했다.
- 과거 virhang_tracks/virhang_usernames 등 실제로 존재할 수 있는 다른 테이블·뷰·함수와 함수 owner/BYPASSRLS/role membership은 원격 catalog와 대조해야 한다. 이번 fixture 결과를 그 테이블까지 확장하지 않는다.

## 테스트·운영 로그인 정책

현재 실제 테스트 DB의 의도적인 제한 해제는 이번에 변경하지 않았다. 아래는 승인 후 새 SQL/Edge Function을 반영했을 때의 정책이다.

- production: 모든 계정 15분 5회. 환경값이 없으면 Edge는 production으로 취급한다.
- staging 기본값도 제한. DB 관리자 승인으로 비공개 설정을 staging+developer_bypass로 바꾸면 기존 viewer/streamer 테스트 계정은 반복 로그인 가능하다.
- admin/super_admin, 프로필 없음/NULL 역할/알 수 없는 username은 staging에서도 항상 제한한다. 실제 최고관리자로 테스트하지 않는다.
- `supabase/environment-config/staging-login.example.sql`은 migration 밖의 수동 예시다. 승인된 실제 staging project ref 확인 후에만 사용한다. 세션 확인값은 실수 방지 수단이며 DB 신원 증명이 아니다.
- 환경 표·카운터는 브라우저 및 앱 관리자 role로 조회/수정할 수 없다. 클라이언트가 요청값으로 bypass를 선택할 수 없다.
- login Edge는 DB 환경과 서버 VIRHANG_ENV가 다르거나 limiter fingerprint가 바뀌면 503으로 거부한다. 구버전 무제한 SQL이 함수를 덮어쓰는 경우도 탐지한다.
- 이 방어는 **새 Edge Function과 SQL의 조합**이 있어야 한다. 구버전 Edge로 되돌리거나 고권한 DB 소유자가 전체 정책을 변조하는 상황까지 자동으로 방어한다고 주장하지 않는다.
- Supabase Auth의 직접 이메일/비밀번호 로그인 엔드포인트에는 이 username RPC 제한이 적용되지 않는다. 공급자 자체 rate limit, IP 분산 제한/CAPTCHA, 최고관리자 MFA/AAL2가 별도로 필요하다. 성공 로그인도 기존과 같이 시도 1회에 포함된다.

## 배포 전 검증 도구 — 실행하지 않는 계획만 생성

`config/environments.example.json`을 비추적 `config/environments.local.json`으로 복사하고 **별도로 만든 운영 프로젝트 ref**를 입력한다. 아직 운영 프로젝트를 생성하지 않았으므로 기본 예시는 의도적으로 검증을 통과하지 않는다.

```sh
node scripts/release-plan.cjs production ACTUAL_PRODUCTION_REF config/environments.local.json
```

두 프로젝트 ref가 같거나 대상 환경과 다르면 거부한다. `config/migration-allowlist.json`의 파일명·SHA256과 실제 migration 목록을 대조하고 DEV SQL 추가/파일 변경을 거부한다. 이 명령에는 DB 연결·SQL 실행·배포 기능이 없다. allowlist는 검토 대상 목록이지 사용자의 실제 적용 승인이 아니다. 루트 버전 SQL을 wildcard로 실행하지 않는다.

## 실행한 테스트

기존 33개 유지. `npm run check`, `npm test` 실행. 총 통과/실패 수는 PROJECT_STATUS에 기록한다.

- 실제 SQL을 메모리 PostgreSQL에서 실행: 곡 필드 경계·악성 URL·직접 DELETE·복구·공동 가수·30초 새 재생 반복 집계·타회원 정보/role 조작·기존 permissive 정책·프로필 없음.
- 환경별 계정 제한/관리자 예외 없음/만료/무제한 함수 덮어쓰기 감지, 실제 로그인 핸들러를 mock 경계에서 실행해 503/429 확인.
- 로컬 DOM/미디어 파서와 운영 계획 검증(잘못된 프로젝트·추가 DEV SQL·변경 hash 거부).
- 실제 Deno Edge 배포, JWT/PostgREST, 멀티 연결/IP 동시성, 브라우저 재생 및 원격 RLS는 미검증이다. 단일 연결 PGlite는 분산 부하 검증이 아니다.

비밀값 검사는 값 자체를 출력하지 않는 다음 파이프로 수행한다. 저장소 파일/새 파일 및 32abcd9 이후 보존할 커밋을 검사한다. 패턴 검사는 비밀정보 부재의 완전한 증명이 아니므로 코드 검토도 병행한다.

```sh
set -o pipefail
python scripts/secret-input.py 32abcd9..HEAD | node scripts/secret-scan.cjs --stdin
```

## 승인 후 적용과 복구

1. 원격 구조/정책/grant/함수 정의를 `supabase/verification/security_patch_02.sql`과 대조하고 비공개 구조·데이터 백업 및 복구 지점을 확인한다. baseline/기존 V2.4·V2.6.8·V2.6.9·공동 가수·랭킹 및 patch 01 선행 상태가 필요하다. 문서가 있다는 이유만으로 과거 SQL을 재실행하지 않는다.
2. live 함수/컬럼과 커스텀 RLS가 다르면 먼저 diff를 검토한다. 특히 users 직접 쓰기·추가 private 컬럼 읽기를 쓰는 다른 앱이 있으면 영향이 있으므로 확인한다. lock_timeout 5초/statement_timeout 30초로 잠금을 제한한다.
3. 프로젝트 binding·allowlist·테스트 결과를 검토하고 사용자 승인 후 001(미적용이면)→002→003→004 순서로 **선택한 파일만** 적용한다. 전체 db push/루트 SQL 일괄 실행은 금지한다.
4. staging에서는 확인된 테스트 프로젝트에만 staging 설정을 승인 적용하고, 서버 VIRHANG_ENV=staging과 origin을 설정한 뒤 새 로그인 Edge를 배포한다. SQL만 먼저 적용하면 잠시 일반 계정 제한이 켜질 수 있고, 새 Edge를 SQL보다 먼저 배포하면 503이 발생한다. 사전 점검/점검시간을 정한다.
5. 실제 테스트 계정으로 관리자/공동 가수/개인 library/RLS/로그인 제한과 정상 음악 흐름을 검증한다. 실제 최고관리자 자격 증명을 로그·대화·repo에 넣지 않는다.
6. 실제 브라우저 회귀와 결과 검토 후 별도 승인으로만 main/Pages 또는 향후 운영에 반영한다. 이번에는 푸시/배포하지 않는다.

오류로 트랜잭션이 끝나지 않으면 같은 SQL 세션에서 ROLLBACK한다. COMMIT 후에는 새 정책/함수/권한을 비공개 백업과 비교해 수정 migration으로 복구한다. 데이터 일괄 역변환은 없다. 보안 검사를 없애거나 DELETE/역할 UPDATE를 다시 열어주는 자동 down migration은 제공하지 않는다. staging 로그인에 문제가 생겨도 무제한 DEV.sql 대신 환경/무결성/Edge 버전부터 대조한다. 필요하면 접근을 일시 중단하고 승인된 안전한 버전으로 수정한다.

## 남은 1단계

실제 스키마·RLS/grant/함수 owner 대조와 staging E2E, IP/전역 로그인 방어·Auth 직접 경로 보호, 최고관리자 MFA/AAL2(4단계와 연결), 분산 동시성·부정 재생 검증, 실행 가능한 배포 CI 연동은 대기다. 현 테스트 서버와 운영 프로젝트의 실제 분리는 아직 수행하지 않았다. 다음은 승인된 staging 검증 준비와 환경 분리, 이후 공식 SOOP 문서/권한 확인이다. 권장 추론 수준은 High다.
