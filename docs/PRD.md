# Cerberpeck Product Requirements Document

> 문서 상태: Draft v0.1  
> 최종 갱신: 2026-07-23  
> 제품명: Cerberpeck(서버펙)  
> 초기 제품 범위: 웹서비스 반복 개선용 Agent Skill + 로컬 CLI

## 1. 문서 목적

이 문서는 Cerberpeck의 제품 목표, 사용자 경험, 반복 실험 프로토콜, Agent Skill 구조, CLI와 설치 프로그램, 데이터 모델, 기술 아키텍처, 보안 원칙, 테스트 전략 및 단계별 구현 계획을 정의한다.

초기 구현은 Codex와 Claude Code에서 모두 사용할 수 있는 웹서비스 개선 스킬을 제공한다. 사용자는 현재 워크스페이스 또는 사용자 전역 범위를 선택하고, Codex와 Claude Code 중 원하는 호스트를 하나 이상 선택해 설치할 수 있어야 한다.

## 2. 제품 한 줄 정의

> 전문가와 고객 Agent 평가단이 웹서비스를 직접 만들고 비교하며, 더 나은 버전만 남을 때까지 반복 개선하는 개발 스킬.

외부 메시지는 다음 문구를 기본으로 한다.

> 만들고, 평가하고, 더 나은 버전만 남긴다.

### 2.1 브랜드 모티브

Cerberpeck은 세베루스(Cerberus)의 수호성과 우드패커(Woodpecker)의 집요하고 정밀한 반복 타격을 결합한 이름이다. 세베루스가 허술한 결과를 통과시키지 않고, 우드패커가 같은 목표를 반복해서 쪼아 변화를 만들어내는 이미지로 제품의 평가·반복·승격 원칙을 표현한다.

브랜드 문장은 다음 문구를 사용한다.

> 세 머리로 보고, 한 부리로 쪼아, 더 나은 것만 남긴다.

기본 로고는 세 개의 수호견 머리 실루엣과 중앙의 붉은 부리·타격축을 하나의 기하학 문양으로 결합한다. 주색은 차콜, 웜 아이보리와 제한적인 시그널 레드다.

## 3. 문제 정의

사용자가 “최고의 랜딩페이지를 만들어줘” 또는 “이 웹서비스를 최대한 좋게 고쳐줘”라고 요청해도 절대적인 최고의 기준은 존재하지 않는다. 좋은 결과는 서비스 종류, 핵심 사용자, 방문 상황, 목표 행동, 브랜드, 기술적 제약에 따라 달라진다.

기존 단일 Agent 작업은 다음 문제를 가진다.

1. 목표가 모호한 상태에서 구현을 시작한다.
2. 한 관점의 자기평가에 의존한다.
3. 개선 전후 비교 없이 변경을 누적한다.
4. 이전 버전이 사라져 퇴행 여부를 판단하기 어렵다.
5. 평가 결과와 실제 변경 사이의 추적성이 부족하다.
6. 긴 작업 중 평가 문맥과 구현 문맥이 섞인다.
7. 중단 후 재개하거나 실험 이력을 재현하기 어렵다.

Cerberpeck은 목표를 평가 계약으로 구체화하고, 역할이 다른 평가자들을 독립 문맥에서 운영하며, Champion과 Challenger를 반복 비교하는 방식으로 이 문제를 해결한다.

## 4. 제품 목표

### 4.1 핵심 목표

- 모호한 웹서비스 개선 요청을 최소한의 질문으로 평가 가능한 목표로 변환한다.
- 전문가 집단과 고객 집단으로 구성된 평가단을 자동 설계한다.
- 평가자별 최초 비평과 블라인드 A/B 비교를 독립된 Agent 컨텍스트에서 실행한다.
- 결과물, 코드, 캡처, 평가, 의사결정 및 버전 계보를 보존한다.
- 최초 요청과 필수 목표 구체화가 끝난 뒤에는 사용자 개입 없이 최대 10라운드까지 실행한다.
- 최종 적용을 포함해 세션이 워크스페이스에 만든 변화를 한 명령으로 세션 시작 전 상태로 되돌릴 수 있게 한다.
- 단순 점수 합산이 아니라 근거와 목표 적합성을 바탕으로 승격을 판단한다.
- 승인된 후보만 다음 Champion으로 삼는다.
- Codex와 Claude Code에서 동일한 핵심 실험 프로토콜을 제공한다.
- 설치, 업데이트, 진단 및 제거를 터미널에서 완결한다.

### 4.2 성공 정의

Cerberpeck 세션이 성공했다고 판단하려면 다음 결과가 있어야 한다.

- 평가 계약이 작성되어 있다.
- 최소 한 개의 Champion이 재현 가능한 상태로 보존되어 있다.
- 평가단 구성이 목표에 맞게 생성되어 있다.
- 각 승격 또는 기각 결정에 근거가 기록되어 있다.
- 최종 Champion과 원래 기준 버전의 차이를 설명할 수 있다.
- 사용자가 최종 결과물을 자신의 워크스페이스에 안전하게 적용할 수 있다.

### 4.3 제품 지표

초기에는 서버 텔레메트리를 수집하지 않는다. 다음 지표를 로컬 세션 보고서에 기록한다.

- 설치 완료 여부 및 선택한 설치 범위·호스트
- 첫 평가 계약 생성까지 걸린 시간
- 첫 Baseline 캡처까지 걸린 시간
- 세션별 라운드 수
- 생성·승격·기각된 Challenger 수
- 객관적 검증 실패 횟수
- 평가자 간 의견 분산
- 세션 완료·중단·실패 상태
- 최종 적용 여부
- 독립 Agent 세션별 토큰·비용·소요 시간
- undo·redo 실행 여부와 복원 결과

향후 익명 텔레메트리를 추가할 경우 반드시 명시적 동의를 받아야 하며 기본값은 비활성화로 한다.

## 5. 초기 범위

### 5.1 지원 대상

- 마케팅 랜딩페이지
- SaaS 및 일반 웹앱 UI
- 회원가입, 로그인, 온보딩, 결제 등 사용자 흐름
- 대시보드와 관리 화면
- 전자상거래 상품·장바구니·체크아웃 화면
- 반응형 웹 화면
- 웹 카피, 정보 구조, 전환 구조
- 관련 프론트엔드 코드
- 화면 동작에 직접 필요한 제한된 백엔드 수정

### 5.2 지원 평가 표면

- 렌더링된 웹 화면
- 데스크톱 및 모바일 캡처
- 지정된 사용자 여정의 화면 상태
- DOM과 접근성 정보
- 브라우저 콘솔 오류 및 네트워크 실패
- 관련 코드와 diff
- 빌드, 타입 검사 및 기존 테스트 결과
- 성능, 접근성 등 구성 가능한 자동 검사 결과

### 5.3 초기 비범위

- 네이티브 모바일 앱
- 데스크톱 앱
- 게임, 영상, 음원 및 3D 자산 자체의 최적화
- 범용 문서, 프레젠테이션 및 데이터 분석 결과물
- 백엔드 아키텍처 자체의 광범위한 재설계
- 프로덕션 배포 자동화
- 실제 결제 또는 운영 데이터 변경
- 원격 협업 서버와 중앙 웹 대시보드
- MCP 서버 제공
- 네이티브 Windows 설치 프로그램과 PowerShell 부트스트랩

MCP는 다중 장비 세션 공유, 중앙 평가 기록, Figma·분석 도구·원격 브라우저 등 외부 시스템 연동이 필요해지는 단계에서 추가한다.

v0의 공식 실행 환경은 macOS, Linux와 WSL2다. 네이티브 Windows는 실제 수요를 확인한 뒤 추가한다.

## 6. 핵심 설계 원칙

### 6.1 목표를 먼저 고정한다

구현 전에 Evaluation Contract를 작성한다. 평가 기준을 바꿀 정도로 중요한 정보만 사용자에게 질문한다.

### 6.2 질문보다 조사를 우선한다

Agent는 먼저 저장소, 기존 화면, 카피, 패키지 설정, 실행 스크립트와 문서를 조사한다. 발견할 수 있는 내용을 사용자에게 다시 묻지 않는다.

### 6.3 질문은 답하기 쉽게 만든다

열린 질문 대신 판단에 필요한 이유를 간단히 설명하고 2~4개의 구체적인 선택지를 제시한다. 항상 직접 입력 선택지를 허용한다.

질문은 계약을 만들 수 없는 경우에만 한 차례 묶어서 한다. 저장소와 요청에서 합리적으로 추론할 수 있으면 질문이나 확인 없이 가정을 기록하고 진행한다.

### 6.4 평가단은 세션 동안 유지한다

잘 설계된 평가단은 목표를 구체적으로 구현한 것이다. 세션 도중 평가단을 숨기거나 임의로 교체하지 않는다. 모든 피드백은 개선 작업에 사용할 수 있다.

### 6.5 평가는 매번 새 문맥에서 실행한다

페르소나 정의는 유지하되, 각 비평과 비교 평가는 새로운 Agent 컨텍스트에서 수행한다. 이전 평가의 표현, 구현자의 의도, 라운드 번호 및 최신 버전 여부를 평가자에게 노출하지 않는다.

### 6.6 상대 비교를 우선한다

절대 점수는 진단 자료로 사용한다. 승격 판단은 Champion과 Challenger의 블라인드 A/B 선호, 근거, 회귀 및 평가 계약 적합성을 중심으로 수행한다.

### 6.7 더 나은 버전만 승격한다

실험 코드는 격리된 작업 공간에서 작성한다. 객관적 검증과 평가를 통과한 Challenger만 Champion이 된다.

### 6.8 첫 실패로 종료하지 않는다

하나의 Challenger 기각은 해당 개선 가설의 실패다. 서로 다른 가설이 연속으로 실패하거나, 개선 여지가 없거나, 예산이 소진될 때 세션을 종료한다.

### 6.9 판단과 기계 작업을 분리한다

CLI는 세션 상태, 파일, 버전, 브라우저, 캡처와 검증을 결정론적으로 담당하고, 판단이 필요한 Action은 격리된 Agent 프로세스에 맡긴다. Skill은 사용자의 요청을 CLI에 전달하고 정말 필요한 차단 질문만 중계한다.

### 6.10 사용자의 원본 작업을 보존한다

실험 중간 결과로 현재 워크스페이스를 반복 덮어쓰지 않는다. 최종 Champion 적용 전까지 원본과 각 후보를 복구 가능한 상태로 유지한다.

최종 적용도 되돌릴 수 있는 트랜잭션으로 기록한다. `cerberpeck undo`는 Cerberpeck이 건드린 경로만 원본 workspace를 처음 변경하기 전 상태로 복원하고, 되돌리기 직전 상태를 다시 `redo`할 수 있게 보존한다.

### 6.11 워크플로 상태 전이의 권위는 하나만 둔다

Codex와 Claude Code의 Skill 본문이 실험 순서와 예외 처리를 각각 구현하지 않게 한다. CLI 내부 Workflow Engine이 현재 상태에서 가능한 다음 Action을 계산하고, Host Session Runner가 독립 Agent 프로세스를 실행해 구조화된 결과를 제출한다. 호스트별 차이는 프로세스 실행 인자와 결과 형식을 변환하는 얇은 어댑터에만 둔다.

### 6.12 단일 애플리케이션 안에서 책임을 분리한다

초기 버전은 배포와 디버깅이 쉬운 모듈형 단일 애플리케이션으로 만든다. 브라우저와 workspace처럼 실제 구현이 둘 이상이거나 테스트 대체물이 필요한 경계에만 작은 인터페이스를 둔다. 원격 저장소, 동적 플러그인, 범용 DI framework는 실제 요구가 생기기 전에 만들지 않는다.

### 6.13 설치·설정·상태·캐시의 수명주기를 분리한다

설치 파일, 팀이 공유할 프로젝트 설정, 재개해야 하는 세션 상태, 다시 만들 수 있는 캐시는 서로 다른 보존·백업·제거 정책을 가진다. 하나의 디렉터리에 있더라도 논리적 저장 영역과 소유권을 분리하고, Global 설치 여부와 관계없이 실험 상태는 기본적으로 해당 workspace에 둔다.

### 6.14 기본 실행은 자율적이어야 한다

실제 터미널의 인자 없는 설치는 한 화면에서 안전한 기본 선택을 보여주고 Enter 한 번으로 시작한다. 명시 플래그·`--yes`·비TTY 설치와 설치 후 실험은 별도 확인을 기다리지 않고 계속한다. 실험 진행 화면은 관찰용이며 매 단계 승인을 받는 마법사가 아니다. 인증·비밀정보 누락, 프로덕션 또는 외부 시스템 변경, 복구할 수 없는 충돌처럼 자동 진행이 위험한 경우에만 멈춘다.

### 6.15 품질을 기본 예산보다 우선한다

기본 패널과 라운드 수는 비용 최소화보다 관점의 다양성과 비교 신뢰도를 우선한다. 비용 상한은 사용자가 설정할 수 있지만 기본값으로 강제하지 않는다. 모델 품질이나 평가자 수를 조용히 낮추는 자동 절약 모드는 제공하지 않는다.

## 7. 주요 사용자

### 7.1 개인 개발자와 디자이너

- 구현 중인 랜딩페이지 또는 웹앱을 다각도로 개선하고 싶다.
- 별도의 사용자 조사팀 없이 다양한 관점의 피드백을 빠르게 받고 싶다.
- 이전 버전을 잃지 않고 반복 개선하고 싶다.

### 7.2 초기 스타트업 팀

- 전환, 신뢰, 브랜드 및 구현 품질을 동시에 검토하고 싶다.
- 팀의 막연한 취향 논쟁을 구체적인 비교와 근거로 바꾸고 싶다.
- 짧은 시간 안에 여러 개선 라운드를 실행하고 싶다.

### 7.3 에이전트 기반 개발 사용자

- Codex 또는 Claude Code에서 자연어 명령만으로 반복 실험을 수행하고 싶다.
- 평가 로그와 버전 계보를 로컬에 보존하고 싶다.
- 호스트를 바꾸더라도 동일한 Cerberpeck 프로토콜을 사용하고 싶다.

## 8. 대표 사용 사례

### 8.1 기존 랜딩페이지 개선

```text
$cerberpeck 이 랜딩페이지를 최고로 만들어줘. 평가단을 구성하고 반복 개선해.
```

또는 Claude Code에서:

```text
/cerberpeck 이 랜딩페이지를 최고로 만들어줘. 평가단을 구성하고 반복 개선해.
```

### 8.2 특정 목표 중심 개선

