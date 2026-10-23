# 실제 Supabase 보고서 대조 — 공동 가수 선행 구조 누락

2026-10-23 · codex-dev · 사용자 제공 report_version=1 catalog JSON을 비교했다. 실제 DB에 접속하거나 SQL/Edge/Pages를 배포하지 않았다. 원본 보고서는 비추적 work/에만 보관한다. 아래의 실제 구조 사실은 전달된 JSON 범위이며, 행·함수 본문·정책 조건식은 확보하지 않았다.

## 결론과 실행 증거

`node scripts/db-compatibility.cjs work/live-schema-report.json` 결과는 **blocked / 차단 사유 10개 / readyToApply=false**다. 기존 001~004만 곧바로 적용하면 안 된다.

`node scripts/rehearse-live-shape.cjs work/live-schema-report.json`을 실제 실행했다. 격리 PGlite에 만든 모형의 공유용 catalog 보고서 **전체가 사용자 JSON과 deep-equal**이었다. 다만 보고서에 없는 제약·기본값·정책 조건식·함수 본문·서비스 역할 grant·데이터까지 실제 DB와 같다는 뜻은 아니다. 보이지 않는 정의/행은 공개 소스와 합성 값으로 모델링했다.

| 확인된 차이 | 현재 소스/기능 영향 | 필요한 조치 |
|---|---|---|
| published_tracks.is_deleted / deleted_at 없음 | virhang-publish.js의 is_deleted=false 조회와 soft-delete UPDATE가 이 구조에서는 42703으로 실패. UI 샘플이나 과거 배포 코드 동작과는 별개 | 기존 행을 바꾸지 않고 false/NULL 기본값의 새 컬럼 추가. 선행 joint SQL의 역할 |
| artist_identities 없음 | 관리자 가수 신원 연결과 검증된 공동 가수 권한을 저장할 표준 구조 없음 | 기존 public.users PK를 확인하고 가수 표기/검증 연결용 구조 생성. 실제 회원과 이름 자동 매칭 금지 |
| song_singers 없음 | 곡 ID와 개별 참여 가수의 관계를 조회·관리할 수 없음 | 기존 singer 문자열을 credit로 분리해 추가. track ID/원래 singer/재생 이력은 그대로 유지 |
| admin_link_artist / sync_song_singers / can_manage_published_track / my_manageable_track_ids 없음 | 관리자 연결·공동 가수 수정·관리 가능 곡 조회 불가. 001은 필수 함수 누락으로 중단 | 선행 joint 구조와 함수 정의가 필요. 취약한 옛 함수가 별도 COMMIT으로 공개되지 않게 보안 패치와 원자적으로 묶거나, 처음부터 강화한 새 migration 작성 |
| song_singers_sync trigger 없음 | 신규·수정 곡의 credit 동기화 없음 | 기존 track ID/등록자 보존 및 검증된 가수 제거 보호를 포함하는 trigger 필요 |
| users RLS=true / 정책 0 / anon SELECT=false / authenticated UPDATE=false | 직접 테이블 접근은 기본 거부. 정책 0개 자체가 권한 상승 허용이라는 뜻이 아님. 기존 my_profile/admin/signup SECURITY DEFINER는 owner가 접근 가능하면 동작할 수 있음 | 전체 공개 정책 추가 금지. 003의 본인 조회·쓰기 차단 정책 및 기존 RPC owner/본문을 함께 검증 |
| users Auth FK 미감지 | PK와 username unique는 확인됐지만 단일 id→auth.users FK는 확인되지 않음. 고아 프로필 가능성·Auth 탈퇴 시 처리 정책 미확정 | 06 무결성 조회 후 제약/삭제 정책을 별도 새 migration으로 검토. FK를 추측해 추가하거나 계정을 정리하지 않음 |
| private.login_security / login_attempts 없음 | **004가 생성할 예정인 정상적인 사전 상태**. 신규 Edge만 먼저 활성화하면 policy RPC 없음으로 503 | SQL 004 및 staging 설정이 준비된 뒤 후보 Edge 검증/전환 |
| validate_track_write / has_valid_profile / login_policy 및 write trigger 없음 | 각각 002/003/004가 생성할 보안 객체. 현재 보호가 서버에 적용됐다고 주장할 수 없음 | 각 migration의 적용 후 권한·정상 동작 확인 |

