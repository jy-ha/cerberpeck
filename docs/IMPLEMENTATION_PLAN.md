# Cerberpeck Implementation Plan

> 기준 문서: `docs/PRD.md`  
> 원칙: 각 범위를 시작할 때 기준 문서와 관련 코드를 다시 분석한 후 구현한다.

## 반복 절차

각 범위에서 다음 순서를 지킨다.

1. PRD의 관련 요구사항과 수용 기준을 다시 읽는다.
2. 현재 코드, 테스트와 이전 범위의 공개 경계를 다시 조사한다.
3. 이번 범위의 포함·비포함 항목과 완료 조건을 이 문서에 갱신한다.
4. 가장 작은 end-to-end 경로부터 구현한다.
5. 단위·통합 테스트를 실행한다.
6. 저장소 밖의 임시 Git 워크스페이스에서 실제 CLI 경로를 검증한다.
7. 발견한 설계 차이와 남은 위험을 기록한 뒤 다음 범위로 이동한다.

## 범위 1 — 프로젝트 골격, Core와 기본 CLI

상태: 완료

재분석 대상:

- PRD §18 상태와 파일 모델
- PRD §19.1~19.6 기술 아키텍처와 Workflow Engine
- PRD FR-009~FR-011
- 현재 저장소: PRD 외 구현 없음

포함:

- pnpm TypeScript workspace와 모듈 경계
- Zod 기반 Session·Action schema
- 원자적 `session.json` 저장과 `.prev` 복구
- 결정론적 `next/submit/fail` 최소 Workflow Engine
- `session create/inspect/next/submit/fail`, `sessions list/show` CLI
- JSON 출력·종료 코드·기본 테스트

비포함:

- 실제 Agent 호출, 브라우저, 후보 파일 변경
- 설치 TUI와 Skill 설치
- 완전한 실험 상태 머신

완료 조건:

- 동일 상태와 입력이 동일한 Action sequence를 만든다.
- 중복 submit이 idempotent하다.
- 손상된 `session.json`을 `.prev`에서 복구할 수 있다.
- 외부 임시 Git 워크스페이스에서 CLI로 session을 생성하고 조회할 수 있다.

완료 기록:

- 2026-07-23: TypeScript workspace, Core schema, Workflow Engine와 기본 CLI 구현
- 단위 테스트 7개 통과, TypeScript build 통과
- `/tmp/cerberpeck-scope1-e2e.C5VjGk`의 독립 Git 워크스페이스에서 빌드된 CLI로 revision 1→5와 `completed` 상태 확인

## 범위 2 — 직접 구현 TUI, 설치·제거와 Skill 번들

상태: 완료

재분석 결과:

- 현재 `apps/cli/dist/main.js`는 workspace package symlink에 의존하므로 설치 파일로 직접 복사할 수 없다.
- 먼저 core·commander·zod를 포함한 단일 Node CommonJS 실행 bundle을 만든다. Commander의 내부 CommonJS 로딩과 충돌하는 ESM bundle은 실제 설치 검증에서 제외했다. Bun native binary 검증은 릴리스 범위로 미룬다.
- Skill 원본은 `skill-src`, 생성물은 `dist/skills` 한 곳으로 유지한다.
- 설치 TUI는 범용 widget 계층 없이 progress renderer, line fallback과 interactive 단일 화면만 둔다.
- Workspace 설치의 CLI·두 Skill을 하나의 매니페스트 트랜잭션으로 처리한다.

이번 범위 포함:

- 단일 실행 bundle과 Skill bundle builder
- Workspace·Global target 및 host 자동 감지
- 기본 자동 설치, `--interactive`, 진행 TUI와 `--json`
- 매니페스트·checksum·backup 기반 update/uninstall
- `doctor`의 설치·host 기본 진단

이번 범위 비포함:

- 브라우저 실제 다운로드와 PATH profile 자동 수정
- 원격 release 다운로드·서명·canonical 원라인 URL
- 세션 실행 진행 화면과 Agent 호출

완료 기록:

- 직접 구현 interactive reducer·raw terminal 화면과 line-mode progress 구현
- Workspace·Global 설치, host 부분 제거, update, doctor와 매니페스트 rollback 구현
- Codex·Claude Skill bundle 생성 및 공식 validator 통과
- 단일 CommonJS 실행 bundle을 외부 Git 워크스페이스에 실제 설치하고 설치된 CLI 실행 확인
- `/tmp/cerberpeck-scope2-e2e.uiQf9w`에서 Workspace·Global 설치/doctor/부분 제거/전체 제거 확인
- `/tmp/cerberpeck-tui-e2e.oVLOXL` PTY에서 `--interactive` Enter 설치 확인

목표:

- 확인을 기다리지 않는 Workspace 기본 설치
- `--interactive`에서만 선택을 바꾸는 직접 구현 TUI
- Codex·Claude Skill bundle 생성과 Workspace/Global 설치
- 매니페스트 기반 update·uninstall

## 범위 3 — 후보 작업공간, 적용과 undo·redo

상태: 완료

재분석 결과:

- 설치 backup과 실험 apply transaction은 수명주기와 복원 의미가 달라 별도 모듈로 유지한다.
- Git dirty state를 잃지 않도록 HEAD worktree를 만든 뒤 세션 시작 snapshot을 candidate에 동기화한다. 원본에서 stash·commit은 하지 않는다.
- 비-Git은 같은 snapshot 형식을 사용한 directory copy로 구현한다.
- 적용 전에 모든 대상의 3-way 가능 여부를 먼저 계산하고 하나라도 충돌하면 원본을 전혀 수정하지 않는다.
- undo는 적용 대상 경로만 복원하며 현재 상태를 redo bundle로 먼저 저장한다.

이번 범위 포함:

- 파일·symlink·mode snapshot manifest
- Git worktree와 비-Git candidate copy
- baseline/candidate diff와 외부 변경 충돌 검사
- 원자적 final apply transaction, `undo`, `redo`
- candidate·apply CLI와 외부 Git/non-Git E2E

이번 범위 비포함:

- Builder Agent가 candidate를 수정하는 자동 호출
- 브라우저 및 개발 서버 lifecycle
- 여러 Challenger의 병렬 생성

완료 기록:

- 파일·symlink·mode를 보존하고 경로 탈출과 symlink ancestor를 차단하는 snapshot 구현
- Git HEAD worktree에 세션 시작 당시 dirty·untracked snapshot을 동기화하고 비-Git directory-copy fallback 구현
- 전체 경로 사전 검사, 파일별 3-way merge, 충돌 시 원본 무변경 적용 구현
- touched path만 대상으로 하는 before/after/redo bundle과 idempotent undo·redo 구현
- 단위·통합 테스트 19개 통과, build와 typecheck 통과
- `/tmp/cerberpeck-scope3-e2e.U6uQDQ` 외부 Git 워크스페이스에 설치한 CLI로 conflict 차단, apply, undo, redo와 세션 상태 전이를 확인

목표:

- Git worktree와 비-Git snapshot 후보
- 원본을 건드리지 않는 Challenger 작업
- 파일 단위 final apply transaction
- 전체 세션 `undo`·`redo`

## 범위 4 — 실행 레시피와 웹 검증

상태: 완료

재분석 대상:

- PRD의 Web App Process Contract, Artifact Preparer, 검증 gate와 제한된 journey 요구사항
- 현재 runtime snapshot/candidate 경계와 CLI 오류·JSON 출력 계약
- 설치 시 browser mode 선택과 doctor의 현재 구현

이번 범위 원칙:

- 프레임워크별 adapter 계층을 만들지 않고 package.json·정적 HTML 기반의 작은 recipe detector를 둔다.
- 서버는 shell 문자열이 아니라 실행 파일과 argv 배열로 시작하고 process group 전체를 정리한다.
- readiness는 stdout 문구가 아니라 HTTP probe로 판단한다.
- browser 검증은 Playwright가 설치된 경우 실제 Chromium을 쓰고, 없으면 명시적인 unavailable 결과를 낸다.
- journey는 임의 코드가 아닌 navigate/click/fill/assert-visible/screenshot의 제한된 JSON 명령만 허용한다.

