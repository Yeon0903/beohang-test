버항 V2.4 — 버항 계정 우선, SOOP 선택 연동(A안)
1. Supabase virhang 프로젝트 SQL Editor에서 V2.4_DATABASE_SETUP.sql 실행.
2. Supabase Authentication > Providers에서 Email 사용 및 이메일 확인 정책 검토.
3. Supabase Authentication > URL Configuration에 GitHub Pages 사이트 URL/redirect 등록.
4. Supabase Project Settings > API Keys 에서 publishable/anon PUBLIC 키를 복사해 virhang-auth.js의 PASTE_SUPABASE_PUBLISHABLE_KEY_HERE 부분만 교체. service_role/secret 키 금지!
5. GitHub Pages 루트에 index.html, app.js, style.css, soop-auth.js, virhang-auth.js, youtube-player.js 업로드. auth/callback.html은 auth 폴더 유지.
6. 신규 회원가입 → 확인 이메일 → 로그인 → 좋아요 및 플레이리스트 저장 테스트.
버항 계정과 SOOP 인증 연결은 아직 분리돼 있으며 SOOP 계정 연결 완료 표시는 구현하지 않음.
스트리머 즐겨찾기/추천/투표는 SOOP 연동 구현 전까지 제한.
음악 목록 자체는 기존 로컬 데모 데이터이므로 다른 기기에서 원래 노래 데이터까지 동기화되는 것은 아님.