account_libraries의 필수 4개 타입과 Auth FK/정책 3개, rank_listens의 필수 5개 타입, 기존 admin_streamer_account/my_profile/can_publish/signup/랭킹 RPC의 인자·반환형은 보고서 계약에 부합한다. rank_listens는 RLS=true / 직접 조회=false / 정책 0개여도 RPC 전용 설계와 맞을 수 있다. 정책 개수만으로 조건의 안전성을 판정하지 않는다.

legacy tracks/playlists가 실제 존재하므로 삭제·새 테이블로 복사·새 account_libraries로 합치지 않는다. 현재 프런트의 플레이리스트 저장 경로는 account_libraries.playlists JSON이다. 원래 playlists 테이블의 실제 용도/다른 RPC는 별도 확인한다. report 05는 고정 컬럼만 반환하므로 legacy login_attempts나 playlists에 그 컬럼만 존재한다고 단정할 수 없다.

## 격리 실행 결과

1. 001 단독 실행 → P0001 `Missing prerequisite functions`; ROLLBACK 후 기존 8개 테이블과 catalog 원상 유지.
2. 현재 프런트와 같은 is_deleted 조건 조회 → 42703 재현.
3. 공동 가수 원본 SQL → 001 → 002 → 003 → 004의 **바깥 BEGIN/COMMIT을 하나로 묶어** 격리 실행 → 성공. 기존 원본 파일과 SHA256 allowlist는 불변이다.
4. 기존 테이블의 모든 기존 컬럼/값을 정렬 JSON으로 비교 → 8개 테이블 모두 일치. track에는 의도된 새 is_deleted=false/deleted_at=NULL만 추가됐다.
5. 새로운 가수 3개/credit 6개는 합성 2곡의 singer 문자열에서 파생됐다. 검증 회원 UUID는 전부 NULL이며 자동 권한 부여가 없다.
6. 합성 가수 연결을 수동으로 설정한 뒤 전체 로컬 트랜잭션 재실행 → 연결/검증 시각·기존 모든 행 유지. 최고관리자의 super_admin 역할 및 RPC 호출 유지.
7. 길이 101의 가수 토큰을 가진 비호환 레거시 데이터 모형 → backfill CHECK 위반 23514, ROLLBACK 후 신규 컬럼/가수 테이블도 남지 않고 기존 행 유지. 실제 데이터를 임의 절단해 통과시키면 안 된다.
8. FK는 자동 추가하지 않았다. 실행 후 catalog 차단 사유는 **Auth FK 대조 1개가 그대로 남았다**. 실행 가능한 것과 실제 적용 가능한 것은 다르다.

| 보존한 기존 테이블 | 합성 행 수 |
|---|---:|
| auth.users | 8 |
| virhang_users | 7 |
| virhang_account_libraries | 1 |
| virhang_published_tracks | 2 |
| virhang_rank_listens | 1 |
| legacy virhang_login_attempts | 1 |
| legacy virhang_tracks | 1 |
| legacy virhang_playlists | 1 |

실제 회원/최고관리자 자격 증명이나 원격 행은 사용하지 않았다. 실제 데이터 보존 완료를 뜻하지 않는다. 합성 fixture에는 부정 역할 방어를 시험하는 NULL role/profileless 계정도 있으며, 실제 DB에 그런 계정이 있다는 근거가 아니다.

### 과거 공동 가수 SQL을 단독 실행하면 안 되는 이유

원본은 재사용할 스키마/backfill의 근거이지만 관리자 NULL 역할 검사와 검증 UUID 공개, 직접 DELETE 정책 등은 보안 패치 전 상태다. NULL role을 가진 **프로필이 존재하는 합성 계정**이 원본 admin_link_artist를 통과하는 것을 재현했다. 001은 이를 차단하고 002는 직접 DELETE를 막으며 003은 내부 검증 UUID의 공개 조회를 막는다. 원본 파일을 단독 실행하고 나중에 패치하는 방식은 피한다.

이번 local applyAtomicLocal은 이러한 위험한 중간 상태를 별도 COMMIT하지 않고 최종 보안 상태를 한 번에 검증하는 **메모리 DB 전용 실험**이다. 실제 실행용 SQL을 출력하지 않고 URL/키도 받지 않는다. Supabase CLI db push나 SQL Editor에 원본 파일을 그대로 일괄 투입하라는 지시가 아니다.

## 누락 객체만 추가하는 새 migration 설계

실제 대상의 06 결과/비공개 정의 점검 전에는 추측으로 DDL을 확정하지 않는다. 001~004는 그대로 보존하고 다음 조건을 충족한 **별도 신규 migration**을 검토한다.