이번 범위 포함:

- 정적 HTML, Vite, Next.js 실행 recipe 감지와 명시적 override
- 개발 서버 lifecycle, 포트 선택, HTTP readiness와 정리
- Playwright capture, console error와 failed request 수집
- 제한된 journey schema와 실행
- candidate 검증 CLI, 단위·통합·외부 workspace E2E

이번 범위 비포함:

- Agent가 실행 계약을 추론하는 호출
- managed browser 다운로드 자동화와 브라우저 바이너리 배포
- 평가단 및 라운드 orchestration

완료 기록:

- shell 문자열 없이 argv로 실행하는 정적 HTML·Vite·Next.js·일반 dev script detector 구현
- process group lifecycle, HTTP readiness, timeout과 secret redaction 구현
- Playwright Core 기반 desktop/mobile capture, console·network gate와 checksum manifest 구현
- 임의 JavaScript가 없는 제한된 journey schema와 실행기 구현
- 단위·통합 테스트를 포함한 전체 23개 테스트, build와 typecheck 통과
- 외부 Git 워크스페이스의 설치된 CLI와 system Chromium으로 정적 후보 및 journey를 캡처해 gate 통과 확인

목표:

- 정적 HTML, Vite와 Next.js 실행 레시피 감지
- 개발 서버 lifecycle과 readiness
- Playwright capture, console·network 수집과 기본 gate
- 제한된 사용자 여정 DSL

## 범위 5 — 독립 Agent 세션과 자율 Workflow

상태: 완료

재분석 대상:

- PRD의 목표 구체화, Evaluation Contract, 패널, 독립 평가, 합성, Builder, 블라인드 A/B, Decision과 종료 조건
- PRD의 Codex/Claude 독립 Host Session 실행 프로토콜과 권한 요구사항
- 현재 Action schema·Workflow Engine·SessionStore와 candidate/capture/apply 경계
- 설치된 `codex exec`와 `claude -p`의 실제 로컬 CLI 옵션

이번 범위 원칙:

- 서브에이전트 기능에 의존하지 않고 Action마다 완전히 새 호스트 CLI 프로세스를 시작한다.
- 호스트별 runner는 명령·이벤트 parsing만 담당하고 다음 Action과 종료 여부는 Workflow Engine이 결정한다.
- 기본 패널은 전문가 3명과 고객 3명이며 계약상 필요할 때만 각 4~5명으로 확장한다.
- 평가자는 read-only 원본/후보를 보고 Builder만 candidate workspace에 쓴다.
- 기본 최대 라운드는 10이고 비용만으로 줄이지 않으며, 차단 조건 외에는 확인 없이 이어간다.
- 처음부터 모든 예외 상태를 일반화하지 않고 현재 두 호스트의 구조화 출력과 한 개 challenger 직렬 loop를 먼저 완성한다.

이번 범위 포함:

- Codex/Claude Host Session Runner와 공통 JSON Action 결과
- 목표 구체화·계약·패널·baseline review·synthesis·build·validation·comparison·decision Action
- evaluator별 새 프로세스와 리뷰 독립성, 기본 3+3 패널
- 최대 10라운드의 promote/reject 반복과 자동 최종 적용·보고
- `run`, `sessions resume` 및 mock host 기반 deterministic E2E

이번 범위 비포함:

- 원격 API 직접 호출과 MCP transport
- 다수 Builder의 동시 challenger 생성
- 범용 provider/plugin SDK

완료 기록:

