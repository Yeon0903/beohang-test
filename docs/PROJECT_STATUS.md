# VirHang V3.0 현재 상태

갱신: 2026-10-24 KST · 개발 브랜치: codex-dev · 단계: 8차 Free Supabase 비공개 PC 백업 절차 준비.

사용자 최신 요청을 기준으로 `BACKLOG.md`의 8단계를 관리한다. 기존 앱을 개선하며 main·Pages·실제 Supabase·OAuth 설정은 변경하지 않았다. AGENTS의 최초 읽기 전용 분석 단계는 끝났고 현재 요청은 코드 수정/로컬 테스트를 허용한다.

| 영역 | 상태 | 근거/한계 |
|---|---|---|
| 관리자 NULL/미인증/프로필 없음 차단 | 새 migration 작성, 로컬 검증 | `202610230001_admin_null_guards.sql`, in-memory PostgreSQL. 실제 DB 적용 전에는 서버가 수정된 것이 아님 |
| 이미지 XSS | 코드 수정, 로컬 DOM·Chromium 검증 | app.js safeImage/artLayer/배경·심벌/SVG escape. 오프라인 Chromium에서 주입 차단 확인, 실제 배포 후 검증 대기 |
| 관리자 정상 관리 동작 | 로컬 회귀검증 | admin/super_admin 승인·해제, 가수 연결/해제, 권한 철회, track ID/credit 보존 |
| RLS | 일부 로컬 검증 | 기존 SQL + 최소 fixture에서 소유자·공동 가수 수정 허용/일반회원 거부. 실제 users 스키마·정책 누락으로 전체 보안 완료 아님 |
| 서버 곡 입력·삭제·privacy RLS | 새 002/003 작성, 로컬 검증 | 직접 DELETE 차단·타회원/프로필 없음 거부·공동 가수 보존. 실제 DB 미적용 |
| 환경별 로그인 제한 | 새 004/Edge 보강, 로컬 검증 | staging 일반계정 완화 선택·관리자 상시 제한·production 기본 제한. 실제 테스트 DB 설정은 그대로 |
| 테스트 도구 | 로컬 도입 | npm run check, npm test. Node >=22.8, devDependencies만 추가. CI/배포 연결 없음 |
| 자체 가입/아이디 로그인/이메일 OTP | 부분 | 공개키 placeholder, SMTP/실제 설정 미확인 |
| 공개곡/수정/삭제/공동 가수 | 부분 | 기존 코드/SQL 보존. 직접 DELETE·복구 UI·원곡 링크 매핑 등 미완 |
| YouTube 재생/30초·반복 재집계/기간별 랭킹 | 부분 | 기존 구현 보존. 부정 재생/삭제곡 필터·실제 DB/브라우저 검증 필요 |
| SOOP URL | 외부 탭 열기 코드 | 내장 재생·외부 시청 집계 아님 |
| SOOP 회원 연결 | 미구현, 테스트 코드만 | 서버 함수 원본 누락, soopLinked 영구 false, 공식 API 지원 미확인 |
| 좋아요/플레이리스트 | 부분 | 개인 JSON 저장·로컬 UI. 공통 좋아요 랭킹·공개범위·동기화 검증 필요 |
| 스트리머/크루/어항 | 부분 또는 미구현 | 가상 프로필/장식 화면, 실제 통계·알림·리캡·포인트 등 BACKLOG 참조 |
| 최고관리자 MFA/감사/운영 분리 | 대기 | 운영 DB/호스팅/OAuth는 별도 구성 예정 |

로컬 검증 결과·실행 방법·적용 위험·복구 절차는 `SECURITY_PATCH_01.md`에 기록한다. 이전 FIRST_CODEX_PROMPT와 버전 README는 역사적 안내이며 최신 상태 판단은 이 문서와 BACKLOG를 우선한다. 실행 전에는 항상 현재 사용자의 승인 범위를 따른다.

## 2차 검증·보존
- 기존 커밋 6e831f7/797a8c1 및 테스트 33개 유지.
- 전체 자동 테스트 **161 통과, 0 실패, 0 skip**, JS/콜백 문법 10개 통과. 실제 DB/Pages는 미변경.
- Pages 소스 조회 접근 제한 후 사용자가 패치 보존을 선택했으므로 GitHub push/PR/merge는 하지 않는다. codex-dev 로컬 커밋과 적용용 패치·bundle로 보존한다.
- 새 입력/RLS/로그인 정책·배포 위험·검증 범위/순서는 SECURITY_PATCH_02.md 참조. 운영 release-plan은 실행하지 않는 검토용 계획만 만든다.

