# 1단계 3차 — beohang-test 적용 전 점검·복구 계획

2026-10-23 KST · codex-dev · **실제 배포/DB 적용 승인 전 단계**.

## 판정

현재는 실제 DB 적용 준비 완료가 아니다. 코드/테스트/001~004 검토와 복구 가능한 소스 백업은 준비했지만 실제 프로젝트 구조·권한·백업 복원·Edge 버전을 확인하지 못했다. 새 DB를 처음부터 재현하는 정식 baseline도 저장소에 없다. 이번에는 서비스 JS·CSS·기존 migration을 바꾸지 않고 준비 문서·읽기 전용 catalog SQL·로컬 검증·백업 생성 도구만 추가한다.

## 보존과 GitHub 확인 결과

- 기존 4개 커밋 6e831f7 → 797a8c1 → 01355b3 → 8275ad6 모두 codex-dev의 조상이다.
- 기존 preservation-02의 SHA256SUMS에 있는 파일 9개 전부 일치하고 incremental bundle 검증도 통과했다. 기존 bundle은 32abcd9가 있는 저장소를 요구하므로 환경 초기화용 단독 백업으로는 부족하다.
- 새 복구 ZIP은 codex-dev 전체 이력 bundle, 현재 커밋 소스 ZIP, 전체 로컬 patch, 기존 백업, 무결성 manifest/복구 안내를 담는다. DB 데이터/회원/실제 환경값/node_modules는 넣지 않는다. bundle은 빈 폴더에 오프라인 clone해 head/tree를 확인한다.
- 원격 read-only 조회: codex-dev=32abcd999fcb73b10b639fdf5ad1839c717efac8, main=c79ed5f8c0441b863607c4ef500043ec834d6b98. 작업 시작 당시 로컬은 원격 codex-dev보다 4개 앞서고 원격 전용 변경은 없었다.
- main과 codex-dev 모두 `.github/workflows` 조회는 404였다. 현재 저장소 workflow 파일이 없다는 범위만 확인했다. Pages의 branch/build type, 다른 GitHub App/외부 CI/org ruleset/웹훅 설정까지 없다고 단정하지 않는다.
- Pages API: connector의 지원 GET 경로 밖이라 조회 실패, gh API도 Forbidden. 실제 배포 브랜치 미확인. **따라서 이번에도 push/PR/merge하지 않는다.** main/Pages 설정도 바꾸지 않는다.
- 사용자 확인 위치: GitHub 저장소 Settings → Pages → Build and deployment의 Source, Branch, Folder. Actions → Workflows/최근 실행의 event/ref/배포 작업. 필요하면 Settings의 Rulesets/Installed Apps/Webhooks와 외부 호스팅 Git 연결도 저장소 소유자가 확인한다. 인증정보는 공유하지 말고 source/ref와 실행 조건만 확인한다.
- 안전한 push 조건: Pages가 codex-dev를 보지 않고, push/all branches/reusable workflow/외부 연동이 codex-dev를 배포하지 않는 증거가 확보되어야 한다. 최신 사용자 지시와 secret scan/test/remote ref를 다시 확인하고 codex-dev만 fast-forward push한다. force push·main merge 금지.

## DB 필수 구성과 신규 DB 재현성

### 기본 구조 — 실제 정의와 대조할 항목

