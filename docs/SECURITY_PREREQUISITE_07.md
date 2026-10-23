# 1단계 7차 — 강화된 공동 가수 선행 migration 000

## 이번에 완성한 코드

`supabase/migrations/202610230000_joint_singer_prerequisites.sql`을 새로 작성했다. 001~004는 원본 바이트와 SHA256을 유지한다. **실제 Supabase/Edge/Pages는 변경하지 않았으며 실제 적용 승인은 별도다.** 화면·디자인·서비스 JS도 변경하지 않았다.

사용자가 확인한 06 결과(최고관리자 존재, 유효한 역할/아이디, role NOT NULL/CHECK/viewer 기본값, 고아 프로필 없음, 음악 등록자/가수 무결성, 기존 definer RLS 접근 및 service_role 조회 권한)를 격리 fixture에 반영했다. Auth-only 계정과 회원→Auth FK 부재도 그대로 재현했다. 새로운 테이블 외의 실제 행/계정은 수집하지 않았다. 원격 함수 본문/정책 조건식·실제 Deno/Auth 서비스가 모두 검증됐다는 뜻은 아니다.

| 수정 파일 | 이유 |
|---|---|
| migrations/202610230000_joint_singer_prerequisites.sql | 누락 구조 추가·INSERT-only credit backfill·첫 COMMIT부터 보안 적용 |
| config/migration-allowlist.json | 원본 4개 hash 유지, prerequisites에 000 hash 추가. 실행 승인/자동 적용을 의미하지 않음 |
| scripts/release-plan.cjs | prerequisites → migrations 순서의 executionOrder를 검토용 결과에 표시 |
| scripts/rehearse-prerequisite.cjs | 확인된 모형에서 실제 000~004 파일을 각각 COMMIT하며 보존/로그인/중간 권한 검증 |
| verification/security_prerequisite_07.sql | 적용 후 읽기 전용 boolean 점검. 실제 행/UUID/설정 비밀값을 반환하지 않음 |
| tests/helpers/live-shape-db.cjs | 기존 06 재현 기본값은 유지하고 확인된 제약·grant fixture를 선택적으로 추가 |
| tests/helpers/login-rehearsal.cjs | service_role 실제 컬럼 권한 경유 조회 및 미인증 메일 응답 시험 옵션 |
| tests/prerequisite-07.test.cjs | 신규 40개 보안·보존·가입 흐름·롤백 테스트 |
| package.json 및 상태/백로그/완료 기준 문서 | 새 rehearsal 명령과 검증 범위/미완료 사항 기록 |

## 000의 변경 범위와 데이터 보존

- `is_deleted boolean NOT NULL DEFAULT false`, `deleted_at timestamptz`를 없을 때만 추가한다. 기존 ID/등록자/가수 문자열/등록·수정 시각을 UPDATE하지 않는다.
- artist_identities와 song_singers, PK/unique/FK/index를 추가한다. 기존 singer를 구분자 `[,，、·]+`로 나눠 새 표에 **INSERT ... ON CONFLICT DO NOTHING**만 수행한다. 기존 credit, 검증 연결/검증자/시각, 수동 추가 credit를 수정·삭제하지 않는다.
- 검증 회원 UUID는 새 identity에서 NULL이다. 이름이 같아도 회원 조회로 자동 연결하거나 role을 승격하지 않는다. 연결/해제는 승인된 관리자의 명시적 RPC로만 가능하다.
- 새 credit의 FK는 곡/기존 프로필/identity를 참조한다. **virhang_users.id→auth.users.id FK는 추가하지 않는다.** Auth/profile/library/rank_listens/legacy tracks/playlists/login_attempts의 기존 행에는 쓰지 않는다.
- Auth-only 계정은 그대로 둔다. 계정 정리·새 프로필 생성·비밀번호 변경·최고관리자 교체는 하지 않는다.

