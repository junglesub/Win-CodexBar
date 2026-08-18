# Win-CodexBar Float Bar Overlay

이 브랜치는 Win-CodexBar의 Float Bar를 **5시간 / 주간 / 월간 사용률 오버레이**로 바꾸는 작업에 집중한다. 기존처럼 출처가 불명확한 단일 숫자를 보여주지 않고, provider가 제공한 실제 quota window를 세 개의 고정 위치에 배치한다.

## 이 브랜치에서 달라진 점

Float Bar의 provider pill은 항상 다음 순서로 표시된다.

```text
5h / weekly / monthly
23% / 41% / 8%
```

- 숫자는 남은 비율이 아니라 **소비한 비율(used percent)** 이다.
- `showAsUsed` 전역 설정과 관계없이 같은 기준을 사용한다.
- 해당 주기의 quota가 없거나 informational window이면 `—`를 표시한다.
- provider 오류가 있으면 `— / — / —`와 critical 상태를 표시한다.
- provider 정렬은 세 값 중 가장 높은 사용률을 기준으로 한다. 각 메트릭(5h/weekly/monthly 또는 폴백)은 자신의 사용률로 독립적으로 색이 칠해진다. pill과 아이콘은 중립을 유지한다.
- inline reset을 켜면 각 slot의 퍼센트를 `2h 5m`, `1d 4h` 같은 짧은 countdown으로 독립적으로 바꿀 수 있다.
- hover tooltip과 접근성 이름에는 provider 이름, 주기, 사용률, 초기화 시간이 모두 남는다.

### 숫자의 근거

Float Bar는 각 provider의 canonical `primary`, `secondary`, `tertiary` rate window만 순서대로 확인한다. 비용 데이터와 로컬 30일 추정치는 사용하지 않는다.

`windowMinutes`가 있으면 다음 기준으로 분류한다.

| 표시 위치 | 기준 |
|---|---|
| 5h | 정확히 `300`분 |
| weekly | `10,080`분 이상 `40,319`분 이하 |
| monthly | 실제 달력 기준 28~31일인 `40,320`~`44,640`분 |

알려진 duration이 이 범위에 없으면 표시하지 않는다. `windowMinutes` 자체가 없을 때만 `5h`, `5-hour`, `weekly`, `7-day`, `monthly` 같은 명시적 label을 보조 기준으로 사용한다. 같은 주기로 분류되는 window가 여러 개면 canonical 순서에서 먼저 나온 값을 유지한다.

### 주기 없는 provider의 폴백

세 고정 슬롯이 모두 비는 provider(주기로 분류할 수 없는 window만 있는 경우)는 `— / — / —` 대신 **하나의 라벨이 붙은 폴백 메트릭**을 표시한다. 설정의 `providerMetrics` 값(`session` → primary, `weekly` → secondary, `model` → modelSpecific, `tertiary` → tertiary)을 따르며, `automatic`(기본값)이거나 요청한 window가 없거나 informational이거나 지원하지 않는 값이면 **modelSpecific → primary → secondary → tertiary** 순서로 자동 선택한다. 특정 provider를 하드코딩하지 않으므로 Antigravity 같은 provider는 기본적으로 모델별 window(예: Gemini Flash)를 보여주고, Session/Weekly/Model을 명시적으로 고르면 각각 primary/secondary/modelSpecific를 보여준다.

## 개발 환경 준비

Windows 10/11 x64 환경을 기준으로 한다.

필수 도구:

- Git
- Node.js 20
- 저장소에 고정된 `pnpm@10.18.1`
- Rust stable `x86_64-pc-windows-msvc`
- Visual Studio Build Tools의 **Desktop development with C++** workload
- Microsoft Edge WebView2 Runtime

이 저장소는 npm이나 yarn lockfile을 사용하지 않는다. Node package는 `apps/desktop-tauri/node_modules`와 pnpm store를 사용하며 전역 설치를 요구하지 않는다.

```powershell
# Node 20 선택
nvm install 20
nvm use 20

# package.json의 packageManager 버전을 Corepack으로 활성화
corepack enable
corepack prepare pnpm@10.18.1 --activate

# Rust MSVC toolchain
rustup default stable-x86_64-pc-windows-msvc
rustup target add x86_64-pc-windows-msvc

# frontend 의존성
pnpm --dir apps/desktop-tauri install --frozen-lockfile
```

`cargo`, `rustc`, `pnpm`을 새 PowerShell에서 찾을 수 없다면 터미널을 다시 열고 버전을 확인한다.

```powershell
node --version
pnpm --version
rustc --version
cargo --version
```

## 개발 버전 실행

저장소 루트에서 가장 간단한 방법은 개발 스크립트를 사용하는 것이다.

```powershell
# debug binary를 빌드하고 실행
.\scripts\dev.ps1

# 기존 debug binary만 다시 실행
.\scripts\dev.ps1 -SkipBuild

# Rust 로그 포함
.\scripts\dev.ps1 -Verbose
```

