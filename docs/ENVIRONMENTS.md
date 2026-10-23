# 테스트 서버 / 정식 서버 운영 설계

## 권장 결론
현재 버항 사이트는 **staging(개발·테스트)** 용으로 남긴다. 기존 실사용 데이터가 있다면 먼저 백업·현황 파악한다. 서비스 공개 시 **새 production 사이트 + 새 Supabase 프로젝트**를 만든다. 사용자 인증 계정, 곡 데이터, OAuth 연결 데이터, 운영 시크릿은 서로 격리한다.

| 항목 | Staging | Production |
|---|---|---|
| 주소 | 현재 개발 사이트, 추후 `staging.` 서브도메인 가능 | 별도의 공식 도메인 |
| 저장소 | 같은 Git 저장소의 codex-dev 개발 브랜치 / 로컬 검증 | main 보호 및 별도 운영 호스팅 준비 (현재 Pages 설정 변경 금지) |
| Supabase | 현재 개발 DB(실제 고객 데이터가 있는지 먼저 확인) | 신규 별도 Supabase 프로젝트 |
| SOOP OAuth | 테스트 앱/승인된 staging redirect | 운영 앱/승인된 production redirect |
| 인증/메일 | 테스트 주소/테스트 계정, 유효한 인증 설정 | 실제 인증·SMTP, MFA 필수 대상 지정 |
| 로그인 시도 제한 | 안전한 개발용 정책(테스트 계정만 완화 권장) | 복구 SQL + IP/계정 제한 상시 적용 |
| 데이터 | 가명/가짜 데이터, 복제 시 개인정보 제거 | 실제 회원 데이터 |
| 시크릿 | 별도 키, 로컬/호스팅 시크릿 저장소 | 전혀 다른 키, 서버에서만 사용 |

## 개발→운영 배포 순서
1. Git 브랜치에서 기능 구현 + 테스트 작성 → staging 배포.
2. staging 테스트 계정으로 로그인·SOOP 연결·RLS·재생·랭킹 등 회귀 검사.
3. SQL 변경 시 백업·forward migration/rollback 작성 및 staging 먼저 적용.
4. 결과 검토·승인 후 main 병합 → production 마이그레이션 → 사이트 배포.
5. 운영 스모크 테스트·로그 모니터링; 문제 시 코드 롤백 및 DB 복구 계획 사용.

## 주의
- staging OAuth callback/허용 Origin은 production과 구분. OAuth 앱이 복수 URL을 허용하는지 공식 문서로 먼저 확인.
- 브라우저 코드에 service_role/secret, 실제 비밀번호, 리프레시 토큰 고정값 넣지 않음.
- 인증 사용자 테이블을 SQL COPY만으로 옮기는 것은 피한다. 실제 계정 이전은 인증 체계와 회원 고지 등 별도 설계가 필요.
- 현재 개발 편의를 위해 제한 해제 SQL을 적용했더라도 공개된 staging에서는 악용될 수 있으니 운영 접근제어(예: 접근 제한)와 속도 제한을 권장.

## 현재 브랜치/승인 규칙 (2026-10-23)
- 개발 작업은 codex-dev에서만. main은 수정하지 않고 현재 beohang-test/Pages를 유지한다. 현재 Pages 배포 원본 설정은 미확인이므로 main을 곧바로 운영 배포로 간주하지 않는다.
- 로컬 테스트는 자동 실행 가능. main 병합, push에 의한 서비스 변경, staging/production 배포와 실제 DB migration 모두 사용자 승인 후 수행한다.
- 별도 운영 브랜드는 VirHang / 버항, 식별자 virhang. 사이트·Supabase·OAuth·메일·키·사용자·Storage 격리. 신규 프로젝트 생성도 아직 하지 않았다.
- 같은 yeon0903.github.io 아래 경로만 달리하면 동일 origin이다. 운영은 독립 도메인을 권장한다. 도메인/프로젝트 ID를 임의 확정하지 않는다.
- 정적 HTML은 .env를 자동으로 읽지 않는다. 공개 설정 생성 단계는 후속 구현한다. service_role/SOOP secret은 서버 secret manager 전용이다.
- 실제 관리자 계정으로 로컬 테스트하지 않는다. 패키지 테스트는 메모리 PostgreSQL의 가짜 계정만 사용한다.