## 3차 적용 전 준비 (2026-10-23)
- 기존 4개 커밋과 preservation-02 파일 9개 SHA256/bundle 검증 통과. 기존 161개 테스트 재실행 전부 통과. catalog/신규 DB 선행조건 준비 테스트 3개 추가 후 전체 **164 통과, 실패/skip 0**.
- Pages API/gh 조회 제한으로 source 미확인. main/codex-dev의 workflow 폴더 404만 확인됨. 외부 연동까지 안전하다고 판정할 수 없어 이번에도 push하지 않음.
- 실제 DB/인증 설정 조회 자격 증명 없음. users/legacy attempts baseline 누락으로 신규 DB 완전 재현 불가. 테스트 fixture는 production baseline이 아님.
- 기존 서비스 JS/CSS/001~004 migration은 불변. 적용·중단·복구 절차는 STAGING_ROLLOUT_03.md, 보안 잔여 검증은 SECURITY_VALIDATION_MATRIX.md.
- 독립 복구용 전체 Git bundle/소스 ZIP 생성·검증은 RECOVERY_BACKUP_03.md의 도구 사용. 지정 output 경로 생성이 거부되어 채팅 첨부/다운로드 전달은 환경 제약으로 미완료이며 workspace ZIP 외부 반출 필요.
- 1단계 전체 완료 아님. 실제 schema/RLS/복원 검증과 IP/Auth 직접 경로·MFA·감사 로그가 남음.

## 4차 보존 확인 및 5차 실행 검증
- Pages는 사용자가 main/root/branch 배포임을 확인했고 외부 자동 배포 없음도 확인했다. b33e5d9까지 5개 커밋을 codex-dev에 푸시한 이력이 있다. main은 c79ed5f 그대로였다. 이전 문단의 push 보류는 당시 기록이다.
- 실제 Supabase credentials 없음. 원격 구조 비교는 security_shareable_05.sql의 단일 catalog JSON 수신 후 수행한다. security_preflight_03.sql은 읽기 전용이며 raw proconfig 출력도 제거했다.
- 합성 격리 DB의 8개 기존 테이블 행 전체를 각 001~004 전후 비교해 불변 확인. 최고관리자 role 유지, 이전 Edge의 각 단계 200, 새 Edge의 잘못된 순서/환경 503·올바른 전환 200 재현(Auth는 mock).
- 기존 164개 + 신규 10개 = **174 통과, 0 실패/skip**. 실제 Chromium의 외부 연결 차단 smoke 8개도 통과, 페이지 오류 0.
- 실제 배포/DB 변경은 하지 않음. baseline 누락·원격 정책/함수·데이터/백업·실제 Auth/Deno 확인 전에는 적용 준비 완료가 아니다. 정확한 SQL Editor 순서는 LIVE_SCHEMA_REHEARSAL_05.md 참조.

## 실제 Supabase 보고서 대조 (06)
- 사용자 제공 05 JSON을 db-compatibility로 검사: blocked, 차단 사유 10개. 공동 가수 2개 표/4개 helper/동기화 trigger와 soft-delete 2컬럼이 없고 users의 Auth FK 미감지다. private 로그인 표/신규 보안 helper는 002~004가 생성할 객체다.
- 격리 모형의 공유 catalog 전체가 실제 JSON과 일치하는 것을 확인했다. 원격의 비공개 함수/정책/제약/행까지 같다는 뜻은 아니다.
- 이 모형에서 001 단독은 P0001로 중단. 공동 가수 선행 SQL과 001~004를 단일 트랜잭션으로 실행하면 기존 8개 표의 모든 기존 필드·최고관리자 role 유지, 2개 soft-delete 기본값 추가, singer에서 credit만 backfill. 재실행 시 수동 검증 연결도 보존됐다.
- Auth FK는 추측해 추가하지 않았으므로 처리 후에도 차단 사유 1개와 비공개 검토 항목이 남는다. 옛 JOINT 단독 적용은 NULL role 관리 경로/검증 UUID 공개/직접 DELETE를 노출할 수 있어 금지한다.
- 다음 사용자 작업은 security_integrity_06.sql 읽기 전용 조회 후 virhang_integrity_report JSON만 공유. 내부적으로 행을 읽지만 계정 행/식별자/역할별 수는 출력하지 않는다.
- 실제 DB/Edge/Pages 변경 없음. 신규 최종 DDL은 무결성/기존 정의 확인 후 별도 migration으로 확정한다. 결과/정확한 의존성·복구는 LIVE_SCHEMA_COMPARISON_06.md 참조.
- 기존 174개 유지 + 신규 15개 = **189 통과, 실패/skip 0**. npm run check 10개 통과. Chromium은 이번에 재실행하지 않았으며 5차 8개 통과는 과거 기록이다.