```text
$cerberpeck 이 B2B SaaS 랜딩페이지를 데모 요청 전환 중심으로 개선해.
핵심 고객은 20~100명 규모 개발팀의 엔지니어링 매니저야.
브랜드 컬러와 가격 정책은 바꾸지 마.
```

### 8.3 웹앱 사용자 흐름 개선

```text
/cerberpeck 신규 사용자가 첫 프로젝트를 만드는 온보딩 흐름을 개선해.
모바일보다 데스크톱이 중요하고 기존 API는 변경하지 마.
```

### 8.4 일반 개선 모드

```text
$cerberpeck 도메인을 더 묻지 말고 일반적인 웹 UX와 완성도를 기준으로 세 라운드만 개선해.
```

이 경우 범용 웹 평가 계약과 기본 평가단을 사용한다.

## 9. 사용자 경험

### 9.1 전체 흐름

```text
요청 수신
  → 저장소·서비스 조사
  → 필요할 때만 한 번의 목표 질문
  → Evaluation Contract 작성
  → 평가단과 평가 기준 고정
  → Baseline Champion 보존·실행·캡처
  → 독립 최초 비평
  → 개선 가설 선택
  → 격리된 Challenger 구현
  → 객관적 검증
  → 블라인드 A/B 비교
  → Decision Agent 판정
  → 승격 또는 기각
  → 다음 가설 또는 종료
  → 최종 Champion 자동 적용·복원 지점 기록·보고
```

세션이 시작되면 기본적으로 위 흐름을 터치 없이 완료한다. 사용자는 진행 TUI를 관찰하거나 언제든 중단할 수 있지만, 라운드별 승인이나 최종 적용 확인을 요구하지 않는다.

### 9.2 저장소 자동 조사

Agent는 질문 전에 다음을 확인한다.

- Git 저장소 여부와 현재 변경 상태
- 패키지 매니저와 프레임워크
- `package.json`, lockfile, 빌드 스크립트
- 앱 실행 명령과 개발 서버 URL
- 주요 라우트와 페이지 진입점
- 기존 테스트와 린트·타입 검사 명령
- 디자인 시스템, 테마, 폰트 및 공통 컴포넌트
- 기존 제품 문서, README 및 카피
- 모바일·데스크톱 지원 흔적

조사 결과는 `.cerberpeck/sessions/<id>/project-profile.yaml`에 저장한다.

### 9.3 질문 정책

- 기본 질문 라운드는 최대 1회다.
- 한 메시지에는 밀접하게 연결된 질문을 최대 2개까지만 넣는다.
- 선택지는 추론한 맥락에 맞춰 생성한다.
- 사용자가 이미 답한 내용은 다시 묻지 않는다.
- 답이 없어도 안전한 기본값이 있으면 명시적으로 가정하고 진행한다.
- 기술 또는 제품 방향을 크게 바꾸는 미지수만 질문한다.
- 계약 초안, 평가단, 가설, 승격과 최종 적용은 기본적으로 별도 확인을 받지 않는다.
- 사용자 입력 Action은 인증·비밀정보, 프로덕션·외부 변경, 복구 불가능한 충돌 또는 서로 양립할 수 없는 핵심 목표에만 생성한다.

예시:

> 현재 페이지는 개발팀용 모니터링 SaaS로 보입니다. 좋은 첫 화면은 가장 중요한 전환 행동에 따라 달라집니다. 무엇을 1순위로 둘까요? ① 무료 체험 시작 ② 데모 요청 ③ 가격 플랜 구매 ④ 다른 목표

### 9.4 Evaluation Contract

Evaluation Contract는 다음 필드를 포함한다.

```yaml
schema_version: 1
session_id: cp_20260722_ab12cd
product:
  name: Example Monitor
  category: B2B SaaS
surface:
  type: landing-page
  routes:
    - /
audience:
  primary:
    role: engineering-manager
    situation: monitoring tools under active comparison
  secondary:
    role: senior-developer
outcomes:
  primary_action: start-free-trial
  secondary_action: view-documentation
priorities:
  - id: value-clarity
    weight: 5
  - id: trust
    weight: 4
  - id: conversion-flow
    weight: 5
  - id: visual-quality
    weight: 3
  - id: mobile-usability
    weight: 2
constraints:
  immutable:
    - brand-colors
    - pricing
    - backend-api
  allowed_scope:
    - frontend
    - copy
evidence:
  viewports:
    - desktop
    - mobile
  inspect_code: true
  inspect_dom: true
budget:
  max_rounds: 10
  max_consecutive_rejections: 3
  max_parallel_sessions: 4
execution:
  mode: isolated-process
  quality_profile: max
panel:
  experts: 3
  customers: 3
```

`max_rounds: 10`은 반드시 열 라운드를 채우라는 뜻이 아니라 품질 개선이 계속 유효할 때 시도할 수 있는 기본 상한이다. 계약을 실질적으로 변경해야 할 경우 변경 이력을 남기고 새 revision을 생성한 뒤 진행 TUI와 최종 보고서에 알린다. 사용자의 핵심 의도와 충돌하지 않는 보정에는 재확인을 요구하지 않는다.

## 10. 평가단

### 10.1 기본 구성

- 전문가 집단: 기본 3명, 필요 시 4~5명
- 고객 집단: 기본 3명, 필요 시 4~5명
- 순수 전문가용 내부 도구 등 고객 평가가 부적절한 경우 고객 집단 생략 가능
- 전체 기본값: 6명, 상한 10명

기본 3명씩으로 시작하고, 사용자군·화면·핵심 평가 축이 여러 개라 기본 패널로 대표성이 부족할 때만 집단별 4~5명으로 늘린다. 유사한 역할을 추가하지 않고 서로 충돌할 수 있는 평가 축을 선택한다. 최대 네 세션씩 나누어 병렬 실행한다.

### 10.2 웹서비스 전문가 후보군

- 제품·UX 및 핵심 작업 흐름
- 전환 설계와 메시지 명료성
- 정보 구조와 인지 부하
- 시각 디자인과 브랜드 일관성
- 프론트엔드 구현 품질
- 접근성 및 반응형 사용성
- 웹 성능과 안정성
- SaaS 카피와 신뢰 형성

Agent는 목표에 맞는 3~5개 역할만 선택한다.

### 10.3 고객 페르소나 설계

고객은 성격보다 다음 차원으로 구분한다.

- 방문 또는 사용 경로
- 문제 인식 수준
- 구매·도입 단계
- 역할과 의사결정 권한
- 사용 빈도와 기술 숙련도
- 목표 작업
- 핵심 우려와 이탈 조건

### 10.4 페르소나 스키마

```yaml
schema_version: 1
id: skeptical-team-lead
cohort: customer
label: 도입을 검토하는 팀 리드
role: engineering-team-lead
context: 8인 개발팀에서 기존 모니터링 도구 교체 검토
job_to_be_done: 짧은 시간 안에 도입 가치와 리스크 판단
success_conditions:
  - 핵심 차별점을 30초 안에 이해
  - 도입 비용과 신뢰 근거 확인
failure_sensitivities:
  - 근거 없는 과장 표현
  - 모호한 가격 또는 도입 과정
focus:
  - value-clarity
  - trust
  - adoption-friction
blind_spot: 세부 구현 난이도는 직접 평가하기 어려움
veto_conditions:
  - 핵심 기능을 오해하게 만드는 표현
```

### 10.5 평가 독립성

- 각 페르소나는 새 최상위 CLI 프로세스로 시작한 완전히 독립된 Agent 세션에서 평가한다.
- 최초 비평자는 다른 평가자의 결과를 보지 않는다.
- 비교 평가자는 최초 비평과 구현자의 개선 가설을 보지 않는다.
- A/B 라벨은 평가자별로 무작위 배치한다.
- “이전”, “새 버전”, “Champion”, “Challenger”라는 표현을 평가 입력에서 제거한다.
- 평가자는 제공된 번들만 근거로 판단하도록 지시한다.
- 리뷰 Agent는 읽기 전용 역할이며 소스 코드를 수정하지 않는다.
- 자식 프로세스에는 `CERBERPECK_CHILD=1`을 설정하고, 설치된 Skill은 이 값이 있으면 새 Cerberpeck 세션을 재귀적으로 시작하지 않는다.
- 리뷰 프로세스의 작업 디렉터리는 정제된 Review Bundle 전용 디렉터리이며 원본과 후보 worktree 경로는 노출하지 않는다.

네이티브 Codex/Claude 서브에이전트 기능은 필수 의존성이 아니다. v0 기본 실행은 Codex의 비대화형 `codex exec`와 Claude Code의 비대화형 `claude -p`를 Action마다 새 프로세스로 시작한다. 이 방식은 부모 대화 기록을 상속하지 않고, 호스트가 지원하는 read-only·허용 도구 설정과 전용 작업 디렉터리로 파일 접근 범위를 좁힐 수 있다. 프로세스 실행을 지원하지 않는 호스트에서는 같은 컨텍스트로 조용히 폴백하지 않고 `doctor`에서 호환성 오류를 낸다.

일부 호스트 버전이 실행 중인 자기 자신 아래에서 비대화형 CLI 재실행을 막는지는 Phase 0에서 실제 검증한다. 그런 버전에는 같은 독립 session semantics를 제공하는 공식 SDK 또는 호스트 background-session 경로를 Host Session Runner 내부에서 사용한다. 어느 경우에도 부모 대화 history를 resume하거나 네이티브 서브에이전트로 대체하지 않는다.

## 11. 실험 프로토콜

### 11.1 용어

- **Session**: 하나의 Evaluation Contract 아래 실행되는 전체 개선 작업
- **Champion**: 현재까지 승인된 최선의 버전
- **Challenger**: 하나의 개선 가설을 구현한 후보 버전
- **Round**: Challenger 생성부터 승격·기각까지의 한 주기
- **Artifact**: 화면, DOM, 코드 diff, 검사 결과 등 평가 입력
- **Review Bundle**: 평가자에게 제공하는 정제된 읽기 전용 자료
- **Promotion**: Challenger를 새 Champion으로 승인하는 결정

### 11.2 Baseline 준비

기존 초안이 있으면 이를 최초 Champion으로 등록한다. 초안이 없으면 Agent가 먼저 구현한 후 등록한다.

Baseline 준비 작업:

1. 현재 워크스페이스 변경 상태 기록
2. 관련 소스 파일 또는 Git tree 보존
3. 앱 실행
4. 지정된 라우트와 사용자 여정 검증
5. 고정 viewport 캡처
6. DOM·접근성·콘솔·네트워크 정보 수집
7. 빌드와 구성된 검사 실행
8. Candidate manifest와 artifact checksum 기록

### 11.3 최초 비평

각 평가자는 다음 형식으로 Baseline을 비평한다.

```json
{
  "persona_id": "conversion-strategist",
  "summary": "핵심 가치보다 기능 목록이 먼저 보인다.",
  "strengths": [
    {"evidence": "hero heading", "finding": "대상 사용자가 명시되어 있다."}
  ],
  "issues": [
    {
      "criterion": "value-clarity",
      "severity": "high",
      "evidence": "hero copy and CTA",
      "finding": "차별점과 CTA의 관계가 불명확하다.",
      "recommended_direction": "결과 중심 헤드라인과 단일 주 CTA를 사용한다."
    }
  ],
  "overall_score": 3.0
}
```

### 11.4 피드백 취합

Synthesis Agent는 모든 원문 피드백과 증거를 읽고 다음을 수행한다.

- 동일 원인의 중복 피드백 병합
- 평가 계약과 직접 연결되지 않는 취향성 피드백 분리
- 서로 충돌하는 피드백과 이유 명시
- 영향도, 확신도, 구현 비용을 고려한 우선순위 지정
- 한 라운드에서 구현할 일관된 개선 가설 작성

피드백을 모두 수용하지 않는다. Synthesis Agent는 반영, 보류, 기각 상태와 이유를 남긴다.

### 11.5 개선 가설

한 라운드는 하나의 일관된 가설을 중심으로 한다. 서로 연관된 1~4개의 변경은 한 가설에 포함할 수 있다.

```yaml
id: hyp_003
title: Hero 가치 제안과 CTA 계층 강화
evidence:
  - 전문가 3명과 고객 2명이 첫 화면의 차별성 부족 지적
expected_effect:
  - 핵심 가치를 더 빠르게 이해
  - 무료 체험 CTA 선택 가능성 증가
changes:
  - 결과 중심 헤드라인으로 교체
  - 보조 문구 축약
  - CTA 우선순위 정리
  - 첫 화면에 신뢰 지표 배치
risks:
  - 설명 축약으로 세부 기능 이해가 감소할 수 있음
status: selected
```

### 11.6 Challenger 구현

- Builder Agent만 후보 소스에 쓰기 권한을 사용한다.
- 후보는 Champion에서 생성한 별도 worktree 또는 스냅샷에서 작업한다.
- 관련 없는 코드 정리를 함께 수행하지 않는다.
- 변경 이유와 영향을 candidate manifest에 기록한다.
- 구현 완료 후 기존 테스트와 웹 검증을 실행한다.

### 11.7 객관적 검증 게이트

기본 필수 게이트:

- 앱 빌드 또는 개발 서버 기동 성공
- 대상 URL 응답 성공
- 페이지 렌더링 성공
- 치명적 브라우저 콘솔 오류 없음
- 필수 요청에서 예기치 않은 4xx·5xx 없음
- 지정된 사용자 여정 완료
- 캡처 생성 성공

프로젝트에서 발견될 경우 추가하는 게이트:

- 기존 단위·통합·E2E 테스트
- TypeScript 타입 검사
- 린트
- 접근성 검사
- 성능 예산
- 주요 DOM assertion

필수 게이트에 실패한 Challenger는 평가단에 보내지 않고 수정하거나 기각한다.

### 11.8 캡처 기본값

```yaml
viewports:
  desktop:
    width: 1440
    height: 1000
  mobile:
    width: 390
    height: 844
capture:
  above_fold: true
  full_page: true
environment:
  locale: ko-KR
  timezone: Asia/Seoul
  color_scheme: light
  reduced_motion: reduce
  animations: disabled
```

각 세션은 Evaluation Contract에 맞게 viewport, locale, theme과 route를 변경할 수 있다. Champion과 Challenger는 동일한 설정을 사용한다.

### 11.9 블라인드 A/B 평가

각 평가자에게 다음을 제공한다.

- Evaluation Contract 중 평가에 필요한 내용
- 페르소나 정의
- 무작위로 A/B 라벨링된 화면과 필요 시 코드·DOM 자료
- 동일한 객관적 검사 요약
- 구조화된 출력 스키마

