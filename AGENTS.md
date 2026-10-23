# VirHang / 버항 — Codex 작업 규칙

## 출발점
- 이 폴더는 사용자가 제공한 `virhang_V3.0_joint_singers_late_signup(1).zip` 원본의 복사본이다. 정식 프로덕션 배포 파일이 아니다.
- 최우선: 현재 동작하는 기능 보존. UI와 SQL 스키마를 이해하기 전에 대규모 재작성 금지.
- 현재 작업 환경은 **개발·테스트(staging)** 로 취급한다. 향후 별도 production 사이트 + 별도 Supabase 프로젝트를 만든다.
- Codex에 코드를 열었다고 실제 Supabase에 SQL을 실행하거나 GitHub에 배포할 권한을 부여한 것으로 해석하지 않는다. 데이터 변경, 외부 API 설정 변경, 프로덕션 배포 전 사용자 승인 받기.

## 현재 개발 합의 (2026-10-23 사용자 요청 반영)
- 코드/문서/테스트 수정과 로컬 검증은 허용. **개발은 codex-dev 브랜치에서만** 진행하며, 변경 전 현재 브랜치와 작업 내용을 확인한다.
- 이번 세션은 Pages 배포 원본 미확인으로 사용자가 원격 push 대신 적용용 패치 보존을 선택했다. 이를 우선한다.
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
