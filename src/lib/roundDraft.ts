import type { HoleScore, RoundTypeCode } from "./db";

/**
 * 라운드 작성 중 임시저장(드래프트).
 *
 * 배경: 스코어 입력값은 그동안 다이얼로그의 React state에만 있었다.
 * 전반 라운드 후 휴식(폰 화면 끄기 / 앱 전환)을 하면 모바일 브라우저가 탭을
 * 메모리에서 날려버려 페이지가 새로고침되고, PWA로 실행한 경우에도
 * start_url("/")부터 다시 시작되기 때문에 **입력한 스코어가 전부 사라지고
 * 골프장 검색부터 다시** 해야 했다.
 * 그래서 입력 중인 내용을 localStorage에 계속 저장해두고, 돌아오면 이어서
 * 기록할 수 있게 한다.
 *
 * 주의: holes[].score 는 다이얼로그 입력값 그대로 **오버타(파 대비 상대 타수)** 이다.
 * (DB에 저장되는 Score.holes[].score 는 실제 타수라서 서로 다르다.)
 */
export type RoundDraft = {
  version: 1;
  courseId: string;
  /** 골프장 이름 (코스조합 제외) */
  courseName: string;
  courseSection: string;
  roundType: RoundTypeCode;
  date: string;
  memo: string;
  holes: HoleScore[];
  handicapInput: number | "";
  handicapType: "none" | "total" | "hole" | "both";
  isNewCourse: boolean;
  tempHoleCount: number;
  setupStep: "choose_holes" | "scorecard";
  /** 마지막 저장 시각 (epoch ms) */
  updatedAt: number;
};

const KEY_PREFIX = "golf-round-draft:";

const keyFor = (uid: string) => `${KEY_PREFIX}${uid}`;

/** 사파리 시크릿 모드 등에서 localStorage 접근이 예외를 던지므로 항상 감싼다. */
export function loadRoundDraft(uid?: string | null): RoundDraft | null {
  if (!uid || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RoundDraft;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.holes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveRoundDraft(uid: string | null | undefined, draft: Omit<RoundDraft, "version" | "updatedAt">) {
  if (!uid || typeof window === "undefined") return;
  try {
    const payload: RoundDraft = { ...draft, version: 1, updatedAt: Date.now() };
    window.localStorage.setItem(keyFor(uid), JSON.stringify(payload));
  } catch {
    // 저장 공간 부족/차단 시에는 조용히 무시 (입력 자체를 막으면 안 됨)
  }
}

export function clearRoundDraft(uid?: string | null) {
  if (!uid || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(keyFor(uid));
  } catch {
    // 무시
  }
}

/** 실제로 타수가 입력된 홀 수 */
export function countFilledHoles(holes: HoleScore[] | undefined): number {
  if (!holes) return 0;
  return holes.filter(h => h.score !== "" && h.score !== null && h.score !== undefined).length;
}

/** 되살릴 가치가 있는(=뭔가 입력된) 드래프트인지 */
export function draftHasInput(draft: RoundDraft | null): boolean {
  if (!draft) return false;
  return countFilledHoles(draft.holes) > 0;
}

/** "오늘 14:32" / "3일 전" 같은 사람이 읽는 시각 */
export function formatDraftTime(ts: number): string {
  const d = new Date(ts);
  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) return `오늘 ${hhmm}`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hhmm}`;
}