평가 출력:

```json
{
  "persona_id": "skeptical-team-lead",
  "preference": "B",
  "confidence": 4,
  "scores": {
    "A": 3.5,
    "B": 4.5
  },
  "criterion_scores": [
    {"criterion": "value-clarity", "A": 3.0, "B": 5.0},
    {"criterion": "trust", "A": 4.0, "B": 4.0}
  ],
  "winner_strengths": [
    "첫 화면에서 대상 사용자와 결과를 즉시 이해할 수 있다."
  ],
  "loser_strengths": [
    "기능 범위 설명은 A가 조금 더 구체적이다."
  ],
  "regressions": [
    "B의 모바일 신뢰 지표 영역이 길다."
  ],
  "blocking_issue": null,
  "evidence": [
    {"artifact": "mobile-full.png", "region": "hero", "note": "CTA가 첫 화면에 유지된다."}
  ]
}
```

점수는 1.0부터 5.0까지 0.5 단위로 허용한다. `preference`는 `A`, `B`, `tie` 중 하나다.

### 11.10 Decision Agent

Decision Agent는 다음 정보를 종합한다.

- Evaluation Contract
- 모든 원문 비교 평가
- 평가자별 A/B 실제 매핑
- 객관적 검증 결과
- 코드 diff와 artifact
- 제기된 치명적 회귀

다음 원칙으로 판단한다.

1. 필수 게이트 실패 후보는 승격하지 않는다.
2. 핵심 목표와 직접 연결된 근거를 취향보다 우선한다.
3. 단순 점수 총합만으로 판정하지 않는다.
4. 핵심 고객 집단의 선호를 제품 목표에 맞게 중요하게 본다.
5. 전문가가 발견한 치명적 접근성·기능·신뢰 문제를 별도로 검토한다.
6. 일부 기준의 향상과 다른 기준의 회귀 사이의 중요도를 설명한다.
7. 승격, 기각 또는 사용자 판단 필요 중 하나를 선택한다.

`사용자 판단 필요`는 선호가 갈린다는 이유로 선택하지 않는다. 자동 판정이 원본 손상, 프로덕션·외부 변경 또는 서로 양립할 수 없는 핵심 목표를 결정해야 할 때만 허용한다.

결정 기록:

```yaml
round: 2
champion: cand_001
challenger: cand_002
decision: promote
summary: 핵심 고객군 모두가 가치 명료성과 CTA 구조 개선을 선호했고 기능 회귀가 없음
support:
  expert_preference: 3/4 challenger, 1 tie
  customer_preference: 3/3 challenger
regressions_accepted:
  - 모바일 신뢰 지표 영역이 길어졌으나 CTA 가시성에는 영향 없음
next_champion: cand_002
```

### 11.11 종료 조건

다음 중 하나를 만족하면 세션을 자동 종료하고 최종 Champion을 적용한다.

- `max_rounds` 도달
- 서로 다른 개선 가설이 `max_consecutive_rejections`만큼 연속 기각
- Synthesis Agent가 평가 계약상 의미 있는 새 가설을 찾지 못함
- 남은 개선의 예상 효과보다 회귀 위험이 큼
- 평가 결과가 반복적으로 갈리고 Decision Agent가 새로운 판별 증거도 제안하지 못함
- 사용자가 종료 요청
- 환경 또는 테스트 실패로 안전하게 계속할 수 없음

비용이나 소요 시간만으로 조기 종료하지 않으며, Challenger 하나가 Champion보다 못하다는 이유만으로 즉시 종료하지 않는다. 사용자 판단 없이도 안전하게 Champion을 유지할 수 있는 경우에는 질문하지 않고 보수적으로 기각한 뒤 다음 가설로 진행한다.

### 11.12 최종 적용

- 최종 Champion과 원래 워크스페이스의 diff를 진행 TUI와 보고서에 보여준다.
- 현재 사용자 변경과 충돌 여부를 기계적으로 검사한다.
- 충돌이 없으면 별도 확인 없이 최종 Champion을 적용한다.
- 모든 파일의 자동 병합이 가능할 때만 하나의 트랜잭션으로 적용한다. 하나라도 해결되지 않는 충돌이 있으면 아무 파일도 적용하지 않고 최종 후보를 보존한 채 차단 상태로 전환한다.
- 적용 직전에 Cerberpeck이 원본 workspace에서 처음 변경할 모든 경로의 내용·존재 여부·파일 모드·symlink 대상을 `apply/before/`에 보존한다.
- 적용 직후 동일 경로를 `apply/after/`에 기록하고 트랜잭션을 완료 상태로 표시한다.
- 최종 보고서를 생성한다.

기본 복원 명령은 다음과 같다.

```text
cerberpeck undo                 # 가장 최근 세션의 적용 전 상태로 복원
cerberpeck undo <session-id>    # 지정 세션 복원
cerberpeck redo <session-id>    # undo 직전 상태 재적용
```

`undo`는 Cerberpeck이 최종 적용에서 건드린 경로만 정확히 복원한다. 이후 사용자가 같은 경로를 수정했더라도 그 현재 상태를 먼저 redo bundle로 보존한 뒤 복원하므로 데이터가 사라지지 않는다. 실험용 worktree, 리뷰와 보고서는 감사 및 redo를 위해 남기고, 해당 세션이 시작한 프로세스는 종료한다. 최종 적용 전 중단된 세션의 `undo`는 프로세스 정리와 상태 변경만 수행한다.

최종 보고서에는 다음이 포함된다.

- 목표와 제약
- 평가단
- Baseline 요약
- 라운드별 가설과 결정
- 최종 변경 요약
- 전후 주요 화면
- 남은 보류 사항
- 복구 또는 재개 방법

## 12. Skill 제품 구조

### 12.1 공통 원칙

Codex와 Claude Code는 모두 Agent Skills 형식의 `SKILL.md`를 지원하지만 설치·호출 규칙은 다르다. Skill은 사용자 요청을 `cerberpeck run`에 넘기고 차단 질문과 최종 결과만 호스트 대화에 중계한다. 반복 실행과 Agent 생성은 CLI가 맡으므로 Skill에 서브에이전트 orchestration을 구현하지 않는다.

```text
skill-src/
├── common/
│   ├── references/
│   │   ├── workflow.md
│   │   ├── clarification.md
│   │   ├── personas.md
│   │   ├── evaluation.md
│   │   └── schemas.md
│   └── assets/
│       └── report-template.md
├── codex/
│   ├── SKILL.template.md
│   └── agents/openai.yaml
└── claude/
    └── SKILL.template.md

dist/skills/                         # 생성물, 직접 수정 금지
├── codex/cerberpeck/
│   ├── SKILL.md
│   ├── agents/openai.yaml
│   ├── references/
│   └── bundle-manifest.json
└── claude/cerberpeck/
    ├── SKILL.md
    ├── references/
    └── bundle-manifest.json
```

빌드 단계에서 각 호스트 배포 디렉터리에 필요한 공통 reference와 adapter를 조합한다. `dist/skills`는 항상 생성물이며 source of truth로 사용하지 않는다. `bundle-manifest.json`에는 Skill bundle version, protocol version, 파일 checksum과 지원 호스트 버전을 기록한다.

공통 reference는 한 벌의 원본에서 두 호스트 bundle로 복사한다. 호스트마다 다른 내용을 공통 reference에 조건문으로 넣지 않는다. build-time validation은 두 bundle의 공통 파일 checksum이 같고 호스트 전용 파일만 차이가 나는지 확인한다.

### 12.2 Codex 어댑터

설치 위치:

- 워크스페이스: `<workspace>/.agents/skills/cerberpeck/`
- 글로벌: `~/.agents/skills/cerberpeck/`

호출:

```text
$cerberpeck <요청>
```

요구사항:

- frontmatter는 `name`과 `description`만 사용한다.
- `agents/openai.yaml`에 표시 이름, 설명 및 기본 프롬프트를 제공한다.
- Skill 본문은 요청을 `cerberpeck run --host codex`에 전달한다.
- CLI는 리뷰·합성·구현·판정 Action마다 새 `codex exec` 프로세스를 실행한다.
- 리뷰와 판정은 read-only sandbox, Builder는 후보 worktree만 workspace-write로 실행한다.
- 구조화 결과에는 `--output-schema`를 사용하고, 일회성 평가에는 `--ephemeral`을 사용한다.
- CLI 명령은 설치 범위에 맞는 resolver를 통해 찾는다.
- Skill은 실험 순서, 평가 Agent 수, 종료 조건 또는 재시도 횟수를 계산하지 않는다.

### 12.3 Claude Code 어댑터

설치 위치:

- 워크스페이스: `<workspace>/.claude/skills/cerberpeck/`
- 글로벌: `~/.claude/skills/cerberpeck/`

호출:

```text
/cerberpeck <요청>
```

요구사항:

- Claude Code Skill frontmatter와 Agent Skills 공통 필드를 사용한다.
- `${CLAUDE_SKILL_DIR}` 등 Claude 전용 경로 치환이 필요한 경우 Claude adapter에서만 사용한다.
- 설치 시 사용자의 권한 설정 파일을 자동으로 완화하지 않는다.
- Skill 본문은 요청을 `cerberpeck run --host claude`에 전달한다.
- CLI는 Action마다 새 `claude -p` 프로세스를 실행하고 `--output-format json`과 `--json-schema`로 결과를 받는다.
- 리뷰는 읽기 도구만 허용하고, Builder는 후보 worktree 범위의 편집과 검증 명령만 자동 허용한다.
- Cerberpeck은 사용자의 기존 Claude 인증을 재사용하되 자격증명을 읽거나 저장하거나 대신 전달하지 않는다.
- 2026-07-23 현재 구독 인증의 Agent SDK와 `claude -p` 사용량은 기존 Claude 구독 사용 한도에서 차감된다. 별도 월간 Agent SDK 크레딧 전환은 연기되었으며 현재 제공되지 않는다. API key 인증은 기존 pay-as-you-go 과금을 따른다.
- Skill은 실험 순서, 평가 Agent 수, 종료 조건 또는 재시도 횟수를 계산하지 않는다.

### 12.4 공통 Skill description

설명은 자연어 요청으로도 안정적으로 활성화되도록 핵심 트리거를 앞에 둔다.

```yaml
name: cerberpeck
description: Iteratively improve web services, landing pages, web apps, onboarding flows, dashboards, responsive UI, frontend code, and web copy by defining an evaluation contract, creating expert and customer reviewer personas, building isolated challengers, running independent critiques and blind A/B comparisons, and promoting only better versions. Use when the user asks to make a website or web product the best, polish or optimize a web experience, compare revisions, or repeatedly improve a frontend through agent evaluation.
```

### 12.5 Skill 문서 분량

- `SKILL.md`는 핵심 상태 전이와 반드시 지켜야 하는 규칙만 포함한다.
- 세부 질문 패턴, 페르소나 설계, JSON 스키마와 예시는 reference로 분리한다.
- 호스트가 Skill을 선택하기 전 메타데이터 비용을 줄이기 위해 description을 명확하고 압축적으로 작성한다.
- 공통 reference는 한 단계 깊이에서 직접 연결한다.

### 12.6 독립 Host Session 실행 프로토콜

호스트 Skill은 한 번의 실행만 시작하고, CLI가 다음 반복을 끝까지 소유한다.

```text
1. Skill → `cerberpeck run --host <host> --request-file <path>`
2. CLI → `session next`로 실행 가능한 Action 조회
3. CLI → Action별 새 호스트 프로세스 실행
4. Host Session Runner → stream event와 구조화 결과 수집
5. CLI → 결과 schema 검증 후 `session submit`
6. CLI → 다음 Action 반복, 완료 시 자동 적용과 보고
7. 차단 질문이 생긴 경우에만 종료 코드 8과 질문 payload를 Skill에 반환
```

Action 예시:

```json
{
  "protocol_version": 1,
  "action_id": "act_01J...",
  "session_id": "cp_20260722_ab12cd",
  "kind": "review.comparison",
  "role": "reviewer",
  "persona_id": "skeptical-team-lead",
  "execution": {
    "context": "isolated-process",
    "host": "codex",
    "write_access": false,
    "parallel_group": "round-2-comparison"
  },
  "inputs": {
    "bundle": ".cerberpeck/sessions/.../bundle.json",
    "prompt": ".cerberpeck/sessions/.../actions/act_01J.../prompt.md",
    "prompt_template": {"id": "review-comparison", "version": 1, "sha256": "..."}
  },
  "output_schema": "schemas/review-comparison-v1.json",
  "attempt": 1
}
```

각 Agent 호출은 이전 대화를 resume하지 않고 새 session id를 발급받는다. Reviewer는 Review Bundle 디렉터리, Builder는 해당 Candidate worktree, Synthesis와 Decision은 필요한 정제 자료 디렉터리를 cwd로 사용한다. 네 개를 초과하는 독립 평가자는 wave로 나눠 실행한다. 실패한 프로세스만 새 세션으로 제한 재시도하며, 같은 컨텍스트 또는 네이티브 서브에이전트로 조용히 대체하지 않는다.

`quality_profile: max`는 호스트에서 일반 제공되는 가장 강한 모델과 가장 높은 비위임 reasoning 설정을 선택한다. 독립성 보존과 비용 폭증 방지를 위해 자식 Agent의 Agent·Task·subagent 도구는 비활성화한다. 특정 모델이 없으면 같은 호스트의 다음으로 강한 모델을 사용하고 그 이유를 기록하며, 비용을 이유로 자동 강등하지 않는다.

이 프로토콜 덕분에 새 Agent 호스트를 추가할 때 전체 Cerberpeck 로직을 다시 작성하지 않고 Host Session Runner adapter만 추가할 수 있다.

Action prompt는 Workflow Engine이 제품에 내장된 template과 session 입력으로 렌더링해 session에 저장한다. 호스트 Skill이 자체 prompt 문구를 재구성하지 않으므로 두 호스트의 의미 동작이 달라지는 것을 줄인다. Skill reference에는 protocol 실행법과 안전 규칙만 두고, 역할별 평가 prompt는 `core/prompts`에서 관리한다.

## 13. CLI 제품 요구사항

### 13.1 역할

CLI는 모델 판단을 대신하지 않는다. 다음 결정론적 기능을 제공한다.