기존 객체가 있으면 타입/NULL 허용/PK/검증 계정 unique/FK 대상 및 삭제 동작/index/soft-delete 상태를 확인한다. 다른 정의는 임의 교정하지 않고 전체 트랜잭션을 중단한다. PK/username unique, 기본 컬럼 타입, 현재 profile/가수/등록자 무결성, service 조회 권한도 실행 중 확인한다. 미확인 추가 track/credit trigger, 잘못된 기존 trigger 바인딩, 일부 definer의 부적절한 owner 권한도 중단 사유다. DB에 이미 추가 정책·view·다른 RPC가 있다면 별도 비공개 검토가 필요하다.

## 단독 COMMIT에도 안전하게 설계한 이유

기존 검증 컬럼에 DEFAULT가 있으면 가수 생성만으로 계정이 연결될 수 있으므로 000은 해당 상태를 거부한다. 생성 컬럼도 허용하지 않는다. 이 동작과 기존 데이터 보존을 별도 테스트했으며, 임의로 DEFAULT를 제거해 적용을 강행하지 않는다.

파일에는 **바깥 BEGIN 1개, 최종 COMMIT 1개**만 있다. 옛 V3.0_JOINT_SINGERS_LATE_SIGNUP.sql을 호출하거나 중간에 커밋하지 않는다.

- hardened admin_streamer_account/admin_link_artist/sync_song_singers를 처음부터 설치한다. 미인증·프로필 없음·NULL 역할·일반회원의 관리 요청을 명시 거부한다. 최고관리자의 권한을 streamer RPC로 변경할 수 없다.
- 001/002의 검증된 보안 정의를 의도적으로 앞당겨 포함했다. 중복 이유는 000이 먼저 커밋돼도 검증되지 않은 새 쓰기 경로나 옛 취약 함수가 공개되지 않게 하기 위해서다. 뒤의 001/002를 수정하지 않고 재실행할 수 있다.
- can_manage_published_track는 실제 DB의 곡 등록자/검증 credit를 읽는다. 인자로 자기 UUID를 owner처럼 넘겨 권한을 얻을 수 없다. streamer 본인 곡·관리자·관리자가 연결한 공동 가수의 정상 수정은 유지한다.
- 곡 입력 BEFORE trigger와 제한적 RLS를 설치한다. 악성/과도한 입력, ID/등록자 변조, 비정상 복구를 거부한다. 잘못된 과거 메타데이터는 삭제/정규화하지 않으며 내용 수정 없이 소프트 삭제하는 경로는 유지한다.
- authenticated/anon의 실제 DELETE/TRUNCATE grant를 철회하고 restrictive DELETE=false 정책을 둔다. 기존에 permissive DELETE 정책이 남아 있어도 클라이언트 물리 삭제는 허용되지 않는다. SQL owner/service_role 유지보수는 별개의 신뢰 경계다.
- identity는 artist_key/display_name만 공개하고 검증 UUID/검증자/시각은 비공개다. credit 직접 쓰기 및 trigger 함수 RPC 실행도 차단한다.
- soft-delete된 곡의 새 재생 집계/공개 랭킹 제외는 002와 같은 함수로 먼저 적용하되 기존 청취 행은 변경하지 않는다. library/profile privacy 강화는 후속 003에서 적용된다.

000은 기존 로그인 limiter/Edge를 바꾸지 않는다. 기존 개발용 로그인 정책은 004에서 강화된다. 최고관리자 MFA·IP/전역 제한이 000만으로 해결되는 것은 아니다.

## 실제 실행한 격리 검증

PGlite(메모리 PostgreSQL)와 합성 데이터만 사용했다. 확인된 NOT NULL/CHECK/viewer 기본값·service_role SELECT 권한을 반영했으며 Auth-only 계정은 유지했다. 실제 메일·password/JWT 발급은 모의 응답이다.

