# 1단계 5차 — 실제 구조 대조와 migration 실행 검증

기준: b33e5d9 이후 codex-dev. 실제 Supabase/회원/Pages는 변경하지 않았다. 아래 실행 기록은 합성 데이터의 격리 PGlite DB와 오프라인 Chromium 결과다. 실제 DB 호환성 판정은 공유용 catalog 보고서 수신 전까지 대기다.

## 사용자: 지금 실행할 SQL과 정확한 순서

현재 migration 001~004나 staging 설정 UPDATE는 실행하지 않는다. 테스트 회원 생성·실제 최고관리자 로그인도 이번 수집 단계에는 필요 없다.

1. Supabase Dashboard에서 현재 beohang-test가 사용하는 프로젝트인지 확인한다. 소스의 URL은 hjvsbfphlnukmdkfbtsh.supabase.co지만 실제 연결 대상이라고 단정하지 않는다. 프로젝트 ref만 확인하고 API secret·비밀번호는 공유하지 않는다.
2. SQL Editor → New query. `supabase/verification/security_shareable_05.sql` 파일 전체를 복사해서 **이 쿼리만 실행**한다. 단일 WITH/SELECT이고 데이터 변경·계정 조회가 없다. 실제 회원 행/이메일/UUID·토큰/비밀키·정책 조건식/함수 본문/설정값은 조회·반환하지 않는다.
3. 결과의 `virhang_shareable_report` 셀 JSON만 복사한다. 이 JSON을 채팅에 붙여넣으면 실제 구조와 소스 계약을 비교할 수 있다. SQL Editor의 회원 테이블 화면·Auth 사용자 목록·전체 설정·raw 덤프는 보내지 않는다.
4. 직접 상세 점검이 필요하면 별도 New query에서 `supabase/verification/security_preflight_03.sql` 전체를 실행한다. BEGIN READ ONLY + catalog SELECT + COMMIT이며 회원 데이터 테이블을 읽거나 DDL/DML/관리 RPC를 실행하지 않는다. 현재 버전은 raw proconfig를 내보내지 않고 빈 search_path/기타 설정 존재 여부만 표시한다. 상세 결과는 Dashboard에서 비공개 검토하고 공유는 05 보고서만 사용한다.
5. 에러가 나면 SQLSTATE와 민감값을 지운 에러 문구만 공유한다. 전체 요청 헤더/계정 행/연결문자열을 보내지 않는다. 트랜잭션이 남아 있다고 표시되면 같은 세션에서 ROLLBACK으로 읽기 전용 점검만 종료한다.

SQL Editor가 JSON export를 `[{'virhang_shareable_report': ...}]` 형태로 내보내도 비교 도구가 처리한다. 로컬 실행 시 결과는 Git에서 무시되는 `work/live-schema-report.json`에 저장한다.

```sh
node scripts/db-compatibility.cjs work/live-schema-report.json
```

이 명령은 파일만 읽고 DB에 접속하지 않는다. `schemaPreconditions=catalog-compatible-only`여도 **적용 승인/안전 판정이 아니다**. 정책 조건식·함수 본문/owner 권한·기존 데이터 형식·실제 Auth/Edge·백업 복구를 확인해야 한다. 누락 컬럼/다른 타입/인자명·반환형 변경/기본 트리거 누락은 `blocked`로 표시한다. 임의로 테이블을 삭제하거나 타입을 바꾸지 않는다.

보고서의 `columns`는 필요한 컬럼의 타입만 포함한다. 알 수 없는 도메인/타입 이름은 other-type-review-privately로 가린다. SQL을 임의 수정해 SELECT * FROM 회원 테이블이나 함수 본문 조회를 추가하지 않는다.

## 비교 범위와 한계

- users: id/username/display_name/role/updated_at, PK·username 유니크·Auth FK, RLS/직접 UPDATE/anon 조회 권한. role CHECK/NULL 및 실제 참조 대상 컬럼/상세 권한은 비공개 정의 검토도 필요하다.
- 공개 음악 18개 필드, 가수 identity/credit, library JSON, rank_listens의 필수 타입을 `config/db-contract.json`과 대조한다. 플레이리스트는 현재 소스에서 별도 playlist 테이블이 아니라 virhang_account_libraries.playlists JSON이다.
- legacy login_attempts와 새 private login 정책/카운터의 존재를 기록한다. 회원/로그인 시도 값 자체는 읽지 않는다.
- 관리자·역할 helper·랭킹·가입 trigger 등 RPC의 signature, 기존 인자명·반환형 호환 여부, SECURITY DEFINER, 빈 search_path와 anon/authenticated/service_role EXECUTE를 수집한다.
- 기존 signup/singer sync와 새 write trigger의 활성화·바인딩 함수·기본 event 타입을 확인한다. trigger WHEN 조건/UPDATE OF 세부 조건까지 같다는 뜻은 아니다.
- policy_count/restrictive_policy_count는 정책의 의미를 증명하지 않는다. rank_listens는 직접 읽기 없이 RPC만 쓰므로 정책 0개가 의도적일 수 있다. 정책 USING/WITH CHECK, view/기타 RPC와 owner/BYPASSRLS는 비공개 검토가 필요하다.
- 추가 virhang_tracks/virhang_usernames/virhang_playlists가 있으면 legacy 경로 별도 점검을 표시한다. 존재하지 않는다고 새로 만들지 않는다.
- 신규 DB의 users/legacy attempts 기본 생성 스키마는 여전히 누락이다. 테스트 fixture를 production baseline으로 복사하지 않는다.