- 설치, 업데이트, 제거 및 진단
- 세션 생성, 조회, 중단 및 재개
- Evaluation Contract와 패널 데이터 검증
- Champion·Challenger 버전 보존
- 앱 프로세스와 브라우저 캡처 관리
- 자동 검증과 artifact 생성
- 블라인드 A/B bundle 생성 및 매핑 보관
- 리뷰 결과 schema 검증
- 승격·기각 이벤트 기록
- 독립 호스트 Agent 프로세스 실행과 구조화 결과 회수
- 최종 결과 적용, undo·redo와 보고서 생성

### 13.2 사용자 명령

```text
cerberpeck                         # 간단한 도움말과 주요 명령 표시
cerberpeck install                # 실제 터미널에서는 선택 TUI, 비TTY에서는 기본값 설치
cerberpeck install --interactive  # 선택 TUI 명시 요청
cerberpeck install --yes          # 감지한 기본값으로 즉시 설치
cerberpeck install [flags]        # 지정 설치
cerberpeck update                 # 현재 설치 업데이트
cerberpeck uninstall              # 세션은 보존하고 기본 설치 즉시 제거
cerberpeck uninstall --interactive
cerberpeck doctor                 # 호스트·브라우저·설치 상태 진단
cerberpeck --version
cerberpeck run --host codex|claude --request <text>
cerberpeck sessions list
cerberpeck sessions show <id>
cerberpeck sessions resume <id>
cerberpeck sessions cancel <id>
cerberpeck undo [session-id]
cerberpeck redo <session-id>
cerberpeck report <id>
```

Skill은 정상 경로에서 `run`만 호출한다. 다음 명령은 CLI 내부 runner, 디버깅과 protocol test에서 사용하는 작고 안정적인 Workflow Protocol이다.

```text
cerberpeck session create --json
cerberpeck session inspect --id <id> --json
cerberpeck session next --id <id> --max-actions <n> --json
cerberpeck session submit --id <id> --action <action-id> --result <path> --json
cerberpeck session fail --id <id> --action <action-id> --error <path> --json
cerberpeck session finalize --id <id> --json
```

`session next`는 서로 독립적으로 병렬 실행 가능한 Action을 한 번에 여러 개 반환할 수 있다. `session submit`은 `action_id`와 attempt를 idempotency key로 사용한다. 같은 결과를 다시 제출하면 중복 event를 만들지 않고 기존 결과를 반환한다.

다음 저수준 명령은 디버깅, 테스트 및 Workflow Engine 내부 command handler에서 사용한다. 호스트 Skill은 특별한 복구 상황이 아니면 직접 호출하지 않는다.

```text
cerberpeck contract validate --file <path> --json
cerberpeck panel validate --dir <path> --json
cerberpeck candidate snapshot --session <id> --json
cerberpeck candidate create --session <id> --from <candidate> --json
cerberpeck preview start --session <id> --candidate <id> --json
cerberpeck capture --session <id> --candidate <id> --json
cerberpeck validate --session <id> --candidate <id> --json
cerberpeck bundle create --session <id> --a <id> --b <id> --reviewer <id> --blind --json
cerberpeck review record --session <id> --file <path> --json
cerberpeck decision record --session <id> --file <path> --json
cerberpeck candidate promote --session <id> --candidate <id> --json
```

### 13.3 CLI 출력 계약

- `--json` 사용 시 stdout에는 JSON 하나만 출력한다.
- 진단 로그는 stderr에 출력한다.
- 오류 응답은 안정적인 `code`, `message`, `details`, `recoverable` 필드를 가진다.
- 성공 응답은 `schema_version`, `command`, `result`를 가진다.
- 상태 변경 명령은 idempotency key를 지원한다.
- CLI는 동시 실행 충돌을 막기 위해 세션별 lock을 사용한다.

대표 종료 코드:

| 코드 | 의미 |
|---:|---|
| 0 | 성공 |
| 2 | 잘못된 인자 또는 schema 오류 |
| 3 | 설치 또는 환경 의존성 오류 |
| 4 | 세션 상태 전이 오류 |
| 5 | 앱 실행 또는 브라우저 오류 |
| 6 | 객관적 검증 실패 |
| 7 | 파일 충돌 또는 안전한 적용 불가 |
| 8 | 반드시 필요한 사용자 입력 대기 |
| 10 | 사용자 취소 |

### 13.4 실행 진행 TUI

`cerberpeck run`을 실제 터미널에서 직접 실행하면 입력이 필요 없는 full-screen 진행 TUI를 표시한다. 세션, 라운드, Action·Agent 진행 상태와 최종 Champion을 보여주며 키 입력 없이 완료까지 계속된다.

Codex·Claude Code Skill 내부 실행은 호스트가 PTY를 제공하더라도 hosted mode로 표시해 같은 event를 한 줄씩 출력한다. 비TTY도 같은 line-mode를 사용한다. `--json`에서는 stdout을 JSONL event 전용으로 사용하고 사람용 로그는 stderr로 보낸다.

## 14. 설치 요구사항

### 14.1 설치 범위

Cerberpeck은 두 설치 범위를 제공한다.

#### Workspace 설치 — 기본값

현재 프로젝트에만 적용한다.

```text
<workspace>/.cerberpeck/bin/cerberpeck
<workspace>/.cerberpeck/install-manifest.json
<workspace>/.agents/skills/cerberpeck/      # Codex 선택 시
<workspace>/.claude/skills/cerberpeck/      # Claude Code 선택 시
```

장점:

- 프로젝트별 버전 고정
- 팀과 Skill 파일 공유 가능
- 다른 프로젝트에 영향 없음
- 관리자 권한과 PATH 변경 불필요

사용자는 다음 경로로 CLI를 직접 실행할 수 있다.

```sh
./.cerberpeck/bin/cerberpeck
```

설치된 Skill은 해당 경로를 자동 탐색한다.

#### Global 설치

현재 사용자 계정의 모든 로컬 프로젝트에 적용한다. 시스템 전역 설치가 아니며 `sudo` 또는 관리자 권한을 요구하지 않는다.

Unix 계열:

```text
$HOME/.local/bin/cerberpeck                    # `--bin-dir`로 변경 가능
${XDG_DATA_HOME:-$HOME/.local/share}/cerberpeck/install-manifest.json
$HOME/.agents/skills/cerberpeck/             # Codex 선택 시
$HOME/.claude/skills/cerberpeck/             # Claude Code 선택 시
```

Global 설치는 실행 파일과 Skill의 가용 범위만 바꾼다. Global로 설치했더라도 새 실험의 contract, candidate, review와 report는 기본적으로 대상 프로젝트의 `<workspace>/.cerberpeck/sessions/`에 저장한다. 이 원칙은 프로젝트 간 상태 유출을 막고 두 설치 방식이 같은 파일 구조를 사용하게 한다.

사용자 전역 설정과 다시 만들 수 있는 cache는 플랫폼 표준 경로를 사용한다.

Unix 계열:

```text
${XDG_CONFIG_HOME:-$HOME/.config}/cerberpeck/config.toml
${XDG_CACHE_HOME:-$HOME/.cache}/cerberpeck/
${XDG_DATA_HOME:-$HOME/.local/share}/cerberpeck/
```

Global data에는 설치 매니페스트와 설치 복구 정보만 둔다. 프로젝트 세션을 자동으로 복사하지 않는다.

PATH에 글로벌 bin 디렉터리가 없으면 현재 shell의 사용자 profile에 Cerberpeck 소유 표식이 있는 한 줄을 추가하고 원본을 백업한다. 변경 내용은 진행 TUI와 매니페스트에 표시하며 제거 시 그 줄만 제거한다. 자동 변경을 원하지 않으면 `--no-modify-path`를 사용한다.

### 14.2 호스트 선택

설치 대상은 다중 선택이다.

- Codex
- Claude Code
- 둘 다

자동 감지 기준:

- `codex` 또는 `claude` 실행 파일 존재
- 기존 `.agents`, `.codex` 또는 `.claude` 디렉터리 존재
- 기존 Cerberpeck 설치 매니페스트 존재

감지된 호스트를 자동 선택한다. 둘 다 감지되면 둘 다 선택한다. 아무 호스트도 감지되지 않으면 둘 다 설치하되 “호스트 CLI는 별도로 설치해야 함”을 표시한다.

비대화형 설치에서 `--hosts`가 생략되면 같은 자동 감지 규칙을 사용한다.

### 14.3 원라인 설치

정식 도메인을 기준으로 다음 UX를 제공한다. 도메인이 확정되기 전에는 GitHub Releases의 원본 URL을 사용할 수 있다.

macOS·Linux 기본 설치:

```sh
curl -fsSL https://cerberpeck.dev/install.sh | sh
```

명시적으로 기본값을 고정한 Workspace 설치:

```sh
curl -fsSL https://cerberpeck.dev/install.sh | sh -s -- --scope workspace --hosts codex,claude --yes
```

Codex 글로벌 설치:

```sh
curl -fsSL https://cerberpeck.dev/install.sh | sh -s -- --scope global --hosts codex --yes
```

Bootstrap script의 역할은 다음으로 제한한다.

1. OS와 CPU architecture 감지
2. 최신 release manifest 다운로드
3. 임시 디렉터리에 installer binary 다운로드
4. SHA-256 checksum 검증
5. 지원될 경우 release signature 검증
6. 인자 없는 실제 터미널 설치면 `/dev/tty`를 installer에 연결해 선택 TUI 표시
7. 명시 플래그·`--yes`·비TTY 설치면 line-mode로 기본값 또는 지정값 적용
8. installer binary 실행 후 임시 파일 정리

Bootstrap script가 Skill 파일을 직접 복사하거나 shell 설정을 임의 변경하지 않는다.

### 14.4 설치 TUI

외부 TUI framework를 사용하지 않고 Cerberpeck CLI 안에 직접 구현한다. `node:readline`, stdin raw mode와 최소 ANSI 제어만 사용하며 상태 모델과 rendering을 분리한다. 이 선택은 설치 binary 크기와 framework 호환성 문제를 줄이고, 화면 수가 적은 현재 범위에 맞는다.

인자 없는 `cerberpeck install`과 원라인 설치를 실제 터미널에서 실행하면 다음 한 화면을 먼저 보여준다. 기본 선택은 Workspace, 감지된 모든 호스트와 감지된 system browser이며 Enter 즉시 설치한다. 별도의 Confirm 화면은 두지 않는다.

```text
Cerberpeck installation options

> Scope    workspace
  [x] Codex
  [x] Claude Code
  Browser  system

Workspace: /work/example
```

설치가 시작되면 다음 진행 화면으로 전환한다.

```text
Cerberpeck installation
✓ 대상 검사
✓ CLI 설치
● Skill 설치
○ Browser 준비
○ Doctor

현재 경로: /work/example
```

portable v0.1에서 system browser가 없으면 `none`으로 설치하고 doctor가 capture 비활성화를 알린다. managed Chromium 다운로드는 P1에서 제공한다. 명시 플래그·`--yes`·비TTY에서는 선택 화면을 생략하고 같은 기본값 또는 지정값으로 진행한다. `--interactive`는 선택 화면을 명시적으로 요청한다. 이미 Cerberpeck이 소유한 수정 파일은 자동 백업 후 교체하고, 다른 소유자의 파일과 충돌할 때만 멈춘다.

키보드 요구사항:

- 방향키 또는 `j`/`k` 이동
- Space 다중 선택
- Enter 선택 적용 및 설치 시작
- `q` 안전한 취소
- 색상 없이도 의미가 전달될 것
- `NO_COLOR` 환경 변수 지원
- 좁은 터미널에서 줄바꿈 가능
- screen reader 친화적인 line-mode fallback 제공

### 14.5 비대화형 설치 플래그

```text
cerberpeck install
  --scope workspace|global
  --workspace <path>
  --hosts codex,claude
  --browser system|managed|none
  --interactive
  --yes
  --no-modify-path
  --force
  --json
```

규칙:

- 인자 없는 실제 터미널 설치는 감지한 기본 선택을 한 화면에 표시한다.
- `--scope`, `--hosts`, `--browser` 중 하나라도 지정하거나 `--yes`를 사용하면 선택 화면을 생략한다.
- 비TTY에서는 생략된 값을 같은 안전한 기본값으로 추론하고 확인 없이 설치한다.
- `--interactive`는 실제 터미널에서 선택 화면을 강제로 연다. TTY가 없으면 안전하게 line-mode 기본값으로 fallback한다.
- `--force`가 필요한 경우에도 기존 파일은 백업 후 교체한다.
- `--scope` 기본값은 항상 `workspace`다.
- `--workspace` 기본값은 Git root, 없으면 현재 디렉터리다.

### 14.6 설치 매니페스트

설치와 제거는 매니페스트를 기준으로 동작한다.

```json
{
  "schema_version": 1,
  "installation_id": "cpi_01J...",
  "version": "0.1.2",
  "scope": "workspace",
  "workspace": "/path/to/project",
  "hosts": ["codex", "claude"],
  "browser": {"mode": "system", "path": "/usr/bin/google-chrome"},
  "files": [
    {
      "path": ".agents/skills/cerberpeck/SKILL.md",
      "sha256": "...",
      "owner": "cerberpeck",
      "component": "skill-codex"
    }
  ],
  "path_changes": [],
  "installed_at": "2026-07-22T00:00:00Z"
}
```

- 설치 프로그램은 자신이 생성한 파일만 매니페스트에 기록한다.
- 업데이트 전 현재 checksum을 비교한다.
- 사용자가 수정한 설치 파일은 자동 덮어쓰지 않는다.
- 교체 선택 시 `.cerberpeck/backups/<timestamp>/`에 백업한다.
- 디렉터리는 비었을 때만 제거한다.

### 14.7 원자적 설치와 롤백

설치 단계:

1. 대상과 충돌 사전 검사
2. 임시 staging 디렉터리에 전체 파일 구성
3. 파일 checksum과 Skill 구조 검증
4. 대상별 atomic rename 또는 안전한 교체
5. 설치 매니페스트 기록
6. `doctor` smoke test
7. 실패 시 역순 롤백

두 호스트 중 하나의 설치가 실패하면 기본적으로 전체 트랜잭션을 롤백한다. `--allow-partial`은 초기 버전에서 제공하지 않는다.

### 14.8 업데이트

```text
cerberpeck update
```

- 기존 scope와 host 선택을 유지한다.
- release manifest와 checksum을 검증한다.
- Cerberpeck 소유 설치 파일이 수정되었으면 자동 백업 후 교체하고 결과를 알린다.
- 설치 매니페스트 형식이 바뀌는 업데이트는 기존 매니페스트를 먼저 백업한다.
- Skill 변경 감지가 즉시 되지 않는 호스트에는 restart 안내를 표시한다.

## 15. 제거 요구사항

