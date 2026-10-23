# 남은 1단계 보안 검증 계획

2026-10-23 · 계획 단계. 실제 설정/코드가 구현·검증된 것으로 표시하지 않는다. 아래 테스트는 소유자가 승인한 격리 staging과 가짜 계정에서만 수행한다.

| 항목 | 현재 위험/필요 변경 | 실제 검증 방법과 통과 조건 |
|---|---|---|
| Auth 직접 로그인 | username Edge의 limiter만으로 `/auth/v1/token?grant_type=password`·signup/OTP/recovery/refresh를 모두 통제할 수 없음. 지원되는 Supabase Auth 자체 제한·CAPTCHA·접근 설정 확인. 직접 경로도 동일 계정/IP 정책이 필요하면 지원되는 hook/게이트웨이 또는 별도 배포 방식을 설계하고, 직접 origin의 우회 여부를 검증. email provider를 단순 끄면 기존 로그인도 깨지므로 금지 | 가짜 이메일 계정으로 직접 password 요청과 Edge 경유를 각각 비교. 모든 엔드포인트에 정책상 제한이 적용되는지, direct origin/IP 헤더 위조로 우회되는지 확인. token/recovery/OTP를 각각 검증. MFA 없는 최고관리자 토큰은 로그인 성공 여부와 별개로 관리 RPC/데이터 접근이 거부되어야 함 |
| IP·전체 제한 | 현재 004는 계정 단위 원자적 counter만 구현. 신뢰된 ingress에서 제공하는 IP를 사용하고 위조 가능한 X-Forwarded-For를 그대로 신뢰하지 않음. 다중 instance 공유 저장소의 원자적 sliding/fixed window·IP+계정+전역 예산, 시간초과 fail-closed·429/Retry-After·차단/정상화 정책 필요. 개인정보 최소화·보관기한과 키 설계 확정 | 단일/여러 IP·여러 계정·동시 instance·NAT·프록시 위조·counter 저장소 장애·window 경계 재현. 설정한 N까지 허용/N+1부터 거부·동시 초과 없음·정상 사용 복구 확인. PGlite 단일 연결 테스트만으로 통과하지 않음 |
| 최고관리자 MFA 강제 | MFA 등록/challenge/복구 UI·운영 계정 분리·서버 AAL2 검사가 아직 없음. 실제 JWT의 검증된 aal과 현재 DB role을 RPC/RLS에서 확인하도록 새 migration 필요. 클라이언트 user_metadata나 버튼 숨김은 근거 아님. 최초 최고관리자/분실 복구는 별도 승인·감사 절차 | 테스트 최고관리자의 aal1 토큰으로 모든 admin RPC/관리 데이터 접근이 거부되고 aal2만 허용되는지 확인. 오래된 토큰·권한 철회·factor 제거·로그아웃·복구·만료 검증. SQL owner/service_role 유지보수와 사용자 세션 구분. 실제 최고관리자 자격 증명으로 시험하지 않음 |
| 실제 RLS/RPC | 코드 fixture와 원격 schema/owner/extra permissive policy/view/grant/role membership/SECURITY DEFINER가 다를 수 있음. inventory 대조 후 필요한 차이만 새 migration으로 수정. 공개 credit와 private verification, soft-delete/랭킹, 모든 관리 endpoint 범위 포함 | anon/viewer/streamer/소유자/공동 가수/관리자/최고관리자/프로필 없음/타회원 토큰으로 직접 PostgREST/RPC 요청. allow/deny 표 작성, privilege 우회·사칭 UUID·직접 role 변경·private playlist 읽기/수정·삭제와 service key 미노출 확인. 기대 상태코드 및 0행/오류/실제 데이터 불변까지 검증 |
| DB 백업·복구 | 소스 bundle과 실데이터 백업은 별개. Dashboard의 가용 backup/PITR와 도구별 포함/제외 범위를 확인하고 Auth·RLS/roles·함수·Storage metadata/객체·Edge 설정을 분리 보관. 암호화·최소 접근·유효기간·RPO/RTO/담당자 필요. 실제 DB 덤프 Git/채팅 업로드 금지 | 격리 프로젝트로 복원해 가짜/비식별 데이터의 회원 ID·곡/credit/library/청취 참조 무결성·권한·로그인·Storage 접근을 확인. 현재 이후 쓰기 손실량·복원 소요·Auth/메일 부작용·secret 재설정 범위 기록. backup 파일 존재만으로 완료 처리하지 않음 |
| 관리자 감사 로그 | 현재 감사 테이블/서버 기록 미구현. actor UUID/current role·대상·작업 종류·결과·서버 시각·request ID를 append-only로 기록하고 클라이언트 수정/삭제 금지. 최소화한 변경 요약만 남기고 password/JWT/메일 원문/secret은 제외. 로그 보존·열람 권한/경보 설계 | 정상/거부된 role 변경·가수 link/unlink·삭제/복구의 로그 일치, 위조 actor 불가, 중복 request ID 처리, 일반회원 열람/관리자 직접 변조 거부 확인. 실패 트랜잭션 내부 INSERT는 같이 rollback되므로 거부 요청의 감사는 신뢰된 서버/게이트웨이의 별도 안전한 경로가 필요. 권한 변경과 성공 감사의 원자성도 검증 |

실제 Auth 기능·hook·IP header 계약은 사용하는 Supabase 버전/플랜과 공식 지원 범위를 확인한 뒤 확정한다. 지원을 확인하지 않은 설정을 활성화됐다고 주장하지 않는다. 이번에는 새 기능 구현/실서버 호출/DB 변경을 하지 않았다.

권장 다음 순서: 실제 스키마/배포 source 증거 확보 → 격리 복원·rehearsal → 승인된 staging 001~004/Edge 검증 → IP/Auth 직접 경로·최고관리자 MFA·감사 로그 작은 단위 구현 → 운영 환경 분리/출시 검증. SOOP는 공식 OAuth 지원 범위 확인부터 별도로 진행한다. 추론 수준은 High 권장.
