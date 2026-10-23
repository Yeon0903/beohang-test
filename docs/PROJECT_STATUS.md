# VirHang V3.0 현재 상태

갱신: 2026-10-23 KST · 개발 브랜치: codex-dev · 단계: 보안 패치 02 로컬 검증.

사용자 최신 요청을 기준으로 `BACKLOG.md`의 8단계를 관리한다. 기존 앱을 개선하며 main·Pages·실제 Supabase·OAuth 설정은 변경하지 않았다. AGENTS의 최초 읽기 전용 분석 단계는 끝났고 현재 요청은 코드 수정/로컬 테스트를 허용한다.

| 영역 | 상태 | 근거/한계 |
|---|---|---|
| 관리자 NULL/미인증/프로필 없음 차단 | 새 migration 작성, 로컬 검증 | `202610230001_admin_null_guards.sql`, in-memory PostgreSQL. 실제 DB 적용 전에는 서버가 수정된 것이 아님 |
| 이미지 XSS | 코드 수정, 로컬 DOM 검증 | app.js safeImage/artLayer/배경·심벌/SVG escape. 실제 브라우저 및 배포 후 검증 대기 |
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