| 대상 | 최소 필요 요소 | 현재 저장소 판정 |
|---|---|---|
| Supabase managed auth | auth.users, auth.uid(), anon/authenticated/service_role. 회원 UUID/이메일 인증 상태/username metadata | Supabase 관리 영역. 직접 재생성/복사하지 않음 |
| public.virhang_users | id uuid PK/FK→auth.users, username text UNIQUE·형식, display_name text, role text, updated_at timestamptz. role 허용값 viewer/streamer/admin/super_admin, 직접 role 변경 보호 | **CREATE TABLE baseline 누락**. PK/FK/UNIQUE/NULL/CHECK·RLS·owner·컬럼 grant를 확인해야 함 |
| 기존 로그인 | virhang_check_login_limit(text) bool, service_role 실행권한. 기존 제한 함수가 사용하는 경우 virhang_login_attempts(username UNIQUE,attempt_count integer,window_started timestamptz) | legacy attempts 테이블 생성 정의 누락. 현재 함수가 no-op인지/이전 limiter인지 미확인 |
| 회원 library | user_id PK/FK, likes/playlists jsonb 배열, updated_at. own SELECT/INSERT/UPDATE permissive 정책 | V2.4 파일 있음. 중복 재실행/타회원 공개 정책 잔존 여부 확인 |
| 공개곡 | id/created_by/created_at/updated_at, title/singer/album/platform/source_url/artwork_url/genre/details/song_type/description/lyrics/original_url | V2.6.9 파일 있음. 실제 컬럼/타입·role helper·RLS 대조 |
| 공동 가수 | artist identities/credits, 검증 사용자·검증자 FK, is_deleted/deleted_at, sync trigger·권한 helper·가수 연결 RPC | V3 joint SQL 파일 있음. 기존 credit와 삭제 상태 보존 필요 |
| 랭킹 | rank_listens의 PK/FK/time/index/RLS 및 rank_start/finish/get | V3 ranking 파일 있음. CASCADE/실제 이력·함수 owner 대조 |
| 004 이후 비공개 로그인 | virhang_private.login_security와 login_attempts, 보안 RPC 2개, service_role만 실행 | 004가 생성. legacy public attempts는 삭제하지 않고 보존 |

users의 created_at/email/추가 소개 컬럼은 실제 제품/스키마에 있을 수 있지만 이번 SQL이 기본값을 추정하지 않는다. 특히 003은 users의 id/username/display_name/role/updated_at SELECT만 허용하므로 다른 앱의 직접 조회 영향도 확인한다.

### 파일 의존성

이 표는 자동 실행 목록이 아니다. 실제 DB에 이미 있으면 정의를 비교하고 누락/차이만 별도 migration으로 해결한다.

1. 검토된 users baseline 및 Supabase Auth 역할/UID 함수가 먼저 필요하다. 기존 로그인 유지에 필요한 함수/legacy attempts도 확인한다.
2. V2.4 library, V2.6 signup trigger(viewer 고정), V2.6.8 관리자 RPC, V2.6.9 공개곡/RLS를 구조와 대조한다. 오래된 V2.5 usernames 방식은 V2.6과 별개이며 일괄 적용 금지.
3. 공개곡 후 V3 joint identities/credits/sync/삭제 컬럼/권한 helper, V3 ranking events/RPC가 필요하다. 현재 원본 ranking SQL의 finish와 ALLOW_REPLAYS는 같은 내용이므로 중복 적용하지 않는다.
4. **001**: 기존 admin_streamer_account, admin_link_artist, sync_song_singers를 교체. users·가수 테이블과 관련 타입/인자명이 맞아야 한다.
5. **002**: 001 및 공개곡/가수 helper/삭제 컬럼/랭킹을 전제로 BEFORE trigger·직접 DELETE 금지·제한적 정책·rank RPC를 교체한다.
6. **003**: users/library/artist identities 및 기존 own permissive library 정책이 필요하다. restrictive guard만으로 접근을 허용하지 않으므로 permissive own 정책의 존재도 확인한다. table 및 legacy column grant 제거 영향 검토.
7. **004**: users와 Supabase 역할이 필요하다. 새 private counter/config와 보안 RPC를 생성하고 기존 login-limit RPC를 같은 signature로 교체한다. production strict 기본값이다.
8. staging 완화 예시는 migration 밖에서 승인된 테스트 프로젝트에만 적용한다. 루트 DEV 제한 해제 SQL을 실행하지 않는다. production에는 완화 예시를 포함하지 않는다.

**신규 DB 판정: 현재 저장소만으로 완전 재현 불가.** 로컬 테스트는 users/auth/roles baseline을 fixture로 직접 만들고 시작한다. fixture는 고의로 취약한 legacy grant/테스트 데이터도 넣으므로 운영 bootstrap으로 복사하면 안 된다. 실제 schema를 확보한 뒤 개인정보 없이 baseline을 작성하고, 격리 DB에서 empty→baseline→001~004 전 과정을 시험해야 한다. 이번에는 추정한 production baseline을 추가하지 않았다.