- 변경 전 core 타입/PK/default/trigger/함수 signature와 현 정책을 검증하고, 예상과 다르면 변경 전 중단한다. 이미 있는 객체에 CREATE IF NOT EXISTS만 쓰고 정의가 같다고 가정하지 않는다.
- 누락된 soft-delete 컬럼/identity/credit/index/trigger와 필요한 hardened helper만 추가한다. 이미 존재하는 다른 경로의 credit/검증 연결은 덮어쓰지 않는다.
- backfill은 singer를 읽어 새 표에 INSERT ... ON CONFLICT DO NOTHING으로 추가하고 기존 track/user/library/listens 행을 UPDATE/DELETE하지 않는다. 과도한 길이·잘못된 값은 숨기거나 잘라 넣지 않고 중단/관리자 검토한다.
- role 값을 바꾸거나 회원 UUID를 재발급하지 않는다. artist 검증 연결은 이름이 같은 회원이 있어도 NULL로 두고 이후 관리자 명시 확인으로만 연결한다.
- 강한 admin/관리 helper, RLS와 최소 공개 컬럼만 같은 트랜잭션에서 활성화한다. trigger 함수를 RPC로 노출하지 않고, 실제 DELETE grant를 복구하지 않는다.
- 원본 JOINT는 drop/recreate하는 정책과 과거 함수도 포함하므로, 실제 추가 migration은 확인된 정책 의미를 보존하며 보안 변화만 명시한다. 기존 001~004를 나중에 다시 실행할 때 선행 역할을 충족하도록 한다.
- 실제 FK가 없고 고아 프로필도 없을 때에만 id→auth.users(id) FK를 검토한다. 예시 방향은 **ON DELETE NO ACTION + NOT VALID → VALIDATE**이며, Auth 탈퇴를 막을 수 있으므로 삭제 정책/기존 연결 확인과 별도 승인이 필요하다. 이미 다른 FK가 있다면 그 정의를 우선 검토한다. 고아 프로필이 있으면 자동 삭제/UUID 변경/임의 Auth 생성으로 해결하지 않는다.
- 대량 backfill/FK validate에는 잠금·시간 제한과 쓰기 동시성 점검이 필요하다. 잠금 실패/시간초과는 ROLLBACK 후 중단한다. 본문에 BEGIN/COMMIT이 있는 원본을 여러 개 이어붙이면 원자적 실행이 되지 않으므로 최종 적용 파일의 경계를 반드시 검토한다.

최종 신규 migration 파일은 위 미확인 조건이 해소된 뒤 작성/allowlist 등록한다. 이번에는 **실제 실행을 승인할 수 있는 신규 DDL이 확정됐다고 표시하지 않는다**.

## 승인 후 의존성과 적용 순서

1. 지금: 읽기 전용 06 결과 → 비공개 함수/정책/제약/원격 Edge 소스 확인 → 백업 격리 복원 → 신규 선행 migration 검토·예행 → 적용 대상/시간 승인.
2. 기존 로그인 Edge는 유지한다. 실제 001은 admin_streamer_account + admin_link_artist + sync_song_singers가 선행되어야 한다. 002는 공동 가수 구조/helper/soft-delete 컬럼과 rank_listens가 필요하다. 003은 users/library/artist 구조가 필요하다. 004는 users의 username/role 및 서버 설정을 필요로 하고 private 객체를 생성한다.
3. 승인된 hardened 선행 구조와 001 → 002 → 003 → 004를 적용한다. **옛 취약 공동 가수 함수를 별도 COMMIT으로 노출하지 않는다.** FK는 syntactic 선행 요건은 아니지만 실제 적용 안전성/탈퇴 정책 검토의 미해결 조건이다.
4. staging DB 설정과 VIRHANG_ENV/VIRHANG_SITE_ORIGIN을 맞춘다. 004의 기본값은 production strict다. 테스트 viewer/streamer 완화는 별도 승인 설정이며 관리자/최고관리자는 계속 제한한다.
5. 원격 기존 Edge 소스와 배포 설정을 확보해 이전/후보 Edge를 비교한다. 실제 Deno·service_role의 profile lookup grant·Auth/JWT·429/503를 후보에서 검증한 다음 활성 이름을 전환한다.
6. 별도 테스트 viewer/streamer/공동 가수/admin/최고관리자/profileless의 JWT로 PostgREST/RPC와 브라우저 회귀를 통과한 후 프런트/Pages를 별도 승인한다. main을 지금 바꾸지 않는다.

### 로그인 호환성과 복구

