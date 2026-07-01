import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  Score,
  saveScore,
  getUserScores,
  HoleScore,
  getUserProfile,
  UserProfile,
  deleteSavedScore,
  saveGolfCourseToDb,
  updateUserProfile,
  updateSavedScore,
} from "@/lib/db";
import { getCourseDetails } from "@/lib/golfApi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, Plus, MapPin, Check, Menu } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ScoresSearch = {
  viewUid?: string;
  courseId?: string;
  courseName?: string;
};

export const Route = createFileRoute("/scores")({
  validateSearch: (search: Record<string, unknown>): ScoresSearch => {
    return {
      viewUid: search.viewUid as string | undefined,
      courseId: search.courseId as string | undefined,
      courseName: search.courseName as string | undefined,
    };
  },
  component: ScoresPage,
});

function RecordRoundDialog({
  open,
  onOpenChange,
  courseInfo,
  onSave,
  onDelete,
  defaultHandicap = 0,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseInfo?: any;
  onSave: (score: any) => void;
  onDelete?: (scoreId: string) => void;
  defaultHandicap?: number;
  initialData?: Score | null;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState(courseInfo?.name || "");
  const [courseSection, setCourseSection] = useState("");
  const [memo, setMemo] = useState("");
  const [holes, setHoles] = useState<HoleScore[]>([]);
  const [handicapInput, setHandicapInput] = useState<number | "">(0);
  const [handicapType, setHandicapType] = useState<"none" | "total" | "hole" | "both">("none");
  const [isNewCourse, setIsNewCourse] = useState(false);
  const [tempHoleCount, setTempHoleCount] = useState<number>(18);
  const [setupStep, setSetupStep] = useState<'choose_holes' | 'scorecard'>('scorecard');
  const [fontSizePreset, setFontSizePreset] = useState<'normal' | 'medium' | 'large'>('normal');

  useEffect(() => {
    if (open) {
      if (initialData) {
        setIsNewCourse(false);
        setHandicapInput(initialData.handicap ?? defaultHandicap);
        setHandicapType(initialData.handicapType ?? "none");
        
        // Parse "Location (Section)" format
        let loc = initialData.location || "";
        let sec = "";
        const match = loc.match(/(.+?)\s*\((.+)\)$/);
        if (match) {
          loc = match[1].trim();
          sec = match[2].trim();
        }
        setLocation(loc);
        setCourseSection(sec);
        
        setDate(initialData.date);
        setMemo(initialData.memo || "");
        
        // Convert gross score to relative score relative to par
        setHoles(initialData.holes.map(h => {
          const parVal = Number(h.par) || 0;
          const grossScore = Number(h.score) || 0;
          const relativeScore = grossScore > 0 && parVal > 0 ? (grossScore - parVal) : "";
          return { ...h, score: relativeScore, strategy: h.strategy || "" };
        }) || []);
        setSetupStep('scorecard');
        return;
      }

      const hasHoles = courseInfo?.holes && courseInfo.holes.length > 0;
      setIsNewCourse(!hasHoles);
      setHandicapInput(defaultHandicap);
      setHandicapType("none");
      setCourseSection(""); // Reset course section for new entry
      setLocation(courseInfo?.name || "");
      setDate(new Date().toISOString().slice(0, 10));

      if (hasHoles) {
        setHoles(courseInfo.holes.map((h: any) => ({ ...h, par: h.par || 4, score: "", strategy: "" })));
        setSetupStep('scorecard');
      } else {
        setSetupStep('choose_holes'); // New course: ask how many holes first
        const isNineHoles = courseInfo?.name?.includes("태광") || courseInfo?.name?.includes("9홀");
        const defaultLength = isNineHoles ? 9 : 18;
        setTempHoleCount(defaultLength);
        
        setHoles(Array.from({ length: defaultLength }, (_, i) => ({
          hole: i + 1,
          par: 4,
          distance: 300,
          score: "",
          putts: 2,
          handicap: 0
        })));
      }
    }
  }, [open, courseInfo, defaultHandicap, initialData]);

  // Actual Gross Total Score: Sum of (Par + Relative Score)
  const totalScore = useMemo(() => {
    return holes.reduce((acc, h) => {
      const parVal = Number(h.par) || 0;
      const scoreVal = h.score === "" ? 0 : Number(h.score);
      if (h.score === "") return acc;
      return acc + (parVal + scoreVal);
    }, 0);
  }, [holes]);

  const totalPar = useMemo(() => holes.reduce((acc, h) => acc + (Number(h.par) || 0), 0), [holes]);
  const showHcpColumn = handicapType === 'hole' || handicapType === 'both';

  const handleHoleCountChange = (count: number) => {
    setTempHoleCount(count);
    setHoles(Array.from({ length: count }, (_, i) => ({
      hole: i + 1,
      par: 4,
      score: "",
      strategy: "",
      handicap: 0
    })));
  };

  const updateHole = (idx: number, field: keyof HoleScore, value: number | string) => {
    const newHoles = [...holes];
    if (field === "score") {
      if (value === "") {
        newHoles[idx] = { ...newHoles[idx], score: "" };
      } else {
        const parVal = Number(newHoles[idx].par) || 4; // Default to 4 if not set yet
        const relativeVal = Number(value);
        
        // Double par limit: actual score must not exceed 2 * par.
        // Also client requested no number over 10 (absolute input limit is 10).
        // Minimum score: Must be at least 1 (Hole-in-one limit).
        // e.g. Par 4 -> actual score >= 1 -> relativeVal >= -3 (Par - 1).
        const minRelative = 1 - parVal;
        const maxRelative = Math.min(parVal, 10);
        
        const boundedVal = Math.max(minRelative, Math.min(maxRelative, relativeVal));
        newHoles[idx] = { ...newHoles[idx], score: boundedVal };
      }
    } else if (field === "par") {
      if (value === "") {
        newHoles[idx] = { ...newHoles[idx], par: "" };
      } else {
        const parNum = Number(value);
        // Constraint: Par must not exceed 10
        const boundedPar = Math.min(10, parNum);
        newHoles[idx] = { ...newHoles[idx], par: boundedPar };
      }

      // If par changed, validate current score boundaries
      const scoreVal = newHoles[idx].score;
      if (scoreVal !== "") {
        const parVal = Number(newHoles[idx].par) || 4;
        const minRelative = 1 - parVal;
        const maxRelative = Math.min(parVal, 10);
        const boundedVal = Math.max(minRelative, Math.min(maxRelative, Number(scoreVal)));
        newHoles[idx].score = boundedVal;
      }
    } else {
      newHoles[idx] = { ...newHoles[idx], [field]: value };
    }
    setHoles(newHoles);
  };

  const save = async () => {
    try {
      const finalCourseId = courseInfo?.id || encodeURIComponent(location);
      const finalName = courseSection ? `${location} (${courseSection})` : location;
      const hcpInputVal = (handicapType === "total" || handicapType === "both") ? (handicapInput === "" ? 0 : Number(handicapInput)) : 0;
      
      // Calculate final actual scores to save in database (convert relative score back to gross score)
      const holesToSave = holes.map(h => {
        const parVal = Number(h.par) || 0;
        const scoreVal = h.score === "" ? "" : (parVal + Number(h.score));
        return {
          ...h,
          score: scoreVal as number | "",
          handicap: h.handicap || 0
        };
      });

      const actualGrossTotal = holesToSave.reduce((acc, h) => acc + (Number(h.score) || 0), 0);

      let finalNetScore = actualGrossTotal;
      if (handicapType === "total") {
        finalNetScore = actualGrossTotal - hcpInputVal;
      } else if (handicapType === "hole") {
        finalNetScore = holesToSave.reduce((acc, h) => acc + ((Number(h.score) || 0) - (h.handicap || 0)), 0);
      } else if (handicapType === "both") {
        finalNetScore = holesToSave.reduce((acc, h) => acc + ((Number(h.score) || 0) - (h.handicap || 0)), 0) - hcpInputVal;
      }

      if (isNewCourse) {
        const newCourseData = {
          id: finalCourseId,
          name: finalName,
          holeCount: tempHoleCount,
          totalPar: holes.reduce((acc, h) => acc + (Number(h.par) || 0), 0),
          holes: holes.map(h => ({
            hole: h.hole,
            par: h.par,
            handicap: h.handicap || 0
          }))
        };
        await saveGolfCourseToDb(newCourseData);
      }

      onSave({
        id: initialData?.id,
        date,
        location: finalName,
        memo,
        holes: holesToSave,
        total: actualGrossTotal,
        courseId: finalCourseId,
        handicap: hcpInputVal,
        netScore: finalNetScore,
        handicapType,
      });
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save course or score", err);
      alert("골프장 정보 또는 점수 저장에 실패했습니다.");
    }
  };

  const dialogNetScore = useMemo(() => {
    if (handicapType === "none") return totalScore;
    const hcpInputVal = (handicapType === "total" || handicapType === "both") ? (handicapInput === "" ? 0 : Number(handicapInput)) : 0;
    
    // Calculate using simulated actual scores
    const simulatedHoles = holes.map(h => {
      const parVal = Number(h.par) || 0;
      const scoreVal = h.score === "" ? "" : (parVal + Number(h.score));
      return { ...h, score: scoreVal };
    });
    const grossTotal = simulatedHoles.reduce((acc, h) => acc + (Number(h.score) || 0), 0);

    if (handicapType === "total") {
      return grossTotal - hcpInputVal;
    } else if (handicapType === "hole") {
      return simulatedHoles.reduce((acc, h) => acc + ((Number(h.score) || 0) - (h.handicap || 0)), 0);
    } else { // both
      return simulatedHoles.reduce((acc, h) => acc + ((Number(h.score) || 0) - (h.handicap || 0)), 0) - hcpInputVal;
    }
  }, [totalScore, handicapInput, handicapType, holes]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl p-0 h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="bg-teal-600 px-5 py-4 text-white shrink-0">
          <DialogTitle className="text-lg font-bold flex flex-wrap items-center justify-between gap-2 pr-8">
            <span>{initialData ? "라운드 수정하기" : "라운드 기록하기"}</span>
            {setupStep === 'scorecard' && (
              <div className="flex items-center gap-2 text-sm font-normal">
                <span className="bg-teal-700 px-3 py-1 rounded-full text-white font-extrabold shadow-sm">
                  기본: {totalScore}타
                </span>
                <span className="bg-teal-800 px-3 py-1 rounded-full text-white font-extrabold shadow-sm">
                  스코어: {(() => {
                    const rel = holes.reduce((acc, h) => {
                      if (h.score === "") return acc;
                      return acc + Number(h.score);
                    }, 0);
                    return rel > 0 ? `+${rel}` : rel === 0 ? "E (Even)" : rel;
                  })()}
                </span>
                {handicapType !== "none" && (
                  <span className="bg-teal-950 px-3 py-1 rounded-full text-white font-extrabold shadow-sm">
                    넷(Net): {dialogNetScore}타
                  </span>
                )}
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        {setupStep === 'choose_holes' ? (
          <div className="flex-1 p-6 flex flex-col justify-between bg-slate-50 overflow-y-auto">
            <div className="space-y-6">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2 shadow-sm">
                <h3 className="text-sm font-bold text-amber-800 flex items-center gap-1.5">
                  ⛳ 신규 골프장 설정
                </h3>
                <p className="text-xs text-amber-700 leading-relaxed">
                  등록되어 있지 않은 새로운 골프장입니다. 원활한 스코어 카드 기록을 위해 골프장의 홀 수와 정보를 기입해 주세요. 등록된 정보는 다른 골퍼들과 공유됩니다.
                </p>
              </div>

              <div className="bg-white p-4 rounded-xl border shadow-sm space-y-4">
                {/* 날짜 & 핸디캡 */}
                <div className="flex flex-wrap gap-4 w-full items-end">
                  <div className="flex-1 min-w-[120px] max-w-[150px]">
                    <Label className="text-xs font-bold text-slate-500">날짜</Label>
                    <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 bg-white h-9 text-xs" />
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <Label className="text-xs font-bold text-slate-500">핸디캡 적용 방식</Label>
                    <select
                      value={handicapType}
                      onChange={e => setHandicapType(e.target.value as any)}
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-xs font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="none">핸디캡 없음</option>
                      <option value="total">총 타수에서 차감</option>
                      <option value="hole">홀별 핸디 직접 입력 (합산)</option>
                      <option value="both">홀별 핸디 직접 입력 + 총합 차감</option>
                    </select>
                  </div>
                  {(handicapType === "total" || handicapType === "both") && (
                    <div className="flex-1 min-w-[140px] max-w-[160px]">
                      <Label className="text-xs font-bold text-slate-500">내 핸디캡 (타수 차감)</Label>
                      <div className="flex items-center mt-1 h-9 bg-white border rounded-md overflow-hidden shadow-sm">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-full px-3 hover:bg-slate-100 border-r rounded-none text-slate-500 font-bold"
                          onClick={() => setHandicapInput(prev => Math.max(0, Number(prev) - 1))}
                        >
                          -
                        </Button>
                        <Input
                          type="number"
                          value={handicapInput}
                          onChange={e => {
                            const val = e.target.value;
                            setHandicapInput(val === "" ? "" : Number(val));
                          }}
                          className="border-none text-center h-full w-full focus-visible:ring-0 font-bold text-slate-800 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          min={0}
                          max={72}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-full px-3 hover:bg-slate-100 border-l rounded-none text-slate-500 font-bold"
                          onClick={() => setHandicapInput(prev => Math.min(72, Number(prev) + 1))}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 골프장 이름 & 코스조합 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-bold text-slate-500">골프장 이름</Label>
                    <Input value={location} onChange={e => setLocation(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-slate-500">코스/코스조합 이름 (선택)</Label>
                    <Input 
                      value={courseSection} 
                      onChange={e => setCourseSection(e.target.value)} 
                      placeholder="예: 동/서 코스, 아웃코스" 
                      className="mt-1" 
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border shadow-sm space-y-4">
                <Label className="text-sm font-bold text-slate-700 block text-center">
                  골프장의 전체 홀 수를 선택해 주세요
                </Label>
                <div className="flex gap-4">
                  <Button
                    type="button"
                    variant={tempHoleCount === 9 ? "default" : "outline"}
                    onClick={() => handleHoleCountChange(9)}
                    className={`flex-1 h-20 text-lg font-bold flex flex-col gap-1 transition-all ${
                      tempHoleCount === 9 
                        ? "bg-teal-600 hover:bg-teal-700 text-white shadow-md shadow-teal-100 scale-[1.02]" 
                        : "hover:bg-slate-50 border-slate-200"
                    }`}
                  >
                    <span>9홀 코스</span>
                    <span className="text-xs font-normal opacity-85">기본 36타 설정</span>
                  </Button>
                  <Button
                    type="button"
                    variant={tempHoleCount === 18 ? "default" : "outline"}
                    onClick={() => handleHoleCountChange(18)}
                    className={`flex-1 h-20 text-lg font-bold flex flex-col gap-1 transition-all ${
                      tempHoleCount === 18 
                        ? "bg-teal-600 hover:bg-teal-700 text-white shadow-md shadow-teal-100 scale-[1.02]" 
                        : "hover:bg-slate-50 border-slate-200"
                    }`}
                  >
                    <span>18홀 코스</span>
                    <span className="text-xs font-normal opacity-85">기본 72타 설정</span>
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t mt-6">
              <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
              <Button 
                onClick={() => setSetupStep('scorecard')} 
                className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-6"
              >
                코스 생성 및 스코어 입력 시작
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex flex-col gap-3 bg-slate-50 p-4 rounded-xl border">
                {/* 날짜 & 핸디캡 */}
                <div className="flex flex-wrap gap-4 w-full items-end">
                  <div className="flex-1 min-w-[120px] max-w-[150px]">
                    <Label className="text-xs font-bold text-slate-500">날짜</Label>
                    <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 bg-white h-9 text-xs" />
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <Label className="text-xs font-bold text-slate-500">핸디캡 적용 방식</Label>
                    <select
                      value={handicapType}
                      onChange={e => setHandicapType(e.target.value as any)}
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-xs font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="none">핸디캡 없음</option>
                      <option value="total">총 타수에서 차감</option>
                      <option value="hole">홀별 난이도에 따라 차감</option>
                      <option value="both">둘 다 적용</option>
                    </select>
                  </div>
                  {handicapType !== "none" && (
                    <div className="flex-1 min-w-[140px] max-w-[160px]">
                      <Label className="text-xs font-bold text-slate-500">내 핸디캡 (타수 차감)</Label>
                      <div className="flex items-center mt-1 h-9 bg-white border rounded-md overflow-hidden shadow-sm">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-full px-3 hover:bg-slate-100 border-r rounded-none text-slate-500 font-bold"
                          onClick={() => setHandicapInput(prev => Math.max(0, Number(prev) - 1))}
                        >
                          -
                        </Button>
                        <Input
                          type="number"
                          value={handicapInput}
                          onChange={e => {
                            const val = e.target.value;
                            setHandicapInput(val === "" ? "" : Number(val));
                          }}
                          className="border-none text-center h-full w-full focus-visible:ring-0 font-bold text-slate-800 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          min={0}
                          max={72}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-full px-3 hover:bg-slate-100 border-l rounded-none text-slate-500 font-bold"
                          onClick={() => setHandicapInput(prev => Math.min(72, Number(prev) + 1))}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 골프장 이름 & 코스조합 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                  <div>
                    <Label className="text-xs font-bold text-slate-500">골프장 이름</Label>
                    <Input value={location} onChange={e => setLocation(e.target.value)} className="mt-1 bg-white h-9" />
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-slate-500">코스/코스조합 이름 (선택)</Label>
                    <Input 
                      value={courseSection} 
                      onChange={e => setCourseSection(e.target.value)} 
                      placeholder="예: 동/서 코스, 아웃코스" 
                      className="mt-1 bg-white h-9"
                      disabled={!isNewCourse}
                    />
                  </div>
                </div>
              </div>

              {isNewCourse && (
                <div className="flex justify-between items-center text-xs bg-amber-50 border border-amber-200 p-2.5 rounded-lg text-amber-800 font-medium">
                  <span>
                    💡 신규 설정 중: <strong>{tempHoleCount}홀 코스</strong>입니다. 각 홀의 파(Par)와 거리(m)를 자유롭게 편집하고 실제 타수를 입력하세요.
                  </span>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    onClick={() => setSetupStep('choose_holes')} 
                    className="h-6 text-[10px] text-amber-900 hover:bg-amber-100 font-bold border border-amber-300"
                  >
                    홀 수 재설정
                  </Button>
                </div>
              )}

              <div className="text-xs bg-teal-50 border border-teal-200 p-3 rounded-lg text-teal-800 space-y-1">
                <p className="font-bold">⛳ 스코어 카드 입력 가이드 (상대 타수 입력)</p>
                <ul className="list-disc pl-4 space-y-0.5 text-teal-700">
                  <li><strong>상대 타수(오버타)</strong>로 입력합니다 (예: Par 4 홀에서 <strong>-1</strong>은 3타, <strong>0</strong>은 4타, <strong>1</strong>은 5타).</li>
                  <li><strong>최소 타수 제한(홀인원)</strong>: 실제 타수가 1타 미만이 될 수 없으므로, 마이너스(-) 입력은 <strong>-(Par - 1)</strong>까지만 가능합니다 (예: Par 3 홀은 최대 <strong>-2</strong>까지만 입력 가능하며 1타로 기록됩니다).</li>
                  <li><strong>양파(더블파) 제한</strong>이 적용됩니다. 최대 입력 가능한 오버 타수는 각 홀 <strong>Par 값</strong>까지입니다 (예: Par 4 홀은 최대 <strong>+4</strong>까지 입력 가능하며 실제 타수는 8타로 기록됩니다).</li>
                </ul>
              </div>

              {/* 글자 크기 선택 조절 바 */}
              <div className="flex items-center justify-end gap-2 bg-slate-50 border p-2.5 rounded-lg">
                <Label className="text-xs font-extrabold text-slate-600">글자 크기 조절:</Label>
                <select
                  value={fontSizePreset}
                  onChange={e => setFontSizePreset(e.target.value as any)}
                  className="flex h-8 w-28 rounded-md border border-input bg-white px-2 py-1 text-xs font-bold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="normal">보통</option>
                  <option value="medium">조금 크게</option>
                  <option value="large">크게</option>
                </select>
              </div>

              {/* Dynamic Sizing mapping derived from fontSizePreset */}
              {(() => {
                let btnSize = "h-6 w-6 text-xs";
                let inputSize = "w-10 h-7 text-sm";
                let tableTextSize = "text-sm";
                let containerMaxPar = "max-w-[110px]";
                let containerMaxScore = "max-w-[120px]";

                if (fontSizePreset === "medium") {
                  btnSize = "h-8 w-8 text-sm";
                  inputSize = "w-12 h-9 text-base";
                  tableTextSize = "text-base";
                  containerMaxPar = "max-w-[130px]";
                  containerMaxScore = "max-w-[140px]";
                } else if (fontSizePreset === "large") {
                  btnSize = "h-10 w-10 text-base";
                  inputSize = "w-16 h-11 text-lg";
                  tableTextSize = "text-lg";
                  containerMaxPar = "max-w-[160px]";
                  containerMaxScore = "max-w-[170px]";
                }

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-center border-collapse">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="p-2 border">Hole</th>
                          <th className="p-2 border">Par</th>
                          <th className="p-2 border">오버타</th>
                          <th className="p-2 border">총스코어</th>
                          <th className="p-2 border">공략법</th>
                          {showHcpColumn && <th className="p-2 border">홀 핸디캡</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {holes.map((h, i) => {
                          const hcpStrokes = h.handicap || 0;
                          const parVal = Number(h.par) || 0;
                          const scoreVal = h.score === "" ? "" : Number(h.score);
                          const computedGross = h.score !== "" && parVal > 0 ? (parVal + Number(h.score)) : "";
                          const showNetDisplay = showHcpColumn && hcpStrokes > 0 && (computedGross !== "" && Number(computedGross) > 0);

                          return (
                            <tr key={i} className={tableTextSize}>
                              <td className="p-2 border font-bold">{h.hole}</td>
                              <td className="p-2 border">
                                <div className={`flex items-center justify-center gap-1 mx-auto ${containerMaxPar}`}>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className={`${btnSize} p-0 border rounded hover:bg-slate-100 font-extrabold text-slate-500 shrink-0`}
                                    onClick={() => {
                                      if (h.par === "") {
                                        updateHole(i, "par", 4);
                                      } else {
                                        updateHole(i, "par", Math.max(1, Number(h.par) - 1));
                                      }
                                    }}
                                  >
                                    -
                                  </Button>
                                  <Input 
                                    type="number" 
                                    value={h.par} 
                                    onChange={e => updateHole(i, "par", e.target.value === "" ? "" : Number(e.target.value))} 
                                    className={`${inputSize} text-center font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none p-0`} 
                                    min={1}
                                    max={10}
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className={`${btnSize} p-0 border rounded hover:bg-slate-100 font-extrabold text-slate-500 shrink-0`}
                                    onClick={() => {
                                      if (h.par === "") {
                                        updateHole(i, "par", 4);
                                      } else {
                                        updateHole(i, "par", Math.min(10, Number(h.par) + 1));
                                      }
                                    }}
                                  >
                                    +
                                  </Button>
                                </div>
                              </td>
                              <td className="p-2 border">
                                <div className={`flex items-center justify-center gap-1 mx-auto ${containerMaxScore}`}>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className={`${btnSize} p-0 border rounded hover:bg-slate-100 font-extrabold text-slate-500 shrink-0`}
                                    onClick={() => {
                                      const currentVal = h.score === "" ? 0 : Number(h.score);
                                      const minRelative = 1 - parVal;
                                      updateHole(i, "score", Math.max(minRelative, currentVal - 1));
                                    }}
                                  >
                                    -
                                  </Button>
                                  <Input
                                    type="number"
                                    value={h.score}
                                    onChange={e => updateHole(i, "score", e.target.value === "" ? "" : Number(e.target.value))}
                                    className={`${inputSize} text-center font-bold text-teal-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none p-0`}
                                    placeholder="0"
                                    min={parVal > 0 ? 1 - parVal : -4}
                                    max={parVal > 0 ? Math.min(parVal, 10) : 10}
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className={`${btnSize} p-0 border rounded hover:bg-slate-100 font-extrabold text-slate-500 shrink-0`}
                                    onClick={() => {
                                      const currentVal = h.score === "" ? 0 : Number(h.score);
                                      const maxRelative = parVal > 0 ? Math.min(parVal, 10) : 10;
                                      updateHole(i, "score", Math.min(maxRelative, currentVal + 1));
                                    }}
                                  >
                                    +
                                  </Button>
                                </div>
                              </td>
                              <td className="p-2 border font-extrabold text-teal-800 bg-teal-50/40">
                                <div className="flex flex-col items-center justify-center min-w-[70px]">
                                  <span>{computedGross !== "" ? `${computedGross}타` : "-"}</span>
                                  {showNetDisplay && (
                                    <span className="text-[9px] font-bold text-slate-400">
                                      Net: {Number(computedGross) - hcpStrokes} (-{hcpStrokes})
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-2 border">
                                <Input type="text" value={h.strategy || ""} onChange={e => updateHole(i, "strategy", e.target.value)} className="w-32 mx-auto text-center h-8" placeholder="공략법" />
                              </td>
                              {showHcpColumn && (
                                <td className="p-2 border">
                                  <Input type="number" value={h.handicap ?? ""} onChange={e => updateHole(i, "handicap", e.target.value === "" ? "" : Number(e.target.value))} className="w-14 mx-auto text-center text-slate-400 h-8" placeholder="핸디" />
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
            <div className="p-4 bg-slate-50 border-t shrink-0 flex justify-between items-center gap-2">
              {initialData && onDelete ? (
                <Button 
                  variant="destructive" 
                  onClick={() => {
                    if (window.confirm("정말로 이 기록을 삭제하시겠습니까? 삭제된 데이터는 복구할 수 없습니다.")) {
                      onDelete(initialData.id!);
                      onOpenChange(false);
                    }
                  }}
                >
                  기록 삭제
                </Button>
              ) : <div></div>}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
                <Button onClick={save} className="bg-teal-600 hover:bg-teal-700 text-white font-bold">저장하기</Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ScoresPage() {
  const { courseId, courseName } = Route.useSearch();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [courseInfo, setCourseInfo] = useState<any>(null);
  const [games, setGames] = useState<Score[]>([]);
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [editingScore, setEditingScore] = useState<Score | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditHandicapOpen, setIsEditHandicapOpen] = useState(false);
  const [tempHandicap, setTempHandicap] = useState<number | "">(0);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        navigate({ to: "/" });
        return;
      }
      setUser(currentUser);
      const p = await getUserProfile(currentUser.uid);
      setProfile(p);
      if (p) {
        setTempHandicap(p.handicap ?? 0);
      }
      const userScores = await getUserScores(currentUser.uid);
      setGames(userScores);
      setIsLoading(false);
    });
    return () => unsub();
  }, [navigate]);

  useEffect(() => {
    if (courseId && !isLoading) {
      const previousGame = games.find(g => g.courseId === courseId);
      
      getCourseDetails(courseId, courseName).then(info => {
        if (previousGame && previousGame.holes) {
          // 이전 기록이 있다면 그 기록의 파(Par) 정보를 재사용합니다.
          info.holes = info.holes.map((h: any, i: number) => ({
            ...h,
            par: previousGame.holes[i]?.par || h.par
          }));
        }
        setCourseInfo(info);
      }).catch(console.error);
    }
  }, [courseId, courseName, isLoading, games]);

  const displayGames = useMemo(() => {
    let filtered = games;
    if (courseId) {
      filtered = filtered.filter(g => g.courseId === courseId);
    }
    if (startDate) {
      filtered = filtered.filter(g => g.date >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(g => g.date <= endDate);
    }
    return filtered;
  }, [games, courseId, startDate, endDate]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate({ to: "/" });
  };

  const handleSaveScore = async (scoreData: any) => {
    if (!user) return;
    try {
      if (scoreData.id) {
        await updateSavedScore(scoreData.id, user.uid, scoreData);
      } else {
        await saveScore(user.uid, scoreData);
      }
      const userScores = await getUserScores(user.uid);
      setGames(userScores);
    } catch (err) {
      console.error(err);
      alert("점수 저장에 실패했습니다.");
    }
  };

  const handleDeleteScore = async (scoreId: string) => {
    if (!user) return;
    try {
      await deleteSavedScore(scoreId, user.uid);
      const userScores = await getUserScores(user.uid);
      setGames(userScores);
    } catch (err) {
      console.error(err);
      alert("점수 삭제에 실패했습니다.");
    }
  };

  const handleUpdateHandicap = async () => {
    if (!user) return;
    try {
      const finalHcp = tempHandicap === "" ? 0 : Number(tempHandicap);
      await updateUserProfile(user.uid, { handicap: finalHcp });
      const p = await getUserProfile(user.uid);
      setProfile(p);
      setIsEditHandicapOpen(false);
    } catch (err) {
      console.error(err);
      alert("핸디캡 수정에 실패했습니다.");
    }
  };

  // Check if current user is super admin email-wise
  const isSuperAdminEmail = useMemo(() => {
    if (!user || !user.email) return false;
    const email = user.email.toLowerCase();
    return email === "tlsejdzkzk@gmail.com" || email === "tkdwnslpooh@gmail.com";
  }, [user]);

  if (isLoading) return <div className="flex h-screen items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b sticky top-0 z-10 px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          {isSuperAdminEmail && (
            <div className="relative group">
              <Button variant="ghost" size="sm" className="p-1 h-8 w-8 hover:bg-slate-100 rounded">
                <Menu className="w-5 h-5 text-slate-700" />
              </Button>
              <div className="absolute left-0 mt-1 w-36 bg-white border rounded-md shadow-lg hidden group-hover:block hover:block z-20">
                <button
                  onClick={() => navigate({ to: "/admin/users" })}
                  className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-teal-50 hover:text-teal-700 border-b cursor-pointer"
                >
                  사용자 전체 보기
                </button>
              </div>
            </div>
          )}
          <h1 className="font-black text-xl text-teal-600">⛳ 골프 스코어</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span 
              className="text-sm font-bold text-slate-700 hover:underline cursor-pointer"
              onClick={() => {
                if (profile) setTempHandicap(profile.handicap ?? 0);
                setIsEditHandicapOpen(true);
              }}
            >
              {profile?.nickname}님
            </span>
            {profile?.handicap !== undefined && profile.handicap > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs font-bold text-teal-700 border-teal-200 bg-teal-50 hover:bg-teal-100 flex items-center gap-1 cursor-pointer transition-all"
                onClick={() => {
                  if (profile) setTempHandicap(profile.handicap ?? 0);
                  setIsEditHandicapOpen(true);
                }}
              >
                HCP {profile.handicap}
              </Button>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}><LogOut className="w-4 h-4" /></Button>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-6">
        {courseInfo && (
          <Card className="p-4 bg-teal-50 border-teal-200">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-2">
              <MapPin className="text-teal-600 w-5 h-5" /> {courseInfo.name}
            </h2>
            <div className="flex gap-2">
              <Button onClick={() => {
                setEditingScore(null);
                setIsRecordOpen(true);
              }} className="flex-1 bg-teal-600 hover:bg-teal-700">이 코스로 점수 기록하기</Button>
              <Button onClick={() => navigate({ to: "/select-course" })} variant="outline" className="flex-1 border-teal-200 text-teal-700 hover:bg-teal-100">골프장 변경</Button>
            </div>
          </Card>
        )}

        {!courseId && (
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold">내 라운드 기록</h2>
            <Button onClick={() => navigate({ to: "/select-course" })} className="bg-teal-600"><Plus className="w-4 h-4 mr-1"/>기록 추가</Button>
          </div>
        )}
        {courseId && (
          <div className="flex justify-between items-center mt-8">
            <h2 className="text-lg font-bold">이 골프장에서의 이전 기록</h2>
          </div>
        )}

        {/* 기간별 조회 날짜 필터 영역 */}
        <Card className="p-3 bg-white border border-slate-100 shadow-sm flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold">
              <span>조회 시작</span>
              <Input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="h-8 py-1 px-2 border w-32 bg-slate-50 text-xs font-bold"
              />
            </div>
            <span className="text-slate-300">~</span>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold">
              <span>조회 종료</span>
              <Input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="h-8 py-1 px-2 border w-32 bg-slate-50 text-xs font-bold"
              />
            </div>
          </div>
          {(startDate || endDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
              className="h-8 px-2.5 text-xs font-bold text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-100 rounded self-end sm:self-auto cursor-pointer"
            >
              초기화
            </Button>
          )}
        </Card>

        <div className="space-y-4">
          {displayGames.map(game => (
            <Card 
              key={game.id} 
              className="p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer border hover:border-teal-300"
              onClick={() => {
                setEditingScore(game);
                setIsRecordOpen(true);
              }}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-slate-500 font-bold">{game.date}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    그로스(기본): {game.total}타
                  </span>
                  {((game.handicap !== undefined && game.handicap > 0) || (game.handicapType === "hole" && game.holes?.some(h => (h.handicap || 0) > 0))) && game.handicapType !== "none" && (
                    <span className="text-sm font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                      네트(적용): {game.netScore ?? (game.total - game.handicap)}타 ({
                        game.handicapType === "total" ? `총합 차감 / HCP ${game.handicap}` :
                        game.handicapType === "hole" ? `홀별 차감 / HCP ${game.holes?.reduce((acc, h) => acc + (h.handicap || 0), 0) || 0}` :
                        `둘 다 적용 / HCP ${game.handicap}(총합)+${game.holes?.reduce((acc, h) => acc + (h.handicap || 0), 0) || 0}(홀별)`
                      })
                    </span>
                  )}
                </div>
              </div>
              <div className="text-sm font-bold flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-400" /> {game.location || "위치 정보 없음"}
              </div>
              {game.stats && (
                <div className="flex gap-2 mt-3 text-xs">
                  <span className="bg-red-50 text-red-600 px-2 py-1 rounded">버디 {game.stats.birdies}</span>
                  <span className="bg-teal-50 text-teal-600 px-2 py-1 rounded">파 {game.stats.pars}</span>
                  <span className="bg-slate-100 px-2 py-1 rounded">보기 {game.stats.bogeys}</span>
                </div>
              )}
              {game.holes && game.holes.length > 0 && (
                <div className="mt-3 text-[10px] sm:text-xs bg-white rounded border overflow-hidden">
                  {Array.from({ length: Math.ceil(game.holes.length / 9) }).map((_, chunkIndex) => {
                    const chunkHoles = game.holes!.slice(chunkIndex * 9, (chunkIndex + 1) * 9);
                    const chunkParTotal = chunkHoles.reduce((sum, h) => sum + (Number(h.par) || 0), 0);
                    const chunkScoreTotal = chunkHoles.reduce((sum, h) => sum + (Number(h.score) || 0), 0);

                    return (
                      <div key={chunkIndex} className={`${chunkIndex > 0 ? "border-t" : ""} overflow-x-auto`}>
                        <table className="w-full text-center border-collapse whitespace-nowrap">
                          <thead>
                            <tr className="bg-slate-50">
                              <th className="p-1 sm:p-1.5 border-b border-r text-slate-500 font-normal w-10 sm:w-12">{chunkIndex === 0 ? "전반" : "후반"}</th>
                              {chunkHoles.map(h => <th key={`hole-${h.hole}`} className="p-1 sm:p-1.5 border-b border-r text-slate-500 font-normal min-w-[24px] sm:min-w-[32px]">{h.hole}</th>)}
                              <th className="p-1 sm:p-1.5 border-b text-slate-500 font-normal min-w-[32px]">합</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="p-1 sm:p-1.5 border-r text-slate-500">Par</td>
                              {chunkHoles.map(h => <td key={`par-${h.hole}`} className="p-1 sm:p-1.5 border-r">{h.par}</td>)}
                              <td className="p-1 sm:p-1.5 font-bold">{chunkParTotal}</td>
                            </tr>
                            <tr className="bg-slate-50/50">
                              <td className="p-1 sm:p-1.5 border-r text-slate-500 font-bold">오버타</td>
                              {chunkHoles.map(h => {
                                const parVal = Number(h.par) || 0;
                                const grossVal = Number(h.score) || 0;
                                const diff = grossVal > 0 && parVal > 0 ? (grossVal - parVal) : 0;
                                const displayDiff = diff > 0 ? `+${diff}` : diff === 0 ? "0" : diff;
                                return (
                                  <td key={`over-${h.hole}`} className={`p-1 sm:p-1.5 border-r font-bold ${diff < 0 ? 'text-red-500' : diff > 0 ? 'text-blue-500' : 'text-slate-700'}`}>
                                    {displayDiff}
                                  </td>
                                );
                              })}
                              <td className="p-1 sm:p-1.5 font-bold">
                                {(() => {
                                  const diffTotal = chunkHoles.reduce((acc, h) => {
                                    const parVal = Number(h.par) || 0;
                                    const grossVal = Number(h.score) || 0;
                                    if (grossVal === 0 || parVal === 0) return acc;
                                    return acc + (grossVal - parVal);
                                  }, 0);
                                  return diffTotal > 0 ? `+${diffTotal}` : diffTotal;
                                })()}
                              </td>
                            </tr>
                            <tr>
                              <td className="p-1 sm:p-1.5 border-r text-teal-700 font-bold">총스코어</td>
                              {chunkHoles.map(h => (
                                <td key={`score-${h.hole}`} className={`p-1 sm:p-1.5 border-r font-bold ${(h.score || 0) < (h.par || 0) ? 'text-red-500' : (h.score || 0) > (h.par || 0) ? 'text-blue-500' : 'text-slate-700'}`}>
                                  {h.score}
                                </td>
                              ))}
                              <td className="p-1 sm:p-1.5 font-bold text-teal-700">{chunkScoreTotal}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          ))}
          {displayGames.length === 0 && (
            <div className="text-center py-10 text-slate-400">아직 등록된 기록이 없습니다.</div>
          )}
        </div>
      </main>

      <RecordRoundDialog 
        open={isRecordOpen} 
        onOpenChange={(open) => {
          setIsRecordOpen(open);
          if (!open) setEditingScore(null);
        }} 
        courseInfo={courseInfo} 
        initialData={editingScore}
        onSave={handleSaveScore} 
        onDelete={handleDeleteScore}
        defaultHandicap={profile?.handicap !== undefined ? profile.handicap : (games.length > 0 ? (games[0].handicap ?? 0) : 0)}
      />

      <Dialog open={isEditHandicapOpen} onOpenChange={setIsEditHandicapOpen}>
        <DialogContent className="max-w-sm p-6 bg-white rounded-xl shadow-lg border border-slate-100">
          <DialogHeader className="pb-2 border-b">
            <DialogTitle className="text-base font-bold text-slate-800">기본 핸디캡 수정</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div>
              <Label className="text-xs font-bold text-slate-500">나의 기본 핸디캡 (평균 타수 차감)</Label>
              <div className="flex items-center mt-1.5 h-9 bg-white border rounded-md overflow-hidden max-w-[160px] shadow-sm">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-full px-3 hover:bg-slate-100 border-r rounded-none text-slate-500 font-bold"
                  onClick={() => setTempHandicap(prev => Math.max(0, Number(prev) - 1))}
                >
                  -
                </Button>
                <Input
                  type="number"
                  value={tempHandicap}
                  onChange={e => {
                    const val = e.target.value;
                    setTempHandicap(val === "" ? "" : Number(val));
                  }}
                  className="border-none text-center h-full w-full focus-visible:ring-0 font-bold text-slate-800 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  min={0}
                  max={72}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="h-full px-3 hover:bg-slate-100 border-l rounded-none text-slate-500 font-bold"
                  onClick={() => setTempHandicap(prev => Math.min(72, Number(prev) + 1))}
                >
                  +
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-normal">
              💡 여기에 입력된 핸디캡은 나의 기본 실력(평균 핸디캡)으로 프로필에 영구 저장됩니다. 새로운 라운드 점수를 기록할 때 기본 핸디캡 값으로 자동 세팅되지만, 필요에 따라 특정 라운드별로 자유롭게 수정(오버라이드)할 수 있습니다.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => setIsEditHandicapOpen(false)}>취소</Button>
            <Button size="sm" onClick={handleUpdateHandicap} className="bg-teal-600 hover:bg-teal-700 text-white font-bold">저장하기</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
