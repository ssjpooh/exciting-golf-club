# AGENTS.md — 익사이팅 골프 클럽 (Exciting Golf Club)

> 이 문서는 이 저장소를 수정하는 **AI 에이전트 / 개발자**가 앱의 구조·도메인 로직·개발 히스토리·관례를 빠르게 파악하도록 작성되었다.
> 코드를 고치기 전에 먼저 이 문서를 읽고, 새 기능/변경을 하면 이 문서도 함께 갱신할 것.

---

## 0. 작업 기록 규칙 (★필독 — 모든 AI 공통★)

이 저장소는 **어떤 AI/도구로 접속할지 모른다.** 세션이 바뀌어도 이전 작업 맥락이 이어지도록, **작업을 마칠 때마다 반드시 기록을 남긴다.**

1. **`CLAUDE.md`의 "작업 로그"에 항상 새 항목을 추가** (최신이 위로). 날짜·무엇을·왜·어떤 파일을 바꿨는지 1~5줄로. → 다음 세션의 아무 AI나 이 로그만 봐도 직전에 무슨 일이 있었는지 안다.
2. 변경이 **구조/도메인 로직/관례**에 영향을 주면 이 `AGENTS.md`의 해당 섹션(및 §12 개발 히스토리)도 함께 갱신.
3. 그런 다음 `main`에 커밋 & 푸시(§10 규칙).

> 요약: **작업 → CLAUDE.md 로그 추가 → (필요시) AGENTS.md 갱신 → 커밋·푸시.** 빠뜨리지 말 것.

---

## 1. 앱 개요

- **무엇**: 골프 라운드 **스코어 기록·통계 웹앱**. 사용자가 라운드별 홀 스코어를 입력하고, 통계 그래프(버디/파/보기/양파, 오버파 추이)로 자신의 기록을 분석한다.
- **대상**: 한국어 사용자. 모든 UI 텍스트·커밋 메시지는 **한국어**.
- **플랫폼**: 모바일 우선(반응형) 웹. PWA "홈 화면에 추가" 안내 있음.

### 중요한 히스토리 — 볼링 앱에서 골프 앱으로 전환됨
이 프로젝트는 원래 **볼링 스코어 앱**이었고 골프로 용도 변경(repurpose)되었다.
- **볼링 잔재는 2026-07-14에 모두 정리됨** (`version.ts` 릴리스 노트, `ReleaseNoteDialog.tsx` 문구, `db.ts` 닉네임 마이그레이션의 `"볼링러"` 제거).
- 다만 **일부 오래된 커밋 메시지**는 볼링 맥락일 수 있으니 히스토리 탐색 시 참고.
> 새 문구는 항상 골프 기준으로 작성할 것.

---

## 2. 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프레임워크 | React 19, **TanStack Router / Start**(파일 기반 라우팅), Vinxi |
| 빌드 | Vite 7, TypeScript 5.8 |
| 스타일 | **Tailwind CSS v4**, shadcn/ui(Radix 기반) 컴포넌트 (`src/components/ui/*`) |
| 상태/폼 | React Hook Form + Zod, TanStack Query(설치되어 있으나 데이터는 대부분 직접 fetch) |
| 백엔드 | **Firebase** (Firestore, Auth, Analytics), `firebase-admin`(서버 커스텀 토큰) |
| 차트 | **Recharts** (LineChart) |
| 아이콘 | lucide-react |
| 지도 | @react-google-maps/api (골프장 검색) |
| 배포 | Cloudflare (`@cloudflare/vite-plugin`, `wrangler.toml`) |
| 외부 API | RapidAPI `golf-course-api` (골프장/홀 정보) |

---

## 3. 개발 명령어

```bash
npm run dev        # 개발 서버 (vite dev --open)
npm run build      # tsr generate + vite build
npm run build:dev  # 개발 모드 빌드
npm run preview    # 빌드 미리보기
npm run lint       # eslint
npm run format     # prettier

npx tsc --noEmit   # 타입 체크 (변경 후 항상 돌려볼 것 — 아래 "알려진 이슈" 참고)
```

- 셸: 이 저장소는 Windows(PowerShell) 환경. Bash 툴도 사용 가능하나 heredoc 등 문법 주의.

---

## 4. 환경 변수 (`.env`)

