# 버항 V3.0 — Codex 시작 키트

이 파일은 원래 V3.0 프로젝트를 **그대로 포함**하고, Codex용 지침만 추가한 패키지다. 실제 서버·DB에 자동 연결되지는 않는다.

## 시작
1. 원본 ZIP 별도 보관. 이 ZIP을 PC의 `VirHang` 폴더에 압축 해제.
2. ChatGPT 데스크톱 앱 → Codex → 로컬 프로젝트 폴더 `VirHang` 열기.
3. `AGENTS.md`와 `docs/` 파일들이 있는 폴더를 열었는지 확인.
4. `docs/FIRST_CODEX_PROMPT.md` 내용을 Codex 대화에 붙여넣기.
5. 먼저 읽기 전용 코드 감사/설계 결과 검토 → 작은 단위로 구현 시작.
6. 현재 Supabase에 SQL을 실행하거나 실제 사이트에 배포하기 전 확인할 것.

## 테스트 서버 방향
- 지금 만든 사이트를 staging으로 유지.
- 나중에 운영용 사이트/Supabase 별도 신규 생성.
- 테스트와 운영 DB 및 API 키, OAuth 콜백, 계정 완전 분리.
- production 로그인 제한은 항상 켜고 staging에서도 보호 장치 사용.

## 보안
이 패키지에 서비스 역할 키, 계정 비밀번호를 넣지 말 것. 공개 키 placeholder는 환경 설정 전까지 바꾸지 않음.