1. **000 → 001 → 002 → 003 → 004를 파일별로 따로 COMMIT**했다. 각 경계에서 관리자 거부·검증 UUID 비공개·클라이언트 DELETE 불가를 확인했다. 거대한 외부 트랜잭션으로 취약한 중간 상태를 숨기지 않았다.
2. 각 단계마다 기존 8개 표의 모든 기존 필드/값을 정렬 JSON으로 비교했다. 회원·최고관리자 역할/ID, 곡 ID/등록자/singer/시각, library JSON, 완료 청취 이력, legacy 표 값이 동일했다. 곡의 새 2개 컬럼만 비교에서 제외하고 false/NULL 기본값은 별도 검사했다.
3. 수동 가수 연결을 만든 뒤 전체 000~004를 재실행해 검증 UUID/시각·원래 데이터·staging 설정이 유지됨을 확인했다. singer에 없는 수동 credit도 000 재실행으로 삭제되지 않았다.
4. 관리자/스트리머/검증 공동 가수의 정상 동작과 일반회원·타회원·프로필 없음·주입한 NULL role의 거부를 확인했다. 악성 이미지·영상 URL/설명·잘못된 장르·과도한 길이를 거부했다.
5. 최종 COMMIT 직전 0 나눗셈 실패를 주입했다. ROLLBACK 후 새 객체/정책/grant와 교체 함수까지 원래 catalog/본문으로 돌아왔고 기존 행도 동일했다. 비호환 partial artist 표 역시 자동 수정 없이 실패했다.
6. 이전 TS Edge 소스는 전후 모두 200이었다. 새 Edge는 DB/서버 환경 불일치 503, staging 일치 200, 미인증 메일 401을 반환했다. profile lookup은 실제 local service_role 컬럼 권한으로 수행했다. 원격 Edge 버전/실제 Auth 서비스의 성공 판정은 아니다.
7. 새 postcheck SQL은 000 직후와 전체 적용 후 READ ONLY 트랜잭션에서 실행됐다. 외부 회원 데이터/식별자 출력 없이 기본 보안 flag가 예상과 일치했다.

합성 보존 대상: auth.users(8), users(7), account_libraries(1), published_tracks(2), rank_listens(1), legacy login_attempts(1), legacy tracks(1), legacy playlists(1). 이 숫자는 실제 회원/곡 수가 아니다. 실제 서버 다중 세션/잠금 경쟁·분산 재생 동시성·Supabase 전체 복원은 이번 PGlite 검사로 대체하지 않는다.

**전체 자동 테스트 229 통과 / 실패·skip 0**: 기존 189개 유지 + 신규 40개. `npm run check` 10개 통과. 화면 변경이 없어 Chromium을 재실행하지 않았으며 과거 8개 통과를 이번 결과로 합산하지 않는다.

```sh
npm run check
npm test
npm run rehearse:prerequisite
```

## 가입·이메일 인증·Auth-only 계정

소스의 `virhang-auth.js`는 signUp에 username 메타데이터를 보내며, `V2.6_DATABASE_MIGRATION.sql`은 **auth.users INSERT 직후** 트리거로 viewer 프로필을 만든다. 트리거는 email_confirmed_at을 검사하거나 인증 완료 이벤트를 기다리지 않는다. signup SQL 자체가 이메일을 보내는 것은 아니다.

| 소스 기준 상황 | 검증된 local DB 동작 | 처리 기준 |
|---|---|---|
| 유효 username + 이메일 미인증 | 즉시 viewer 프로필 생성; 요청한 admin role 메타데이터 무시 | 인증 미완료로 취급. 현재 username Edge는 이메일 인증 전 로그인 거부 |
| 이후 이메일 인증 UPDATE | 기존 profile/role 그대로, 새 프로필 추가 없음 | 가입 완료/정상 세션은 실제 Auth 검증 후 판정 |
| username 없는 Auth INSERT | Auth-only로 유지 | 이메일 전용/다른 provider/관리 생성/과거 가입 가능. 자동 profile 생성/삭제 금지 |
| Auth-only의 후속 이메일 인증 | profile이 자동으로 생기지 않음 | username onboarding/충돌 처리 설계 및 별도 승인 전까지 보존 |
| invalid/중복 username | 같은 트랜잭션의 Auth INSERT도 실패 | 일반 오류로 안내하고 수동 계정 정리하지 않음 |