## 실제 DB를 조회할 수 없을 때 사용자 확인 목록

프로젝트 관리자만 확인하고, 비밀값·회원 행·auth 덤프를 대화/Git에 붙이지 않는다.

- [ ] 실제 staging project ref/조직/region/소유 권한과 현재 사이트가 참조하는 URL. 코드의 hjvsbfphlnukmdkfbtsh가 실제 대상인지 Dashboard에서 확인.
- [ ] 현재 공개 키가 코드 placeholder인지 실제 배포본에서 별도 공급되는지 확인. 공개 키와 secret/service_role 구분.
- [ ] `supabase/verification/security_preflight_03.sql`을 확인된 프로젝트 SQL Editor에서 수동 조회: 테이블/컬럼/constraint 이름·FK 대상/RLS/grant/함수 owner·EXECUTE/search_path/trigger/DB role membership. 읽기 전용이며 함수 body·계정 데이터는 반환하지 않는다.
- [ ] constraint 실제 정의, username UNIQUE/형식·role CHECK/NULL, extra policies/views/functions의 효과는 Dashboard에서 비공개 검토. catalog 목록만으로 안전 판정하지 않음.
- [ ] Edge 현재 코드 버전·function name·Verify JWT 정책·환경변수 **이름과 설정 여부**, SMTP/이메일 인증/OTP/URL redirect/CAPTCHA/Auth rate limit. 실제 값은 secret manager에 유지.
- [ ] legacy usernames/virhang_tracks 등 저장소 밖 테이블, 공개 RPC, SECURITY DEFINER owner/BYPASSRLS/기본권한 및 함수별 검색 경로.
- [ ] 기존 회원·곡·credit·library·완료 청취 이력의 수량/참조 무결성·복구 지점. 샘플 행은 공유하지 않음.
- [ ] 백업의 Auth/Storage 포함범위·복원가능 시점·RPO/RTO, 가용 복구 권한, 복원 연습 결과.
- [ ] 운영 project ref/도메인/OAuth/메일은 아직 별도 준비 중. 테스트 DB 복제 시 개인정보 제거·회원 이전은 별도 승인.

현재 도구에는 실제 Supabase 연결 자격 증명이 구성되지 않아 위 원격 점검은 하지 않았다. secret 값을 채팅으로 요청하지 않는다.

## 로그인 중단을 피하기 위한 적용 순서 (사용자 승인 후에만)

제로 다운타임을 검증했다고 주장하지 않는다. 기존 회원을 삭제/재가입시키거나 비밀번호를 초기화해서 전환하지 않는다.

1. 변경 전 DB/권한/Edge 버전·서버 secret binding 이름·현재 소스/호스팅 버전을 비공개 보존한다. 점검 시간·담당자·중단/복구 기준을 정하고 격리된 복원 DB에서 rehearsal한다.
2. 실제 users baseline 및 기존 001~004 적용 여부를 확인한다. 함수 signature/return type/컬럼/owner가 다르면 중단한다. 단순히 파일이 있다는 이유로 옛 SQL을 실행하지 않는다.
3. 승인된 staging에서 필요한 001→002→003을 적용하고, 각 단계에서 기존 로그인(이름→UUID 조회 및 Auth 인증), 정상 곡 관리·공동 가수·private library를 별도 테스트 계정으로 검증한다.
4. 기존 로그인 Edge를 유지한 상태에서 004를 먼저 적용한다. 기존 Edge도 동일한 bool limiter RPC를 계속 호출할 수 있는지 rehearsal에서 확인한다. 004 직후에는 일반 테스트 계정도 5회 제한이 켜질 수 있다.
5. Dashboard의 staging project ref를 재확인한 뒤 같은 점검 시간에 staging 완화 설정을 승인 적용한다. 환경·개발 완화 여부·함수 fingerprint가 의도와 맞는지 확인한다. 관리자/최고관리자는 계속 제한된다. 운영에서는 완화를 사용하지 않는다.
6. 서버 secret manager에 VIRHANG_ENV=staging와 정확한 Origin을 준비한다. Supabase runtime binding을 다른 프로젝트 키로 교체하지 않는다. 프런트 설정은 아직 건드리지 않는다.
7. 가능하면 새 소스를 후보 함수명(예: virhang-username-login-next)에 **별도 배포 승인 후** 올려 먼저 테스트한다. 새 Edge가 먼저 활성화되어 policy RPC가 없거나 환경이 다르면 503이 되므로 순서를 뒤집지 않는다. 실제 Deno bundle/dependency/JWT 설정 검증도 필요하다.
8. 후보 테스트가 통과한 뒤 별도 승인으로 기존 virhang-username-login에 새 코드를 반영한다. 정상 로그인·잘못된 비밀번호·관리자 제한·환경 불일치 503을 확인한다. 테스트 토큰/비밀번호를 로그에 남기지 않는다.
9. 실제 브라우저에서 기존 사이트 기능을 확인한 후 프런트 패치를 승인 배포한다. 프런트가 참조하는 공개 키/URL도 실제 배포 값으로 검증한다. main merge는 이번 범위에서 금지이며 따로 승인되지 않았다.
10. 기존 회원 ID·등록자·가수 연결·청취·library 보존, 오류율/429/503·메일 문제를 점검하고 승인 체크리스트에 결과를 기록한다.