### 15.1 제거 진입점

설치된 CLI:

```sh
./.cerberpeck/bin/cerberpeck uninstall   # Workspace
cerberpeck uninstall                     # Global
```

원라인 제거:

```sh
curl -fsSL https://github.com/jy-ha/cerberpeck/releases/latest/download/uninstall.sh | sh
```

공개 원라인 제거는 별도 scope 인자를 받지 않는다. 실행한 현재 workspace의 Workspace 설치와 사용자 Global 설치를 모두 완전 제거한다. 다른 프로젝트의 Workspace 설치는 경로를 추측해 탐색하지 않는다.

### 15.2 제거 TUI

`cerberpeck uninstall`은 현재 범위의 설치를 자동 선택해 세션과 보고서를 보존한 채 확인 없이 제거하고 진행 TUI를 보여준다. `--interactive`를 명시했을 때만 발견된 설치, 제거할 호스트와 데이터 보존 여부를 한 화면에서 바꾼다. 일반 제거에는 별도 Confirm 화면이 없다.

기본 정책:

- CLI와 선택한 Skill adapter 제거
- 사용자 세션, 캡처 및 보고서 보존
- 사용자가 수정한 설치 파일 보존
- Cerberpeck이 만든 PATH 항목만 제거
- 다른 프로그램 또는 다른 Skill 파일은 건드리지 않음

완전 제거:

```text
cerberpeck uninstall --purge
```

CLI의 `--purge`는 선택한 설치 범위의 전체 제거를 의미한다. Workspace에서는 두 호스트 Skill, CLI, 설치 매니페스트, `.cerberpeck` 아래의 세션·캡처·보고서·후보 worktree·캐시·브라우저·백업과 `cerberpeck.toml`을 삭제한다. Global에서는 두 호스트 Skill, CLI, 전용 data directory와 Cerberpeck이 추가한 PATH block을 삭제한다. 수정된 Cerberpeck Skill 파일도 전용 디렉터리와 함께 제거하지만 프로젝트의 제품 코드는 변경하지 않는다.

삭제 전에 실행 중인 Cerberpeck Agent 프로세스를 종료하고, Cerberpeck이 만든 Git worktree는 `git worktree remove`로 등록 정보까지 정리한다. `--purge`는 undo·redo 기록도 없애는 비가역 작업이므로 TUI에서만 한 번 확인하고, 비대화형에서는 `--purge --yes`를 모두 요구한다. 공개 `uninstall.sh`는 완전 제거 전용으로 두 플래그를 전달해 Workspace와 Global purge를 모두 시도한다. 한 범위가 실패해도 다른 범위 제거를 계속하고 최종 실패 코드를 반환한다.

### 15.3 부분 제거

```text
cerberpeck uninstall --hosts claude
cerberpeck uninstall --hosts codex
```

다른 호스트가 남아 있으면 공통 CLI와 데이터는 유지한다. 마지막 호스트를 제거하면 공통 CLI도 자동 제거하며, 유지하려면 `--keep-cli`를 사용한다.

### 15.4 CLI 자기 제거

- Unix에서는 종료 직전 안전하게 대상 파일을 제거한다.
- 실패 시 남은 경로와 수동 명령을 정확히 출력한다.

## 16. 브라우저 및 웹 검증 계층

### 16.1 구현 선택

- `playwright-core`를 브라우저 자동화 API로 사용한다.
- System mode에서는 감지한 Chrome, Chromium 또는 Edge executable을 사용한다.
- Managed mode에서는 Cerberpeck 버전에 고정된 Chromium revision을 사용자 cache에 설치한다. 이 항목은 P1이며 portable v0.1은 managed 선택 시 미지원 오류를 명시적으로 반환한다.
- 브라우저 다운로드는 설치 계획에 크기를 표시한다.
- 브라우저를 사용할 수 없으면 코드 중심 평가로 조용히 전환하지 않고 해결 방법을 안내한다.

### 16.2 실행 레시피

실행 레시피(Run Recipe)는 “이 웹서비스를 로컬에서 어떤 명령으로 시작하고, 언제 준비됐다고 판단하며, 어디로 접속하고, 어떻게 종료하는가”를 기계가 다시 실행할 수 있게 저장한 정보다. 추상적인 제품 계약이 아니라 개발 서버 조작법이다.

```yaml
schema_version: 1
cwd: .
start:
  argv: [pnpm, dev, --, --host, 127.0.0.1, --port, "4173"]
  env:
    NODE_ENV: development
ready:
  kind: http
  url: http://127.0.0.1:4173/
  expected_status: 200
  timeout_seconds: 90
stop:
  signal: SIGTERM
  timeout_seconds: 10
routes:
  - /
```

CLI는 `package.json`, framework 설정, 기존 테스트와 이미 열린 포트를 조사해 레시피를 자동 생성하고 세션에 저장한다. shell 문자열 대신 `argv` 배열을 사용하며, 프로세스 그룹 전체를 추적해 세션 종료·중단·undo 때 정리한다. 기본 레시피가 실패하면 다른 감지 후보를 자동 시도한다. 인증 정보가 필요하거나 프로덕션·외부 환경을 가리키는 것으로 의심될 때만 사용자에게 묻는다.

따라서 사용자에게 “웹서비스 실행 계약을 작성해 달라”고 요구하지 않는다. 제품 UI에서는 이해하기 쉬운 “실행 레시피”라고 부르며, 보통은 자동 감지 결과를 진행 TUI에 한 줄 표시하는 것으로 끝낸다.

### 16.3 사용자 여정

Agent가 다음 제한된 DSL로 사용자 여정을 작성할 수 있게 한다.

```yaml
name: signup-happy-path
start: /
steps:
  - click: "text=Start free trial"
  - expect_url: "/signup"
  - fill:
      selector: "input[name=email]"
      value_from_env: "CERBERPECK_TEST_EMAIL"
  - screenshot: signup-form
```

초기 DSL 지원 동작:

- `goto`
- `click`
- `fill`
- `select`
- `press`
- `wait_for`
- `expect_visible`
- `expect_text`
- `expect_url`
- `screenshot`

임의 JavaScript 실행은 MVP DSL에서 지원하지 않는다. 필요한 경우 사용자가 명시한 프로젝트 테스트를 실행한다.

### 16.4 비밀정보

- 테스트 자격증명 값을 session 파일에 평문 저장하지 않는다.
- `value_from_env` 또는 host secret mechanism을 사용한다.
- 캡처 전 지정 selector를 마스킹할 수 있다.
- 로그에서 토큰, 쿠키 및 Authorization header를 제거한다.

## 17. 버전 및 작업 공간 관리

### 17.1 Git 프로젝트

- 현재 HEAD와 dirty state를 Baseline manifest에 기록한다.
- 사용자 변경을 자동 commit하거나 stash하지 않는다.
- 가능하면 Git worktree와 전용 internal ref를 사용한다.
- ref namespace 예시: `refs/cerberpeck/<session>/<candidate>`
- 실험 commit은 사용자 브랜치에 자동 병합하지 않는다.
- 최종 적용 시 patch 또는 선택적 commit 적용 방식을 사용한다.

### 17.2 비-Git 프로젝트

- 대상 파일 목록과 checksum이 기록된 snapshot copy를 저장한다.
- `node_modules`, build output 및 cache는 복제하지 않는다.
- 프로젝트 프로필이 식별한 관련 파일과 명시적 include pattern만 보존한다.
- 최종 적용 전 checksum으로 외부 변경을 검사한다.

### 17.3 현재 변경과 충돌

세션 시작 후 원래 워크스페이스 파일이 바뀌면 최종 적용 시 3-way merge를 시도한다. 자동 해결할 수 없으면 다음을 제공한다.

- 충돌 파일
- Baseline, 현재 워크스페이스, 최종 Champion의 세 버전
- 적용 중단
- 파일별 선택
- 새 Baseline으로 세션 재기준화

자동 3-way merge가 성공하면 진행하고 병합 결과를 적용 트랜잭션에 포함한다. 자동 해결할 수 없는 충돌은 확인 질문을 반복하지 않고 세션을 `blocked`로 두며, 원본 워크스페이스는 그대로 유지한다.

### 17.4 세션 전체 undo와 redo

최종 적용은 다음 파일 단위 트랜잭션으로 관리한다.

```text
apply/
├── transaction.json
├── before/
│   ├── manifest.json
│   └── files/
├── after/
│   ├── manifest.json
│   └── files/
└── redo/
    ├── manifest.json
    └── files/
```

- `before`는 Cerberpeck이 원본 workspace를 처음 변경하기 직전, `after`는 적용 완료 직후 상태다. 모든 실험은 격리 worktree에서 이루어지므로 이것이 원본에 대한 세션 최초 상태다.
- manifest는 각 대상의 상대 경로, 존재 여부, 종류, mode, symlink 대상과 checksum을 기록한다.
- 새로 만든 파일은 `before`에서 `absent`, 삭제한 파일은 `after`에서 `absent`로 기록한다.
- `undo`는 현재 대상 상태를 먼저 `redo`에 보존한 후 `before`를 복원한다.
- `redo`는 다시 현재 상태를 안전하게 보존한 후 `after` 또는 마지막 redo bundle을 적용한다.
- 한 session transaction은 `applied`, `undone`, `redone` 중 하나이며 명령 재실행은 idempotent하다.
- 세션 시작 후 Cerberpeck이 수정하지 않은 경로는 undo 대상이 아니다.
- 복원 도중 실패하면 이미 바꾼 경로를 명령 시작 직전 상태로 역복원한다.

이 방식은 프로젝트 전체를 강제로 reset하지 않으면서 Cerberpeck의 전체 최종 변경만 최초 상태로 되돌린다. 사용자가 이후 같은 파일을 편집했어도 redo bundle에 남기므로 확인 없이 복원할 수 있다.

## 18. 상태와 파일 모델

### 18.1 Workspace 데이터

팀이 공유할 설정과 로컬 runtime 상태를 분리한다.

```text
cerberpeck.toml                         # 선택적 프로젝트 설정, 버전 관리 가능
.cerberpeck/
├── .gitignore
├── bin/
│   └── cerberpeck
├── install-manifest.json
├── cache/
├── browsers/
├── backups/
├── worktrees/
└── sessions/
    └── <session-id>/
        ├── session.json                # canonical state
        ├── session.json.prev           # 마지막 정상 상태 백업
        ├── journal.jsonl               # 사용자 감사·디버깅 로그
        ├── project-profile.yaml
        ├── contract.yaml
        ├── rubric.yaml
        ├── panel/
        ├── hypotheses/
        ├── candidates/
        ├── actions/
        ├── artifacts/
        ├── review-bundles/
        ├── reviews/
        ├── decisions/
        ├── apply/                       # final apply와 undo·redo bundle
        └── report.md
```

`cerberpeck.toml`은 팀이 공유할 수 있는 run command, route, viewport, gate와 보존 정책만 담는다. 비밀정보, 절대 사용자 경로, 세션별 판단은 넣지 않는다.

`.cerberpeck/.gitignore`는 runtime binary, cache, browser, worktree, session artifact와 비밀 가능성이 있는 데이터를 기본적으로 제외한다. 설치 프로그램은 루트 `.gitignore`를 묻지 않고 수정하지 않는다.

화면, DOM, diff와 검사 결과는 해당 Candidate의 `artifacts/` 아래에 직접 저장한다. manifest에는 상대 경로, media type과 checksum을 기록한다. 초기 버전은 전역 deduplication이나 garbage collector를 구현하지 않는다. 실제 세션 용량이 문제가 될 때 artifact 보존 기간 또는 content-addressed 저장을 추가한다.

### 18.2 Session 상태 머신

```text
draft
  → profiling
  → clarifying
  → contracted
  → baseline_preparing
  → baseline_reviewing
  → synthesizing
  → challenger_building
  → challenger_validating
  → comparison_reviewing
  → deciding
      ├─ promoted → synthesizing
      ├─ rejected → synthesizing
      └─ needs_user → deciding
  → finalizing
  → applying
  → completed
      ↔ undone
```

모든 실행 상태에서 `interrupted`, `failed`, `cancelled`, `blocked`로 전환할 수 있다. `interrupted`, `blocked`와 recoverable `failed`는 resume할 수 있다. `completed`는 undo 후 `undone`, redo 후 다시 `completed`가 된다.

위 상태는 사용자에게 보이는 세션 상태다. Agent가 수행할 작업은 Action 단위로 관리한다.

```text
pending → submitted → accepted
   └──────────────→ failed → pending 또는 cancelled
```

- 각 Action은 세션 내 고유 `action_id`, `kind`, `attempt`와 예상 출력 schema를 가진다.
- 병렬 리뷰는 페르소나별 Action으로 생성한다.
- 동일한 `action_id`와 attempt의 결과 제출은 idempotent하다.
- `session next`는 아직 accepted되지 않은 동일한 Action을 다시 반환할 수 있으므로 중단 후 별도 lease 복구 없이 재개할 수 있다.
- 필수 Action이 모두 accepted되기 전에는 다음 workflow state로 이동하지 않는다.
- 여러 reviewer가 동시에 제출해도 CLI의 짧은 파일 lock 구간에서 순서대로 반영한다.

### 18.3 상태 저장과 감사 로그

`session.json`을 유일한 현재 상태 원본으로 사용한다. 상태 변경 시 다음 순서를 따른다.

1. session lock 획득
2. 현재 `revision` 확인
3. 새 상태를 임시 파일에 작성하고 flush
4. 기존 상태를 `session.json.prev`로 보존
5. atomic rename으로 `session.json` 교체
6. 요약 event를 `journal.jsonl`에 append
7. lock 해제

`journal.jsonl`은 라운드와 의사결정의 이력을 보여주는 감사·디버깅 자료다. 이를 replay하여 상태를 재구성할 의무는 없다. `session.json`이 손상되면 `.prev`에서 복구하고 artifact와 리뷰 파일의 checksum을 다시 확인한다.

- `session.json`은 `schema_version`과 증가하는 `revision`을 가진다.
- schema 변경이 실제로 발생할 때 이전 fixture와 변환 함수를 추가한다.
- migration framework나 event별 version 체계를 미리 만들지 않는다.
- journal 기록 실패는 현재 상태 저장을 되돌리지 않지만 doctor 경고를 남긴다.

### 18.4 설정 우선순위

설정은 다음 우선순위로 병합한다.

```text
명령줄 flag
  > CERBERPECK_* 환경 변수
  > workspace `cerberpeck.toml`
  > 사용자 전역 config
  > built-in default
```

