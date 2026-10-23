# VirHang / 버항 — Codex 작업 규칙

## 출발점
- 이 폴더는 사용자가 제공한 `virhang_V3.0_joint_singers_late_signup(1).zip` 원본의 복사본이다. 정식 프로덕션 배포 파일이 아니다.
- 최우선: 현재 동작하는 기능 보존. UI와 SQL 스키마를 이해하기 전에 대규모 재작성 금지.
- 현재 작업 환경은 **개발·테스트(staging)** 로 취급한다. 향후 별도 production 사이트 + 별도 Supabase 프로젝트를 만든다.
- Codex에 코드를 열었다고 실제 Supabase에 SQL을 실행하거나 GitHub에 배포할 권한을 부여한 것으로 해석하지 않는다. 데이터 변경, 외부 API 설정 변경, 프로덕션 배포 전 사용자 승인 받기.

## 현재 개발 합의 (2026-10-24 사용자 요청 반영)
- 코드/문서/테스트 수정과 로컬 검증은 허용. **개발은 codex-dev 브랜치에서만** 진행하며, 변경 전 현재 브랜치와 작업 내용을 확인한다.
- 사용자가 Pages=main/root 및 codex-dev 외부 자동 배포 없음 확인. 검증/비밀정보 검사 후 codex-dev 코드 보존 push는 허용된 이력이 있다. main merge/Pages·Edge 배포/실제 DB 변경은 여전히 승인 전 금지. 현재는 Free Supabase의 사용자 PC 비공개 백업 절차를 준비한다. 실제 export/복원/000~004 적용은 수행하지 않는다.
- main 변경·GitHub 병합·Pages 배포·실제 Supabase/외부 설정 변경은 사전 승인 없이 하지 않는다. codex-dev를 배포 브랜치로 자동 연결하지 않는다.
- SQL은 `supabase/migrations/`의 새 파일로 작성한다. 과거 버전 SQL 수정/일괄 실행 대신 사전조건·위험·적용·검증·복구를 문서화한다.
- 사용자의 최신 8단계 백로그는 docs/BACKLOG.md. 1차 관리자 NULL/XSS와 2차 곡 입력/privacy RLS/환경별 로그인 정책을 로컬 검증했다. 이후도 작은 단위로 진행한다.
- 테스트 계정과 실제 최고관리자 분리. 로컬 fixture는 가짜 UUID와 메모리 DB만 사용한다. 실제 서버에서 검증하지 않은 기능은 완료라고 하지 않는다.
- UI/기능 삭제·디자인 대규모 변경은 사전 승인. 보안 입력 거부 시 안전한 대체 표지를 사용한다.
- `npm run check` 및 `npm test`는 로컬 검사 전용. 배포나 실제 DB 연결을 추가하지 않는다.

## 실제 현재 코드에서 확인된 사실
- HTML/CSS/일반 JavaScript 웹 앱; supabase/functions/virhang-username-login/index.ts 포함.
- `virhang-auth.js`의 `SUPABASE_PUBLISHABLE_KEY`는 `PASTE_SUPABASE_PUBLISHABLE_KEY_HERE` 플레이스홀더이다. 공개용 키만 브라우저 사용, secret/service_role 절대 금지.
- `soop-auth.js` OAuth 테스트 코드 존재하나 사용자별 계정 연결 미구현; 콜백 URL은 과거 `beohang-test` 경로. `auth/callback.html`이 `virhang-soop-auth` 함수를 호출하나 해당 Edge Function 원본은 이 폴더에 없다.
- 곡 등록·공개/참여 가수 계정 연결, 곡 수정·소프트 삭제, 재생 30초 유효 집계, 동일 곡 새 재생 재집계용 SQL 및 코드가 존재한다. 실제 DB 적용/브라우저 검증 여부는 별도 확인 필요.
- 서버 공통 좋아요 랭킹, 순위 변동 스냅샷, SOOP 외부 VOD 재생수 집계, 완성형 개인 리캡 등 미구현 사항은 `docs/BACKLOG.md` 참조.
- `V2.6.7_DISABLE_RATE_LIMIT_DEV.sql`은 테스트 편의용이며 **production 절대 사용 금지**. 계정별 제한도 IP별 방어를 대체하지 않는다.
- `V3.0_PC_INTEGRATION_PLAN.md`에 따르면 **PC 완성 우선**, 모바일/PWA는 이후. 스트리머 랭킹, 노래 등록 요청, 잘못된 정보 신고, 재생 불가 신고는 현 범위에서 제외한다.

## 변하지 말아야 할 비즈니스 규칙
- 버항 자체 가입 후 모든 회원 `viewer` 시작; SOOP 연동은 가입 후 선택 사항.
- streamer 권한은 관리자/최고관리자의 신원 확인 후 수동 부여. 활동명/아이디 자동 매칭 금지.
- 동일 곡 새 재생은 30초 유효 청취 이후 반복 집계 가능. 가짜 인기 수치 생성 금지. SOOP 외부 플레이어의 청취를 임의로 집계하지 않는다.
- 곡/참여 가수 연결 뒤에도 기존 트랙 ID 및 재생 이력 보존; 삭제는 기본 소프트 삭제.
- 접두어는 `vir`, 표기는 VirHang / 버항. `살별` 참여 가수 표기는 `체비, 아이네, 비챤`.