## 7차 선행 migration 구현
- 사용자 확인 06 결과를 반영했다: 유효한 username/role·role NOT NULL/CHECK/viewer 기본값·최고관리자·기존 definer RLS 권한·service_role 조회 권한 있음, 고아 profile 없음, Auth-only 있음, 회원 Auth FK 없음. 자동 계정 수정/FK 추가는 하지 않는다.
- 신규 202610230000_joint_singer_prerequisites.sql을 작성했다. 누락 공동 가수/soft-delete 구조·INSERT-only backfill과 초기 보안을 한 BEGIN/COMMIT으로 설치한다. 원본 001~004/서비스 JS/디자인은 불변이다.
- 000 → 001 → 002 → 003 → 004를 각각 COMMIT하며 각 경계의 NULL/프로필 없음 관리자 거부·검증 UUID 비공개·직접 DELETE 거부를 검증했다. 기존 8개 표의 모든 기존 필드·최고관리자·Auth-only 보존, 수동 credit/가수 연결/시각의 재실행 보존, 최종 COMMIT 직전 실패 rollback 통과.
- 저장소 signup trigger는 이메일 확인 전 Auth INSERT 시 username이 있으면 viewer 생성, 없으면 Auth-only 유지. 이메일 인증 UPDATE는 profile을 생성하지 않는다. 해당 소스 동작을 테스트했으며 실제 원격 trigger 본문/메일/Auth는 미검증이다.
- 기존 189개 + 신규 40개 = **229 통과, 실패/skip 0**. npm run check 10개 통과. service_role profile SELECT를 실제 local 권한으로 경유한 이전/현재 Edge handler 호환 테스트도 통과(Auth/JWT는 mock).
- 실제 DB/Edge/Pages는 미변경. 코드 후보의 local 검증은 완료, 실제 적용·원격 JWT/복원 검증·FK/탈퇴·MFA/IP/Auth 직접 경로/감사는 미완료다. 적용/중단/복구/수정 파일은 SECURITY_PREREQUISITE_07.md를 우선 참조한다.

## 8차 Free Supabase 백업 준비
- 공식 CLI v2.122.0/공식 문서·dump 필터를 확인하고 Windows 10 지원 조건·설치/checksum·PC 전용 숨김 입력·비공개 NTFS 폴더·schema/data/roles 및 Auth 범위·추가 보관·SHA256·localhost 격리 복원 절차를 작성했다. 상세는 FREE_SUPABASE_BACKUP_WINDOWS_08.md.
- 기본 schema export는 auth/storage 관리 스키마를 제외하지만 기본 data-only는 Auth 데이터를 포함한다. 관리 schema reference/custom 가입 trigger·Storage 실제 파일·Edge 배포본·인증 설정·별도 secret/root key는 별도 확인이 필요하다. 앱 최고관리자 role은 회원 데이터이며 PostgreSQL roles.sql과 다르다.
- **실제 PC 설치/export/백업 파일 생성/hash 대조/실데이터 복원은 미수행**. Windows 명령은 Windows에서 실행 검증하지 않았다. 소스 백업·합성 테스트를 실제 DB 백업 완료로 표시하지 않는다.
- 기존 npm test 재검증 **229 통과, 실패/skip 0**, npm run check 10개 통과. 문서만 변경했으며 서비스/UI/000~004·원격 DB/Edge/Pages는 불변이다.
- 9차는 사용자 PC에서 실제 백업·추가 범위 확보·해시/격리 복원 검증을 마치고 실제 적용 승인을 받은 뒤 진행한다. 추천 추론 수준 High.
