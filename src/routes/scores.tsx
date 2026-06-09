// UI 최적화 및 빌드 설정 완료 (2026-05-14)
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useLoadScript, Autocomplete } from "@react-google-maps/api";
const libraries: ("places")[] = ["places"];
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { MapSearchDialog } from "@/components/MapSearchDialog";
import {
  Score,
  saveScore,
  getUserScores,
  Frame,
  getUserProfile,
  UserProfile,
  UserRole,
  getClubs,
  updateUserClub,
  Club,
  createClubApprovalRequest,
  getUserActiveApprovalRequest,
  ClubApprovalRequest,
  subscribeUserProfile,
  updateSavedScore,
  deleteSavedScore,
  sortScoresDesc,
} from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus,
  History,
  Trophy,
  TrendingUp,
  ChevronRight,
  Calendar as CalendarIcon,
  MapPin,
  StickyNote,
  Delete,
  ShieldCheck,
  Crown,
  Diamond,
  User,
  Menu,
  Users,
  Settings,
  LayoutDashboard,
  LogOut,
  Check,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// 1. 라우트 정의
type ScoresSearch = {
  viewUid?: string;
};

export const Route = createFileRoute("/scores")({
  validateSearch: (search: Record<string, unknown>): ScoresSearch => {
    return {
      viewUid: search.viewUid as string | undefined,
    };
  },
  component: ScoresPage,
});


