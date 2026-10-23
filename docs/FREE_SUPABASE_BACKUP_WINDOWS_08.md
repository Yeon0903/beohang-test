# 1단계 8차 — Free Supabase를 Windows PC에 비공개 백업

확인일: **2026-10-24 KST**. 대상은 기존 beohang-test Supabase다. **이 문서는 준비 절차이며 실제 DB 백업 생성·Windows 실행·실데이터 복원은 아직 하지 않았다. migration 000~004/Edge/Pages도 실행·변경하지 않는다.** 이전 Git bundle/복구 ZIP은 소스 백업이며 실제 DB/Auth 백업을 대신하지 않는다.

Supabase는 Free 프로젝트에 CLI export와 외부 보관을 권장한다. 공식 stable release **v2.122.0**(2026-10-23 공개)의 도움말 문서와 구현을 확인했다. 아래 버전을 고정해 사용하고 beta/latest로 임의 교체하지 않는다.

## 1. 백업 범위

| 대상 | 보관 위치/방법 | 주의 |
|---|---|---|
| public 및 사용자 정의 스키마의 표/인덱스/제약/RLS/grant/SQL 함수 | schema.sql | 실제 정의 기준. 아직 없는 공동 가수/private 로그인 객체는 백업에 없는 것이 정상 |
| 회원·최고관리자 role·곡·library JSON·재생·legacy 표 | data.sql | 최고관리자 권한은 **public.virhang_users.role 데이터**다. roles.sql에 저장되는 권한과 다름 |
| 가수 identity/공동 가수 credit | 존재하면 data.sql | 현재 확인상 두 표는 없음. 기존 singer 문자열은 published_tracks에 보존. 000을 적용해서 만든 후 백업하는 것이 아님 |
| Auth 사용자/identities 및 Auth 데이터 | data.sql | v2.122.0의 기본 data-only dump는 auth를 포함한다. auth.schema_migrations 등 내부 이력은 제외. **--schema public로 제한하면 Auth를 빠뜨림** |
| Auth 비밀번호 해시/인증 상태/MFA·세션 관련 행 | 위 Auth 데이터 범위 | 평문 비밀번호 백업이 아니다. 데이터에 민감한 해시/토큰이 있을 수 있으므로 전체 덤프 비공개. 암호화 키/서비스 버전/서명 키/설정 차이로 세션·MFA·OAuth 재사용을 보장하지 않음 |
| 사용자 정의 PostgreSQL role/config/grant | roles.sql | 관리 role은 필터링하며 **role 로그인 비밀번호는 제외**. 대상에 필요하면 나중에 별도 재설정. 앱의 admin/super_admin role 값과 구분 |
| auth/storage 관리 스키마 정의와 가입 trigger/RLS | managed-schema-reference.sql + 실제 custom trigger DDL 별도 저장 | 기본 schema.sql은 이 스키마를 제외한다. 관리 스키마 전체 reference를 새 Supabase에 통째로 적용하지 않음 |
| Supabase CLI migration history | 존재할 때 history-schema.sql/history-data.sql 추가 | 일반 dump는 supabase_migrations를 제외. 없다면 없음을 비공개 기록하고 만들어내지 않음 |
| Storage bucket/object 메타데이터 | data.sql의 storage 데이터 | **파일 바이트는 포함 안 됨**. vector 표 2개는 공식 기본 명령에서 제외하므로 사용 시 별도 절차 필요 |
| Storage 실제 파일 | storage-files/에 별도 다운로드 | public/private bucket 모두, 하위 경로·빈 파일·전체 페이지·개수/크기/hash 대조. 외부 YouTube/SOOP 영상은 DB 백업 대상 아님 |
| 배포된 Edge 소스/공유 모듈 | edge/에 읽기 전용 download | 저장소 버전과 실제 배포본이 다를 수 있음. 원격 배포 버전/JWT 검증 설정도 비공개 기록 |
| Auth 서비스 설정·SMTP·OAuth·redirect·rate limit·이메일 템플릿·MFA 정책 | private-settings/에 수동 기록 | SQL dump가 Dashboard 설정을 복원해 주지 않음. secret 값은 비밀번호 관리자에 따로 보관 |
| Edge secrets, DB 비밀번호, API/JWT 서명 키, Vault/pgsodium root key | 별도 비밀 저장소 | secrets list의 이름/해시는 secret 원문 백업이 아님. Vault/root-key 이전은 별도 검토·승인 없이 실행하지 않음 |
| Realtime publications/replication·extensions·webhooks/cron·network 설정 | private-settings/목록 및 필요한 정의 | 일부 관리 객체/extension 데이터/event trigger는 CLI가 제외/변형. SQL 3개만으로 플랫폼 전체 복구 완료라고 표시하지 않음 |