따라서 **미인증 이메일이라는 사실만으로 현재 트리거 아래에서 profile 누락을 설명할 수 없다**. 과거 트리거 설치 시점/다른 provider/메타데이터 누락/다른 배포 소스 등을 비공개로 대조해야 한다. 실제 원격 트리거 본문은 이번 사용자 결과만으로 확인되지 않았으며 임의로 덮어쓰지 않았다.

정상 계정은 Auth–profile ID 일치, 유효 username/role, 이메일 인증 및 유효 세션을 함께 확인한다. profile이 있는 미인증 계정은 pending으로 보존한다. profile 없는 계정은 role을 임의 부여하지 않고 관리·등록·집계 등 profile 필수 기능을 거부한다. 최종 003 이후 개인 library도 profile guard를 적용한다. 관리자·최고관리자 판정에 Auth user_metadata.role을 사용하지 않는다.

## 회원 Auth FK와 탈퇴 — 이번에는 별도 보류

현재 고아 profile은 없지만 Auth-only는 존재한다. 이 사실만으로 FK를 자동 추가하거나 기존 Auth-only를 삭제할 필요는 없다. 이번 요청대로 회원→Auth FK는 변경하지 않는다. 일반 catalog 비교 도구의 FK 차단 사유 1개는 남으며, 다른 누락 구조는 해소된다. 이는 000의 문법 의존성이 아니라 탈퇴/수명주기 검토 항목이다.

추가 검토 시 source의 published_tracks.created_by→Auth는 NO ACTION, library/rank_listens→Auth는 CASCADE다. 실제 원격의 상세 FK는 별도 확인해야 한다. 곡을 가진 Auth 삭제가 막히거나, 삭제 시 library/청취가 사라질 수 있으므로 profile FK 하나만 추가해 탈퇴를 완성할 수 없다. 새 identity의 verified_user_id는 profile 삭제 시 SET NULL, verified_by는 NO ACTION으로 검증자 profile 삭제를 막는다.

향후 탈퇴 처리에서 음악/청취 보존·개인정보 익명화/삭제 범위·가수 검증 해제·관리자 대체/감사·세션 철회를 먼저 정한다. 승인된 새 migration으로 NO ACTION + NOT VALID → VALIDATE 등을 검토할 수 있지만 Auth 삭제 동작을 막을 수 있다. CASCADE를 편의상 선택하면 안 된다. 계정/UUID/role의 자동 교정은 하지 않는다.

## 승인 후 테스트 서버 실행 절차

지금 사용자가 반복해서 05/06을 조회할 필요는 없다. 다음은 **실제 적용 승인 후**의 절차이며 이번에 실행하지 않았다.

