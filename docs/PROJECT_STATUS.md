# 현재 V3.0 점검 메모 (압축파일 기준)

**확인 범위:** 코드/README/SQL 파일 존재 여부. 실제 Supabase 원격 설정, 배포 환경, 기능 정상동작은 검증하지 못함.

| 영역 | 현재 상태 | 근거/주의 |
|---|---|---|
| 자체 가입/아이디 로그인 | 코드 있음, 환경 검증 필요 | `virhang-auth.js`, `virhang-username-login` Edge Function |
| 이메일 인증 | UI·로직 일부, 실발송 검증 필요 | SMTP/OTP 정책 확인 필요 |
| 역할과 관리자·스트리머 관리 | SQL 및 JS 존재, 배포 확인 필요 | `V2.6.8_ADMIN_STREAMER_SETUP.sql`, `virhang-admin.js` |
| 곡 게시, 수정/소프트삭제, 공동가수 뒤늦게 연결 | 코드와 SQL 있음 | `V2.6.9_PUBLISHED_TRACKS_SETUP.sql`, `V3.0_JOINT_SINGERS_LATE_SIGNUP.sql` |
| YouTube 재생/30초 집계/새 재생 반복 집계 | 코드와 SQL 존재, 실사용 검증 필요 | `youtube-player.js`, `V3.0_RANKING_BACKEND_SETUP.sql`, `V3.0_ALLOW_REPLAYS.sql` |
| 기간별 랭킹 | 일부 구현 | 서버 기록 구현됨, 좋아요 랭킹·스냅샷/NEW 별도 필요 |
| SOOP URL 인식 | 외부 탭으로 열기 구현 | 임베드나 외부 시청 집계 아님 |
| SOOP 계정 OAuth 연동 | 테스트 수준, 미완성 | 과거 `beohang-test` 콜백과 누락된 `virhang-soop-auth` Edge Function 원본 |
| 개인 좋아요·플레이리스트 | 일부 클라이언트/라이브러리 구현, 동기화·권한·집계 검증 필요 | 공통 좋아요 랭킹 미연결 |
| 최고관리자 MFA | 코드에서 확인되지 않음 | 추가 구현/인증 공급자 설정 필요 |
| 테스트/운영 분리 | 구성되지 않음 | 이 프로젝트를 staging의 소스 기점으로 삼을 것 |

**보안 주의:** 업로드 원본에 Supabase 프로젝트 URL(비밀값 아님), SOOP Client ID(비밀키 아님), 과거 callback URL이 있음. Secret은 사용자/플랫폼 설정에서 관리해야 한다. 프런트 파일에 publishable key placeholder가 남아 있어 현재 원본만으로 즉시 정상 배포된다고 단정할 수 없음.
