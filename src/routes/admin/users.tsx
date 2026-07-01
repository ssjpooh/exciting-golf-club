import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  getAllUsers,
  updateUserRole,
  UserProfile,
  UserRole,
  getUserProfile,
  deleteUserRecord,
  updateUserNickname,
  getUserScores,
  Score,
} from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ShieldCheck,
  Crown,
  Diamond,
  User as UserIcon,
  RefreshCcw,
  Search,
  Trophy,
  Edit2,
  Trash2,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [search, setSearch] = useState("");
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  
  // 닉네임 수정 상태
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editNickname, setEditNickname] = useState("");

  // 점수 보기 다이얼로그 상태
  const [scoreDialogOpen, setScoreDialogOpen] = useState(false);
  const [scoreDialogUser, setScoreDialogUser] = useState("");
  const [selectedUserScores, setSelectedUserScores] = useState<Score[] | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate({ to: "/", replace: true });
        return;
      }

      const profile = await getUserProfile(user.uid);
      if (profile?.role !== "super_admin" && profile?.role !== "master") {
        toast.error("권한이 없습니다.");
        navigate({ to: "/scores", replace: true });
        return;
      }

      setCurrentUserProfile(profile);
      setIsAdmin(true);
      fetchUsers();
    });

    return () => unsubscribe();
  }, [navigate]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await getAllUsers();
      setUsers(data || []);
    } catch (error) {
      toast.error("사용자 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };



  const handleRoleChange = async (targetUserId: string, newRole: UserRole) => {
    try {
      // 3번 케이스: 클럽장이 다른 클럽원에게 클럽장(master) 권한 부여 시 본인은 운영진(staff)으로 강등
      if (currentUserProfile?.role === "master" && newRole === "master") {
        if (!window.confirm("상대방에게 클럽장 권한을 위임하시겠습니까?\n위임 시 본인은 운영진(staff)으로 강등되며 관리 페이지에서 나가게 됩니다.")) {
          // Reset the select value back by refetching
          fetchUsers();
          return;
        }
        
        // 1. 상대방을 master로 임명
        await updateUserRole(targetUserId, "master");
        
        // 2. 본인을 staff로 강등
        if (auth.currentUser) {
          await updateUserRole(auth.currentUser.uid, "staff");
        }
        
        toast.success("클럽장 권한 위임이 완료되었습니다.");
        navigate({ to: "/scores", replace: true });
        return;
      }

      // 일반적인 역할 수정 (클럽장이 운영진 임명/회수 하거나 슈퍼관리자가 관리할 때)
      await updateUserRole(targetUserId, newRole);
      setUsers((prev) => prev.map((u) => (u.uid === targetUserId ? { ...u, role: newRole } : u)));
      toast.success("등급이 변경되었습니다.");
    } catch (error) {
      toast.error("등급 변경에 실패했습니다.");
    }
  };



  const handleDeleteUser = async (userId: string, nickname: string) => {
    if (!window.confirm(`정말로 '${nickname}' 사용자를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    try {
      await deleteUserRecord(userId);
      setUsers((prev) => prev.filter((u) => u.uid !== userId));
      toast.success("사용자가 삭제되었습니다.");
    } catch (error) {
      console.error("Failed to delete user:", error);
      toast.error("사용자 삭제에 실패했습니다.");
    }
  };

  const handleSaveNickname = async (userId: string) => {
    if (!editNickname.trim()) {
      toast.error("이름을 입력해주세요.");
      return;
    }
    try {
      await updateUserNickname(userId, editNickname.trim());
      setUsers((prev) => prev.map((u) => (u.uid === userId ? { ...u, nickname: editNickname.trim() } : u)));
      setEditingUserId(null);
      toast.success("이름이 변경되었습니다.");
    } catch (error) {
      toast.error("이름 변경에 실패했습니다.");
    }
  };

  const handleViewScoresList = async (user: UserProfile) => {
    try {
      setScoreDialogUser(user.nickname || user.email?.split("@")[0] || "회원");
      setScoreDialogOpen(true);
      setSelectedUserScores(null);
      const scores = await getUserScores(user.uid);
      setSelectedUserScores(scores);
    } catch (error) {
      toast.error("점수 기록을 불러오는데 실패했습니다.");
    }
  };

  const canEditRole = (targetUser: UserProfile) => {
    // 본인 계정은 역할 수정 불가
    if (targetUser.email === auth.currentUser?.email) return false;
    
    if (currentUserProfile?.role === "super_admin") return true;
    
    return false;
  };

  const filteredUsers = useMemo(() => {
    let list = users || [];
    return list.filter(
      (u) =>
        u.nickname.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()),
    );
  }, [users, search, currentUserProfile]);

  const RoleIcon = ({ role }: { role: UserRole }) => {
    switch (role) {
      case "super_admin":
        return <Diamond className="w-4 h-4 text-purple-500" />;
      case "master":
        return <Crown className="w-4 h-4 text-amber-500" />;
      case "staff":
        return <ShieldCheck className="w-4 h-4 text-blue-500" />;
      default:
        return <UserIcon className="w-4 h-4 text-slate-400" />;
    }
  };

  if (!isAdmin || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-teal-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/scores" })}>
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <div>
              <h1 className="text-2xl font-black text-slate-900">사용자 관리</h1>
              <p className="text-xs text-slate-500 font-medium">클럽 회원들의 등급을 관리합니다.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="이름 또는 이메일 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10 w-[200px] sm:w-[250px] bg-white border-none shadow-sm"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={fetchUsers}
              className="h-10 w-10 bg-white"
            >
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <Card className="border-none shadow-xl overflow-hidden bg-white/80 backdrop-blur-md">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="w-[180px]">닉네임</TableHead>
                  <TableHead>이메일</TableHead>
                  <TableHead>등급</TableHead>
                  <TableHead className="text-right">설정</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-20 text-slate-400 font-medium">
                      사용자가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.uid} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="py-3">
                        <div className="font-bold text-slate-800 leading-tight flex items-center gap-2">
                          {editingUserId === user.uid ? (
                            <div className="flex items-center gap-1">
                              <Input
                                value={editNickname}
                                onChange={(e) => setEditNickname(e.target.value)}
                                className="h-6 w-24 text-xs"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveNickname(user.uid);
                                  else if (e.key === "Escape") setEditingUserId(null);
                                }}
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[10px] text-teal-600"
                                onClick={() => handleSaveNickname(user.uid)}
                              >
                                저장
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[10px] text-slate-400"
                                onClick={() => setEditingUserId(null)}
                              >
                                취소
                              </Button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => handleViewScoresList(user)}
                                className="text-slate-800 hover:text-teal-600 hover:underline text-left cursor-pointer transition-colors"
                              >
                                {user.nickname || user.email?.split("@")[0] || "회원"}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingUserId(user.uid);
                                  setEditNickname(user.nickname);
                                }}
                                className="text-slate-300 hover:text-slate-500 transition-colors ml-1"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-slate-500 text-xs">{user.email}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <RoleIcon role={user.role} />
                          <span className="text-[10px] font-bold uppercase tracking-tight text-slate-500">
                            {user.role === "super_admin"
                              ? "슈퍼 관리자"
                              : user.role === "master"
                                ? "클럽장"
                                : user.role === "staff"
                                  ? "운영진"
                                  : "클럽원"}
                          </span>
                        </div>
                      </TableCell>


                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Select
                            value={user.role}
                            onValueChange={(val: UserRole) => handleRoleChange(user.uid, val)}
                            disabled={!canEditRole(user)}
                          >
                            <SelectTrigger className="w-[100px] h-8 text-[11px] font-bold border-slate-100 bg-slate-50/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {currentUserProfile?.role === "super_admin" && (
                                <SelectItem value="super_admin">슈퍼 관리자</SelectItem>
                              )}
                              <SelectItem value="master">클럽장</SelectItem>
                              <SelectItem value="staff">운영진</SelectItem>
                              <SelectItem value="member">클럽원</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleDeleteUser(user.uid, user.nickname || user.email?.split("@")[0] || "회원")}
                            disabled={user.email === auth.currentUser?.email}
                            className="h-8 w-8 border-red-100 text-red-500 hover:bg-red-50 hover:text-red-600 flex-shrink-0"
                            title="사용자 삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* 점수 보기 다이얼로그 */}
      <Dialog open={scoreDialogOpen} onOpenChange={setScoreDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Trophy className="w-5 h-5 text-teal-600" />
              {scoreDialogUser} 님의 라운드 기록
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-6">
            {selectedUserScores === null ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-500 border-t-transparent" />
              </div>
            ) : selectedUserScores.length === 0 ? (
              <div className="text-center py-10 text-slate-500 font-medium">
                등록된 점수 기록이 없습니다.
              </div>
            ) : (
              <div className="space-y-6">
                {selectedUserScores.map((game, i) => (
                  <Card key={game.id || i} className="p-4 shadow-sm border border-slate-100 bg-slate-50/30">
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
                    
                    <div className="text-sm font-bold flex items-center gap-1 mb-3">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" /> {game.location || "위치 정보 없음"}
                    </div>

                    {game.stats && (
                      <div className="flex gap-2 mb-3 text-[11px] font-bold">
                        <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded">버디 {game.stats.birdies}</span>
                        <span className="bg-teal-50 text-teal-600 px-2 py-0.5 rounded">파 {game.stats.pars}</span>
                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded">보기 {game.stats.bogeys}</span>
                      </div>
                    )}

                    {game.holes && game.holes.length > 0 && (
                      <div className="text-[10px] sm:text-xs bg-white rounded border overflow-hidden shadow-inner">
                        {Array.from({ length: Math.ceil(game.holes.length / 9) }).map((_, chunkIndex) => {
                          const chunkHoles = game.holes!.slice(chunkIndex * 9, (chunkIndex + 1) * 9);
                          const chunkParTotal = chunkHoles.reduce((sum, h) => sum + (Number(h.par) || 0), 0);
                          const chunkScoreTotal = chunkHoles.reduce((sum, h) => sum + (Number(h.score) || 0), 0);

                          return (
                            <div key={chunkIndex} className={`${chunkIndex > 0 ? "border-t" : ""} overflow-x-auto`}>
                              <table className="w-full text-center border-collapse whitespace-nowrap">
                                <thead>
                                  <tr className="bg-slate-50">
                                    <th className="p-1 sm:p-1.5 border-b border-r text-slate-500 font-normal w-10 sm:w-12">
                                      {chunkIndex === 0 ? "전반" : "후반"}
                                    </th>
                                    {chunkHoles.map(h => (
                                      <th key={`hole-${h.hole}`} className="p-1 sm:p-1.5 border-b border-r text-slate-500 font-normal min-w-[24px] sm:min-w-[32px]">
                                        {h.hole}
                                      </th>
                                    ))}
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
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