frontend hot reload가 필요하면 Tauri dev server를 직접 실행한다.

```powershell
pnpm --dir apps/desktop-tauri run tauri:dev
```

실행 후 tray icon에서 Settings를 열고 **Menu** 탭의 Float Bar를 활성화한다. 이전 CodexBar 프로세스가 남아 있으면 single-instance 처리로 새 binary 대신 기존 프로세스가 열릴 수 있으므로 먼저 종료한다.

## 검증

이 브랜치의 핵심 frontend 검증은 다음과 같다.

```powershell
# Float Bar 단위 테스트
pnpm --dir apps/desktop-tauri exec vitest run src/floatbar/FloatBar.test.tsx

# Float Bar와 공용 usage-window 테스트
pnpm --dir apps/desktop-tauri exec vitest run `
  src/floatbar/FloatBar.test.tsx `
  src/lib/usageWindows.test.ts

# TypeScript 검사
pnpm --dir apps/desktop-tauri exec tsc --noEmit

# 저장소의 로컬 CI 묶음
.\scripts\local-check.ps1
```

Float Bar는 별도 always-on-top WebView2 window이므로 최종 UI 확인은 테스트만으로 충분하지 않다. 새 binary를 만든 뒤 실제 Windows desktop에서 값 순서, tooltip, drag, orientation, click-through, theme을 확인한다.

## 설치 가능한 Windows 패키지 만들기

`pnpm run tauri:build`는 이 저장소에서 `--no-bundle`로 설정되어 있어 실행 파일만 만들고 installer를 만들지 않는다. 실제 설치 가능한 결과물은 Windows release builder를 사용한다.

릴리스 전용 Windows 환경에는 다음 항목이 추가로 필요하다.

- Inno Setup 6 (`ISCC.exe`)
- VC++ Redistributable와 WebView2 bootstrapper를 내려받을 네트워크 접근
- installer smoke test를 실행할 수 있는 일반 사용자 권한

전용 release machine에서는 저장소의 prerequisite 스크립트로 환경을 점검·준비할 수 있다.

```powershell
.\scripts\install-release-prerequisites.ps1
```

현재 브랜치의 **커밋된 상태**로 installer를 만들려면 현재 commit hash와 로컬 repository를 명시한다. 이렇게 해야 release builder의 clean managed checkout에 이 브랜치가 정확히 반영된다.

```powershell
$commit = git rev-parse HEAD
$repo = git rev-parse --show-toplevel
$workRoot = 'C:\code\Win-CodexBar-feat-overlay'

.\scripts\windows-release-build.ps1 `
  -Ref $commit `
  -RepoUrl $repo `
  -WorkRoot $workRoot `
  -SmokeInstall
```

`-SmokeInstall`은 생성된 installer를 silent install한 뒤 제거까지 확인한다. 출력은 다음 위치에 생성된다.

```text
C:\code\Win-CodexBar-feat-overlay\assets\CodexBar-<version>-Setup.exe
C:\code\Win-CodexBar-feat-overlay\assets\CodexBar-<version>-Setup.exe.sha256
C:\code\Win-CodexBar-feat-overlay\assets\CodexBar-<version>-portable.exe
C:\code\Win-CodexBar-feat-overlay\assets\CodexBar-<version>-portable.exe.sha256
```

installer에는 desktop app, CLI, VC++ runtime bootstrapper, WebView2 bootstrapper가 포함된다. 로컬 결과물은 서명되지 않을 수 있으므로 배포 전에 `.sha256` 파일과 Authenticode 상태를 별도로 확인한다.

## 관련 파일

| 파일 | 역할 |
|---|---|
| `apps/desktop-tauri/src/floatbar/FloatBar.tsx` | 세 quota window 선택, 표시, tooltip, 정렬과 상태 계산 |
| `apps/desktop-tauri/src/floatbar/FloatBar.css` | Float Bar의 horizontal/vertical layout |
| `apps/desktop-tauri/src/floatbar/FloatBar.test.tsx` | 분류 경계, countdown, 오류, 접근성 회귀 테스트 |
| `docs/superpowers/specs/2026-08-18-float-bar-three-window-usage-design.md` | 승인된 동작 계약 |
| `docs/superpowers/plans/2026-08-18-float-bar-three-window-usage.md` | 구현 및 검증 계획 |
| `docs/ARCHITECTURE.md` | Tauri/React/Rust 데이터 흐름 |
| `docs/BUILDING.md` | 저장소 전체 build 참고 |
| `docs/WINDOWS_PROOF.md` | Windows installer와 실제 UI 검증 체크리스트 |

## 현재 제한 사항

- provider가 canonical window에 월간 quota를 제공하지 않으면 monthly 위치는 `—`다.
- 비용이나 로컬 30일 사용량을 월간 quota처럼 대신 표시하지 않는다.
- 모델별·추가 quota window는 이 compact overlay의 범위가 아니다.
- UI 동작 검증은 Windows-native WebView2 환경이 필요하다.