## 보안 필수
- 인증과 모든 admin/super_admin/streamer 관리 권한은 서버/RLS에서 재검증. 클라이언트 숨김으로 방어했다고 주장하지 않는다.
- OAuth는 공식 SOOP 문서와 앱 승인 권한을 검증한 뒤, 코드 교환은 서버에서 처리. state·PKCE(지원 여부 확인)·callback allowlist·CSRF·중복 연동 방지·연동 해제 처리.
- 시크릿, 토큰, 계정 비밀번호, 운영 DB 덤프는 git/로그/대화에 절대 업로드하지 않는다. `.env*` 무시, `.env.example`만 비밀값 없이 제공.
- 프로덕션은 반드시 로그인 시도 제한/감사 로그/MFA(최고관리자)/백업·복원 절차/프로덕션 RLS 정책 검증을 통과해야 한다.
- 마이그레이션은 백업·롤백·검증 쿼리와 함께 제공. 서비스 데이터 삭제나 관리자 역할 부여를 자동 실행하지 않는다.

## Codex 작업 방식
1. `docs/PROJECT_STATUS.md`, `docs/BACKLOG.md`, `docs/ENVIRONMENTS.md`, `docs/ACCEPTANCE.md`를 읽는다.
2. 최초 분석은 완료. 이후 기능별 구현 범위와 위험/변경 파일 목록을 먼저 제시하고 사용자 승인 범위 안에서 수정한다.
3. 기능별 작은 변경, Git 커밋, 테스트 결과와 남은 이슈 보고.
4. 개발 환경에서 확인한 변경만 승인 후 운영 환경에 반영.

## 검증 도구 (5차)
- npm run rehearse는 합성 PGlite 전용, npm run test:browser는 모든 앱 요청을 가로채는 offline Chromium 전용이다. 실제 Supabase/Auth/YouTube를 검증했다고 표시하지 않는다.
- 실제 구조 공유는 security_shareable_05.sql의 단일 JSON만 사용하고 work/live-schema-report.json 같은 비추적 경로에 보관한다. 실제 회원 행/함수 본문/secret을 수집·공개하지 않는다.
- 실제 05 결과는 공동 가수 구조/soft-delete 컬럼 누락 등 10개 차단 사유다. LIVE_SCHEMA_COMPARISON_06.md를 우선 참조한다. 원본 JOINT SQL을 단독 적용하지 않는다.
- security_integrity_06.sql은 회원/곡 행을 내부적으로 읽되 boolean 무결성 결과만 반환한다. 이 결과와 비공개 정의 확인 전에는 Auth FK/계정/역할을 추측해 고치지 않는다. 사용자 JSON은 계속 비추적 work/에만 둔다.

## 7차 선행 migration
- 사용자가 06 무결성 결과를 확인했다. Auth-only 계정은 보존하며 회원→Auth FK/탈퇴 정책은 별도 판단한다. 실제 함수 본문/정책·Auth 서비스 확인과 실제 적용 승인은 계속 필요하다.
- 202610230000_joint_singer_prerequisites.sql은 강화된 선행 구조다. 승인 후 순서는 000 → 원본 001 → 002 → 003 → 004. 옛 JOINT 단독 적용은 금지한다. 상세는 docs/SECURITY_PREREQUISITE_07.md.
- npm run rehearse:prerequisite는 합성 PGlite에서 파일별 COMMIT 경계까지 검사한다. 실제 DB/Edge에 접속하지 않는다. 신규 postcheck 07은 승인된 000 적용 이후에만 실행한다.

## 8차 Free 백업 준비
- docs/FREE_SUPABASE_BACKUP_WINDOWS_08.md는 공식 CLI v2.122.0의 Windows 설치·숨김 비밀번호 입력·schema/data/roles/Auth 범위·추가 보관·무결성/격리 복원 절차다. 실제 백업 생성/Windows 실행/실데이터 복원은 미완료다.
- 백업은 사용자 PC의 Git/동기화 폴더 밖 비공개 경로에만 저장한다. DB URL/비밀번호/덤프/Auth 행/Edge secret은 Codex·GitHub·채팅으로 보내지 않는다. 소스 bundle은 DB 백업이 아니다.
- 관리 auth/storage schema의 custom trigger/RLS와 Storage 실제 파일·Edge 배포본·Auth 설정/비밀값은 별도 범위를 확인한다. 전체 관리 schema reference를 통째로 복원하지 않는다.
- 다음 9차는 실제 백업 파일/hash·분리된 복원/데이터·권한 확인과 별도 사용자 승인 이후다. 000~004/실제 DB/Edge/Pages는 계속 미변경한다.