`doctor --explain-config`는 각 최종 설정값과 출처를 출력한다. 배열과 map의 병합 규칙은 schema에 명시하고, 알 수 없는 key는 경고 없이 무시하지 않는다.

### 18.5 재현성 메타데이터

Session 생성 시 다음 버전을 고정한다.

- Cerberpeck 제품 버전
- workflow protocol version
- session schema version
- Codex 또는 Claude Skill bundle version
- prompt template version과 digest
- host 이름과 감지된 버전
- browser 종류와 revision
- 프로젝트 commit, dirty snapshot digest
- Agent 실행 모드, 각 독립 호스트 session id, 모델·reasoning·사용량
- 적용 transaction id와 undo·redo 상태

모델 식별자와 reasoning 설정은 호스트가 제공할 때 참고 정보로 기록하되 재개의 필수 조건으로 삼지 않는다. CLI와 session schema가 호환되지 않을 때만 업데이트 또는 새 세션 생성을 안내한다.

## 19. 기술 아키텍처

### 19.1 권장 기술 선택

- 언어: TypeScript
- 런타임 개발 기준: Node.js 24 LTS 이상
- 패키지 매니저: pnpm
- CLI parser: `commander` 또는 동급 라이브러리
- TUI: 외부 framework 없이 `node:readline` + raw input + 최소 ANSI renderer 직접 구현
- schema와 runtime validation: Zod + JSON Schema export
- 브라우저: Playwright Core
- 접근성 검사: `@axe-core/playwright`
- 테스트: Vitest
- CLI E2E: 임시 HOME·workspace를 사용하는 subprocess 테스트
- release binary: Bun compile 기반 단일 실행 파일을 우선 검증

직접 구현 TUI는 full-screen renderer, key decoder, line-mode renderer와 화면별 순수 state reducer로 제한한다. flex layout, component lifecycle, animation framework나 범용 widget system은 만들지 않는다.

단일 실행 파일에서 Playwright와 asset embedding이 안정적으로 동작하지 않으면 다음 fallback을 사용한다.

1. 작은 native/bootstrap binary
2. Cerberpeck 전용 portable Node runtime
3. versioned application bundle

사용자 시스템의 Node 설치 여부에 기대는 방식은 최종 설치 UX의 기본 경로로 사용하지 않는다.

### 19.2 아키텍처 스타일

모듈형 단일 애플리케이션으로 구현한다. CLI, 설치 TUI와 세션 명령은 하나의 실행 파일과 하나의 코드베이스를 사용한다.

```text
Codex Skill ─┐
Claude Skill ├─→ `cerberpeck run` → Workflow Core
사용자 CLI ──┘                       ├─ Host Session Runner ─→ codex exec / claude -p
                                    ├─ Workspace
                                    ├─ Web Runtime
                                    └─ Local Session Files

직접 구현 TUI ───────────────────────→ Run progress / Installer
```

독립 세션은 별도 서비스나 분산 시스템이 아니라 같은 로컬 CLI가 관리하는 자식 프로세스다. 원격 저장소 또는 범용 plugin framework를 전제로 구조를 늘리지 않는다. 유지해야 할 핵심 경계는 Workflow Action schema와 Host Session Runner다.

### 19.3 모듈 구조

```text
apps/
└── cli/
    └── src/
        ├── commands/             # 사용자·Skill CLI command
        ├── tui/                  # terminal, input, renderer, install·run screen
        └── main.ts
packages/
├── core/
│   └── src/
│       ├── workflow/             # 상태 전이와 next/submit/fail
│       ├── session/              # session.json과 journal
│       ├── schemas/              # Zod와 JSON Schema
│       ├── prompts/              # 역할별 prompt template
│       └── reporting/            # Markdown report
├── runtime/
│   └── src/
│       ├── workspace/            # Git worktree와 비-Git copy
│       ├── web/                  # process, Playwright, capture, gate
│       ├── agents/               # codex exec·claude -p process adapter
│       └── artifacts/            # 파일과 manifest
├── installer/                    # target, manifest, update, uninstall
└── skill-builder/                # Codex·Claude bundle 생성
skill-src/
├── common/
├── codex/
└── claude/
tests/
├── fixtures/
├── integration/
└── e2e/
```

별도 `domain`, `application`, `contracts`, `composition` package를 만들지 않는다. 타입과 schema는 `core`에 두고, 코드가 커져 독립 배포 또는 별도 소유권이 필요해질 때만 package를 분리한다.

### 19.4 모듈 책임

#### Core

- Session, Round, Candidate와 Action type
- 허용되는 상태 전이와 종료 조건
- `CreateSession`, `GetNextActions`, `SubmitActionResult`, `FailAction`, `FinalizeSession`
- 외부 JSON schema 검증
- prompt 렌더링
- 보고서 생성

Core는 Playwright, TUI와 호스트별 CLI를 직접 사용하지 않는다. 다만 로컬 파일 기반 SessionStore는 v0의 유일한 구현이므로 불필요한 repository interface 뒤에 숨기지 않는다.

#### Runtime

- Git worktree 또는 비-Git copy를 이용한 후보 작업 공간
- 개발 서버와 검사 command 실행
- Playwright 캡처와 사용자 여정
- 독립 Codex·Claude 프로세스 실행, stream event 정규화와 취소
- artifact 파일과 manifest 관리

#### Installer

- Workspace·Global target 결정
- CLI와 호스트별 Skill 설치
- 매니페스트, 업데이트, 롤백과 제거

#### Skill Builder

- 공통 source에서 Codex와 Claude bundle 생성
- host 전용 SKILL.md 조합
- bundle checksum과 protocol version 검증

### 19.5 필요한 인터페이스만 둔다

초기 구현에서 명시적인 교체 경계는 실제 구현이 둘 이상인 다음 세 개로 제한한다.

```ts
interface WorkspaceDriver {
  snapshot(request: SnapshotRequest): Promise<WorkspaceSnapshot>;
  createCandidate(request: CandidateRequest): Promise<CandidateWorkspace>;
  diff(request: DiffRequest): Promise<WorkspaceDiff>;
  apply(request: ApplyRequest): Promise<ApplyResult>;
}

interface WebDriver {
  start(request: StartRequest): Promise<RunningApp>;
  capture(request: CaptureRequest): Promise<CaptureResult>;
  validate(request: ValidationRequest): Promise<ValidationResult>;
}

interface HostSessionRunner {
  run(request: HostActionRequest): AsyncIterable<HostActionEvent>;
  cancel(sessionId: string): Promise<void>;
}
```

`WorkspaceDriver`는 Git과 비-Git 구현이 실제로 다르고, `WebDriver`는 테스트에서 브라우저를 대체할 필요가 있으며, `HostSessionRunner`는 Codex와 Claude 실행·출력 형식이 실제로 다르므로 유지한다. Clock, UUID, artifact store, host detector 등에 각각 Port를 만들지 않는다. 필요한 테스트에서는 함수 인자나 작은 test helper로 값을 주입한다.

### 19.6 Workflow Engine

Workflow Engine은 현재 `session.json`과 제출 결과로 다음 Action 집합을 계산하는 유일한 상태 전이 권위다.

```text
session.json + submitted result
  → action과 output schema 검증
  → 상태 전이
  → 다음 Action 생성
  → session.json 원자적 저장
```

중요 규칙:

- Action payload는 version을 가진 JSON contract다.
- Action은 렌더링된 prompt와 정제된 input bundle을 참조한다.
- 병렬 리뷰는 같은 `parallel_group`의 여러 Action으로 반환한다.
- 같은 Action 결과의 중복 제출은 기존 결과를 반환한다.
- 실패한 Action만 attempt를 증가시켜 다시 실행한다.
- 사용자의 답이 필요한 Action은 자동 Action보다 우선한다.
- CLI runner는 `next`가 반환하지 않은 단계를 임의로 건너뛰지 않는다.

### 19.7 프로젝트 감지

정적 HTML, Vite, Next.js와 일반 package script 감지는 `runtime/web/detectors/`의 순서가 있는 함수 목록으로 구현한다. 새 framework 지원은 detector 함수와 fixture를 하나 추가하는 방식으로 한다. 별도 Registry interface나 외부 plugin loading은 만들지 않는다.

### 19.8 Artifact와 Review Bundle

- artifact는 세션과 Candidate 아래의 일반 파일로 저장한다.
- manifest는 상대 경로, checksum과 media type을 기록한다.
- Review Bundle builder만 평가자에게 공개할 파일을 복사하거나 연결한다.
- A/B 실제 mapping은 reviewer bundle 밖의 private JSON 파일에 둔다.
- Report는 저장된 리뷰와 결정 파일을 읽어 생성한다.

### 19.9 공개 호환성 경계

v0에서 안정적으로 유지할 계약은 다음으로 제한한다.

- installer flag와 설치 위치
- 사용자 CLI command와 exit code
- `session next/submit/fail` JSON protocol
- `cerberpeck.toml`과 `session.json`의 `schema_version`
- Codex·Claude Skill 호출 이름

내부 디렉터리 배치와 저수준 command는 공개 API로 약속하지 않는다. 실제 schema 변경이 발생하면 그때 이전 fixture와 변환 함수를 추가한다. 최소 한 release의 deprecation 정책이나 범용 migration framework는 안정화 이후 결정한다.

### 19.10 MCP 확장 경로

MCP는 초기 코드에 scaffold를 만들지 않는다. 도입 시 Workflow Core의 `next/submit/fail` 함수를 재사용하는 얇은 transport를 추가한다. 원격 세션 저장소가 실제 요구될 경우 그때 SessionStore 경계를 추출한다.

MCP 도입 조건:

- 여러 장비에서 같은 세션을 조작해야 함
- 팀 대시보드나 원격 artifact가 필요함
- 외부 디자인·분석 시스템과 중앙 연결이 필요함
- 엄격한 원격 평가 sandbox가 필요함

### 19.11 의존성 규칙

- `core`는 `runtime`, `installer`, CLI와 호스트 Skill을 import하지 않는다.
- `runtime`은 호스트 Skill과 설치 TUI를 import하지 않는다.
- CLI가 모듈을 조립하고 사용자 출력과 JSON transport를 담당한다.
- TypeScript project reference와 간단한 ESLint import rule로 역방향 import와 순환 의존성만 차단한다.
- 별도 DI container나 architecture framework는 사용하지 않는다.

## 20. 보안 및 안전

### 20.1 설치 안전

- `sudo`를 요구하거나 사용하지 않는다.
- OS·architecture별 checksum을 검증한다.
- release manifest는 HTTPS로 전달한다.
- 가능한 즉시 Sigstore 또는 동급 서명을 추가한다.
- 설치 계획과 수정 경로를 실행 전에 표시한다.
- shell profile 수정 전 exact diff를 보여준다.
- 기존 파일 충돌 시 기본 동작은 중단이다.
- `--force`도 백업 없이 덮어쓰지 않는다.

### 20.2 제거 안전

- 매니페스트에 없는 파일을 삭제하지 않는다.
- 예상 경로 밖으로 해석되는 symlink를 따라 삭제하지 않는다.
- workspace root, HOME 또는 광범위한 상위 디렉터리를 재귀 삭제 대상으로 사용하지 않는다.
- `--purge`는 구체적인 대상 목록을 작성한 후 실행한다.
- 수정된 파일은 기본 보존한다.

### 20.3 실행 안전

- 프로젝트 실행 명령은 세션에 기록하고 사용자에게 보이게 한다.
- production 환경을 자동 감지하거나 조작하지 않는다.
- 브라우저 네트워크 기록에서 secret을 제거한다.
- 평가자에게 write 작업을 맡기지 않는다.
- 동시에 여러 Builder가 같은 worktree를 수정하지 않는다.
- 사용자의 dirty working tree를 자동 stash, reset 또는 commit하지 않는다.
- 독립 Agent 프로세스에는 역할별 최소 권한, 명시적 cwd와 `CERBERPECK_CHILD=1`을 적용한다.
- 호스트 인증 토큰이나 API key를 읽어 세션 파일에 복사하지 않는다. 자식 프로세스는 사용자가 설정한 공식 호스트 인증 경로를 직접 사용한다.
- 비대화형 Agent가 추가 권한을 요구하면 그 Action을 실패 처리한다. 원본 workspace에 더 넓은 권한을 자동 부여하지 않는다.
- undo·redo 대상은 적용 transaction manifest의 상대 경로로 한정하고, 모든 현재 상태를 먼저 복구 bundle에 보존한다.

## 21. 진단

`cerberpeck doctor`는 다음을 검사한다.

- CLI binary와 버전
- 설치 scope와 매니페스트
- Codex Skill 경로와 checksum
- Claude Code Skill 경로와 checksum
- 호스트 CLI 감지와 버전
- `codex exec` 또는 `claude -p` 비대화형 실행, 인증과 구조화 출력 지원
- 역할별 read-only·workspace-write 또는 허용 도구 설정 지원
- Skill discovery 가능성
- browser mode와 executable
- workspace 쓰기 권한
- Git과 worktree 지원
- Node·패키지 매니저 등 프로젝트 의존성
- 손상된 세션과 lock
- PATH 상태
- 업데이트 가능 여부

결과는 `ok`, `warning`, `error`로 구분하고 각 문제에 실행 가능한 해결 명령을 제공한다.

```text
✓ Cerberpeck 0.1.2
✓ Workspace installation: /work/example
✓ Codex skill: .agents/skills/cerberpeck
✓ Claude skill: .claude/skills/cerberpeck
! Claude Code is running; restart may be required because the top-level skill directory was newly created
✓ System Chrome: /usr/bin/google-chrome
```

## 22. 기능 요구사항과 수용 기준

### FR-001 목표 구체화

- Agent는 저장소 조사 후 질문한다.
- 기본 질문 라운드는 1회 이하이며 질문 없이 추론 가능하면 바로 진행한다.
- 결과는 schema-valid Evaluation Contract로 저장된다.

### FR-002 평가단 생성

- 전문가 3~5명, 고객 0 또는 3~5명을 생성할 수 있다.
- 일반 웹서비스 기본값은 전문가 3명과 고객 3명이며, 대표성이 부족할 때 각 4~5명으로 확장한다.
- 페르소나 간 평가 축이 중복되는 경우 Synthesis Agent가 조정한다.
- 모든 페르소나는 정의된 schema를 통과한다.

### FR-003 독립 최초 비평

- 각 평가는 resume되지 않은 별도 최상위 호스트 CLI 프로세스에서 실행된다.
- 평가자는 서로의 결과를 볼 수 없다.
- 각 결과가 reviewer schema를 통과한다.
- 실패한 평가만 재시도할 수 있다.