- 기존 저수준 protocol 호환성을 유지하며 자율 round/champion/종료 상태와 Action 종류 확장
- Codex `exec`와 Claude `-p`를 Action마다 새 프로세스로 실행하는 runner, xhigh/max 품질 설정과 역할별 권한 구현
- 기본 전문가 3명+고객 3명, wave당 최대 4개 독립 baseline/A-B review 구현
- 정제된 review bundle, 평가자별 결정론적 blind mapping과 Decision 전용 private mapping 구현
- synthesis→isolated build→실제 web gate→comparison→decision→최대 10라운드 loop, final apply와 report 구현
- mock Codex/Claude 양쪽에서 각 18개 PID가 전부 다른 deterministic 통합 테스트 통과
- `/tmp/cerberpeck-scope5-e2e.jzyxIX`의 설치된 CLI에서 실제 Chromium capture를 포함한 1-round 전체 run과 자동 적용 확인

목표:

- Codex와 Claude Host Session Runner
- 역할별 cwd·권한·구조화 출력
- 기본 3+3 평가단, 최대 10라운드
- 최초 비평, Synthesis, Builder, A/B Review와 Decision 자동 반복

## 범위 6 — 실제 E2E와 릴리스 강화

상태: 완료

재분석 대상:

- PRD 설치·업데이트·제거, 원라인 bootstrap, browser, doctor와 배포 수용 기준
- 현재 installer transaction, 직접 구현 install TUI, bundled CLI와 Skill 산출물
- 실제 로컬 Codex/Claude 비대화형 구조화 출력과 중첩 실행 가능성

이번 범위 포함:

- checksum release artifact와 macOS/Linux 원라인 bootstrap
- 직접 구현 uninstall interactive TUI와 global PATH 소유 표식 복원
- managed browser의 정직한 지원 경계와 doctor 진단
- 설치→실행→보고→undo→redo→제거 실제 외부 workspace E2E
- 실제 Codex/Claude host smoke 및 가능한 범위의 full E2E
- 최종 문서·도움말·Skill launcher 정합성

완료 기록:

- SHA-256 release manifest, 네 개 macOS/Linux portable Node artifact와 `curl | sh` bootstrap 구현
- Workspace/Global 원라인 설치·부분 제거·전체 제거, global PATH 소유 표식 추가/복원 실제 검증
- 직접 구현 uninstall TUI와 종료 후 stdin 정리, PTY 실제 검증
- Agent stdout/stderr 실시간 action log, PID record, cancel과 미적용 session undo cleanup 구현
- review bundle에서 내부 candidate 경로를 제거하고 화면·정제된 gate·코드 snapshot만 A/B로 제공
- 상세 baseline/comparison evidence schema, 필수 gate의 기계적 promotion 차단과 확장된 Markdown report 구현
- 전체 28개 테스트, build/typecheck, 두 Skill 공식 validator와 release build 통과
- `/tmp/cerberpeck-real-codex-e2e.3R6NX1`에서 실제 Codex xhigh 세션 18개, 실제 Chromium 두 버전 capture, 자동 적용, undo와 redo 완료
- 실제 Claude adapter 호출은 현재 로컬 Claude 인증이 `401 Invalid authentication credentials`를 반환해 full E2E가 외부 환경상 차단됨. 동일 adapter의 18-process mock E2E와 구조화 output parsing은 통과

알려진 v0.1 경계:

- release artifact는 Bun native binary가 아니라 Node.js 20+ portable bundle이다.
- managed Chromium 다운로드는 아직 포함하지 않으며 system browser 또는 `--browser none`을 사용한다.
- release signature/provenance와 macOS/arm64 실장비 검증은 CI·공개 release 인프라가 마련될 때 수행한다.

목표:

- 외부 임시 fixture에서 원라인 설치부터 undo까지 검증
- 호스트 호환성·중첩 실행·재개 검증
- release artifact와 bootstrap installer
- PRD·구현·사용자 도움말 최종 정합성

## 범위 7 — 브랜드, 엔드유저 README와 기본 실행 TUI

상태: 완료

재분석 대상:

- PRD의 브랜드 메시지, 설치 후 사용자 여정, 자율 실행과 TTY 진행 화면 요구사항
- 기존 README의 CLI 중심 설명과 Codex·Claude Skill 진입 방식
- `run`·`sessions resume`의 이벤트 출력, 설치 TUI renderer와 Skill launcher

이번 범위 원칙:

- README는 내부 CLI 명령 목록이 아니라 스킬을 설치한 사용자가 자연어로 요청하고 복원하는 흐름을 설명한다.
- 실행 TUI는 입력을 요구하는 마법사가 아니라 자율 세션의 현재 상태를 보여주는 기본 관찰 화면으로 둔다.
- TTY에서는 full-screen renderer, 비TTY에서는 간결한 line-mode, `--json`에서는 기존 JSONL 계약을 유지한다.
- 범용 TUI framework 없이 작은 순수 reducer와 renderer만 추가한다.
- 스킬은 새 실험과 undo·redo·resume·report를 구분해 CLI로 전달하되 Workflow를 복제하지 않는다.

완료 기록:

- 세베루스와 우드패커를 결합한 로고와 브랜드 문장 제작
- 설치 후 `$cerberpeck`·`/cerberpeck` 요청을 중심으로 README 전면 개편
- README 기본 언어를 영어로 전환하고, 사용 예시는 제품이 스스로 조사·구체화한다는 의도에 맞게 짧은 요청으로 단순화
- Codex·Claude Skill description에 `cbp` 암시적 호출 트리거를 추가하고 요청 전달 전 단축 토큰 제거
- Action 상태, 병렬 리뷰 진행률, 현재 라운드와 최종 Champion을 표시하는 기본 실행 TUI 구현
- `run`과 `sessions resume`에 TTY/line/JSON 출력 모드 연결
- Codex·Claude Skill에 자연어 undo·redo·resume·report 라우팅 추가
- 전체 31개 테스트, typecheck, build와 두 Skill validator 통과
- `/tmp/cerberpeck-default-tui.M1NbPK`의 Git 워크스페이스에 실제 설치 후 PTY에서 19개 Action, Chromium 검증과 Champion 자동 적용 확인

## 범위 8 — 완전 제거 스크립트와 잔여물 정리

상태: 완료

재분석 대상:

- PRD의 원라인 제거, purge, CLI 자기 제거와 파일 수명주기 요구사항
- 설치 매니페스트 기반 기본 제거와 Workspace·Global target 구조
- runtime의 실행 프로세스 기록과 Git candidate worktree 구조
- release bootstrap과 README 설치 안내

이번 범위 원칙:

- 기본 uninstall은 수정 파일과 세션을 보존하는 기존 안전 정책을 유지한다.
- 완전 제거용 `--purge`와 공개 `uninstall.sh`만 제품 전용 상태와 설정을 모두 삭제한다.
- Workspace 또는 사용자 홈 같은 광범위한 경로를 재귀 삭제하지 않고, 해석된 Cerberpeck 전용 경로만 삭제한다.
- 제품 코드에 적용된 변경은 자동으로 되돌리지 않는다. 사용자가 원하면 uninstall 전에 undo한다.

이번 범위 포함:

- 독립 원라인 `uninstall.sh`와 release artifact 포함
- Workspace·Global 완전 제거
- 실행 중 Agent 프로세스와 Cerberpeck Git worktree 등록 정보 정리
- 수정된 Skill, cache, sessions, backups, config와 PATH block 제거
- README 설치 안내 바로 아래 완전 제거 안내

완료 기록:

- 공개 원라인 `uninstall.sh` 추가 및 release 산출물에 포함
- Workspace purge에서 두 Skill, CLI, `.cerberpeck` 전체와 `cerberpeck.toml` 제거
- Global purge에서 두 Skill, CLI, 전용 data directory와 소유 PATH block 제거
- 실행 중 Agent 프로세스 종료와 소유 Git worktree의 등록 정보 포함 제거
- 수정되거나 설치 매니페스트가 유실·손상된 경우에도 알려진 제품 전용 경로 완전 제거
- 전체 34개 테스트, typecheck, build와 네 플랫폼 release 생성 통과
- `/tmp/cerberpeck-uninstall-e2e.BKwQIA`에서 release 설치, 실제 Git candidate worktree 생성, 수정된 Skill과 설정 추가 후 원라인 제거 검증; 제품 코드와 main worktree만 남음