## 2차 로그인 정책과 검토 도구
- 현재 실제 테스트 DB의 제한 해제는 이번에 건드리지 않았다. 신규 migration 004는 production strict 기본값이고 staging 완화는 migration 외 수동 설정으로 분리한다.
- staging에서도 admin/super_admin은 항상 계정 제한을 받는다. 실제 최고관리자와 테스트 관리자는 분리한다. MFA는 아직 미구현이다.
- 새 Edge는 VIRHANG_ENV와 DB policy/fingerprint가 일치해야 로그인 가능하다. Supabase Auth 직접 이메일 로그인과 IP 방어는 별도 보완한다.
- 환경별 project ref 예시는 config/environments.example.json, 로컬 binding은 비추적 config/environments.local.json. production ref는 신규 프로젝트 확정 전까지 비워 둔다.
- scripts/release-plan.cjs는 승인된 migration hash와 프로젝트 분리를 확인하는 계획 생성 전용이다. SQL 실행/자동 배포를 하지 않는다.
- 이번 사용자는 Pages 설정 미확인으로 원격 push 대신 패치 보존을 선택했다. Pages 소스 확인 없이 배포 영향이 있는 push를 재개하지 않는다.

## 3차 승인 경계와 적용 순서
현재 요청은 배포 영향이 없다는 증거가 있는 codex-dev push만 허용한다. Pages source 조회가 거부되어 이번에는 push 보류. workflow 폴더 404는 외부 연동 부재 증명이 아니다. 실제 DB/Edge/Pages는 미변경이다.

기존 로그인 Edge 유지 → SQL/함수 사전조건 검증 → 승인된 001~004 → staging 정책/서버 환경 일치 확인 → 후보 Edge 검증 → 활성 Edge 전환 → 프런트 별도 승인 순서로 준비한다. 새 Edge를 policy RPC보다 먼저 활성화하면 503이 발생하므로 금지한다. 상세/중단·복구는 STAGING_ROLLOUT_03.md 참조.

## 최신 확인과 5차 검증
사용자가 Pages=main/root 및 codex-dev 외부 자동 배포 없음 확인. b33e5d9까지 코드 보존 push 완료 기록이며 main/Pages/Supabase 변경은 별도 승인 범위다. 5차 격리 DB·offline Chromium 결과는 실제 staging 검증으로 대체하지 않는다. 실제 구조 조회/공유와 SQL→Edge→프런트의 상세 순서는 LIVE_SCHEMA_REHEARSAL_05.md 참조.

## Free 테스트 프로젝트 백업 (8차)
- 자동 백업 UI에 의존하지 않고 공식 CLI로 사용자 PC에 export한다. 절차: FREE_SUPABASE_BACKUP_WINDOWS_08.md. 저장 위치는 `%LOCALAPPDATA%\VirHang\backups\날짜-시간`, Git/OneDrive 밖·사용자/SYSTEM 전용 ACL·암호화 보관이다.
- 실제 접속 URL/비밀번호는 사용자 PC의 입력/일시적 프로세스 환경만 사용한다. Codex·채팅·Git/Actions·스크린샷에 전달하지 않는다. DB link/push/reset/pull이나 migration을 백업 명령으로 사용하지 않는다.
- SQL/Auth 백업과 별개로 Storage 바이트·실제 Edge 소스/config/secrets·Auth 설정·관리 스키마 custom trigger/RLS·암호화 root key 범위를 확인한다. 앱 회원 role은 data.sql, custom PostgreSQL role은 roles.sql이며 role 비밀번호는 제외된다.
- 복원은 빈 별도 로컬 Supabase·localhost·외부 통신 차단·DB 외 서비스 중지 후에만 준비한다. 원격 대상 복원이나 000~004 적용은 이번에 승인되지 않았다. 실데이터 복원 환경은 평소 개발 환경/최고관리자 공격 테스트와 분리한다.
- 현재는 절차 작성/기존 코드 회귀검증까지이며 실제 DB export/Windows 실행/실데이터 복원은 미수행이다. 9차 진행은 실제 백업·복원 확인과 별도 적용 승인 이후다.