근거: [Free 백업 안내](https://supabase.com/docs/guides/platform/backups), [공식 CLI 백업/복구](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [v2.122.0 dump 필터 구현](https://github.com/supabase/cli/blob/v2.122.0/apps/cli-go/pkg/migration/dump.go), [role 비밀번호 제외 구현](https://github.com/supabase/cli/blob/v2.122.0/apps/cli-go/pkg/migration/scripts/dump_role.sh).

## 2. Windows 설치 전 확인

일반 PowerShell에서 실행한다. 출력은 PC 환경 정보뿐이며 여기로 보낼 필요 없다.

```powershell
winver
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture
wsl --version
```

현재 [Docker Windows 요구사항](https://docs.docker.com/desktop/setup/install/windows-install/)은 x64 Windows 10 22H2/build 19045의 해당 에디션, WSL 2.1.5 이상, RAM 8GB 이상, 가상화 활성화를 명시하고 **Microsoft 서비스 지원 기간 내 OS**만 지원한다고 설명한다. 에디션/지원 상태까지 확인한다. Windows 10이라는 이유만으로 설치가 지원된다고 보장하지 않는다. 요구사항을 만족하지 못하면 지원되는 PC/OS에서 같은 CLI 방식으로 export한 뒤 암호화된 백업을 Windows PC에 보관한다. 지원되지 않는 구버전 Docker를 임의 설치하지 않는다.

WSL이 필요한 경우에만 **관리자 PowerShell**에서 설치하고 재부팅한다. 이미 설치됐으면 불필요하게 재설치하지 않는다.

```powershell
wsl --install
# 재부팅 후 필요한 경우
wsl --update
wsl --version
```

[Microsoft WSL 설치 안내](https://learn.microsoft.com/en-us/windows/wsl/install)의 조건을 따른다. Docker Desktop은 공식 설치 파일로 설치하고 **WSL 2 backend / Linux containers**로 시작한다. [Supabase CLI 설치 문서](https://supabase.com/docs/guides/local-development/cli/getting-started)에서도 Windows 컨테이너 실행 환경이 필요하다. 아래에서는 Node/npm/Scoop 설치 없이 공식 Windows x64 ZIP을 사용한다.

## 3. 공식 CLI 설치와 파일 체크섬 확인

일반 PowerShell에서 실행한다. Windows x64 전용 예시다. ZIP과 checksum은 Supabase 공식 GitHub release에서 가져온다. 먼저 공식 [v2.122.0 release](https://github.com/supabase/cli/releases/tag/v2.122.0)를 확인한다.

```powershell
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$virTools = Join-Path $env:LOCALAPPDATA 'VirHang\tools\supabase-2.122.0'
New-Item -ItemType Directory -Path $virTools -Force | Out-Null
$virRelease = 'https://github.com/supabase/cli/releases/download/v2.122.0'
$virAsset = 'supabase_2.122.0_windows_amd64.zip'
$virZip = Join-Path $virTools $virAsset
Invoke-WebRequest "$virRelease/$virAsset" -OutFile $virZip -UseBasicParsing
Invoke-WebRequest "$virRelease/checksums.txt" -OutFile (Join-Path $virTools 'checksums.txt') -UseBasicParsing
$virChecksumLine = @(Get-Content (Join-Path $virTools 'checksums.txt') | Where-Object {
    $_ -match ('\s+\*?' + [regex]::Escape($virAsset) + '$')
})
if ($virChecksumLine.Count -ne 1) { throw 'Official checksum entry missing/ambiguous. Stop.' }
$virExpectedHash = ($virChecksumLine[0] -split '\s+')[0]
if ((Get-FileHash $virZip -Algorithm SHA256).Hash -ne $virExpectedHash) { throw 'CLI ZIP checksum mismatch. Stop.' }
Expand-Archive -LiteralPath $virZip -DestinationPath $virTools -Force
$virCli = Join-Path $virTools 'supabase.exe'
& $virCli --version
if ($LASTEXITCODE -ne 0) { throw 'CLI did not start.' }
& $virCli db dump --help
docker version
if ($LASTEXITCODE -ne 0) { throw 'Start a supported Docker Desktop Linux engine first.' }
```

`--version`은 2.122.0인지 확인한다. 새 PowerShell 창을 열었다면 `$virCli` 경로를 다시 지정한다. ZIP을 검증한 뒤 실행하며 `npm install -g supabase`나 임의 설치 스크립트를 쓰지 않는다.

## 4. 비공개 폴더와 준비 상태 기록

백업 루트는 **%LOCALAPPDATA%\VirHang\backups\날짜-시간**이다. 예: `C:\Users\사용자\AppData\Local\VirHang\backups\20261024-153000`. Git clone/프로젝트/OneDrive/Desktop/Documents가 아닌 경로다. 디스크 여유 용량을 확인한다. BitLocker/장치 암호화 등 사용 가능한 암호화 저장소와 암호화된 별도 복사본을 권장한다. NTFS ACL만으로 로컬 관리자나 분실 디스크까지 보호되지는 않는다.

```powershell
$virBackup = Join-Path $env:LOCALAPPDATA ('VirHang\backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
if (Test-Path -LiteralPath $virBackup) { throw 'Backup path already exists; choose a new folder.' }
New-Item -ItemType Directory -Path $virBackup | Out-Null
# 데이터 쓰기 전에 현재 사용자와 SYSTEM만 접근하도록 새 폴더 ACL을 지정한다.
$virAcl = [System.Security.AccessControl.DirectorySecurity]::new()
$virAcl.SetAccessRuleProtection($true, $false)
$virSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$virSystemSid = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
foreach ($virIdentity in @($virSid, $virSystemSid)) {
    $virRule = [System.Security.AccessControl.FileSystemAccessRule]::new(
        $virIdentity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $virAcl.AddAccessRule($virRule)
}
Set-Acl -LiteralPath $virBackup -AclObject $virAcl
$virBackup
```

ACL 명령이 실패하면 중단한다. 파일을 공개 폴더에 대신 쓰지 않는다. 이 경로/전체 터미널/덤프 내용은 공유하지 않는다. `backup-notes.txt`를 PC에서 만들어 CLI 버전·시작/완료 시각·DB major version·보관 범위/미보관 항목만 비공개 기록한다. **비밀번호/접속 문자열/secret은 notes에도 쓰지 않는다.**

DB major version이 불명확하면 Supabase SQL Editor에서 다음 **SELECT만** 실행해 숫자만 확인한다. DB 비밀번호를 초기화하거나 migration을 실행하지 않는다.

```sql
SELECT current_setting('server_version_num')::integer / 10000 AS postgres_major;
SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='supabase_migrations') AS has_cli_history;
```

## 5. DB 연결 정보 준비 — 비밀번호는 PC에서만 입력

Supabase Dashboard의 기존 테스트 프로젝트 → **Connect → Session pooler**에서 host/user/database/port를 확인한다. 기본적으로 **Session mode / 5432**를 사용한다. Transaction pooler/6543은 사용하지 않는다. IPv6가 실제 지원되면 direct host도 가능하지만 아래는 Session pooler 예시다. host/region을 추측하지 않는다. 기존 DB 비밀번호를 모르면 여기서 중단한다. 비밀번호 재설정은 서비스에 영향을 줄 수 있어 별도 판단이다.

이 절차는 `supabase login/link`를 사용하지 않는다. 명시적 passwordless `--db-url` + 일시적 `PGPASSWORD`를 사용해 프로젝트 오연결과 연결 과정의 임시 role 생성 등을 피한다. **URL userinfo에 콜론/비밀번호를 넣지 않는다.** PGPASSWORD는 따로 전달되므로 비밀번호의 특수문자 percent-encoding이 필요 없다.

3~4절과 같은 일반 PowerShell 창에서 screen sharing/녹화/transcript/debug tracing 없이 수행한다. 실제 값이 입력되는 것은 `Read-Host` 프롬프트뿐이다. 명령 기록에는 변수 참조만 남긴다. 비밀번호를 명령 줄 리터럴, CLI의 --password 값, --token 값, --db-url 값, .env, setx, GitHub Actions secret 작업에 넣지 않는다. 복원 절차의 psql --password는 값을 받는 옵션이 아니라 숨김 입력을 강제하는 flag다.

## 6. 실제 SQL export 명령 — 사용자 PC에서만 실행

먼저 가입/곡 수정/파일 업로드/배포가 적은 시간을 택한다. **각 dump는 별도 snapshot**이므로 4개 파일이 하나의 트랜잭션이라고 가정하지 않는다. data.sql 자체는 pg_dump의 일관된 snapshot이지만 백업 이후의 새 변경은 포함되지 않는다. 이 작업은 쓰기를 차단하거나 사이트를 내리지 않는다. 백업 중 다른 관리자가 DDL/권한을 바꾸면 안정된 시간에 다시 생성한다.

아래는 위에서 설정한 `$virCli`, `$virBackup`을 사용한다. **원격에서는 db dump만 실행한다.** `--dry-run`도 비밀번호가 확장된 스크립트를 출력할 수 있으므로 사용하지 않는다.

```powershell
$virDbHost = Read-Host 'Session pooler host only (no URL/password)'
$virDbUser = Read-Host 'Session pooler user (postgres.PROJECTREF)'
$virPgMajor = Read-Host 'Postgres major from the SELECT (15 or 17, not a guess)'
if ($virDbHost -notmatch '^aws-[a-zA-Z0-9-]+\.pooler\.supabase\.com$') { throw 'Unexpected pooler host. Stop and verify Connect panel.' }
if ($virDbUser -notmatch '^postgres\.[a-z]{20}$') { throw 'Unexpected database user. Stop.' }
if ($virPgMajor -notin @('15','17')) { throw 'Review CLI support for this source Postgres version first.' }
$virDbUrl = 'postgresql://' + $virDbUser + '@' + $virDbHost + ':5432/postgres?sslmode=require'
$virWork = Join-Path $virBackup 'cli-work'
New-Item -ItemType Directory -Path $virWork | Out-Null
$virPreviousPassword = [Environment]::GetEnvironmentVariable('PGPASSWORD', 'Process')
$virPreviousTelemetry = [Environment]::GetEnvironmentVariable('SUPABASE_TELEMETRY_DISABLED', 'Process')
$virSecret = $null
$virPtr = [IntPtr]::Zero
Push-Location $virWork
try {
    $env:SUPABASE_TELEMETRY_DISABLED = '1'
    & $virCli init
    if ($LASTEXITCODE -ne 0) { throw 'Local CLI init failed.' }
    $virConfig = Join-Path $virWork 'supabase\config.toml'
    $virConfigText = [IO.File]::ReadAllText($virConfig)
    $virMajorPattern = '(?m)^major_version[ \t]*=[ \t]*\d+[ \t]*\r?$'
    if ([regex]::Matches($virConfigText, $virMajorPattern).Count -ne 1) { throw 'Review local config major_version format.' }
    $virConfigText = [regex]::Replace($virConfigText, $virMajorPattern, ('major_version = ' + $virPgMajor))
    [IO.File]::WriteAllText($virConfig, $virConfigText, ([Text.UTF8Encoding]::new($false)))
    $virSecret = Read-Host 'Existing TEST database password (hidden; never paste in chat)' -AsSecureString
    $virPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($virSecret)
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($virPtr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($virPtr)
    $virPtr = [IntPtr]::Zero
    if ([string]::IsNullOrEmpty($env:PGPASSWORD)) { throw 'Empty password; stop.' }

    & $virCli db dump --db-url $virDbUrl --file (Join-Path $virBackup 'roles.sql') --role-only
    if ($LASTEXITCODE -ne 0) { throw 'roles export failed. Backup incomplete.' }
    & $virCli db dump --db-url $virDbUrl --file (Join-Path $virBackup 'schema.sql')
    if ($LASTEXITCODE -ne 0) { throw 'schema export failed. Backup incomplete.' }
    & $virCli db dump --db-url $virDbUrl --file (Join-Path $virBackup 'data.sql') --data-only --use-copy -x 'storage.buckets_vectors' -x 'storage.vector_indexes'
    if ($LASTEXITCODE -ne 0) { throw 'data export failed. Backup incomplete.' }
    & $virCli db dump --db-url $virDbUrl --file (Join-Path $virBackup 'managed-schema-reference.sql') --schema 'auth,storage'
    if ($LASTEXITCODE -ne 0) { throw 'managed schema reference export failed. Backup incomplete.' }

    # SELECT 결과에 실제 history schema가 존재할 때만 y. 모르면 n 후 미확인으로 기록.
    $virHistory = Read-Host 'Did has_cli_history return true? (y/n)'
    if ($virHistory -eq 'y') {
        & $virCli db dump --db-url $virDbUrl --file (Join-Path $virBackup 'history-schema.sql') --schema supabase_migrations
        if ($LASTEXITCODE -ne 0) { throw 'history schema export failed.' }
        & $virCli db dump --db-url $virDbUrl --file (Join-Path $virBackup 'history-data.sql') --schema supabase_migrations --data-only --use-copy
        if ($LASTEXITCODE -ne 0) { throw 'history data export failed.' }
    }
}
finally {
    if ($virPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($virPtr) }
    if ($null -ne $virSecret) { $virSecret.Dispose() }
    [Environment]::SetEnvironmentVariable('PGPASSWORD', $virPreviousPassword, 'Process')
    [Environment]::SetEnvironmentVariable('SUPABASE_TELEMETRY_DISABLED', $virPreviousTelemetry, 'Process')
    $virPreviousPassword = $null
    $virDbUrl = $null
    Pop-Location
}
```

PowerShell 5.1의 `>`/`Out-File`은 덤프 한글/인코딩을 손상할 수 있으므로 **CLI의 --file을 사용**했다. 비밀번호는 실행 중 프로세스 환경에 평문으로 존재하며 관리자 권한의 로컬 도구에는 보일 수 있다. 신뢰하는 PC에서만 실행하고 종료 후 터미널을 닫는다. 환경 변수 삭제가 모든 관리 메모리를 완전히 지운다는 뜻은 아니다. 이 명령을 Codex 원격 터미널에 대신 입력하지 않는다.

## 7. 기본 파일·Auth 포함·무결성 검사

export 중 하나라도 exit code가 실패했다면 파일이 있어도 백업 완료가 아니다. 새 폴더에서 다시 시작하고 실패 파일/로그를 업로드하지 않는다.

```powershell
$virRequiredFiles = @('roles.sql','schema.sql','data.sql','managed-schema-reference.sql')
foreach ($virName in $virRequiredFiles) {
    $virFile = Join-Path $virBackup $virName
    if (!(Test-Path -LiteralPath $virFile) -or (Get-Item -LiteralPath $virFile).Length -eq 0) { throw 'Missing/empty export. Stop.' }
}
# -Quiet는 일치한 줄/회원 정보를 출력하지 않고 bool만 돌려준다.
foreach ($virTable in @('auth.users','auth.identities','public.virhang_users','public.virhang_published_tracks','public.virhang_account_libraries','public.virhang_rank_listens')) {
    $virParts = $virTable.Split('.')
    $virCopyPattern = '^COPY "' + [regex]::Escape($virParts[0]) + '"\."' + [regex]::Escape($virParts[1]) + '"[ \t]*\('
    if (!(Select-String -LiteralPath (Join-Path $virBackup 'data.sql') -Pattern $virCopyPattern -Quiet)) {
        throw ('Required table COPY block missing: ' + $virTable)
    }
}
$virManifest = @(Get-ChildItem -LiteralPath $virBackup -Filter '*.sql' -File | ForEach-Object {
    [pscustomobject]@{ File = $_.Name; Bytes = $_.Length; SHA256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
})
$virManifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $virBackup 'sha256-manifest.json') -Encoding UTF8
# 나중에 재검증: 원본 폴더 또는 암호화 복사본을 풀어 놓은 비공개 경로에서 실행.
$virSavedManifest = Get-Content -LiteralPath (Join-Path $virBackup 'sha256-manifest.json') -Raw | ConvertFrom-Json
foreach ($virEntry in $virSavedManifest) {
    if ($virEntry.File -notmatch '^[a-zA-Z0-9_-]+\.sql$') { throw 'Unexpected manifest filename.' }
    $virCheckFile = Join-Path $virBackup $virEntry.File
    if ((Get-Item -LiteralPath $virCheckFile).Length -ne $virEntry.Bytes -or
        (Get-FileHash -LiteralPath $virCheckFile -Algorithm SHA256).Hash -ne $virEntry.SHA256) { throw 'Backup checksum mismatch. Stop.' }
}
'File integrity matches; actual restore is NOT yet verified.'
```

SHA256 일치는 파일 변경/복사 손상 확인이며 완전한 DB 복구 증명이 아니다. COPY 블록 존재도 행 수/권한/로그인 복구를 증명하지 않는다. 원본 SQL을 편집해 오류를 감추지 않는다. 복구용 수정이 필요하면 검증된 별도 사본과 변경 기록을 사용하고 원본/hash를 보존한다. 추가 DDL/파일 보관 후에는 새 manifest를 별도로 만들어 이전 manifest를 덮어쓰지 않는다.

### 원본/격리 복원본의 비공개 비교 기준

다음 SELECT를 백업 시점에 가까운 조용한 시간의 **원본 SQL Editor**와 복원 후의 **localhost psql**에서 각각 실행해 결과를 PC 비공개 notes에 저장한다. 현재 보고서에서 존재가 확인된 표만 대상으로 하며 계정 값은 출력하지 않는다. 실제 원격 확인이 달라 표가 없으면 중단·미확인으로 기록하고 표를 만들지 않는다.

```sql
SELECT 'auth.users' AS object_name, count(*) AS row_count FROM auth.users
UNION ALL SELECT 'auth.identities', count(*) FROM auth.identities
UNION ALL SELECT 'public.virhang_users', count(*) FROM public.virhang_users
UNION ALL SELECT 'public.virhang_users:super_admin', count(*) FROM public.virhang_users WHERE role='super_admin'
UNION ALL SELECT 'public.virhang_published_tracks', count(*) FROM public.virhang_published_tracks
UNION ALL SELECT 'public.virhang_account_libraries', count(*) FROM public.virhang_account_libraries
UNION ALL SELECT 'public.virhang_rank_listens', count(*) FROM public.virhang_rank_listens
UNION ALL SELECT 'public.virhang_login_attempts', count(*) FROM public.virhang_login_attempts
UNION ALL SELECT 'public.virhang_tracks', count(*) FROM public.virhang_tracks
UNION ALL SELECT 'public.virhang_playlists', count(*) FROM public.virhang_playlists;

SELECT
  EXISTS(SELECT 1 FROM auth.users a WHERE NOT EXISTS(SELECT 1 FROM public.virhang_users p WHERE p.id=a.id)) AS has_auth_only,
  EXISTS(SELECT 1 FROM public.virhang_users p WHERE NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=p.id)) AS has_orphan_profile;
```

읽기 전용이지만 큰 표의 count는 부하가 있어 실행 시간을 선택한다. 이 결과도 공개하지 않는다. Auth-only=true는 사용자 확인상 기존 상태이며 복원 후 임의로 없애지 않는다. 최고관리자 수/표 행 수가 같다는 것만으로 동일 계정·동일 곡·JSON·권한이 보존됐다고 증명하지 못한다. PC 안에서 원본 dump/복원 데이터의 ID·필드·연결·RLS/grant/trigger까지 대조한다. 원본이 계속 변경되면 조회와 dump snapshot 차이 때문에 수가 달라질 수 있어 시각/RPO를 함께 기록하고 차이를 해소하기 전에는 통과로 표시하지 않는다.

## 8. 기본 dump에서 빠지는 가입 trigger 등

schema.sql은 public의 profile 생성 **함수**는 담더라도 auth.users의 **trigger**를 빠뜨릴 수 있다. 실제 정의를 별도 저장해야 가입 흐름을 복구할 수 있다. SQL Editor에서 아래 **읽기 전용 SELECT**를 실행하고 결과를 PC의 private backup 폴더 `custom-auth-trigger-reference.txt`로 저장한다. 결과는 채팅/GitHub에 보내지 않는다. 소스의 예상 이름은 virhang_v26_auth_signup_profile이지만 원격에서 이름이 다를 수 있어 모든 사용자 trigger를 조회한다. 설치된 signup trigger가 없다면 만들어내지 않고 미확인으로 기록한다. 조회된 모든 trigger를 앱 소유라고 간주하지 않는다.

```sql
SELECT t.tgname, pg_get_triggerdef(t.oid, true) || ';' AS private_restore_reference
FROM pg_trigger t
WHERE t.tgrelid = 'auth.users'::regclass
  AND NOT t.tgisinternal
ORDER BY t.tgname;
```

이 reference와 managed-schema-reference.sql에서 **실제 custom trigger/RLS 등만** 검토해 `custom-managed-reviewed.sql` 복원 사본을 만든다. 관리 스키마 전체를 복원 대상으로 삼거나 저장소의 옛 설정 SQL을 무작정 재실행하지 않는다. 일반 schema.sql의 public 함수가 먼저 복원된 뒤 custom trigger를 복원한다. 기본 Supabase 관리 스키마는 대상 Supabase의 올바른 서비스 버전이 제공해야 한다.

## 9. SQL 외 항목 별도 보관

1. **Storage**: Dashboard Storage에서 모든 bucket(비공개 포함)·하위 객체를 확인해 PC `storage-files/`로 다운로드한다. 파일이 많으면 공식 [다운로드 안내](https://supabase.com/docs/guides/storage/management/download-objects)의 CLI/S3 방식을 별도 구성한다. 페이지당 일부만 받은 상태를 전체 백업으로 표시하지 않는다. 새 S3 자격 증명 생성/설정 활성화는 이번 작업에 포함하지 않는다. bucket 설정, 경로, 개수, 총 바이트, 파일 SHA256을 비공개로 대조한다. unused라면 확인 후 '미사용'으로 기록한다.
2. **Edge**: 실제 배포본을 `edge/`에 다운로드한다. 토큰을 명령 줄에 넣지 않고 `supabase login`의 공식 대화형 흐름을 PC에서만 사용한다. DB link는 하지 않는다. 다음은 읽기 전용 API 호출과 로컬 파일 저장이다.

```powershell
$virCli = Join-Path $env:LOCALAPPDATA 'VirHang\tools\supabase-2.122.0\supabase.exe'
$virBackup = Read-Host 'Existing private backup folder path on this PC'
if (!(Test-Path -LiteralPath $virBackup -PathType Container)) { throw 'Backup folder missing.' }
$virProjectRef = Read-Host 'Confirmed existing test project ref only'
if ($virProjectRef -notmatch '^[a-z]{20}$') { throw 'Invalid project ref.' }
$virEdge = Join-Path $virBackup 'edge'
New-Item -ItemType Directory -Path $virEdge | Out-Null
& $virCli login
if ($LASTEXITCODE -ne 0) { throw 'Interactive login failed.' }
& $virCli functions list --project-ref $virProjectRef
if ($LASTEXITCODE -ne 0) { throw 'Function inventory failed.' }
& $virCli functions download --project-ref $virProjectRef --workdir $virEdge --use-api
if ($LASTEXITCODE -ne 0) { throw 'Function download incomplete.' }
```

3. **설정/비밀값**: Auth providers/가입·이메일 인증/OTP·SMTP/메일 템플릿/URL·redirect/비밀번호·rate limit·MFA 설정, Edge의 JWT 검증·배포 버전/region/config, OAuth callback, extensions/publications/webhooks/cron 등을 private-settings/에 기록한다. 비밀 원문은 암호 관리자의 별도 항목으로 보관한다. [CLI reference](https://supabase.com/docs/reference/cli/supabase-functions-download)의 functions download는 secret 원문을 내려받는 기능이 아니다. 저장소에 누락됐던 SOOP Edge가 배포돼 있다면 그 실제 소스도 대상이다. 복구할 secret 원문을 확보하지 못하면 '미확보'로 기록한다.
4. **Vault/암호화**: 사용하는지 비공개 확인한다. 사용 중이면 단순 SQL restore로 해독된다고 가정하지 않는다. [공식 특수 복구 고려사항](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)에 따른 별도 키 처리 검토가 필요하며, 키를 공개 파일/대화에 복사하지 않는다.

## 10. 격리 복원 검증 절차 — 원격 대상으로 실행 금지

새 유료/무료 hosted project 생성은 이번에 승인하지 않았으므로 로컬 Supabase를 우선한다. **기존 Git 소스 폴더가 아닌 새 빈 폴더**를 쓴다. 000~004나 seed/원격 설정을 복사하지 않는다. 표준 PostgreSQL만으로는 Supabase 관리 role/Auth/schema를 충실히 재현하지 못한다.

1. CLI 설치/Docker 이미지 준비를 먼저 마친다. 새 폴더를 만들고 4절에서 만든 현재 사용자/SYSTEM 전용 ACL을 적용한다. 아래는 같은 PowerShell 창의 `$virCli`, `$virAcl`을 사용한다.

```powershell
$virRestore = Join-Path $env:LOCALAPPDATA ('VirHang\restore-check\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
if (Test-Path -LiteralPath $virRestore) { throw 'Restore folder exists. Stop.' }
New-Item -ItemType Directory -Path $virRestore | Out-Null
Set-Acl -LiteralPath $virRestore -AclObject $virAcl
& $virCli init --workdir $virRestore
if ($LASTEXITCODE -ne 0) { throw 'Local restore init failed.' }
notepad (Join-Path $virRestore 'supabase\config.toml')
```

2. 열린 config.toml에서 project_id를 기존과 구별되는 `virhang-restore-08`로, `[db]`의 major_version을 확인한 원본 major로 설정해 저장하고 메모장을 닫는다. 실제 SMTP/OAuth/서버 secret을 넣지 않는다. migrations와 seed가 비어 있는지 확인한다.
3. `& $virCli start --workdir $virRestore`로 기본 관리 스키마/서비스 버전을 준비한다. 실패하면 데이터를 복원하지 않는다. 출력에 로컬 키가 있으므로 로그/스크린샷을 공유하지 않는다. 로컬 서비스 버전이 원본과 맞지 않으면 복원이 실패할 수 있다. 원본 SQL을 즉석 수정해 통과시키지 않는다.
4. **실제 데이터를 넣기 전** Docker Desktop에서 이 restore 프로젝트의 Auth/REST/Edge/Realtime/Storage/Analytics 등 외부 부작용이 있는 서비스를 모두 멈추고 DB만 남긴다. 다른 프로젝트 컨테이너를 중지하지 않는다. 포트는 localhost로만 접근하며 외부 공개하지 않는다. Windows 방화벽/네트워크 격리로 외부 통신을 차단한다. 가장 단순한 방법은 이미지 준비 후 Wi-Fi/Ethernet 연결을 끊고, 복원 DB를 중지한 뒤에만 다시 연결하는 것이다. SQL에는 cron/webhook/외부 URL이 포함될 수 있어 DB만 켜도 인터넷 차단이 필요하다. 이 조건을 만들 수 없다면 원본 회원 데이터로 복원하지 않는다.
5. [PostgreSQL 공식 Windows 도구](https://www.postgresql.org/download/windows/)에서 원본과 호환되는 `psql`을 설치한다. 설치 시 만든 다른 DB를 복원 대상으로 착각하지 않는다. 아래는 **127.0.0.1:54322**에 있는 해당 로컬 Supabase DB만 대상으로 한다. 포트가 다르면 먼저 local config와 실행 중인 DB를 확인하고 문서를 수정 검토한다. 원격 host나 $virDbUrl로 바꾸지 않는다.

```powershell
# 새 창. 원격 PGPASSWORD/PGSERVICE/PGHOST 등은 재사용하지 않는다.
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:PGSERVICE -ErrorAction SilentlyContinue
Remove-Item Env:PGSERVICEFILE -ErrorAction SilentlyContinue
Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue
$virBackup = Read-Host 'Private backup folder path on this PC'
$virPsql = Read-Host 'Full path to installed psql.exe (not a connection URL)'
if (!(Test-Path -LiteralPath $virPsql -PathType Leaf)) { throw 'psql.exe missing.' }
& $virPsql --version
if ($LASTEXITCODE -ne 0) { throw 'psql did not start.' }
# 비밀번호 프롬프트에는 LOCAL Supabase의 비밀번호만 입력한다. 원격 DB 비밀번호가 아님.
& $virPsql --no-psqlrc --host=127.0.0.1 --port=54322 --username=postgres --dbname=postgres --password --single-transaction --set=ON_ERROR_STOP=1 --command='ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;' --file="$virBackup\roles.sql" --file="$virBackup\schema.sql" --command='SET session_replication_role = replica;' --file="$virBackup\data.sql" --command='SET session_replication_role = origin;'
if ($LASTEXITCODE -ne 0) { throw 'Local restore failed; NOT verified. Keep originals and stop.' }
```

psql.exe의 일반적인 설치 위치는 `C:\Program Files\PostgreSQL\<설치한 버전>\bin\psql.exe`다. 실제 설치 경로를 확인한다.

이 명령은 새 로컬 DB에 데이터를 쓰므로 반드시 대상/격리 조건을 확인한다. 역할/스키마/데이터 순서와 trigger 비활성화는 공식 복원 절차를 따르고, default grant 때문에 원본보다 권한이 넓어지지 않게 사전 revoke한다. 즉시 회원 생성 trigger가 Auth 복사 중 중복 profile을 만들지 않도록 한다. **이 명령은 현재 테스트 Supabase 복구용 명령이 아니다.**

6. 성공 후 검토한 custom-managed-reviewed.sql, 필요 시 history 두 파일을 **같은 localhost 전용 조건**으로 별도 single-transaction/ON_ERROR_STOP 복원한다. 관리 스키마 전체 reference는 실행하지 않는다. 미복원 custom trigger/정책은 미완료로 기록한다. extensions/Vault/Auth·Storage 버전 문제가 있으면 중단해 원인을 기록한다.
7. 네트워크가 차단된 상태에서 localhost `psql`의 읽기 전용 조회로 원본의 비공개 inventory와 회원/Auth ID 연결·최고관리자 role·표별 실제 행 수·곡 ID/credit/JSON·청취 이벤트·시각·RLS/grant/RPC/가입 trigger를 비교한다. 원본 회원 행·해시·비밀번호·토큰을 채팅에 보내지 않는다. Auth-only도 보존됐는지 확인하고 자동 생성/정리하지 않는다. 기존 앱에 아직 없는 artist/credit 표를 새로 만들지 않는다. 표 개수/파일 checksum만으로 복원 통과라고 하지 않는다.
8. 실제 SMTP/OAuth/Edge 호출 없이 DB 복원까지 확인한다. 로그인 기능의 최종 검증은 별도 합성 테스트 계정/격리 설정으로 준비하며 실제 최고관리자 자격 증명을 써서 공격/로그인 테스트하지 않는다. raw 데이터 복원만으로 전체 플랫폼 복구 성공을 주장하지 않는다.
9. 복원 DB와 해당 프로젝트의 모든 컨테이너를 중지한 뒤에만 네트워크를 다시 연결한다. 자동 재시작 설정도 확인한다. Auth/SQL/Storage 원본과 hash manifest, 비공개 검증 기록은 암호화된 다른 매체에 한 번 더 복사하고 hash를 대조한다. 복원 환경의 비밀값/회원 데이터도 Git/클라우드 동기화로 내보내지 않는다.

## 11. 이번 완료 상태와 9차 진입 기준

- 완료: 공식 문서/CLI v2.122.0 범위 확인과 Windows 명령·비밀값 입력·보관·hash·격리 복원 절차 작성.
- **미완료: 사용자 PC CLI/Docker 설치, 실제 export 파일 생성, Storage/Edge/설정 확보, 실제 checksum 대조, 실데이터 격리 복원.** 작성된 명령은 Windows 10에서 실행 검증되지 않았다.
- 원격 DB/Edge/Pages와 000~004에는 아무 작업도 하지 않았다. 여기서 9차를 바로 시작하지 않는다.
- 9차 조건: 실제 SQL export 전부 성공/필수 Auth·앱 표 포함, 관리 schema custom 객체/이력 범위 확인, Storage/Edge/설정의 확보 또는 미사용 확인, 원본/복사본 hash 일치, 격리 복원·데이터/권한 검증 및 예외 해결, 프로젝트·쓰기 시점/RPO·적용 범위의 별도 승인.
- 공유할 수 있는 진행 상태는 CLI 버전/각 단계 성공 여부/검증된 범위/민감값을 지운 에러 코드 정도다. 백업 파일/SQL 원문/Auth 사용자 화면/전체 에러/비밀값은 첨부하지 않는다.
- 다음 단계: **1단계 9차 — 백업 검증 후 테스트 환경에서 migration 적용 및 기능 검증. 추천 추론 수준 High.**