## 실제 수행한 적용 예행연습

`node scripts/rehearse-migrations.cjs` 또는 `npm run rehearse`로 재실행 가능하다. 외부 URL/키/실제 계정을 받지 않는 합성 메모리 DB 전용 명령이다. 배포 명령은 없다.

| 보존 대상(합성) | 기존 행 수 | 001 직후 | 002 직후 | 003 직후 | 004 직후 |
|---|---:|---|---|---|---|
| auth.users | 8 | 동일 | 동일 | 동일 | 동일 |
| virhang_users | 7 | 동일 | 동일 | 동일 | 동일 |
| account_libraries | 1 | 동일 | 동일 | 동일 | 동일 |
| published_tracks | 2 | 동일 | 동일 | 동일 | 동일 |
| artist_identities | 3 | 동일 | 동일 | 동일 | 동일 |
| song_singers | 6 | 동일 | 동일 | 동일 | 동일 |
| rank_listens | 1 | 동일 | 동일 | 동일 | 동일 |
| legacy login_attempts | 1 | 동일 | 동일 | 동일 | 동일 |

행 수만 센 것이 아니라 각 테이블의 **행 전체 JSON을 정렬해 deep equality**로 비교했다. 계정 UUID·role·곡 ID·가수 연결·플레이리스트/좋아요·청취 시각/이벤트 ID·기존 로그인 counter가 같았다. 새 private 로그인 테이블은 의도된 신규 구조이며 보존 비교 대상의 legacy 테이블을 대체·삭제하지 않는다.

- 최고관리자(super_admin) role과 관리자 RPC 호출 권한이 유지됐다. 실제 최고관리자 자격 증명은 사용하지 않았다.
- 001~004 원본 파일의 SHA256을 기존 allowlist와 대조한 뒤 순서대로 실행했다. 기존 migration을 수정하지 않았다.
- display_name이 다른 이름인 비호환 DB에서 003을 실행하면 42703이 발생했다. ROLLBACK 후 회원 행과 기존 grant가 그대로이고 새 helper가 부분 생성되지 않은 것을 검증했다. 따라서 실제 보고서 대조를 생략하면 안 된다.
- 비어 있는 Supabase 유사 스키마는 기존 admin SQL만으로 bootstrap할 수 없고, 001도 선행 함수 누락을 명시 거부하는 기존 테스트를 유지했다.

## 로그인 배포 순서 — 실행한 결과

SQL RPC는 격리 DB의 실제 PostgreSQL 함수이고, Supabase Auth getUserById/signInWithPassword·JWT 발급은 가짜 응답으로 모의했다. 이 결과는 실제 Deno/메일/네트워크 로그인 성공 판정이 아니다.

| 단계 | 결과 |
|---|---|
| SQL 전, 이전 Edge 소스 + 개발용 기존 limiter | 200 |
| SQL 전, 새 Edge를 먼저 활성화 | 503 재현 |
| 각 001/002/003/004 직후, 이전 Edge | 매 단계 200 |
| 004 후 DB production 기본값 + 새 Edge staging 설정 | 503 재현 |
| 격리 DB staging 설정을 맞춘 뒤 새 Edge | 200 |
| 잘못된 비밀번호 | 401 |

이전 Edge는 Git 32abcd9의 원본 소스를 테스트 fixture로 고정했다. 원격에 배포된 실제 소스와 같다고 가정하지 않는다. 실제 적용 때는 현재 원격 Edge 버전을 먼저 확보·대조한다.

### 승인 후 실제 적용 순서

