import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { getUserProfile, getClubs, addClub, updateClubName, Club, UserProfile } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Plus, Settings, Calendar, RefreshCcw, Edit2 } from "lucide-react";

import { toast } from "sonner";

export const Route = createFileRoute("/admin/clubs")({
  component: AdminClubsPage,
});

function AdminClubsPage() {
  const navigate = useNavigate();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [newClubName, setNewClubName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  
  // 클럽 이름 수정 상태
  const [editingClubId, setEditingClubId] = useState<string | null>(null);
  const [editClubName, setEditClubName] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate({ to: "/" });
        return;
      }

      const profile = await getUserProfile(user.uid);
      if (!profile || (profile.role !== "super_admin" && profile.role !== "master")) {
        toast.error("접근 권한이 없습니다.");
        navigate({ to: "/scores" });
        return;
      }

      setCurrentUserProfile(profile);
      loadClubs();
    });

    return () => unsubscribe();
  }, [navigate]);

  const loadClubs = async () => {
    setIsLoading(true);
    console.log("loadClubs: Starting to fetch club list...");
    try {
      const data = await getClubs();
      console.log(`loadClubs: Received ${data.length} clubs from database.`);
      setClubs(data);
      if (data.length === 0) {
        console.warn("loadClubs: Database returned an empty list.");
      }
    } catch (error) {
      console.error("loadClubs: Failed to fetch clubs.", error);
      toast.error("클럽 목록을 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };


  const handleAddClub = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    console.log("handleAddClub triggered. Name:", newClubName);


    
    if (!newClubName.trim()) {
      console.warn("Club name is empty.");
      return;
    }
    
    if (isAdding) {
      console.warn("Already adding a club, ignoring request.");
      return;
    }

    setIsAdding(true);
    try {
      console.log("Calling addClub API...");
      await addClub(newClubName.trim());
      console.log("addClub API success.");
      toast.success("클럽이 추가되었습니다.");
      setNewClubName("");
      await loadClubs();
    } catch (error: any) {
      console.error("Club add error details:", error);
      if (error.message === "ALREADY_EXISTS_NAME") {
        toast.error("이미 등록되어 있는 클럽 이름입니다.");
      } else if (error.message === "MAX_CLUB_LIMIT_REACHED") {
        toast.error("더 이상 클럽을 추가할 수 없습니다. (최대 9999개)");
      } else {
        toast.error(`클럽 추가에 실패했습니다. (${error.message || "권한 또는 네트워크 오류"})`);
      }
    } finally {
      setIsAdding(false);
      console.log("handleAddClub finished.");
    }
  };

  const handleSaveClubName = async (clubId: string) => {
    if (!editClubName.trim()) {
      toast.error("클럽 이름을 입력해주세요.");
      return;
    }
    try {
      await updateClubName(clubId, editClubName.trim());
      setClubs((prev) => prev.map((c) => (c.id === clubId ? { ...c, name: editClubName.trim() } : c)));
      setEditingClubId(null);
      toast.success("클럽명이 변경되었습니다.");
    } catch (error: any) {
      if (error.message === "ALREADY_EXISTS_NAME") {
        toast.error("이미 사용 중인 클럽 이름입니다.");
      } else {
        toast.error("클럽명 변경에 실패했습니다.");
      }
    }
  };

  const filteredClubs = useMemo(() => {
    if (currentUserProfile?.role === "master") {
      const myClubId = currentUserProfile.clubId;
      return clubs.filter((c) => c.id === myClubId);
    }
    return clubs;
  }, [clubs, currentUserProfile]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: "/scores" })}
            className="rounded-full hover:bg-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">클럽 관리</h1>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => loadClubs()} 
                className="h-8 px-2 text-[10px] font-bold gap-1 rounded-lg border-slate-200"
              >
                <RefreshCcw className="h-3 w-3" />
                새로고침
              </Button>
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Club Management
            </p>
          </div>

        </header>

        {/* 클럽 추가 섹션 */}
        {currentUserProfile?.role === "super_admin" && (
          <Card className="p-6 border-none shadow-xl shadow-slate-200/50">
            <form onSubmit={handleAddClub} className="space-y-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase px-1">
                  새 클럽 이름
                </label>
                <div className="flex gap-2">
                  <Input
                    value={newClubName}
                    onChange={(e) => setNewClubName(e.target.value)}
                    placeholder="ex. 볼링 매니아, 스트라이크 클럽"
                    className="flex-1 h-12 rounded-xl border-slate-100 bg-slate-50 focus:bg-white transition-all font-bold"
                  />
                  <Button
                    type="submit"
                    onClick={() => handleAddClub()}
                    disabled={!newClubName.trim() || isAdding}
                    className="h-12 px-6 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-xl shadow-lg shadow-teal-600/20 gap-2 shrink-0"
                  >
                    <Plus className="h-5 w-5" />
                    추가
                  </Button>
                </div>
              </div>
            </form>
          </Card>
        )}

        {/* 클럽 리스트 */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase px-1 tracking-widest">
            {currentUserProfile?.role === "master" ? "소속 클럽 정보" : "등록된 클럽 리스트"}
          </h2>
          {isLoading ? (
            <div className="py-20 text-center space-y-4">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-teal-600 border-t-transparent"></div>
              <p className="text-sm font-bold text-slate-400">클럽 정보를 불러오고 있습니다...</p>
            </div>
          ) : filteredClubs.length === 0 ? (
            <div className="py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100">
              <Settings className="h-12 w-12 text-slate-200 mx-auto mb-4" />
              <p className="text-sm font-bold text-slate-400">소속되거나 등록된 클럽이 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredClubs.map((club) => (
                <Card
                  key={club.id}
                  className="p-5 border-none shadow-md hover:shadow-xl transition-all group bg-white rounded-2xl"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-600 font-black group-hover:bg-teal-600 group-hover:text-white transition-colors shadow-inner">
                        {club.name.substring(0, 1)}
                      </div>
                      <div>
                        {editingClubId === club.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editClubName}
                              onChange={(e) => setEditClubName(e.target.value)}
                              className="h-8 w-44 font-bold text-slate-800 border-teal-200 text-sm"
                              placeholder="클럽 이름"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              className="h-8 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-2.5"
                              onClick={() => handleSaveClubName(club.id)}
                            >
                              저장
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 border-slate-200 text-slate-500 font-bold text-xs px-2.5"
                              onClick={() => setEditingClubId(null)}
                            >
                              취소
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <h3 className="font-black text-slate-800 text-lg">{club.name}</h3>
                            <button
                              onClick={() => {
                                setEditingClubId(club.id);
                                setEditClubName(club.name);
                              }}
                              className="text-slate-300 hover:text-slate-500 transition-colors"
                              title="이름 수정"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-slate-400 mt-0.5">
                          <Calendar className="h-3 w-3" />
                          <span className="text-[10px] font-bold">코드: {club.code}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
