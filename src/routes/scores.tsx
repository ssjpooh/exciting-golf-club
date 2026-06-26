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
} from "@/lib/db";
import { getCourseDetails } from "@/lib/golfApi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, Plus, MapPin, Check } from "lucide-react";
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

function getHoleHandicapStrokes(
  h: HoleScore,
  index: number,
  totalHandicap: number,
  totalHoles: number
): number {
  if (!totalHandicap) return 0;
  const baseStrokes = Math.floor(totalHandicap / totalHoles);
  const remainder = totalHandicap % totalHoles;

  // 홀별 난이도 정보(1 ~ totalHoles)가 입력되어 있는 경우
  if (h.handicap && h.handicap >= 1 && h.handicap <= totalHoles) {
    return baseStrokes + (h.handicap <= remainder ? 1 : 0);
  }

  // 홀별 난이도가 없으면 순서대로 분배
  return baseStrokes + (index < remainder ? 1 : 0);
}

function RecordRoundDialog({
  open,
  onOpenChange,
  courseInfo,
  onSave,
  defaultHandicap = 0,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseInfo?: any;
  onSave: (score: any) => void;
  defaultHandicap?: number;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState(courseInfo?.name || "");
  const [courseSection, setCourseSection] = useState("");
  const [memo, setMemo] = useState("");
  const [holes, setHoles] = useState<HoleScore[]>([]);
  const [handicapInput, setHandicapInput] = useState<number | "">(0);
  const [isNewCourse, setIsNewCourse] = useState(false);
  const [tempHoleCount, setTempHoleCount] = useState<number>(18);
  const [setupStep, setSetupStep] = useState<'choose_holes' | 'scorecard'>('scorecard');

  useEffect(() => {
    if (open) {
      const hasHoles = courseInfo?.holes && courseInfo.holes.length > 0;
      setIsNewCourse(!hasHoles);
      setHandicapInput(defaultHandicap);
      setCourseSection(""); // Reset course section for new entry

      if (hasHoles) {
        setHoles(courseInfo.holes.map((h: any) => ({ ...h, score: h.par, putts: 2 })));
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
          score: 4,
          putts: 2,
          handicap: 0
        })));
      }
      setLocation(courseInfo?.name || "");
    }
  }, [open, courseInfo, defaultHandicap]);

  const totalScore = useMemo(() => holes.reduce((acc, h) => acc + (h.score || 0), 0), [holes]);
  const totalPar = useMemo(() => holes.reduce((acc, h) => acc + (h.par || 0), 0), [holes]);
  const showHcpColumn = handicapInput !== "" && handicapInput > 0;

  const handleHoleCountChange = (count: number) => {
    setTempHoleCount(count);
    setHoles(Array.from({ length: count }, (_, i) => ({
      hole: i + 1,
      par: 4,
      distance: 300,
      score: 4,
      putts: 2,
      handicap: 0
    })));
  };

  const updateHole = (idx: number, field: keyof HoleScore, value: number) => {
    const newHoles = [...holes];
    newHoles[idx] = { ...newHoles[idx], [field]: value };
    setHoles(newHoles);
  };

  const save = async () => {
    try {
      const finalCourseId = courseInfo?.id || encodeURIComponent(location);
      const finalName = courseSection ? `${location} (${courseSection})` : location;
      
      if (isNewCourse) {
        const newCourseData = {
          id: finalCourseId,
          name: finalName,
          holeCount: tempHoleCount,
          totalPar: holes.reduce((acc, h) => acc + (h.par || 0), 0),
          holes: holes.map(h => ({
            hole: h.hole,
            par: h.par,
            distance: h.distance,
            handicap: h.handicap || 0
          }))
        };
        await saveGolfCourseToDb(newCourseData);
      }

      onSave({
        date,
        location: finalName,
        memo,
        holes,
        total: totalScore,
        courseId: finalCourseId,
        handicap: handicapInput === "" ? 0 : Number(handicapInput),
        netScore: totalScore - (handicapInput === "" ? 0 : Number(handicapInput)),
      });
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save course or score", err);
      alert("골프장 정보 또는 점수 저장에 실패했습니다.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl p-0 h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="bg-teal-600 px-5 py-4 text-white shrink-0">
          <DialogTitle className="text-lg font-bold flex items-center justify-between">
            <span>라운드 기록하기</span>
            {setupStep === 'scorecard' && (
              <div className="flex items-center gap-4 text-sm font-normal">
                <span className="bg-teal-700 px-3 py-1 rounded-full text-white font-bold">기본(Gross): {totalScore} 타</span>
                {handicapInput > 0 && (
                  <span className="bg-teal-900 px-3 py-1 rounded-full text-white font-bold">넷(Net): {totalScore - handicapInput} 타</span>
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
                <div className="flex gap-4 w-full items-center">
                  <div className="flex-1 max-w-[150px]">
                    <Label className="text-xs font-bold text-slate-500">날짜</Label>
                    <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 bg-white h-9 text-xs" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs font-bold text-slate-500">내 핸디캡 (타수 차감)</Label>
                    <div className="flex items-center mt-1 h-9 bg-white border rounded-md overflow-hidden max-w-[160px] shadow-sm">
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
                <div className="flex gap-4 w-full items-center">
                  <div className="flex-1 max-w-[150px]">
                    <Label className="text-xs font-bold text-slate-500">날짜</Label>
                    <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 bg-white h-9 text-xs" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs font-bold text-slate-500">내 핸디캡 (타수 차감)</Label>
                    <div className="flex items-center mt-1 h-9 bg-white border rounded-md overflow-hidden max-w-[160px] shadow-sm">
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

              <div className="overflow-x-auto">
                <table className="w-full text-center border-collapse">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="p-2 border">Hole</th>
                      <th className="p-2 border">Score</th>
                      <th className="p-2 border">Putts</th>
                      <th className="p-2 border">Par</th>
                      <th className="p-2 border">거리 (m)</th>
                      {showHcpColumn && <th className="p-2 border">홀 난이도</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {holes.map((h, i) => {
                      const hcpStrokes = getHoleHandicapStrokes(
                        h,
                        i,
                        handicapInput === "" ? 0 : Number(handicapInput),
                        holes.length
                      );
                      const showNetDisplay = hcpStrokes > 0 && h.score > 0;

                      return (
                        <tr key={i}>
                          <td className="p-2 border font-bold">{h.hole}</td>
                          <td className="p-2 border">
                            {showNetDisplay ? (
                              <div className="flex flex-col items-center gap-0.5 min-w-[70px]">
                                <Input
                                  type="number"
                                  value={h.score}
                                  onChange={e => updateHole(i, "score", Number(e.target.value))}
                                  className="w-16 mx-auto text-center font-bold text-teal-600"
                                />
                                <span className="text-[10px] font-bold text-slate-400">
                                  Net: {h.score - hcpStrokes} (-{hcpStrokes})
                                </span>
                              </div>
                            ) : (
                              <Input
                                type="number"
                                value={h.score}
                                onChange={e => updateHole(i, "score", Number(e.target.value))}
                                className="w-16 mx-auto text-center font-bold text-teal-600"
                              />
                            )}
                          </td>
                          <td className="p-2 border">
                            <Input type="number" value={h.putts} onChange={e => updateHole(i, "putts", Number(e.target.value))} className="w-16 mx-auto text-center" />
                          </td>
                          <td className="p-2 border">
                            <Input type="number" value={h.par} onChange={e => updateHole(i, "par", Number(e.target.value))} className="w-14 mx-auto text-center" />
                          </td>
                          <td className="p-2 border">
                            <Input type="number" value={h.distance} onChange={e => updateHole(i, "distance", Number(e.target.value))} className="w-20 mx-auto text-center" placeholder="m" />
                          </td>
                          {showHcpColumn && (
                            <td className="p-2 border">
                              <Input type="number" value={h.handicap || ""} onChange={e => updateHole(i, "handicap", Number(e.target.value))} className="w-14 mx-auto text-center text-slate-400" placeholder="난이도" />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t shrink-0 flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
              <Button onClick={save} className="bg-teal-600 hover:bg-teal-700 text-white font-bold">저장하기</Button>
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
  const [isLoading, setIsLoading] = useState(true);
  const [isEditHandicapOpen, setIsEditHandicapOpen] = useState(false);
  const [tempHandicap, setTempHandicap] = useState<number | "">(0);

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
          // 이전 기록이 있다면 그 기록의 파(Par)와 거리 정보를 재사용합니다.
          info.holes = info.holes.map((h: any, i: number) => ({
            ...h,
            par: previousGame.holes[i]?.par || h.par,
            distance: previousGame.holes[i]?.distance || h.distance
          }));
        }
        setCourseInfo(info);
      }).catch(console.error);
    }
  }, [courseId, courseName, isLoading, games]);

  const displayGames = useMemo(() => {
    if (courseId) {
      return games.filter(g => g.courseId === courseId);
    }
    return games;
  }, [games, courseId]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate({ to: "/" });
  };

  const handleSaveScore = async (scoreData: any) => {
    if (!user) return;
    try {
      await saveScore(user.uid, scoreData);
      const userScores = await getUserScores(user.uid);
      setGames(userScores);
    } catch (err) {
      console.error(err);
      alert("점수 저장에 실패했습니다.");
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

  if (isLoading) return <div className="flex h-screen items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b sticky top-0 z-10 px-4 py-3 flex justify-between items-center">
        <h1 className="font-black text-xl text-teal-600">⛳ 골프 스코어</h1>
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
              <Button onClick={() => setIsRecordOpen(true)} className="flex-1 bg-teal-600 hover:bg-teal-700">이 코스로 점수 기록하기</Button>
              <Button onClick={() => navigate({ to: "/select-course" })} variant="outline" className="flex-1 border-teal-200 text-teal-700 hover:bg-teal-100">골프장 변경</Button>
            </div>
          </Card>
        )}

        {!courseId && (
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold">내 라운드 기록</h2>
            <Button onClick={() => setIsRecordOpen(true)} className="bg-teal-600"><Plus className="w-4 h-4 mr-1"/>기록 추가</Button>
          </div>
        )}
        {courseId && (
          <div className="flex justify-between items-center mt-8">
            <h2 className="text-lg font-bold">이 골프장에서의 이전 기록</h2>
          </div>
        )}

        <div className="space-y-4">
          {displayGames.map(game => (
            <Card key={game.id} className="p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-slate-500 font-bold">{game.date}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    그로스(기본): {game.total}타
                  </span>
                  {game.handicap !== undefined && game.handicap > 0 && (
                    <span className="text-sm font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                      네트(적용): {game.netScore ?? (game.total - game.handicap)}타 (HCP {game.handicap})
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
            </Card>
          ))}
          {displayGames.length === 0 && (
            <div className="text-center py-10 text-slate-400">아직 등록된 기록이 없습니다.</div>
          )}
        </div>
      </main>

      <RecordRoundDialog 
        open={isRecordOpen} 
        onOpenChange={setIsRecordOpen} 
        courseInfo={courseInfo} 
        onSave={handleSaveScore} 
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