// 2. 유틸리티 함수
function pinValue(s: string): number {
  if (!s) return 0;
  if (s === "X") return 10;
  if (s === "-") return 0;
  if (s === "/") return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function computeScore(frames: string[][]): { cumulative: number[]; total: number } {
  const rolls: number[] = [];
  for (let i = 0; i < 9; i++) {
    const f = frames[i] ?? [];
    const a = f[0] ?? "";
    const b = f[1] ?? "";
    if (a === "X") {
      rolls.push(10);
    } else {
      const av = pinValue(a);
      rolls.push(av);
      if (b === "/") rolls.push(10 - av);
      else rolls.push(pinValue(b));
    }
  }
  const f10 = frames[9] ?? [];
  const a = f10[0] ?? "";
  const b = f10[1] ?? "";
  const c = f10[2] ?? "";
  const av = a === "X" ? 10 : pinValue(a);
  rolls.push(av);
  const bv = b === "X" ? 10 : b === "/" ? 10 - av : pinValue(b);
  rolls.push(bv);
  if (a === "X" || b === "/" || (a !== "" && b !== "" && av + bv === 10 && a !== "X")) {
    const cv = c === "X" ? 10 : c === "/" ? 10 - bv : pinValue(c);
    rolls.push(cv);
  }

  const cumulative: number[] = [];
  let rollIdx = 0;
  let score = 0;
  for (let frame = 0; frame < 10; frame++) {
    if (frame < 9) {
      const r1 = rolls[rollIdx] ?? 0;
      if (r1 === 10) {
        score += 10 + (rolls[rollIdx + 1] ?? 0) + (rolls[rollIdx + 2] ?? 0);
        rollIdx += 1;
      } else {
        const r2 = rolls[rollIdx + 1] ?? 0;
        if (r1 + r2 === 10) {
          score += 10 + (rolls[rollIdx + 2] ?? 0);
        } else {
          score += r1 + r2;
        }
        rollIdx += 2;
      }
    } else {
      for (let k = rollIdx; k < rolls.length; k++) score += rolls[k] ?? 0;
    }
    cumulative.push(score);
  }
  return { cumulative, total: score };
}

function computeMaxPossibleScore(currentFrames: string[][]): number {
  const frames = JSON.parse(JSON.stringify(currentFrames));
  
  for (let i = 0; i < 9; i++) {
    if (frames[i][0] === "") {
      frames[i][0] = "X";
    } else if (frames[i][0] !== "X" && frames[i][1] === "") {
      frames[i][1] = "/";
    }
  }
  
  if (frames[9][0] === "") {
    frames[9][0] = "X";
    frames[9][1] = "X";
    frames[9][2] = "X";
  } else if (frames[9][0] === "X") {
    if (frames[9][1] === "") {
      frames[9][1] = "X";
      frames[9][2] = "X";
    } else if (frames[9][1] === "X") {
      if (frames[9][2] === "") {
        frames[9][2] = "X";
      }
    } else if (frames[9][1] !== "X" && frames[9][2] === "") {
      frames[9][2] = "/";
    }
  } else if (frames[9][0] !== "X") {
    if (frames[9][1] === "") {
      frames[9][1] = "/";
      frames[9][2] = "X";
    } else if (frames[9][1] === "/") {
      if (frames[9][2] === "") {
        frames[9][2] = "X";
      }
    }
  }
  
  return computeScore(frames).total;
}

// 3. 하위 컴포넌트
function FrameThrows({ throws, isLast }: { throws: string[]; isLast: boolean }) {
  const slots = isLast ? 3 : 2;
  const display: string[] = [];
  for (let i = 0; i < slots; i++) display.push(throws[i] ?? "");

  return (
    <div className="flex h-full w-full items-start justify-center">
      <div className="flex border-b border-l border-slate-100">
        {display.map((v, i) => {
          let displayVal = v;
          let isStrikeOrSpare = v === "X" || v === "/";

          if (!isLast && throws[0] === "X") {
            displayVal = i === 0 ? "▶" : "◀";
            isStrikeOrSpare = true;
          } else {
            if (displayVal === "X") displayVal = "▶◀";
            else if (displayVal === "/") displayVal = "◢";
          }

          return (
            <span
              key={i}
              className={`inline-flex h-5 w-[18px] sm:w-6 items-center justify-center text-[10px] font-bold ${
                i > 0 ? "border-l border-slate-100" : ""
              } ${isStrikeOrSpare ? "text-amber-500" : "text-slate-600"}`}
            >
              {displayVal}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ScoreSheet({ gameNo, game, onClick }: { gameNo: number; game: Score; onClick?: () => void }) {
  // Mobile: 5+5 frames in two rows for compact display
  const renderHalf = (start: number, end: number) => (
    <table className="w-full border-collapse text-center">
      <thead>
        <tr className="bg-slate-50 text-slate-400">
          {Array.from({ length: end - start }).map((_, i) => (
            <th
              key={i}
              className="border-l border-slate-100 py-1 text-[9px] font-bold first:border-l-0"
            >
              {start + i + 1}
            </th>
          ))}
        </tr>
        <tr className="border-t border-slate-100">
          {game.frames.slice(start, end).map((f, i) => (
            <td key={i} className="h-9 border-l border-slate-100 p-0 align-middle first:border-l-0">
              <FrameThrows throws={f.throws} isLast={start + i === 9} />
            </td>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr className="border-t border-slate-100 bg-teal-50/30">
          {game.frames.slice(start, end).map((f, i) => (
            <td
              key={i}
              className="border-l border-slate-100 py-1.5 text-[11px] font-black tabular-nums text-slate-700 first:border-l-0"
            >
              {f.cumulative || ""}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );

  return (
    <div 
      onClick={onClick}
      className={`rounded-xl border border-slate-200 bg-white shadow-sm transition-all ${
        onClick ? "hover:border-teal-500/50 hover:shadow-md cursor-pointer active:scale-[0.99]" : ""
      }`}
    >
      {/* Game header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase text-slate-500">GAME {gameNo}</span>
          <span className="text-[10px] text-slate-400">· {game.matchType}</span>
          {game.location && (
            <span className="hidden sm:inline text-[10px] text-slate-400 truncate max-w-[120px]">
              · {game.location}
            </span>
          )}
        </div>
        <div className="text-lg font-black tabular-nums text-teal-600">{game.total}</div>
      </div>

      {/* Mobile: 5+5 split */}
      <div className="sm:hidden divide-y divide-slate-100">
        {renderHalf(0, 5)}
        {renderHalf(5, 10)}
      </div>

      {/* Desktop: original 10-frame table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full border-collapse text-center">
          <thead>
            <tr className="bg-slate-50/80 text-slate-500">
              {Array.from({ length: 10 }).map((_, i) => (
                <th
                  key={i}
                  className="border-l border-slate-100 px-1 py-2 text-[10px] font-bold first:border-l-0"
                >
                  {i + 1}
                </th>
              ))}
              <th className="border-l border-slate-100 px-3 py-2 text-[10px] font-black uppercase">
                TOTAL
              </th>
            </tr>
            <tr className="border-t border-slate-100">
              {game.frames.map((f, i) => (
                <td
                  key={i}
                  className="h-10 border-l border-slate-100 p-0 align-middle first:border-l-0"
                >
                  <FrameThrows throws={f.throws} isLast={i === 9} />
                </td>
              ))}
              <td className="border-l border-slate-100" />
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-100 bg-teal-50/30">
              {game.frames.map((f, i) => (
                <td
                  key={i}
                  className="border-l border-slate-100 px-1 py-2 text-xs font-black tabular-nums text-slate-700 first:border-l-0"
                >
                  {f.cumulative || ""}
                </td>
              ))}
              <td className="border-l border-slate-100 px-3 py-2 text-lg font-black tabular-nums text-teal-600">
                {game.total}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecordGameDialog({
  onSave,
  onDelete,
  editGame,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  onSave: (g: Omit<Score, "userId" | "stats" | "createdAt"> & { id?: string }) => void;
  onDelete?: (scoreId: string) => void;
  editGame?: Score | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setInternalOpen;

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState("");
  const [memo, setMemo] = useState("");
  const [matchType, setMatchType] = useState("연습");
  const [ballUsed, setBallUsed] = useState("");
  const [activeCell, setActiveCell] = useState<{ frame: number; throwIdx: number } | null>(null);
  const [frames, setFrames] = useState<string[][]>(() =>
    Array.from({ length: 10 }, () => ["", ""]),
  );
  const [isMapSearchOpen, setIsMapSearchOpen] = useState(false);

  const { isLoaded } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string || "",
    libraries,
  });

  const [autocomplete, setAutocomplete] = useState<any>(null);

  const onLoadAutocomplete = useCallback((autoC: any) => {
    setAutocomplete(autoC);
  }, []);

  const onPlaceChanged = () => {
    if (autocomplete !== null) {
      const place = autocomplete.getPlace();
      if (place.name) {
        setLocation(place.name);
      } else if (place.formatted_address) {
        setLocation(place.formatted_address);
      }
    }
  };

  useEffect(() => {
    if (open) {
      if (editGame) {
        setDate(editGame.date);
        setLocation(editGame.location || "");
        setMemo(editGame.memo || "");
        setMatchType(editGame.matchType || "연습");
        setBallUsed(editGame.ballUsed || "");
        const newFrames = Array.from({ length: 10 }, () => ["", "", ""]);
        editGame.frames.forEach((f, i) => {
          newFrames[i][0] = f.throws[0] || "";
          newFrames[i][1] = f.throws[1] || "";
          if (i === 9) {
            newFrames[i][2] = f.throws[2] || "";
          }
        });
        setFrames(newFrames.map((f, i) => i === 9 ? f.slice(0, 3) : f.slice(0, 2)));
      } else {
        reset();
        const lastLocation = localStorage.getItem("lastSearchedBowlingAlley");
        if (lastLocation) {
          setLocation(lastLocation);
        }
      }
    }
  }, [open, editGame]);

  const isAllFilled = useMemo(() => {
    return frames.every((f, i) => {
      if (i < 9) return f[0] === "X" || (f[0] !== "" && f[1] !== "");
      return f[0] === "X" ? f[1] !== "" && f[2] !== "" : (f[1] === "/" ? f[2] !== "" : f[0] !== "" && f[1] !== "");
    });
  }, [frames]);

  const computed = useMemo(() => computeScore(frames), [frames]);
  const maxPossibleScore = useMemo(() => computeMaxPossibleScore(frames), [frames]);

  const focusNextCell = (currentFrame: number, currentThrow: number, currentVal: string) => {
    let nextFrame = currentFrame;
    let nextThrow = currentThrow + 1;

    if (currentFrame < 9 && currentVal === "X" && currentThrow === 0) {
      nextFrame = currentFrame + 1;
      nextThrow = 0;
    } else if (currentFrame < 9 && currentThrow === 1) {
      nextFrame = currentFrame + 1;
      nextThrow = 0;
    } else if (currentFrame === 9 && currentThrow === 2) {
      setActiveCell(null);
      return;
    } else if (
      currentFrame === 9 &&
      currentThrow === 1 &&
      currentVal !== "X" &&
      currentVal !== "/" &&
      frames[9][0] !== "X"
    ) {
      setActiveCell(null);
      return;
    }

    setActiveCell({ frame: nextFrame, throwIdx: nextThrow });
  };

  const setThrow = (frameIdx: number, throwIdx: number, rawValue: string) => {
    let value = rawValue.toUpperCase();
    if (value === "0") value = "-";
    if (value === "X" || value === "10") value = "X";
    else if (value === "/") value = "/";
    else if (value === "-") value = "-";
    else if (!/^[0-9]$/.test(value) && value !== "") return;

    setFrames((prev) => {
      const next = prev.map((f) => [...f]);
      if (frameIdx === 9 && next[9].length < 3) {
        while (next[9].length < 3) next[9].push("");
      }
      if (frameIdx < 9 && throwIdx === 1 && value !== "" && value !== "X") {
        const firstVal = pinValue(next[frameIdx][0]);
        const currentVal = value === "/" ? 10 - firstVal : pinValue(value);
        if (firstVal + currentVal > 10) {
          alert("한 프레임의 합계는 10을 넘을 수 없습니다.");
          return prev;
        }
      }
      if (frameIdx === 9 && throwIdx === 1 && next[9][0] !== "X" && value !== "" && value !== "/") {
        const firstVal = pinValue(next[9][0]);
        if (firstVal + pinValue(value) > 10) {
          alert("한 프레임의 합계는 10을 넘을 수 없습니다.");
          return prev;
        }
      }
      if (throwIdx > 0 && /^[0-9]$/.test(value)) {
        const prevValue = next[frameIdx][throwIdx - 1];
        if (/^[0-9]$/.test(prevValue)) {
          const sum = parseInt(prevValue) + parseInt(value);
          if (sum === 10) value = "/";
        }
      }
      next[frameIdx][throwIdx] = value;
      if (value !== "") {
        setTimeout(() => focusNextCell(frameIdx, throwIdx, value), 10);
      }
      return next;
    });
  };

  const handleKeypadPress = (val: string) => {
    if (!activeCell) return;
    setThrow(activeCell.frame, activeCell.throwIdx, val);
  };

  const handleDeletePress = () => {
    if (!activeCell) return;
    const { frame, throwIdx } = activeCell;
    setFrames((prev) => {
      const next = prev.map((f) => [...f]);
      
      if (frame < 9) {
        if (throwIdx === 1) {
          next[frame][1] = "";
          setActiveCell({ frame, throwIdx: 0 });
        } else if (throwIdx === 0) {
          next[frame][0] = "";
          next[frame][1] = "";
        }
      } else {
        // 10th frame
        if (throwIdx === 2) {
          next[frame][2] = "";
          setActiveCell({ frame, throwIdx: 1 });
        } else if (throwIdx === 1) {
          next[frame][1] = "";
          setActiveCell({ frame, throwIdx: 0 });
        } else if (throwIdx === 0) {
          next[frame][0] = "";
          next[frame][1] = "";
          next[frame][2] = "";
        }
      }
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open || !activeCell) return;
      
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }
      
      const keyUpper = e.key.toUpperCase();
      
      if (e.key === "Backspace") {
        e.preventDefault();
        handleDeletePress();
      } else if (keyUpper === "S") {
        e.preventDefault();
        const { frame, throwIdx } = activeCell;
        const f = frames[frame] || [];
        
        if (frame < 9) {
          if (throwIdx === 0) {
            handleKeypadPress("X");
          } else if (throwIdx === 1) {
            handleKeypadPress("/");
          }
        } else {
          // 10th frame
          if (throwIdx === 0) {
            handleKeypadPress("X");
          } else if (throwIdx === 1) {
            if (f[0] === "X") {
              handleKeypadPress("X");
            } else {
              handleKeypadPress("/");
            }
          } else if (throwIdx === 2) {
            if (f[1] === "X" || f[1] === "/") {
              handleKeypadPress("X");
            } else {
              handleKeypadPress("/");
            }
          }
        }
      } else if (/^[0-9]$/.test(e.key) || keyUpper === "X" || e.key === "/" || e.key === "-") {
        e.preventDefault();
        handleKeypadPress(e.key);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, activeCell, frames]);

  const reset = () => {
    setFrames(Array.from({ length: 10 }, () => ["", ""]));
    setDate(new Date().toISOString().slice(0, 10));
    setLocation("");
    setMemo("");
    setMatchType("연습");
    setBallUsed("");
  };

  const save = () => {
    const newFrames: Frame[] = frames.map((throws, i) => ({
      throws: throws.filter((t) => t !== ""),
      cumulative: computed.cumulative[i] ?? 0,
    }));
    onSave({
      id: editGame?.id,
      date,
      frames: newFrames,
      total: computed.total,
      location,
      memo,
      matchType,
      ballUsed,
    });
    setOpen(false);
    reset();
  };

  const handleDelete = () => {
    if (editGame?.id && onDelete) {
      if (window.confirm("정말로 이 게임 기록을 삭제하시겠습니까?")) {
        onDelete(editGame.id);
        setOpen(false);
        reset();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {controlledOpen === undefined && (
        <DialogTrigger asChild>
          <Button className="bg-teal-600 font-bold shadow-lg hover:bg-teal-700">+ 점수 기록</Button>
        </DialogTrigger>
      )}
      <DialogContent className="w-full h-[100dvh] sm:h-auto sm:max-w-3xl sm:rounded-2xl p-0 border-none shadow-none sm:shadow-2xl flex flex-col outline-none">
        <DialogHeader className="bg-teal-600 px-5 py-3 text-white shrink-0 sm:rounded-t-2xl flex flex-row items-center justify-between space-y-0 pr-12">
          <DialogTitle className="text-base sm:text-xl font-bold">볼링 점수 기록</DialogTitle>
          <div className="flex gap-2">
            {editGame && onDelete && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                className="bg-red-500 hover:bg-red-600 text-white font-black h-8 px-3 text-xs gap-1 shadow-sm active:scale-95 border-none"
              >
                삭제하기
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={save}
              className="bg-white text-teal-600 hover:bg-teal-50 font-black h-8 px-3 text-xs gap-1 shadow-sm active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              저장하기
            </Button>
          </div>
        </DialogHeader>
        <div
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 pb-60 sm:pb-6 min-h-[110dvh]"
          style={{ paddingBottom: "calc(15rem + env(safe-area-inset-bottom))" }}
        >
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-3 sm:gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="rec-date" className="text-[10px] font-bold uppercase text-slate-500">
                날짜
              </Label>
              <Input
                id="rec-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full sm:w-[140px] border-slate-200 text-xs sm:text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-match" className="text-[10px] font-bold uppercase text-slate-500">
                게임 종류
              </Label>
              <select
                id="rec-match"
                value={matchType}
                onChange={(e) => setMatchType(e.target.value)}
                className="flex h-9 w-full sm:w-[100px] rounded-md border border-slate-200 bg-transparent px-3 py-1 text-xs sm:text-sm outline-none"
              >
                <option value="연습">연습</option>
                <option value="상주 리그">상주 리그</option>
                <option value="교류전">교류전</option>
                <option value="정기전">정기전</option>
                <option value="대회">대회</option>
                <option value="이벤트">이벤트</option>
              </select>
            </div>
            <div className="space-y-1.5 col-span-2 sm:flex-[2] min-w-[140px]">
              <Label htmlFor="rec-ball" className="text-[10px] font-bold uppercase text-slate-500">
                사용한 공
              </Label>
              <Input
                id="rec-ball"
                value={ballUsed}
                onChange={(e) => setBallUsed(e.target.value)}
                placeholder="ex. 피직스 파워엘리트"
                className="border-slate-200 text-xs sm:text-sm"
              />
            </div>
          </div>

          {/* Centered Large Current Score Display */}
          <div className="flex flex-col items-center justify-center py-3 bg-gradient-to-r from-teal-50/50 via-teal-50 to-teal-50/50 rounded-2xl border border-teal-100/50 my-1 relative overflow-hidden">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-teal-600/70 mb-1">TOTAL / MAX SCORE</span>
            <div className="flex items-baseline justify-center gap-1.5 sm:gap-2">
              <span className="text-4xl sm:text-5xl font-black tabular-nums text-teal-600 tracking-tight animate-in zoom-in-95 duration-200">
                {computed.total}
              </span>
              <span className="text-4xl sm:text-5xl font-black tabular-nums text-teal-600 tracking-tight">
                / {maxPossibleScore}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-1.5">
            <div className="grid grid-cols-5 gap-1.5">
              {frames.map((f, i) => (
                <div
                  key={i}
                  className={`bg-white rounded-lg border overflow-hidden transition-all ${activeCell?.frame === i ? "border-teal-500 ring-1 ring-teal-500/20 shadow-md" : "border-slate-200"}`}
                >
                  <div
                    className={`py-0.5 text-[9px] font-bold text-center border-b ${activeCell?.frame === i ? "bg-teal-500 text-white border-teal-500" : "bg-slate-50 text-slate-400 border-slate-100"}`}
                  >
                    {i + 1}
                  </div>
                  <div className="p-1 flex flex-col items-center gap-1">
                    <div className="flex justify-center gap-0.5">
                      {[0, 1, 2].map((tIdx) => {
                        if (i < 9 && tIdx === 2) return null;
                        const val = f[tIdx] ?? "";
                        
                        let displayVal = val;
                        let isStrikeOrSpare = val === "X" || val === "/";
                        
                        if (i < 9 && f[0] === "X") {
                          displayVal = tIdx === 0 ? "▶" : "◀";
                          isStrikeOrSpare = true;
                        } else {
                          if (displayVal === "X") displayVal = "▶◀";
                          else if (displayVal === "/") displayVal = "◢";
                        }
                        
                        const isStrikeDisabled = i < 9 && tIdx === 1 && f[0] === "X";
                        const isActive = activeCell?.frame === i && activeCell?.throwIdx === tIdx;
                        return (
                          <div
                            key={tIdx}
                            onClick={() => {
                              if (i < 9 && tIdx === 1 && f[0] === "X") return;
                              setActiveCell({ frame: i, throwIdx: tIdx });
                            }}
                            className={`h-7 w-6 rounded border flex items-center justify-center font-black text-[10px] transition-all cursor-pointer ${
                              isActive
                                ? "ring-2 ring-teal-500 border-teal-500 bg-white"
                                : isStrikeDisabled
                                  ? "bg-amber-50/10 border-slate-100 opacity-60 cursor-not-allowed"
                                  : "border-slate-100 bg-white"
                            } ${isStrikeOrSpare ? "text-amber-600" : "text-slate-700"}`}
                          >
                            {displayVal}
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-[10px] font-black text-teal-600 h-3 leading-none">
                      {computed.cumulative[i] || ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          


          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-2">
            <div className="space-y-1.5 flex-1 flex flex-col">
              <Label
                htmlFor="rec-location"
                className="text-[10px] font-bold uppercase text-slate-500 mb-1.5"
              >
                볼링장
              </Label>
              <div className="flex gap-2">
                {isLoaded ? (
                  <div className="flex-1 w-full">
                    <Autocomplete
                      onLoad={onLoadAutocomplete}
                      onPlaceChanged={onPlaceChanged}
                    >
                      <Input
                        id="rec-location"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="볼링장 이름"
                        className="border-slate-200 text-xs sm:text-sm w-full h-9"
                      />
                    </Autocomplete>
                  </div>
                ) : (
                  <Input
                    id="rec-location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="로딩 중..."
                    className="border-slate-200 text-xs sm:text-sm w-full h-9"
                  />
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0 border-teal-200 text-teal-600 hover:bg-teal-50"
                  onClick={() => setIsMapSearchOpen(true)}
                  title="지도에서 볼링장 찾기"
                >
                  <MapPin className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="rec-memo" className="text-[10px] font-bold uppercase text-slate-500">
                메모
              </Label>
              <Input
                id="rec-memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="메모"
                className="border-slate-200 text-xs sm:text-sm"
              />
            </div>
          </div>

          {/* 점수 입력 자판 */}
          <div className="space-y-2 pt-4 border-t mt-4 max-w-md mx-auto w-full">
            {/* 숫자 키 1-9 (3열) */}
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((btn) => (
                <Button
                  key={btn}
                  type="button"
                  variant="outline"
                  className="h-12 font-black text-lg bg-white text-slate-700 border-slate-200 active:scale-95"
                  onClick={() => handleKeypadPress(btn)}
                >
                  {btn}
                </Button>
              ))}
            </div>
            {/* 특수 키 + 지우기 (4열) */}
            <div className="grid grid-cols-4 gap-2">
              {["-", "X", "/"].map((btn) => {
                let isDisabled = false;
                if (activeCell) {
                  const { frame, throwIdx } = activeCell;
                  const f = frames[frame] || [];
                  const firstThrow = f[0] || "";
                  const secondThrow = f[1] || "";
                  if (btn === "X") {
                    if (frame < 9) isDisabled = throwIdx !== 0;
                    else if (throwIdx === 1) isDisabled = firstThrow !== "X";
                    else if (throwIdx === 2)
                      isDisabled = secondThrow !== "X" && secondThrow !== "/";
                  } else if (btn === "/") {
                    if (throwIdx === 0) isDisabled = true;
                    else if (frame === 9 && throwIdx === 1) isDisabled = firstThrow === "X";
                    else if (frame === 9 && throwIdx === 2)
                      isDisabled = secondThrow === "X" || secondThrow === "/";
                    else if (firstThrow === "X" || firstThrow === "" || firstThrow === "-")
                      isDisabled = true;
                  }
                }
                return (
                  <Button
                    key={btn}
                    type="button"
                    disabled={isDisabled}
                    variant={btn === "X" || btn === "/" ? "default" : "outline"}
                    className={`h-12 font-black text-xl active:scale-95 ${
                      btn === "X"
                        ? "bg-amber-500 text-white border-amber-600"
                        : btn === "/"
                          ? "bg-amber-400 text-white border-amber-500"
                          : "bg-white text-slate-700 border-slate-200"
                    } ${isDisabled ? "opacity-30 grayscale" : ""}`}
                    onClick={() => handleKeypadPress(btn)}
                  >
                    {btn === "X" ? "▶◀" : btn === "/" ? "◢" : btn}
                  </Button>
                );
              })}
              <Button
                type="button"
                variant="secondary"
                className="h-12 bg-slate-100 text-slate-500 border border-slate-200 active:scale-95 flex items-center justify-center"
                onClick={handleDeletePress}
              >
                <Delete className="h-5 w-5" />
              </Button>
            </div>

            {/* 모바일 전용 대형 저장 버튼 (UX 핵심) */}
            <Button
              type="button"
              className="w-full h-14 bg-teal-600 hover:bg-teal-700 text-white font-black text-lg shadow-xl shadow-teal-600/20 active:scale-[0.98] transition-all gap-2 mt-2"
              onClick={save}
            >
              <Check className="w-6 h-6" />
              점수 저장하기
            </Button>
          </div>
        </div>

        <DialogFooter className="bg-slate-50/90 backdrop-blur-md px-6 py-4 flex gap-2 sm:justify-end border-t border-slate-100 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {editGame && onDelete && (
            <Button
              variant="outline"
              onClick={handleDelete}
              className="font-bold border-red-200 text-red-500 hover:bg-red-50 flex-1 sm:flex-none"
            >
              삭제하기
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={reset}
            className="font-bold text-slate-400 flex-1 sm:flex-none"
          >
            초기화
          </Button>
          <Button
            className="bg-teal-600 font-bold px-8 shadow-lg hover:bg-teal-700 shadow-teal-600/20 flex-1 sm:flex-none"
            onClick={save}
          >
            저장하기
          </Button>
        </DialogFooter>
      </DialogContent>
      <MapSearchDialog
        open={isMapSearchOpen}
        onOpenChange={setIsMapSearchOpen}
        onSelectBowlingAlley={(name) => {
          setLocation(name);
        }}
      />
    </Dialog>
  );
}

// 4. 메인 페이지 컴포넌트
function ScoresPage() {
  const navigate = useNavigate();
  const { viewUid } = Route.useSearch();
  const isViewMode = useMemo(() => {
    return typeof viewUid === "string" && viewUid !== "" && viewUid !== "undefined" && viewUid !== "null";
  }, [viewUid]);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    return d.toISOString().slice(0, 10);
  });
  const [filterMatchType, setFilterMatchType] = useState("전체");
  const [games, setGames] = useState<Score[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeRequest, setActiveRequest] = useState<ClubApprovalRequest | null>(null);
  const [isClubDialogOpen, setIsClubDialogOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<Score | null>(null);
  const [isInitialMapSearchOpen, setIsInitialMapSearchOpen] = useState(false);

  useEffect(() => {
    const todayStr = new Date().toDateString();
    const lastDate = localStorage.getItem("lastMapSearchDate");
    if (lastDate !== todayStr) {
      setIsInitialMapSearchOpen(true);
      localStorage.setItem("lastMapSearchDate", todayStr);
    }
  }, []);

  const handleUpdateScore = async (data: Omit<Score, "userId" | "stats" | "createdAt"> & { id?: string }) => {
    if (!userId || !data.id) return;
    try {
      await updateSavedScore(data.id, userId, data);
      setGames((prev) =>
        sortScoresDesc(prev.map((g) => (g.id === data.id ? { ...g, ...data } : g)))
      );
      toast.success("점수 기록이 수정되었습니다.");
    } catch (error: any) {
      console.error("점수 수정 실패:", error);
      toast.error("점수 수정에 실패했습니다: " + error.message);
    }
  };

  const handleDeleteScore = async (scoreId: string) => {
    if (!userId) return;
    try {
      await deleteSavedScore(scoreId, userId);
      setGames((prev) => prev.filter((g) => g.id !== scoreId));
      toast.success("점수 기록이 삭제되었습니다.");
    } catch (error: any) {
      console.error("점수 삭제 실패:", error);
      toast.error("점수 삭제에 실패했습니다: " + error.message);
    }
  };

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
        
        if (unsubscribeProfile) {
          unsubscribeProfile();
        }

        unsubscribeProfile = subscribeUserProfile(user.uid, async (profile) => {
          try {
            setUserProfile(profile);

            if (profile) {
              // 등급 변경 감지 및 알림
              const lastRole = localStorage.getItem("last-known-role");
              const roleLabels: Record<string, string> = {
                super_admin: "슈퍼 관리자",
                master: "클럽장",
                staff: "운영진",
                member: "클럽원",
              };
              if (lastRole && lastRole !== profile.role) {
                const oldLabel = roleLabels[lastRole] || lastRole;
                const newLabel = roleLabels[profile.role] || profile.role;
                toast.success(`🎉 등급이 [${oldLabel}]에서 [${newLabel}](으)로 변경되었습니다!`, {
                  duration: 5000,
                });
              }
              localStorage.setItem("last-known-role", profile.role);
              
              // 1. 프로필부터 즉시 targetProfile에 설정 (비동기 병목/오류 방지)
              const isAdmin = profile.role === "super_admin" || profile.role === "master";
              const targetUid = (isAdmin && isViewMode) ? viewUid : user.uid;

              if (targetUid !== user.uid) {
                try {
                  const target = await getUserProfile(targetUid);
                  setTargetProfile(target || profile);
                } catch (err) {
                  console.error("대상 프로필 로딩 실패:", err);
                  setTargetProfile(profile);
                }
              } else {
                setTargetProfile(profile);
              }

              // 2. 승인 대기 상태 조회 (독립적인 try-catch로 예외 격리)
              let hasActiveReq = false;
              try {
                const req = await getUserActiveApprovalRequest(user.uid);
                setActiveRequest(req);
                hasActiveReq = !!req;
              } catch (err) {
                console.error("승인 대기 상태 조회 실패:", err);
              }

              // 클럽이 없고 대기 중인 가입 신청도 없는 경우 첫 가입 설정 페이지(/profile-setup)로 강제 이동
              if (!profile.clubId && !hasActiveReq) {
                navigate({ to: "/profile-setup", replace: true });
                return;
              }

              // 3. 점수 조회 (독립적인 try-catch로 예외 격리)
              try {
                const userScores = await getUserScores(targetUid);
                setGames(userScores);
              } catch (err) {
                console.error("점수 조회 실패:", err);
              }
            } else {
              // Firestore에 문서가 존재하지 않는 경우 (예: 로그인 직후/회원가입 중)
              // Auth의 displayName과 email을 Fallback으로 사용
              const fallbackProfile: UserProfile = {
                uid: user.uid,
                email: user.email || "",
                nickname: user.displayName || user.email?.split("@")[0] || "회원",
                provider: user.providerData?.[0]?.providerId || "email",
                role: "member",
                average: 0,
                highScore: 0,
                createdAt: null,
                lastLoginAt: null,
              };
              setUserProfile(fallbackProfile);
              setTargetProfile(fallbackProfile);
            }
          } catch (error) {
            console.error("데이터 로딩 실패:", error);
          } finally {
            setLoading(false);
          }
        });
      } else {
        setUserId(null);
        setLoading(false);
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = undefined;
        }
        navigate({ to: "/", replace: true });
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, [navigate, viewUid, isViewMode]);


  const handleRefreshProfile = async () => {
    if (userId) {
      try {
        const profile = await getUserProfile(userId);
        setUserProfile(profile);
        if (!isViewMode) {
          setTargetProfile(profile);
        }
      } catch (err) {
        console.error("handleRefreshProfile profile error:", err);
      }
      try {
        const req = await getUserActiveApprovalRequest(userId);
        setActiveRequest(req);
      } catch (err) {
        console.error("handleRefreshProfile approvals error:", err);
      }
    }
  };

  const RoleBadge = ({ role }: { role: UserRole }) => {
    const config: Record<UserRole, { label: string; color: string; icon: any }> = {
      super_admin: {
        label: "슈퍼 관리자",
        color: "bg-purple-100 text-purple-700 border-purple-200",
        icon: Diamond,
      },
      master: {
        label: "클럽장",
        color: "bg-amber-100 text-amber-700 border-amber-200",
        icon: Crown,
      },
      staff: {
        label: "운영진",
        color: "bg-blue-100 text-blue-700 border-blue-200",
        icon: ShieldCheck,
      },
      member: {
        label: "클럽원",
        color: "bg-emerald-100 text-emerald-700 border-emerald-200",
        icon: User,
      },
    };

    const { label, color, icon: Icon } = config[role] || config.member;

    return (
      <div
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold shadow-sm ${color}`}
      >
        <Icon className="w-3 h-3" />
        {label}
      </div>
    );
  };

  const filtered = useMemo(
    () => games.filter((g) => g.date >= from && g.date <= to && (filterMatchType === "전체" || g.matchType === filterMatchType)),
    [games, from, to, filterMatchType],
  );
  const periodAvg = useMemo(
    () =>
      filtered.length === 0
        ? 0
        : Math.round(filtered.reduce((sum, g) => sum + g.total, 0) / filtered.length),
    [filtered],
  );
  const periodHigh = useMemo(
    () => (filtered.length === 0 ? 0 : Math.max(...filtered.map((g) => g.total))),
    [filtered],
  );
  const periodLow = useMemo(
    () => (filtered.length === 0 ? 0 : Math.min(...filtered.map((g) => g.total))),
    [filtered],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, Score[]>();
    for (const g of filtered) {
      if (!map.has(g.date)) map.set(g.date, []);
      map.get(g.date)!.push(g);
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [filtered]);

  const handleSaveScore = async (data: Omit<Score, "userId" | "stats" | "id" | "createdAt">) => {
    if (!userId) return;
    try {
      const newId = await saveScore(userId, data);
      const newScore: Score = {
        ...data,
        userId,
        id: newId,
        stats: { strikeCount: 0, spareCount: 0, openCount: 0 },
        createdAt: { seconds: Math.floor(Date.now() / 1000) }
      };
      setGames((prev) => sortScoresDesc([...prev, newScore]));
    } catch (error) {
      console.error("점수 저장 실패:", error);
      alert("점수 저장에 실패했습니다. (보안 규칙 또는 네트워크 오류)\n" + (error as any).message);
    }

  };

  const SidebarMenu = () => {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-slate-500 hover:text-teal-600 transition-colors"
          >
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-[280px] sm:w-[350px] p-0 flex flex-col border-r-0 shadow-2xl"
        >
          <SheetHeader className="p-6 bg-gradient-to-br from-teal-600 to-teal-700 text-white text-left">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-2xl shadow-inner">
                🎳
              </div>
              <SheetTitle className="text-xl font-black text-white">Exciting Bowling</SheetTitle>
            </div>
            {userProfile && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">{userProfile.nickname || userProfile.email?.split("@")[0] || "회원"}</span>
                  <RoleBadge role={userProfile.role} />
                </div>
                <p className="text-xs text-teal-100 opacity-80">{userProfile.email}</p>
              </div>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
            <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              메인 메뉴
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-12 font-semibold text-slate-600 hover:bg-teal-50 hover:text-teal-700"
              onClick={() => navigate({ to: "/scores" })}
            >
              <LayoutDashboard className="h-5 w-5" />
              점수 기록부
            </Button>

            {(userProfile?.role === "super_admin" || userProfile?.role === "master") && (
              <>
                <div className="px-3 py-2 mt-4 text-[10px] font-bold text-amber-500 uppercase tracking-widest">
                  관리자 메뉴
                </div>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 h-12 font-semibold text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                  onClick={() => navigate({ to: "/admin/users" })}
                >
                  <Users className="h-5 w-5" />
                  사용자 관리
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 h-12 font-semibold text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                  onClick={() => navigate({ to: "/admin/clubs" })}
                >
                  <Settings className="h-5 w-5" />
                  클럽명 관리
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 h-12 font-semibold text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                  onClick={() => navigate({ to: "/admin/approvals" })}
                >
                  <Check className="h-5 w-5" />
                  승인 관리
                </Button>
              </>
            )}
          </div>

          <div className="p-4 border-t bg-slate-50">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-12 font-bold text-red-500 hover:bg-red-50 hover:text-red-600"
              onClick={() => auth.signOut()}
            >
              <LogOut className="h-5 w-5" />
              로그아웃
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  };

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center font-bold text-teal-700">
        Loading...
      </div>
    );

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-4 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-4 sm:space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* 사이드바 메뉴 트리거 - 슈퍼관리자/클럽장 전용 */}
            {(userProfile?.role === "super_admin" || userProfile?.role === "master") && (
              <SidebarMenu />
            )}

            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-teal-600 flex items-center justify-center text-white text-xl sm:text-2xl shadow-lg shadow-teal-600/20">
              🎳
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h1 className="text-lg sm:text-2xl font-black tracking-tight text-slate-900 truncate">
                  {targetProfile?.nickname || targetProfile?.email?.split("@")[0] || "회원"}
                </h1>
                {targetProfile && <RoleBadge role={targetProfile.role} />}
                {isViewMode && (
                  <span className="bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-200">
                    조회 모드
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg sm:text-2xl font-black tracking-tight text-slate-700 truncate">
                  {activeRequest && !targetProfile?.clubId ? activeRequest.toClubName : (targetProfile?.clubName || "클럽 미지정")}
                </p>
                {targetProfile?.uid === userProfile?.uid && !isViewMode && (
                  <div className="ml-1 flex items-center gap-2">
                    {activeRequest ? (
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded shadow-sm flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        {activeRequest.type === "JOIN" ? "가입 승인 대기 중" : "탈퇴 승인 대기 중"}
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsClubDialogOpen(true)}
                        className="h-6 text-[10px] font-bold border-teal-200 text-teal-600 hover:bg-teal-50 px-2"
                      >
                        {targetProfile?.clubId ? "클럽 변경" : "클럽 가입"}
                      </Button>
                    )}
                  </div>
                )}
                {targetProfile?.email && (
                  <p className="text-[10px] sm:text-xs text-slate-400 font-medium truncate w-full sm:w-auto sm:ml-2">
                    ({targetProfile.email})
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {isViewMode ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate({ to: "/scores", search: {} })}
                className="bg-white border-teal-200 text-teal-600 font-bold hover:bg-teal-50"
              >
                내 기록 보기
              </Button>
            ) : (
              <RecordGameDialog onSave={handleSaveScore} />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => auth.signOut()}
              className="text-[11px] h-8 sm:h-10 border-slate-200 text-slate-500 hover:text-red-500 hover:border-red-100 hover:bg-red-50 transition-all"
            >
              로그아웃
            </Button>
          </div>
        </header>

        <Card className="border-none bg-white p-3 shadow-sm sm:p-5">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3 sm:flex-wrap">
              <div className="space-y-1">
                <Label htmlFor="from" className="text-[10px] font-bold uppercase text-slate-500">
                  시작일
                </Label>
                <Input
                  id="from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full sm:w-[140px] border-slate-200 text-xs sm:text-sm h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="to" className="text-[10px] font-bold uppercase text-slate-500">
                  종료일
                </Label>
                <Input
                  id="to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full sm:w-[140px] border-slate-200 text-xs sm:text-sm h-9"
                />
              </div>
              <div className="space-y-1 col-span-2 sm:col-span-1">
                <Label htmlFor="filter-match" className="text-[10px] font-bold uppercase text-slate-500">
                  게임 종류
                </Label>
                <select
                  id="filter-match"
                  value={filterMatchType}
                  onChange={(e) => setFilterMatchType(e.target.value)}
                  className="flex h-9 w-full sm:w-[180px] rounded-md border border-slate-200 bg-transparent px-3 py-1 text-xs sm:text-sm outline-none"
                >
                  <option value="전체">전체 (모든 게임)</option>
                  <option value="연습">연습</option>
                  <option value="상주 리그">상주 리그</option>
                  <option value="교류전">교류전</option>
                  <option value="정기전">정기전</option>
                  <option value="대회">대회</option>
                  <option value="이벤트">이벤트</option>
                </select>
              </div>
            </div>
            <div className="sm:ml-auto flex items-center justify-around sm:justify-start gap-4 sm:gap-6 rounded-xl bg-teal-50 border border-teal-100 px-4 sm:px-5 py-2">
              <div className="text-center">
                <div className="text-[9px] font-bold text-teal-600/70 uppercase">Games</div>
                <div className="text-base sm:text-xl font-black text-teal-900">
                  {filtered.length}
                </div>
              </div>
              <div className="h-8 w-px bg-teal-200/50" />
              <div className="text-center">
                <div className="text-[9px] font-bold text-teal-600/70 uppercase">Average</div>
                <div className="text-base sm:text-xl font-black text-teal-700">{periodAvg}</div>
              </div>
              <div className="h-8 w-px bg-teal-200/50" />
              <div className="text-center">
                <div className="text-[9px] font-bold text-amber-600/70 uppercase flex items-center justify-center gap-0.5">
                  <ArrowUp className="w-2 h-2" /> High
                </div>
                <div className="text-base sm:text-xl font-black text-amber-700">{periodHigh}</div>
              </div>
              <div className="h-8 w-px bg-teal-200/50" />
              <div className="text-center">
                <div className="text-[9px] font-bold text-slate-500/70 uppercase flex items-center justify-center gap-0.5">
                  <ArrowDown className="w-2 h-2" /> Low
                </div>
                <div className="text-base sm:text-xl font-black text-slate-600">{periodLow}</div>
              </div>
            </div>
          </div>
        </Card>
        <div className="space-y-5 sm:space-y-6">
          {byDate.length === 0 && (
            <Card className="border-dashed border-2 p-12 text-center text-muted-foreground bg-white/50">
              기록이 없습니다.
            </Card>
          )}
          {byDate.map(([date, games]) => {
            const dayAvg = Math.round(games.reduce((s, g) => s + g.total, 0) / games.length);
            return (
              <section key={date} className="space-y-2.5">
                <div className="flex items-center gap-3 px-1">
                  <h2 className="text-sm font-bold text-slate-800">{date}</h2>
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-[11px] sm:text-xs font-medium text-slate-500">
                    평균 <span className="font-bold text-teal-600">{dayAvg}</span>
                  </span>
                </div>
                <div className="space-y-2.5">
                  {games.map((g, i) => (
                    <ScoreSheet 
                      key={g.id || i} 
                      gameNo={games.length - i} 
                      game={g} 
                      onClick={
                        !isViewMode && targetProfile?.uid === userProfile?.uid
                          ? () => setEditingGame(g)
                          : undefined
                      }
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* PWA 설치 안내 */}
        <div className="mt-10 pb-10 flex justify-center">
          <PWAInstallSection />
        </div>

        {/* 점수 수정 다이얼로그 */}
        <RecordGameDialog
          open={!!editingGame}
          onOpenChange={(open) => {
            if (!open) setEditingGame(null);
          }}
          editGame={editingGame}
          onSave={handleUpdateScore}
          onDelete={handleDeleteScore}
        />

        {/* 클럽 선택 다이얼로그 */}
        <ClubSelectionDialog 
          userProfile={userProfile} 
          onUpdate={handleRefreshProfile} 
          open={isClubDialogOpen}
          onOpenChange={setIsClubDialogOpen}
        />

        {/* 메인 화면 진입 시 뜨는 볼링장 검색 다이얼로그 */}
        <MapSearchDialog
          open={isInitialMapSearchOpen}
          onOpenChange={setIsInitialMapSearchOpen}
          onSelectBowlingAlley={(name) => {
            // No direct action needed here other than saving to localStorage (which MapSearchDialog does internally)
            toast.success(`'${name}'이(가) 기본 볼링장으로 설정되었습니다.`);
          }}
        />
      </div>
    </main>
  );
}

function PWAInstallSection() {
  const [showInstall, setShowInstall] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isSafari, setIsSafari] = useState(false);

  useEffect(() => {
    // 이미 설치된 경우 체크
    if (typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches) {
      return;
    }

    // 환경 체크
    const ua = typeof window !== "undefined" ? window.navigator.userAgent.toLowerCase() : "";
    const ios = /iphone|ipad|ipod/.test(ua);
    const safari =
      ua.includes("safari") &&
      !ua.includes("chrome") &&
      !ua.includes("crios") &&
      !ua.includes("kakaotalk");

    setIsIOS(ios);
    setIsSafari(safari);

    // 설치 가능한 경우 버튼 노출 (Android/Chrome)
    if (typeof window !== "undefined" && (window as any).deferredPrompt) {
      setShowInstall(true);
    }

    const handleInstallAvailable = () => setShowInstall(true);
    window.addEventListener("pwa-install-available", handleInstallAvailable);
    return () => window.removeEventListener("pwa-install-available", handleInstallAvailable);
  }, []);

  const handleInstallClick = async () => {
    const promptEvent = (window as any).deferredPrompt;
    if (!promptEvent) return;

    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    (window as any).deferredPrompt = null;
    setShowInstall(false);
  };

  if (isIOS) {
    return (
      <Card className="w-full max-w-md p-5 bg-gradient-to-br from-teal-50 to-white border-teal-100 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-start gap-4 text-left">
          <div className="bg-teal-600 p-2 rounded-xl text-white shadow-md shadow-teal-600/20 mt-1">
            <Plus className="w-5 h-5" />
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-black text-teal-900 leading-none">
              앱처럼 설치해서 더 빠르게!
            </h4>
            {isSafari ? (
              <p className="text-[11px] text-teal-700 leading-relaxed font-medium">
                하단의{" "}
                <span className="inline-block px-1.5 py-0.5 bg-white rounded border border-teal-200 align-middle">
                  <LogOut className="w-3 h-3 rotate-180 inline -mt-0.5" /> 공유
                </span>{" "}
                버튼을 누르고 <br />
                <strong className="text-teal-900">[홈 화면에 추가]</strong>를 누르면 설치돼요!
              </p>
            ) : (
              <p className="text-[11px] text-amber-700 leading-relaxed font-semibold">
                아이폰은{" "}
                <span className="underline decoration-amber-300">사파리(Safari) 브라우저</span>
                에서만 <br />
                설치가 가능합니다. 사파리로 다시 접속해 주세요!
              </p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  if (showInstall) {
    return (
      <Card className="w-full max-w-md p-5 bg-teal-600 text-white border-none shadow-xl shadow-teal-600/20 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between gap-4 text-left">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
              <Plus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="text-sm font-bold tracking-tight">홈 화면에 앱 추가</h4>
              <p className="text-[11px] text-teal-50 opacity-80">
                주소창 없이 앱처럼 깔끔하게 기록하세요!
              </p>
            </div>
          </div>
          <Button
            onClick={handleInstallClick}
            size="sm"
            className="bg-white text-teal-600 hover:bg-teal-50 font-black whitespace-nowrap shadow-lg shadow-black/10"
          >
            앱 설치
          </Button>
        </div>
      </Card>
    );
  }

  return null;
}

function ClubSelectionDialog({
  userProfile,
  onUpdate,
  open,
  onOpenChange
}: {
  userProfile: UserProfile | null;
  onUpdate: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClubId, setSelectedClubId] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      getClubs().then(setClubs);
      setSelectedClubId(""); // 다이얼로그 열릴 때 초기화
    }
  }, [open]);

  const handleSave = async () => {
    if (!selectedClubId || !userProfile) return;
    setIsLoading(true);
    try {
      const club = clubs.find((c) => c.id === selectedClubId);
      if (club) {
        if (club.id === userProfile.clubId) {
          toast.error("현재 소속된 클럽과 동일합니다.");
          setIsLoading(false);
          return;
        }

        const type = userProfile.clubId ? "CHANGE" : "JOIN";
        await createClubApprovalRequest(
          userProfile.uid,
          userProfile.nickname,
          type,
          club.id,
          club.name,
          userProfile.clubId,
          userProfile.clubName
        );
        
        toast.success("승인 요청이 완료되었습니다.");
        onUpdate();
        onOpenChange(false);
      }
    } catch (error: any) {
      console.error("Club approval request failed", error);
      if (error.message === "ALREADY_HAS_ACTIVE_REQUEST") {
        toast.error("이미 진행 중인 승인 요청이 있습니다.");
      } else {
        toast.error(`요청 처리에 실패했습니다: ${error.message || error}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-xl font-black text-center">소속 클럽 선택</DialogTitle>
        </DialogHeader>
        <div className="py-6 space-y-4">
          <p className="text-sm text-slate-500 text-center leading-relaxed">
            클럽에 가입하거나 변경하려면 <br />
            <strong>원하시는 클럽</strong>을 선택해 주세요.
          </p>
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-400 uppercase">클럽 리스트</Label>
            <select
              className="w-full h-12 rounded-xl border border-slate-200 bg-white px-4 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/20 transition-all appearance-none"
              value={selectedClubId}
              onChange={(e) => setSelectedClubId(e.target.value)}
            >
              <option value="">클럽을 선택하세요</option>
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            className="w-full h-12 bg-teal-600 hover:bg-teal-700 text-white font-black text-lg rounded-xl shadow-lg shadow-teal-600/20"
            disabled={!selectedClubId || isLoading}
            onClick={handleSave}
          >
            {isLoading ? "처리 중..." : "선택 완료"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ScoresPage;