### 중단/복구 기준

- baseline/프로젝트/backup restore 증거가 없으면 시작하지 않는다. RLS 타회원 누출, 관리자 우회, 일반 테스트 로그인 503, 예기치 않은 회원/곡/이력 변화가 있으면 다음 단계로 진행하지 않는다.
- SQL COMMIT 전 실패는 같은 세션 ROLLBACK 후 상태를 비교한다. 적용 파일/단계별 검증 결과를 기록한다.
- 새 Edge만 문제가 있으면 승인된 이전 Edge 버전을 복원하되 새 strict DB limiter는 유지할 수 있는지 rehearsal에서 확인한다. DEV.sql을 복구 수단으로 쓰지 않는다.
- 정책/함수 이상은 원인에 맞는 수정 migration으로 보안 가드를 유지하며 복구한다. 직접 DELETE/role UPDATE를 다시 열지 않는다. 코드 롤백은 DB·저장 이력까지 되돌리지 않는다.
- 데이터 손상이 있으면 쓰기를 제한하고 사전 backup/PITR의 격리 복원본을 먼저 검증한다. 운영/테스트 DB를 무작정 과거 시점으로 덮으면 그 이후 가입·등록·청취가 사라질 수 있어 데이터 손실 범위와 승인 후에만 복구한다.
- 실제 DB backup은 이 소스 ZIP에 없다. Storage 객체, Auth, Edge 설정·메일/OAuth 설정, 브라우저 localStorage의 이어듣기/즐겨찾기 등은 각각 백업·이전 범위를 확인한다.

## 테스트/정식 환경 차이

| 항목 | beohang-test | 향후 VirHang / 버항 |
|---|---|---|
| 사이트 | 기존 테스트 사이트·현재 호스팅 보존 | 독립 호스팅/공식 origin, 도메인 확정 전 |
| 코드 | codex-dev 로컬 개발, Pages/Actions 확인 후 push 판단 | 검증된 release만 별도 승인 반영 |
| DB/Auth | 기존 테스트 회원/데이터 보호, 현황 검증 후 staging 지정 | 신규 Supabase 프로젝트, 실제 계정·Storage 별도 |
| 로그인 | 테스트 viewer/streamer만 선택적 완화, 관리자 제한 유지 | 계정/IP/전역 제한·CAPTCHA·관리자 MFA 필수 |
| OAuth/메일 | 승인된 테스트 앱/callback/SMTP | 별도 운영 앱/callback/키/메일 |
| 비밀값·백업 | staging 전용 secret manager/비공개 백업 | 운영 전용 secret/접근권한/복구 절차 |

같은 github.io 출처에서 경로만 나누는 것은 완전한 브라우저 격리가 아니다. 운영은 독립 origin을 권장한다. 원본 beohang 이벤트·저장 키를 일괄 치환하지 않는다.