1. 현재 프로젝트 ref·기존 사이트/Edge 버전과 보관한 복구본을 확인한다. 실제 DB backup의 격리 복원/복구 가능 여부, 기존 RPC/정책 본문·추가 view/trigger를 비공개로 확인한다. 테스트 최고관리자를 실제 최고관리자와 분리한다. 적용 시간·프로젝트·아래 SQL 범위 승인을 확정한다.
2. 기존 로그인 Edge는 유지한다. `000` 파일 **전체**를 단독 실행한다. 한 파일 내부의 BEGIN/COMMIT을 나누거나 일부 선택 실행하지 않는다. 5초 잠금/30초 실행 제한을 넘으면 중단하고 대상/규모/동시 쓰기를 재검토한다. 값을 무작정 늘리지 않는다.
3. 승인된 순서 **000 → 001 → 002 → 003 → 004**로 각 원본 파일 전체를 적용한다. 각 단계 실패 시 다음 단계로 넘어가지 않는다. 원본 JOINT/V2 초기 설정/DEV 제한 해제 SQL은 실행하지 않는다. 신규 DB 전체 bootstrap용 목록도 아니다.
4. 000 직후 및 최종 적용 후 `supabase/verification/security_prerequisite_07.sql`을 실행한다. 이 조회는 그 전에는 새 표가 없어 실패할 수 있으므로 **지금 실행할 쿼리가 아니다**. `super_admin_present`, `auth_only_accounts_present`, 두 trigger active, service lookup은 true; 보안 위반/누락 flag들은 false가 기대값이다. 실제 새 가입이 발생하면 Auth-only 여부가 달라질 수 있어 개수/삭제 근거로 쓰지 않는다. 공유는 `virhang_prerequisite_report` JSON만 한다.
5. 004는 production strict 기본값이다. 테스트 환경의 일반 계정 완화는 기존 `supabase/environment-config/staging-login.example.sql`의 실제 승인 설정을 별도 적용한다. 관리자/최고관리자 제한은 계속 켠다. `VIRHANG_ENV=staging`과 DB 정책, `VIRHANG_SITE_ORIGIN`을 맞춘 뒤 후보 로그인 Edge를 실제 Deno/Auth로 검증한다. 먼저 새 Edge를 활성화하지 않는다.
6. 별도 테스트 계정의 실제 JWT로 RPC/PostgREST를 직접 호출해 허용/거부를 확인한다. 회원·음악/credit/library/청취 보존은 원격 backup/비공개 비교로 확인한다. 실제 최고관리자로 공격 테스트하지 않는다.
7. 브라우저의 정상 로그인/가입/OTP·공동 가수 수정·soft-delete·랭킹/재생 회귀가 통과하면 Edge 활성화 및 프런트 배포를 각각 승인한다. main/Pages 변경은 이 코드 push에 포함되지 않는다.

release-plan의 `executionOrder`가 5개 파일의 전체 순서다. `migrations` 필드는 기존 4개 패치 목록을 보존하고 `prerequisites`에 000을 따로 표시한다. 이 도구는 hash/환경 확인과 계획 생성만 하며 SQL을 실행하지 않는다.

## 실패 시 복구

- COMMIT 전 에러: 해당 트랜잭션은 취소해야 한다. 같은 연결에 남아 있으면 ROLLBACK하고 새 catalog와 데이터를 확인한다. SQL Editor가 연결을 정리한 경우도 부분 적용 여부를 확인한 뒤 중단한다. 최종 COMMIT 직전 실패/ROLLBACK은 local에서 검증했다.
- 000 성공 후 001 등 실패: 이미 커밋된 000은 강화된 상태로 유지하고 다음 단계를 중단한다. 과거 취약 SQL로 되돌리거나 새 credit/컬럼을 DROP하지 않는다. 원인 확인 후 검증된 재실행 또는 새 수정 migration을 승인받는다.
- 새 Edge만 실패: 새 SQL과 호환 검증된 이전 Edge로 복귀한다. DB limiter를 DEV 무제한 함수로 덮어쓰지 않는다. 롤백할 원격 Edge 소스/버전과 실제 Auth 호환성은 적용 전에 확보한다.
- 데이터 손상 의심: 쓰기를 통제하고 backup을 별도 DB에 복원해 비교한다. 이후 발생한 회원/곡/청취를 잃는 과거시점 덮어쓰기는 별도 복구 범위 승인 전 실행하지 않는다.

## 완료 범위

보완 migration과 로컬 자동 검증은 완료했다. **실제 테스트 DB 적용·Supabase 전체 환경 검증은 미실시**다. 실제 배포 승인/backup 복원/원격 함수·정책/실제 Auth·JWT·브라우저 확인이 남는다. 회원 FK·탈퇴 정책, IP/전역 제한, Auth 직접 로그인 우회, 최고관리자 MFA 강제, 감사 로그도 미완료다. 다음은 이 후보를 승인된 테스트 프로젝트에 적용하고 원격 회귀를 확인하는 단계이며 High를 권장한다.
