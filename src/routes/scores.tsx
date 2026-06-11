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
};

export const Route = createFileRoute("/scores")({
  validateSearch: (search: Record<string, unknown>): ScoresSearch => {
    return {
      viewUid: search.viewUid as string | undefined,
      courseId: search.courseId as string | undefined,
    };
  },
  component: ScoresPage,
});

function RecordRoundDialog({
  open,
  onOpenChange,
  courseInfo,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseInfo?: any;
  onSave: (score: any) => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState(courseInfo?.name || "");
  const [memo, setMemo] = useState("");
  const [holes, setHoles] = useState<HoleScore[]>([]);

  useEffect(() => {
    if (open) {
      if (courseInfo?.holes && courseInfo.holes.length > 0) {
        setHoles(courseInfo.holes.map((h: any) => ({ ...h, score: h.par, putts: 2 })));
      } else {
        // API 데이터가 없거나 에러가 나서 빈 템플릿이 온 경우 (태광CC 등)
        const isNineHoles = courseInfo?.name?.includes("태광") || courseInfo?.name?.includes("9홀");
        const defaultLength = isNineHoles ? 9 : 18;
        
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
  }, [open, courseInfo]);

  const totalScore = useMemo(() => holes.reduce((acc, h) => acc + (h.score || 0), 0), [holes]);
  const totalPar = useMemo(() => holes.reduce((acc, h) => acc + (h.par || 0), 0), [holes]);

  const updateHole = (idx: number, field: keyof HoleScore, value: number) => {
    const newHoles = [...holes];
    newHoles[idx] = { ...newHoles[idx], [field]: value };
    setHoles(newHoles);
  };

  const save = () => {
    onSave({
      date,
      location,
      memo,
      holes,
      total: totalScore,
      courseId: courseInfo?.id,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl p-0 h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="bg-teal-600 px-5 py-4 text-white shrink-0">
          <DialogTitle className="text-lg font-bold flex items-center justify-between">
            <span>라운드 기록하기</span>
            <span className="text-xl">{totalScore} 타</span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>날짜</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <Label>골프장 이름</Label>
              <Input value={location} onChange={e => setLocation(e.target.value)} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-center border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  <th className="p-2 border">Hole</th>
                  <th className="p-2 border">Par</th>
                  <th className="p-2 border">HCP</th>
                  <th className="p-2 border">Score</th>
                  <th className="p-2 border">Putts</th>
                </tr>
              </thead>
              <tbody>
                {holes.map((h, i) => (
                  <tr key={i}>
                    <td className="p-2 border font-bold">{h.hole}</td>
                    <td className="p-2 border">
                      <Input type="number" value={h.par} onChange={e => updateHole(i, "par", Number(e.target.value))} className="w-16 mx-auto text-center" />
                    </td>
                    <td className="p-2 border">
                      <Input type="number" value={h.handicap || ""} onChange={e => updateHole(i, "handicap", Number(e.target.value))} className="w-16 mx-auto text-center text-slate-400" placeholder="HCP" />
                    </td>
                    <td className="p-2 border">
                      <Input type="number" value={h.score} onChange={e => updateHole(i, "score", Number(e.target.value))} className="w-16 mx-auto text-center font-bold text-teal-600" />
                    </td>
                    <td className="p-2 border">
                      <Input type="number" value={h.putts} onChange={e => updateHole(i, "putts", Number(e.target.value))} className="w-16 mx-auto text-center" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="p-4 bg-slate-50 border-t shrink-0 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={save} className="bg-teal-600 hover:bg-teal-700">저장하기</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScoresPage() {
  const { courseId } = Route.useSearch();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [courseInfo, setCourseInfo] = useState<any>(null);
  const [games, setGames] = useState<Score[]>([]);
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        navigate({ to: "/" });
        return;
      }
      setUser(currentUser);
      const p = await getUserProfile(currentUser.uid);
      setProfile(p);
      const userScores = await getUserScores(currentUser.uid);
      setGames(userScores);
      setIsLoading(false);
    });
    return () => unsub();
  }, [navigate]);

  useEffect(() => {
    if (courseId && !isLoading) {
      const previousGame = games.find(g => g.courseId === courseId);
      
      getCourseDetails(courseId).then(info => {
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
  }, [courseId, isLoading, games]);

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

  if (isLoading) return <div className="flex h-screen items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b sticky top-0 z-10 px-4 py-3 flex justify-between items-center">
        <h1 className="font-black text-xl text-teal-600">⛳ 골프 스코어</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm font-bold">{profile?.nickname}님</span>
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
                <span className="text-lg font-black text-teal-600">{game.total} 타</span>
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
      />
    </div>
  );
}