### FR-004 후보 격리

- Champion 원본을 변경하지 않고 Challenger를 생성한다.
- 후보 간 lineage가 기록된다.
- 중단 후 같은 후보에서 재개할 수 있다.

### FR-005 웹 artifact

- desktop과 mobile capture를 생성한다.
- 캡처 설정과 checksum을 기록한다.
- 콘솔과 네트워크 오류를 후보별로 수집한다.

### FR-006 블라인드 비교

- 평가자별 A/B 순서가 무작위다.
- 실제 mapping은 평가 bundle 밖에 저장한다.
- 비교 결과는 1~5점, 0.5 단위와 선호·근거를 포함한다.

### FR-007 승격 판정

- 필수 게이트 실패 후보는 승격할 수 없다.
- Decision Agent는 단순 평균 외의 근거를 기록한다.
- 승격과 기각 모두 이벤트로 보존된다.

### FR-008 종료와 보고

- 첫 후보 기각만으로 종료하지 않는다.
- 기본 최대 라운드는 10이며 비용만으로 자동 축소하지 않는다.
- 설정된 라운드 상한과 종료 이유를 보고한다.
- Baseline과 최종 Champion을 비교하는 보고서를 생성한다.

### FR-009 호스트 독립 Workflow Protocol

- Codex와 Claude Host Session Runner는 동일한 versioned Action schema를 사용한다.
- 상태 전이, 재시도와 종료 조건은 Workflow Engine에서만 계산한다.
- Skill은 `cerberpeck run`을 시작하고 차단 질문만 중계한다.
- 호스트별 E2E에서 같은 session 상태와 제출 결과가 같은 Action kind sequence를 만든다.
- protocol version이 호환되지 않으면 작업을 시작하기 전에 명확히 실패한다.

### FR-010 병렬 Action과 재개

- `session next`가 독립 reviewer Action을 한 번에 반환할 수 있다.
- 결과 제출은 `action_id`와 attempt 기준으로 idempotent하다.
- 중단 후 accepted되지 않은 Action을 다시 조회해 실행할 수 있다.
- 일부 reviewer만 실패한 경우 성공한 리뷰를 다시 실행하지 않는다.

### FR-011 로컬 상태 복구

- `session.json`은 원자적으로 교체되고 이전 정상본이 보존된다.
- artifact manifest는 session 기준 상대 경로와 checksum을 사용한다.
- 손상된 현재 상태를 `.prev`에서 복구할 수 있다.

### FR-012 터치 없는 자율 실행

- 목표 구체화가 끝나면 계약, 패널, 라운드, 승격과 최종 적용 확인을 기다리지 않는다.
- 사용자 입력은 인증·비밀정보, 프로덕션·외부 변경, 복구 불가능한 충돌 또는 핵심 목표 충돌에만 요구한다.
- 직접 터미널 실행은 입력 없이 완료까지 갱신되는 진행 TUI를 표시하고, Skill 내부와 비TTY에서는 line event를 출력한다.
- 중단 후 `sessions resume`으로 나머지 Action만 계속한다.

### FR-013 세션 undo와 redo

- `cerberpeck undo` 한 명령으로 최근 세션이 수정한 모든 경로를 최초 상태로 복원한다.
- undo 전에 현재 대상 상태를 redo bundle로 보존한다.
- 새 파일, 삭제 파일, mode와 symlink를 포함하며 관련 없는 경로는 변경하지 않는다.
- undo·redo 중 실패하면 명령 직전 상태로 롤백한다.
- 적용하지 않은 세션의 undo는 프로세스만 정리하고 성공한다.

### FR-014 실행 레시피 자동 감지

- 정적 HTML, Vite와 Next.js fixture에서 확인 없이 시작 명령·URL·readiness·종료 규칙을 생성한다.
- 후보마다 동일 레시피를 사용하고 실행 실패 시 안전한 감지 후보를 자동 재시도한다.
- 프로덕션 또는 외부 서비스 가능성이 있으면 실행하지 않고 차단한다.

### IR-001 원라인 설치

- macOS·Linux 실제 터미널에서 `curl | sh` 한 줄로 Workspace 기본 선택 TUI를 열고 Enter 한 번으로 설치한다.
- 비TTY 또는 명시 플래그에서는 입력 없이 기본값 또는 지정값으로 설치한다.
- 다운로드 binary checksum 불일치 시 아무 파일도 설치하지 않는다.

### IR-002 설치 범위

- Workspace와 Global 선택지가 있다.
- Workspace가 기본 선택이다.
- 선택한 실제 경로가 설치 전에 표시된다.

### IR-003 호스트 선택

- Codex, Claude Code 또는 둘 다 선택할 수 있다.
- Workspace 및 Global 경로가 공식 discovery 경로와 일치한다.
- 두 호스트 설치는 하나의 트랜잭션으로 처리된다.

### IR-004 비대화형 설치

- scope, workspace, hosts와 browser를 flag로 지정할 수 있다.
- `--json`에서 사람이 읽는 진행 로그가 stdout을 오염시키지 않는다.
- CI 환경에서 TTY 없이 설치할 수 있다.

### IR-005 업데이트

- 설치 scope와 hosts를 유지한 채 업데이트할 수 있다.
- 수정된 설치 파일을 감지한다.
- 실패 시 이전 버전으로 롤백한다.

### IR-006 제거

- 설치된 CLI와 원라인 부트스트랩 모두 제거를 시작할 수 있다.
- 공개 원라인 제거 한 번으로 현재 Workspace와 Global 설치를 모두 완전 제거한다.
- host별 부분 제거를 지원한다.
- 세션 데이터는 기본 보존한다.
- `--purge`에서만 세션 데이터와 백업을 제거한다.
- 매니페스트에 없는 파일은 제거하지 않는다.

### IR-007 TUI 접근성

- 키보드만으로 모든 설치와 제거 과정을 완료할 수 있다.
- `NO_COLOR`와 line-mode를 지원한다.
- 취소 시 부분 설치가 남지 않는다.
- TUI는 외부 UI framework 없이 작은 renderer와 state reducer로 구현한다.

## 23. 테스트 전략

### 23.1 단위 테스트

- 설치 target resolution
- workspace root 탐지
- host 자동 감지
- manifest serialization과 checksum
- 상태 머신 transition
- 동일 session 상태의 결정론적 Action 생성
- Action dependency와 실패 attempt 증가
- idempotency
- 원자적 session 저장과 `.prev` 복구
- 실행 TUI state reducer, key decoding과 line-mode formatting
- persona, contract, review schema
- A/B mapping randomization
- 종료 조건
- secret redaction
- path traversal과 symlink 방어
- apply transaction, 전체 undo·redo와 중간 실패 역롤백

### 23.2 통합 테스트

- 임시 HOME에서 Global Codex 설치·업데이트·제거
- 임시 HOME에서 Global Claude 설치·업데이트·제거
- 임시 workspace에서 두 호스트 동시 설치
- 수정된 Skill 파일이 있는 상태의 업데이트
- 부분 제거 후 다른 호스트 유지
- `--purge`와 기본 데이터 보존 차이
- PATH 수정과 복구
- Git worktree candidate 생성·승격·최종 적용
- 비-Git snapshot·충돌 검사
- Playwright capture와 journey DSL
- Codex·Claude Host Session Runner event 정규화, schema 출력과 취소
- 실행 레시피 감지, readiness timeout과 process-group 정리

### 23.3 Protocol과 Skill bundle 테스트

- CLI `next/submit/fail` JSON의 golden fixture를 보존한다.
- Codex와 Claude Skill bundle 생성 결과를 snapshot 비교한다.
- 공통 Skill reference가 호스트 bundle 사이에서 drift하지 않는지 checksum으로 검사한다.
- `core`가 `runtime`, `installer` 또는 CLI를 import하지 않는지 검사한다.
- Skill이 `run` 이외의 workflow를 재구현하거나 서브에이전트 호출을 포함하지 않는지 검사한다.
- `CERBERPECK_CHILD=1`에서 Skill이 재귀 세션을 시작하지 않는지 검사한다.

schema 변경이 처음 발생할 때 이전 버전 fixture와 변환 테스트를 추가한다. v0부터 빈 migration framework를 만들지는 않는다.

### 23.4 설치 E2E 매트릭스

| OS | Architecture | Shell/Host |
|---|---|---|
| macOS | arm64 | zsh |
| macOS | x64 | zsh/bash |
| Linux | x64 | bash/zsh |
| Linux | arm64 | bash |
| WSL2 | x64 | bash |

모든 환경에서 binary 실행, TUI 표시, Workspace 설치와 기본 제거를 smoke test한다. Linux x64와 macOS arm64에서만 다음 전체 조합을 매 release 실행한다.

- 인자 없는 실제 터미널 선택 TUI와 Enter 설치
- `--yes` 기본 설치
- `--interactive` 명시 선택 변경
- 비대화형 설치
- Workspace 기본값
- Global 설치
- Codex only
- Claude only
- 둘 다
- update
- 부분 uninstall
- full uninstall
- purge
- 네트워크 중단과 checksum 실패 롤백

### 23.5 Skill E2E fixture

최소 세 개의 작은 웹 프로젝트 fixture를 사용한다.

1. 정적 랜딩페이지
2. React/Vite SaaS 화면
3. Next.js 인증·온보딩 흐름

각 fixture는 runtime·capture integration test에 사용한다. 전체 Agent 세션 E2E는 React/Vite fixture 하나에 집중하고 Codex와 Claude Code에서 각각 실행한다.

전체 Agent 세션에서 다음을 검증한다.

- 저장소 조사
- Evaluation Contract 생성
- 평가단 생성
- Baseline capture
- 독립 평가 결과 생성
- Challenger 구현과 검증
- 블라인드 A/B bundle
- 승격 또는 기각
- 최종 보고서
- 최종 자동 적용 후 undo와 redo

정적 HTML과 Next.js fixture에는 별도의 전체 Agent 세션을 중복 실행하지 않는다. 관련 detector나 capture 동작이 바뀔 때만 선택적으로 실행한다.

### 23.6 Forward test

Skill 초안 완성 후 의도된 정답을 알려주지 않은 새 Agent 컨텍스트에서 현실적인 요청을 실행한다. 평가 시에는 생성된 contract, persona, candidate, review와 보고서를 원시 artifact로 검토한다.

## 24. 배포와 릴리스

### 24.1 버전 정책

- SemVer 사용
- CLI, schema 및 Skill bundle은 하나의 제품 버전으로 릴리스
- session schema와 install manifest schema는 독립된 정수 version 유지
- schema가 실제로 변경될 때만 이전 버전 변환과 테스트를 추가

### 24.2 Release artifact

```text
cerberpeck-<version>-darwin-arm64.tar.gz
cerberpeck-<version>-darwin-x64.tar.gz
cerberpeck-<version>-linux-arm64.tar.gz
cerberpeck-<version>-linux-x64.tar.gz
release-manifest.json
checksums.txt
install.sh
```

### 24.3 CI 파이프라인

1. lint, typecheck, unit test
2. integration test
3. Skill schema 및 구조 validation
4. platform binary build
5. binary smoke test
6. installer E2E
7. checksums 및 provenance 생성
8. GitHub Release 생성
9. canonical installer endpoint 갱신

## 25. 구현 계획

각 Phase는 계층 하나를 완성하는 대신 사용자가 관찰할 수 있는 end-to-end 기능을 추가한다. 미래용 추상화를 먼저 만들지 않고 해당 Phase에서 실제로 사용하는 기능만 구현한다.

### Phase 0 — Walking Skeleton

목표: 가장 위험한 기술 가정을 검증하고, 가짜 결과를 사용하더라도 한 Session이 공통 프로토콜로 끝까지 흐르게 한다.

작업:

- TypeScript 모듈형 단일 애플리케이션 골격
- Workflow Engine과 Action Protocol을 설명하는 짧은 architecture note
- `session create → next → submit → completed` 최소 Workflow Engine
- 임시 디렉터리의 `session.json` 저장
- CLI JSON transport와 golden contract fixture
- 공통 Skill source와 Codex·Claude 최소 adapter 생성
- 두 호스트 공식 경로에서 Skill discovery 확인
- `codex exec`·`claude -p` 독립 프로세스, 구조화 출력과 취소 spike
- Bun single binary에서 직접 구현 TUI, embedded asset과 Playwright system browser spike
- 임시 workspace 설치·제거 prototype

완료 기준:

- 동일 session 상태와 제출 결과가 두 호스트에서 동일한 Action sequence 생성
- fake reviewer result를 제출해 최소 Session 완료
- 두 호스트에서 새 프로세스가 부모 대화를 resume하지 않고 schema-valid 결과 생성
- 한 fixture 페이지 desktop·mobile 캡처
- Codex와 Claude에서 생성된 Skill 호출 확인
- packaging 전략을 단일 binary 또는 portable Node fallback 중 하나로 확정
- 간단한 module import rule이 CI에서 실행

### Phase 1 — 첫 번째 실제 수직 슬라이스

목표: 정적 또는 Vite 랜딩페이지 하나를 한 라운드 실제 개선하고 자동 적용·복원하는 내부 alpha를 만든다.

작업:

- 실제 터미널의 Workspace 기본 선택 TUI와 비TTY 자동 설치, 직접 구현 진행 TUI
- `session.json`, `.prev`, journal과 일반 artifact 디렉터리
- Evaluation Contract, Persona, Review와 Decision schema v1
- Git WorkspaceDriver 최소 구현
- system browser Playwright capture
- Baseline snapshot과 desktop·mobile artifact
- 기본 3명 전문가·3명 고객 패널 생성 Action과 필요 시 4~5명 확장
- Host Session Runner와 독립 최초 비평 Action
- Synthesis, 단일 Builder, 검증, A/B Review와 Decision Action
- promote 또는 reject
- Markdown final report, 자동 final apply와 단일 세션 undo
- Codex와 Claude Host Session Runner E2E

완료 기준:

- 두 호스트에서 같은 fixture에 실제 한 라운드 완료
- Reviewer가 새 최상위 프로세스에서 실행되고 구조화된 결과 제출
- 원본 workspace를 덮어쓰지 않고 Challenger 생성
- A/B mapping이 reviewer bundle에 노출되지 않음
- 최종 결과가 확인 없이 적용되고 `cerberpeck undo`로 원래 상태 복원

### Phase 2 — Workflow 신뢰성과 재개

목표: 여러 라운드, 병렬 리뷰, 중단과 실패를 안전하게 처리한다.

작업:

- 전체 Session aggregate와 transition guard
- Action dependency, parallel group과 attempt
- idempotent submit과 부분 reviewer 재시도
- 짧은 session file lock과 revision 확인
- atomic save와 `.prev` 복구
- Git internal ref, worktree cleanup과 원자적 final apply
- 비-Git WorkspaceDriver
- redo bundle과 undo·redo 중간 실패 역롤백
- 연속 기각, 기본 10 max round와 최소 needs-user 정책
- session list, show, resume, cancel
- 기본 재현성 메타데이터와 protocol compatibility 검사

완료 기준:

- 프로세스 강제 종료 후 같은 세션 재개
- 일부 리뷰 실패 시 해당 리뷰만 재실행
- 첫 Challenger 기각 후 다른 가설로 계속 진행
- 중단 또는 손상 후 `.prev` 상태에서 복구
- dirty workspace와 충돌 시 데이터 손실 없이 중단
- 적용 이후 같은 파일을 수정한 상태에서도 undo가 현재 내용을 redo bundle로 보존

### Phase 3 — 웹서비스 지원 확장

목표: 랜딩페이지를 넘어 대표적인 웹서비스 실행과 사용자 흐름을 안정적으로 평가한다.

작업:

- 정적 HTML, Vite, Next.js 순차 detector 함수
- 실행 레시피 자동 생성과 fallback
- preview process lifecycle과 orphan cleanup
- managed Chromium mode
- full-page, theme, locale과 복수 route capture
- console·network 수집과 secret redaction
- journey DSL
- 기존 project script 기반 gate
- axe 접근성 검사
- React/Vite와 Next.js fixture

완료 기준:

- 세 fixture에서 동일 조건 캡처와 사용자 여정 완료
- 앱 실행 실패가 구조화된 recoverable Action으로 표시
- 필수 게이트 실패 후보가 비교 평가로 넘어가지 않음
- 자격증명이 event, log 또는 artifact에 평문 저장되지 않음
- 새 detector가 Workflow Core 수정 없이 추가됨

### Phase 4 — 설치·업데이트·제거 제품화

목표: 내부 alpha를 일반 사용자가 안전하게 설치하고 관리할 수 있게 한다.

작업:

- Workspace와 Global target resolver 완성
- Codex, Claude 및 둘 다 선택하는 직접 구현 설치 TUI
- 실제 터미널 기본 선택 설치와 비TTY·명시 플래그 자동 설치, 자동 업데이트·일반 제거
- 비대화형 flags와 JSON 출력
- install manifest, checksum과 bundle compatibility
- atomic staging, rollback과 backup
- Global config·data·cache 경로
- update와 제품·protocol 호환성 검사
- 호스트별 부분 uninstall, default data preservation과 purge
- Unix bootstrap script
- PATH 변경과 자기 제거
- `doctor`와 `--explain-config`
- 임시 HOME·workspace installer E2E

완료 기준:

- 모든 IR 요구사항 통과
- 원라인 설치 후 두 호스트에서 Skill discovery 가능
- 업데이트 실패 시 이전 CLI와 Skill bundle 복원
- 제거 후 세션 데이터 기본 보존
- 실패·취소 후 매니페스트 밖의 부분 설치 없음

### Phase 5 — 공개 릴리스 강화

목표: 오픈소스 공개와 반복 유지보수에 필요한 호환성·테스트·릴리스 체계를 완성한다.

작업:

- 지원 OS·architecture release matrix
- module boundary와 workflow protocol test
- generated Skill bundle drift test
- 접근 가능한 line-mode installer
- network failure와 corrupted download 테스트
- Skill forward test와 host compatibility matrix
- 예제 fixture와 데모 녹화
- 보안 검토
- release signing과 provenance
- canonical installer endpoint

완료 기준:

- Stable v0.1 release artifact
- 원라인 설치·업데이트·제거 시나리오 통과
- 신규 workspace에서 첫 실험을 별도 문서 없이 시작 가능
- 알려진 데이터 손실 또는 host별 workflow drift 이슈 없음

### Phase 6 — 후속 후보

- 여러 Challenger 병렬 탐색
- 원격 MCP adapter
- 팀 공유 session store
- HTML 비교 대시보드
- Figma, analytics 및 issue tracker 연동
- 실제 웹 사용 데이터에 따른 평가 계약 보강
- 추가 프레임워크용 실행·캡처 detector
- 세션 용량 문제가 확인될 경우 artifact deduplication과 정리 명령
- schema 변경이 발생할 경우 migration 도구
- 네이티브 Windows binary와 PowerShell installer·uninstaller

## 26. 구현 우선순위

### P0

- Workspace 기본 설치
- Global 설치
- Codex·Claude 선택 설치
- TUI와 비대화형 설치
- 안전한 제거
- versioned Workflow Action Protocol
- Workflow Engine과 원자적 `session.json` 저장
- host adapter bundle 자동 생성과 호환성 검사
- Codex·Claude 독립 Host Session Runner
- 기본 10라운드와 3+3 평가단
- Git·snapshot 후보 보존
- browser capture
- 독립 평가와 A/B 비교
- 승격·기각·종료
- 최종 자동 적용, 전체 세션 undo·redo와 보고

### P1

- managed Chromium
- journey DSL 전체 동작
- HTML 보고서
- 접근성·성능 검사 확장

### P2

- MCP
- 원격 저장소와 팀 대시보드
- 외부 서비스 connector

## 27. 주요 위험과 대응

| 위험 | 영향 | 대응 |
|---|---|---|
| 단일 binary와 Playwright packaging 실패 | 원라인 설치 복잡도 증가 | Phase 0에서 조기 검증, portable Node fallback 준비 |
| 호스트별 Agent CLI와 출력 형식 차이 | 세션 실행 불일치 | 공통 Action schema와 Host Session Runner 분리, E2E를 호스트별 실행 |
| 호스트 인증·구독·비대화형 사용량 차이 | 자동 세션 시작 실패 또는 예상 밖 한도 소진·비용 | 자격증명은 공식 CLI에 맡기고 doctor에서 실제 one-shot probe와 구독 한도·API 과금 경로 안내 |
| 실행 중인 호스트에서 동일 CLI의 중첩 실행 제한 | 독립 Action 시작 실패 | Phase 0에서 검증하고 공식 SDK·background-session 경로로 교체; 같은-context fallback 금지 |
| 자식 Agent가 Cerberpeck을 다시 호출 | 재귀 실행과 비용 폭증 | `CERBERPECK_CHILD=1`, 전용 cwd와 Skill recursion guard |
| 설치 파일 사용자 수정 | 업데이트·제거 시 데이터 손실 | checksum, manifest와 자동 backup; 외부 소유 파일 충돌만 중단 |
| dirty workspace와 최종 적용 충돌 | 사용자 코드 손실 | 자동 stash 금지, snapshot과 3-way merge, 충돌 시 중단 |
| 리뷰 결과 schema 불일치 | 자동 취합 실패 | CLI validation과 제한된 재시도 |
| 웹서비스 실행 방식 다양성 | 캡처 실패 | 저장소 조사, 명시적 run command, fixture 확장 |
| 브라우저 다운로드 크기 | 설치 이탈 | system browser 기본, managed mode 선택 제공 |
| 기본 10라운드·3+3 평가의 높은 비용과 시간 | 사용자 중단 | 4개 wave 병렬화, 사용량 실시간 표시, resume와 선택적 사용자 budget; 품질을 조용히 낮추지 않음 |
| 여러 Agent의 동시 쓰기 | 코드 충돌 | 리뷰 read-only, Builder 단일 writer, 후보별 worktree |
| 평가자에게 버전 정체 노출 | 비교 편향 | 무작위 A/B bundle과 mapping 분리 |
| Codex와 Claude Skill의 workflow drift | 호스트별 동작과 버그 수정이 달라짐 | Skill은 `run` launcher로 제한하고 상태 전이와 prompt는 CLI 한 곳에서 관리 |
| 세션 상태 파일 손상 | 재개 실패 | atomic rename, revision, `.prev` 백업과 doctor 복구 |
| undo 대상 파일의 후속 사용자 수정 | 복원 중 사용자 작업 손실 | 현재 상태를 redo bundle로 먼저 보존하고 manifest 대상 밖은 변경하지 않음 |
| 필요 이상의 추상화 | 초기 개발 속도와 이해도 저하 | 모듈형 단일 애플리케이션 유지, 실제 구현이 둘 이상인 경계만 interface 사용 |
| Artifact 누적 | 장기 세션의 디스크 사용량 증가 | 세션별 용량 표시와 수동 정리, 문제가 확인될 때 deduplication 추가 |
| Global 설치와 프로젝트 상태 혼동 | 프로젝트 간 데이터 유출 또는 제거 오류 | Global은 binary·Skill 가용 범위만 변경하고 Session Store는 workspace-local 유지 |

## 28. 확정된 제품 결정

- 초기 제품은 웹서비스 개선에 한정한다.
- Skill + CLI로 시작한다.
- MCP는 초기 릴리스에 포함하지 않는다.
- Workflow Engine을 상태 전이의 단일 권위로 두고 Skill은 `cerberpeck run` launcher와 차단 질문 중계로 제한한다.
- 모듈형 단일 애플리케이션으로 구현하고 `core`, `runtime`, `installer`, `skill-builder` 책임만 분리한다.
- Workspace, Web과 실제 두 구현이 있는 Host Session Runner 경계에만 초기 interface를 두며 범용 DI와 동적 플러그인 시스템은 만들지 않는다.
- Global 설치에서도 실험 상태는 기본적으로 workspace에 저장한다.
- `session.json`을 canonical state로 사용하고 journal은 감사 로그로만 사용한다.
- 평가단은 세션 동안 유지하고 모든 피드백을 개선에 활용한다.
- 각 Agent Action은 `codex exec` 또는 `claude -p`로 시작한 새 최상위 독립 세션에서 수행한다. 네이티브 서브에이전트 기능은 요구하지 않는다.
- 일반 웹서비스의 기본 평가단은 전문가 3명과 고객 3명이며 필요할 때 각 4~5명으로 확장한다.
- 기본 최대 라운드는 10이며 품질을 비용보다 우선한다.
- 기본 `quality_profile`은 `max`이며 자식 Agent의 재위임 기능은 끈다.
- 절대 점수보다 블라인드 A/B 비교와 근거를 우선한다.
- 첫 Challenger 기각으로 세션을 종료하지 않는다.
- 기본 설치 범위는 Workspace다.
- Global은 사용자 전역 설치이며 시스템 관리자 권한을 요구하지 않는다.
- Codex, Claude Code 또는 둘 다 설치할 수 있다.
- TUI는 외부 framework 없이 직접 구현한다.
- 실제 터미널의 인자 없는 설치는 한 화면에서 기본 선택을 확인하며, 명시 플래그·비TTY 설치와 실험은 확인을 기다리지 않고 진행한다.
- Codex·Claude Code 내부 실행은 line-mode, 직접 터미널 실행은 full-screen 진행 TUI를 사용한다.
- TUI, line-mode CLI, 원라인 설치 및 원라인 제거를 모두 지원한다.
- 최종 Champion은 충돌이 없으면 자동 적용하고, `undo`·`redo`로 세션 전체 변경을 쉽게 복원한다.
- 웹서비스 시작 정보는 사용자에게 요구하는 “실행 계약”이 아니라 자동 감지하는 “실행 레시피”로 관리한다.
- 제거 시 세션과 보고서는 기본 보존하고 `--purge`에서만 삭제한다.
- 설치 및 제거는 매니페스트에 기록된 소유 파일만 변경한다.

## 29. 출시 전 남은 결정

- 공식 Git 저장소와 release download URL
- `cerberpeck.dev` 도메인 사용 여부
- 오픈소스 라이선스
- macOS 코드 서명 방식
- Sigstore 기반 release signing 도입 시점
- stable v0.1의 최소 Codex 및 Claude Code 버전

호스트 모델과 reasoning의 정확한 CLI 매핑은 Phase 0 compatibility spike에서 확정한다. 제품 의미는 이미 `quality_profile: max`로 결정되어 있으며, 고정 모델명을 core schema에 박지 않는다. 호스트 릴리스에 따라 alias가 바뀔 수 있으므로 실제 resolved model과 설정은 session에 기록하고 사용자가 config로 override하게 한다.

모델 CLI 매핑과 최소 호스트 버전은 Phase 0에서, 나머지 배포 결정은 Phase 5 이전에 확정한다. 어느 항목도 현재 core 구현을 막지 않는다.

## 30. 공식 호스트 경로 근거

2026-07-23 기준 공식 문서에 따르면 Codex의 repository Skill은 `.agents/skills`, 사용자 Skill은 `$HOME/.agents/skills`에서 탐색된다. Claude Code의 project Skill은 `.claude/skills/<skill-name>/SKILL.md`, personal Skill은 `~/.claude/skills/<skill-name>/SKILL.md`에 위치한다.

Codex는 `codex exec` 비대화형 실행, JSONL event와 JSON Schema 구조화 출력을 공식 지원한다. Claude Code는 `claude -p` 비대화형 실행, JSON·stream JSON과 JSON Schema 출력을 공식 지원한다. 따라서 네이티브 서브에이전트를 필수로 두지 않고 Action마다 새 최상위 프로세스를 시작하는 기본 설계가 가능하다.

Claude Code 공식 문서는 새 session이 이전 conversation history 없이 시작하며 background session도 각자 별도 프로세스로 실행된다고 설명한다. 이 경로는 `claude -p` 중첩 실행 호환성에 문제가 있는 버전의 대안이 될 수 있다.

Anthropic은 2026-06-15 공지에서 별도 월간 Agent SDK 크레딧 전환을 중단했다. 현재 구독 인증으로 실행한 Agent SDK, `claude -p`와 제3자 앱 사용량은 기존 구독 사용 한도에서 계속 차감되며, 별도 월간 크레딧은 제공되지 않는다.

- [OpenAI Codex — Build skills](https://learn.chatgpt.com/docs/build-skills)
- [OpenAI Codex — Customization](https://learn.chatgpt.com/docs/customization/overview)
- [OpenAI Codex — Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Claude Code — Extend Claude with skills](https://code.claude.com/docs/en/skills)
- [Claude Code — Run Claude Code programmatically](https://code.claude.com/docs/en/headless)
- [Claude Code — How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works)
- [Claude Code — Manage multiple agents with agent view](https://code.claude.com/docs/en/agent-view)
- [Claude Help Center — Use the Claude Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)

공식 discovery 경로가 바뀔 수 있으므로 release 전 host compatibility test와 문서 검증을 반복한다.
