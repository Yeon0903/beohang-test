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