합성 SQL RPC + 실제 보관된 이전/현재 TS handler 소스로 old=200, 새 handler SQL 전=503, SQL 후 old=200, 환경 불일치=503, staging 일치=200을 재현했다. Auth/password/JWT/원격 service grant는 mock이므로 실제 로그인 검증은 남는다. remote Edge가 저장소의 옛 fixture와 같은 버전인지도 미확인이다.

- COMMIT 전 실패는 ROLLBACK하고 객체/권한/데이터 원상 여부 확인. 부분 적용을 계속하지 않는다.
- COMMIT 후 실패는 다음 SQL/프런트 전환을 중단하고 승인된 수정 migration으로 해결한다. 옛 JOINT나 DEV 제한 해제 SQL을 rollback용으로 실행하면 보안이 약해진다.
- 새 Edge만 실패하면 **새 SQL과 사전 호환 검증된** 이전 Edge로 복귀하고 계정 limiter는 유지한다. 로그인 오류를 해결하려고 회원/최고관리자를 삭제·재가입·일괄 비밀번호 변경하지 않는다.
- 데이터 손상은 백업을 별도 DB에 복원해 비교한 뒤 복구 범위를 승인받는다. 운영 중 새 회원/곡/청취를 덮어쓰는 과거시점 복원은 별도 판단이 필요하다.

## 사용자가 지금 Supabase에서 실행할 작업

1. 기존 beohang-test 프로젝트인지 확인한다. key/연결문자열은 공유하지 않는다.
2. SQL Editor → New query에서 **supabase/verification/security_integrity_06.sql 전체만 실행**한다. 이 쿼리는 SELECT만 있고 READ ONLY 트랜잭션에서도 로컬 실행 검증했다. metadata와 boolean 결과만 내보낸다. 다만 05와 달리 내부적으로 회원/곡 행을 읽어 FK 고아 상태·잘못된 값의 존재를 검사한다. 회원 행/이메일/UUID/역할별 수/토큰/함수 본문은 출력하지 않는다.
3. **virhang_integrity_report 셀 JSON만** 공유한다. 스크린샷/SELECT * 결과/데이터 덤프/비밀번호/secret은 보내지 않는다. 에러가 나면 민감값을 지운 SQLSTATE/문구만 공유하고 schema를 임의 수정하지 않는다.
4. 실제 migration/FK 추가/GRANT/정책 변경/회원 생성·삭제/Edge 배포는 아직 하지 않는다.

결과 해석:
- any_profile_without_auth_user=true: FK/탈퇴 정책을 추가하기 전에 비공개 계정별 복구 방침부터 확인. 프로필 자동 삭제 금지.
- any_auth_user_without_profile=true: 이메일 전용/가입 미완료 계정일 수 있다. 프로필 자동 생성/권한 부여 없이 현재 앱 차단 정책과 비교한다.
- any_profile_invalid_username 또는 any_profile_null_or_unknown_role=true: 기존 계정을 임의 정규화·승격하지 않고 운영자가 비공개 검토한다.
- super_admin_profile_present=false: 현재 최고관리자 역할 문자열/실제 계정 연결을 비공개 확인한다. 새 최고관리자를 자동 생성하지 않는다.
- any_track_missing_*_owner 또는 any_singer_token_exceeds_artist_key_limit=true: backfill/권한 변화 전 중단하고 데이터 보존 방침 결정.
- service_role_* 또는 profile_definer_owner_rls_bypass가 false: 실제 grant/owner를 비공개 검토한다. RLS를 끄거나 전체 공개 GRANT로 해결하지 않는다.
- role default/CHECK/not-null 플래그는 구조 힌트다. default 표현식의 의미나 CHECK가 올바른 whitelist인지까지 증명하지 않는다.

실제 적용 준비 완료는 아니다. 실제 06·정책/함수/원격 Edge·격리 복원·Auth/JWT 검증이 남았으며, IP/전체 제한·Auth 직접 경로·최고관리자 MFA 강제·감사 로그도 별도 보안 과제다.

## 재실행

```sh
npm run check
npm test
npm run rehearse:live-shape
# 비추적 사용자 JSON과 전체 catalog 일치까지 검증할 때
npm run rehearse:live-shape -- work/live-schema-report.json
```

원본 174개 유지 + 신규 15개 = **189 통과, 실패/skip 0**. npm run check의 10개 문법 검사도 통과했다. Chromium은 이번 변경의 UI 대상이 없어 기존 결과를 재실행 결과로 표시하지 않는다. 테스트 결과/사용자 원본 JSON은 work/에서 Git 추적하지 않는다.