`src/lib/firebase.ts`, `golfApi.ts`가 사용하는 Vite 환경 변수 (`import.meta.env`):

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
VITE_GOLF_API_KEY          # RapidAPI 골프 코스 API 키 (없으면 API 조회 스킵/빈 템플릿 반환)
```

> ⚠️ **민감 정보 주의**: 저장소 루트에 `firebase-admin-key.json`(서비스 계정 키)이 있다. 절대 노출/커밋 확산 금지. 카카오/네이버 OAuth 서버 액션이 이를 사용한다.

---

## 5. 디렉터리 구조

```
src/
├─ routes/                 # TanStack 파일 기반 라우팅
│  ├─ __root.tsx           # 루트 레이아웃 (릴리스 노트 팝업 등)
│  ├─ index.tsx            # "/"  로그인 페이지 (구글/애플/카카오/네이버/익명)
│  ├─ scores.tsx           # "/scores"  ★핵심★ 스코어 기록/수정/통계/리스트
│  ├─ select-course.tsx    # "/select-course"  골프장 선택(지도 검색)
│  ├─ admin/users.tsx      # "/admin/users"  관리자: 유저 목록/등급/타 유저 스코어 열람
│  └─ oauth/callback/      # 카카오·네이버 OAuth 콜백
├─ components/
│  ├─ ScoreStatisticsGraph.tsx  # 통계 라인차트 (scores.tsx가 사용)
│  ├─ MapSearchDialog.tsx       # 구글맵 골프장 검색
│  ├─ ReleaseNoteDialog.tsx     # 버전 릴리스 노트 팝업
│  └─ ui/                       # shadcn/ui 컴포넌트 모음
├─ lib/
│  ├─ db.ts               # ★Firestore 접근 계층 + 타입 정의 (Score, UserProfile, GolfCourse 등)
│  ├─ firebase.ts         # Firebase 클라이언트 초기화
│  ├─ firebase-admin.ts   # Firebase Admin (서버)
│  ├─ golfApi.ts          # 골프장/홀 정보 조회 (DB 우선 → RapidAPI fallback)
│  ├─ auth/providers.ts   # 클라이언트 로그인 (google/apple/custom token/anonymous)
│  ├─ auth/server-actions.ts  # 카카오/네이버 커스텀 토큰 발급(서버)
│  └─ version.ts          # APP_VERSION + RELEASE_NOTES
└─ routeTree.gen.ts       # 자동 생성 (직접 수정 금지)
```

---

## 6. 인증 (Auth)

- Firebase Auth 사용. `onAuthStateChanged`로 로그인 상태 감지.
- 지원 로그인: **Google, Apple**(팝업), **Kakao, Naver**(OAuth 콜백 → 서버에서 Firebase 커스텀 토큰 발급 → `signInWithCustomToken`), **익명**.
- 로그인/최초 가입 시 `createOrUpdateUser`(`db.ts`)가 `users` 컬렉션에 프로필 생성/갱신.
- **슈퍼 관리자 이메일은 하드코딩**되어 있다:
  - `db.ts` `createOrUpdateUser`의 `adminEmails`: `tlsejdzkzk@gmail.com`, `tkdwnslpooh@gmail.com`, `ssjpooh@kakao.com`, `tlsejdzkzk1@naver.com`, `shin.sangjun@icloud.com` → 자동 `super_admin`.
  - `scores.tsx`의 `isSuperAdminEmail`: `tlsejdzkzk@gmail.com`, `tkdwnslpooh@gmail.com` (관리자 메뉴 노출용, **위 목록과 별개라 불일치 주의**).

---

## 7. 데이터 모델 (Firestore)

컬렉션 3개. 타입 정의는 모두 `src/lib/db.ts`.

### `scores` — 라운드 기록 (`Score`)
```ts
{
  id?, userId, date: "YYYY-MM-DD",
  holes: HoleScore[],       // { hole, par, score(=그로스 타수), putts?, distance?, strategy?, handicap? }
  total: number,            // 그로스 총타수
  location?, courseId?, memo?,
  stats: GameStats,         // { birdies, pars, bogeys, doubleBogeys, worse, totalPutts } — 저장 시 자동 계산
  handicap?, netScore?,
  handicapType?: "none" | "total" | "hole" | "both",
  roundType?: "field" | "screen",   // 라운딩 종류 (코드로 저장). 없으면 '필드'로 간주
  createdAt?
}
```
- 저장: `saveScore` / 수정: `updateSavedScore` / 삭제: `deleteSavedScore`. 모두 저장 후 `syncUserStats`로 유저 average/highScore 갱신.
- 조회: `getUserScores`(서버 정렬 대신 **클라이언트 정렬** — Firestore 인덱스 회피 목적), `sortScoresDesc`(날짜 desc → createdAt desc).

### `users` — 유저 프로필 (`UserProfile`)
```ts
{ uid, email, nickname, provider, role: UserRole, average, highScore, handicap?, createdAt, lastLoginAt }
// UserRole = "super_admin" | "master" | "staff" | "member"
```

### `golf_courses` — 골프장/코스 (`GolfCourse`)
```ts
{ id, name, holeCount, totalPar, holes: GolfCourseHole[], createdAt }
// 신규 골프장은 스코어 입력 중 saveGolfCourseToDb로 등록되어 다른 유저와 공유됨
```

---

## 8. 핵심 도메인 로직 (★ 반드시 이해할 것 ★)

대부분 `src/routes/scores.tsx`의 `RecordRoundDialog`에 있다. **기록 입력과 수정은 같은 다이얼로그**를 재사용한다(`initialData` 유무로 구분).

### 8-1. 상대 타수(오버타) 입력 방식
- 사용자는 각 홀에서 **par 대비 상대 타수(오버타)** 를 입력한다. 예: Par4에서 `-1`=3타, `0`=4타, `+1`=5타.
- **DB에는 그로스(실제) 타수로 변환하여 저장**한다 (`score = par + 상대값`). 반대로 수정 화면을 열 때는 그로스 → 상대값으로 역변환.
- 입력 제한:
  - 최소 = `1 - par` (홀인원 한계, 실제 1타 미만 불가)
  - 최대 = `min(par, 10)` (양파/더블파 제한 + 절대 10타 상한)

### 8-2. 핸디캡 (`handicapType`)
- `none`(없음) / `total`(총타수 차감) / `hole`(홀별 차감) / `both`(둘 다).
- `netScore`는 위 방식에 따라 계산되어 저장. 홀별 핸디는 `holes[].handicap`.

### 8-3. 라운딩 종류 (`roundType`) — 최근 추가 기능
- 값: **`field`(필드) / `screen`(스크린)** 두 가지. **저장은 코드**(`field`/`screen`), **표시는 코드명**(`필드`/`스크린`).
- 매핑 상수: `db.ts`의 `ROUND_TYPES = [{code:'field',name:'필드'}, {code:'screen',name:'스크린'}]`, 타입 `RoundTypeCode`.
- **기록 입력/수정 다이얼로그**의 "라운딩 종류"에는 **필드/스크린 2개만** 노출(전체 없음). 기본값 `field`.
- `roundType`이 없는 **레거시 기록은 '필드'로 간주**한다 (`g.roundType ?? 'field'`).

### 8-4. 통계 그래프 (`ScoreStatisticsGraph.tsx`)
- 9홀/18홀은 `holes.length`(9 또는 18)로 분류. 헤더의 셀렉트로 전환.
- 라인: 오버파(+/-), 버디, 파, 보기, 양파. 토글 칩으로 표시/숨김.
- **양파(더블파)** = `(그로스 - par) === par` 인 홀. birdies/pars/bogeys는 `stats`에서, 양파는 실시간 계산.
- 제목은 선택된 라운딩 타입에 따라 **"전체/필드/스크린 스코어 통계"** 로 동적 표시(제목은 `roundTypeFilter` prop만 받고, 필터 버튼은 그래프 밖 "조회 옵션 바"에 있음. `onRoundTypeChange`가 넘어오면 그래프 헤더에도 버튼이 렌더되는 조건부 구조).

### 8-5. `scores.tsx` 페이지 필터/상태
- `displayGames` = `games`를 **courseId + 시작/종료일 + 라운딩 타입**으로 필터한 결과. 통계·리스트 **공통** 사용.
- **라운딩 타입 필터(전체/필드/스크린)**: 세그먼트 버튼. "조회 옵션 바"(시작/종료일 필터 카드 아래, 입력 창 글자 크기 옆)에 위치. `roundTypeFilter` 상태(`'all' | RoundTypeCode`).
- **홈으로(전체기록)**: `courseId`가 없으면 `courseInfo`를 `null`로 비워 첫 로그인과 동일한 "내 라운드 기록" 화면으로 복귀.
- 각 기록 카드의 "그로스(기본):" 배지 앞에 `[필드]`(초록)/`[스크린]`(남보라) 구분 라벨.

### 8-6. 글자 크기 프리셋 (`fontSizePreset`)
- `'normal' | 'medium' | 'large' | 'huge'` — 노년층/접근성 대응. **거의 모든 UI 블록이 이 값에 따라 Tailwind 클래스를 분기**한다(IIFE로 클래스 문자열 계산하는 패턴 다수). UI를 수정할 때 4가지 프리셋을 모두 고려할 것.

---

## 9. UI/UX 관례

- **테마색**: teal(`teal-600` 계열)이 기본 강조색. 선택된 세그먼트 버튼 = `bg-teal-600 text-white`.
- **적은 옵션 + 자주 토글하는 필터** → 드롭다운보다 **세그먼트(토글) 버튼** 선호(탭 1번). **한 번 정해두는 설정**(글자 크기 등) → 드롭다운 유지.
- 라벨/컨트롤은 공백이 과하지 않게 붙여 배치, 모바일에서 `flex-wrap`으로 자연스럽게 줄바꿈.
- shadcn/ui 컴포넌트(`@/components/ui/*`)와 Tailwind를 사용. 색/여백은 주변 코드 톤에 맞춤.

---

## 10. Git / 커밋 관례

- **작업 완료 후 항상 커밋 & 푸시**(묻지 않고 자동). 이 저장소는 **`main`에 직접 커밋**하는 워크플로우다(브랜치 새로 파지 않음).
- 커밋 메시지는 **한국어**, 기존 스타일 유지: `feat: ...` 또는 간단한 설명(`UI 변경` 등).
- AI가 만든 커밋에는 트레일러 추가:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

## 11. 알려진 이슈 / 주의점 (기존부터 존재, 이번 기능과 무관)

`npx tsc --noEmit` 시 아래 **기존 에러**가 뜬다. 신규 변경으로 인한 에러와 구분할 것:

1. **`src/routes/index.tsx`** — 존재하지 않는 `getUserActiveApprovalRequest`를 `@/lib/db`에서 import.
   `error TS2305: Module '"@/lib/db"' has no exported member 'getUserActiveApprovalRequest'`.
   → `db.ts`에 해당 함수가 없다. 승인 요청 기능이 미완성이거나 제거된 흔적. 로그인 흐름 수정 시 확인 필요.
2. **`src/routes/scores.tsx:271`** — `saveGolfCourseToDb`에 넘기는 `holes[].par` 타입이 `number | ""`인데 `GolfCourse.holes[].par`는 `number`. 입력 중 빈 값 허용 때문.
3. **`src/routes/scores.tsx`** — 게임 카드 렌더에서 `game.handicap`이 `possibly undefined` (`TS18048`).
4. **`admin/users.tsx`** — `game.handicap` undefined 관련 동일 계열 경고.
5. **슈퍼 관리자 이메일 목록 불일치**: `db.ts`와 `scores.tsx`의 하드코딩 목록이 다름(§6 참고).

> 새 변경을 커밋하기 전 `npx tsc --noEmit`으로 **위 목록 외 새로운 에러가 없는지**만 확인하면 된다.

---

## 12. 최근 개발 히스토리 (라운딩 종류/타입 기능)

시간순(오래된 → 최신):
1. `라운딩 종류 추가` — `Score.roundType`(field/screen) 도입. 기록 입력/수정 다이얼로그의 "코스/코스조합 이름" 하단에 필드/스크린 선택(토글 버튼) 추가. 저장은 코드로.
2. `홈 화면 통계 수정` — 홈으로 이동 시 `courseInfo` 초기화, 통계에 라운딩 타입 필터 개념 도입.
3. `UI 변경` — 리스트도 라운딩 타입 필터에 포함되도록 `displayGames`에 통합. 카드 배지에 `[필드]/[스크린]` 표시.
4. `조회 옵션 바 UX 개선` — 라운딩 타입 필터를 드롭다운 → **세그먼트 버튼**화, 입력 창 글자 크기와 한 줄 배치.
5. `그래프 제목 앞으로 이동 → 다시 조회 옵션 바로 복귀` — 최종적으로 **필터 버튼은 조회 옵션 바에**, **그래프 제목만 선택값 반영("전체/필드/스크린 스코어 통계")** 하는 구조로 정리.

**현재 상태 요약**:
- 라운딩 종류 = 필드/스크린 (기록 저장 값, 코드 저장).
- 라운딩 타입 필터 = 전체/필드/스크린 (통계·리스트 조회용, `all`은 저장 안 되는 "전부 보기" 의미).
- 필터 버튼: 조회 옵션 바 / 그래프 제목: 동적 텍스트.

---

## 13. 새 작업 시 체크리스트

- [ ] 변경 파일이 `fontSizePreset` 4단계를 모두 커버하는가?
- [ ] 라운딩 관련 값을 다룬다면 코드(`field`/`screen`) 저장 + 레거시 `?? 'field'` 처리를 지켰는가?
- [ ] `npx tsc --noEmit`에서 §11 목록 외 신규 에러가 없는가?
- [ ] 한국어 UI 문구/커밋 메시지인가?
- [ ] 완료 후 `main`에 커밋 & 푸시했는가?
- [ ] 이 `AGENTS.md`에 반영이 필요한 구조 변경인가?