1. 공유 보고서 대조 → 비공개 정책/함수 정의 확인 → 실제 백업과 격리 복원 확인 → 적용 대상 project ref와 점검 시간 승인. 기존 회원·최고관리자/테스트 계정 분리 확인.
2. 필요한 기존 baseline/가입 trigger/library/공개곡/가수/랭킹 정의를 확인한다. 누락은 별도 검토하며 과거 SQL을 일괄 실행하지 않는다.
3. 기존 Edge를 유지한 채 **001 → 002 → 003 → 004**를 승인된 파일 단위로 적용한다. 각 COMMIT 후 로그인/권한/기존 데이터 보존을 확인한다. 004에는 production strict 기본값이 있어 일반 테스트 계정 제한이 잠시 켜질 수 있다.
4. Dashboard로 확인한 staging에만 승인된 완화 설정을 적용한다. 원래 의도한 테스트 viewer/streamer 편의는 유지하되 관리자/최고관리자 제한을 해제하지 않는다.
5. 서버 secret manager에 `VIRHANG_ENV=staging`, 정확한 Origin을 설정한다. 현재 GitHub Pages가 https://yeon0903.github.io/beohang-test/이면 Origin은 **https://yeon0903.github.io**다(경로/끝 슬래시 제외). Supabase runtime binding과 다른 프로젝트 키를 섞지 않는다.
6. 후보 로그인 함수에 새 코드와 login-policy.mjs를 승인 배포해 먼저 검증한다. 실제 Deno import/JWT 설정·메일/세션·429/503 확인 후 활성 이름 virhang-username-login으로 전환한다. SQL/policy 준비 전에 새 Edge를 활성화하지 않는다.
7. 브라우저 실제 테스트 계정으로 확인한 후 프런트 배포를 별도 승인한다. codex-dev push는 Pages 배포가 아니며 main/Pages 변경은 현재 승인 범위 밖이다.
8. 원래 회원·곡/credit/library/청취 이력, 로그인 오류율/권한 차단 결과를 기록한다. 삭제·초기화·재가입/비밀번호 초기화를 전환 수단으로 쓰지 않는다.

### 문제가 생길 때

- 적용 전 compatibility blocked, 백업 미검증, 대상 프로젝트 불명확이면 중단한다.
- COMMIT 전 에러는 같은 세션 ROLLBACK 후 객체/권한/데이터를 비교한다. 003 실패 후 ROLLBACK은 로컬에서 재현했다.
- COMMIT 후 이상은 다음 단계·프런트 전환을 중단하고 승인된 수정 migration으로 해결한다. 과거 취약 SQL/DEV 제한 해제 SQL을 복구용으로 재실행하지 않는다.
- 새 Edge만 실패하면 사전 검증된 이전 Edge로 복원하되 강한 DB limiter를 유지한다. 이전 Edge가 새 SQL과 호환되는지 원격 소스/격리 rehearsal로 먼저 확인해야 한다.
- 데이터 손상이 의심되면 쓰기를 제한하고 백업을 별도 DB에 복원해 검증한다. 단순 과거시점 덮어쓰기로 이후 가입/등록/청취를 잃지 않도록 손실 범위·승인을 확인한다.

## 실제 브라우저 실행과 남은 검증

이번 환경의 Chromium 154에서 `npm run test:browser` **8개 통과**, 페이지 오류 0개. Playwright-core는 개발 의존성만 추가했고 서비스 번들에 넣지 않았다. 모든 앱 요청을 라우트로 가로채며 외부 서비스 호출은 차단했다.

실행한 항목: 홈/곡 목록/검색/랭킹 탭, 메일을 보내지 않는 OTP 화면 이동, 손님 관리 버튼 숨김(UI만), 악성 artwork의 주입 요소/실행 없음 및 기본 SVG 표시, 실제 Supabase client 생성 없음.

실제 staging에서 승인 후 확인할 항목:
- 테스트 viewer/streamer/공동 가수/admin/최고관리자 및 프로필 없는 계정의 직접 PostgREST/RPC 허용/거부.
- 본인 library 저장·새로고침·계정 전환, 타회원 조회/수정/role 변경 거부.
- 관리자·공동 가수의 정상 등록/수정/soft-delete, 관리자 복구, 원래 곡 ID/이력 보존.
- 실제 가입/OTP/로그인/세션 갱신/로그아웃, Origin/CORS·네트워크 실패·서버 429/503.
- YouTube 실제 30초/일시정지/탐색/새 재생 반복 집계. SOOP 외부 시청을 임의 집계하지 않음.
- 실제 최고관리자 자격 증명을 쓰지 않는 별도 테스트 최고관리자로 role/AAL/MFA와 직접 Auth 경로 확인.

최고관리자 MFA 강제·IP/전역 제한·Supabase Auth 직접 password endpoint 우회 방지·감사 로그는 아직 미구현/미검증이다. 현재 역할 검사만으로 MFA 보호까지 끝났다고 표시하지 않는다.

## 재실행 명령과 산출물

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run rehearse
# 설치된 Chromium 필요. 기본 /usr/bin/chromium, 다른 경로는 VIRHANG_BROWSER_EXECUTABLE 지정.
npm run test:browser
```

이번 검증은 기존 164개를 유지하고 10개를 추가하여 **174개 통과, 실패/skip 0**. 브라우저 8개는 별도다. 상세 로컬 출력은 work 영역에만 보관하고 실제 사용자 보고서를 Git에 커밋하지 않는다.
