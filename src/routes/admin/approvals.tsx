import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  getUserProfile,
  getPendingApprovalRequests,
  approveClubRequest,
  rejectClubRequest,
  UserProfile,
  ClubApprovalRequest,
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
import { ChevronLeft, RefreshCcw, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/approvals")({
  component: AdminApprovalsPage,
});

function AdminApprovalsPage() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<ClubApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate({ to: "/", replace: true });
        return;
      }

      const profile = await getUserProfile(user.uid);
      if (profile?.role !== "super_admin" && profile?.role !== "master" && profile?.role !== "staff") {
        toast.error("권한이 없습니다.");
        navigate({ to: "/scores", replace: true });
        return;
      }

      setCurrentUserProfile(profile);
      fetchRequests(profile);
    });

    return () => unsubscribe();
  }, [navigate]);

  const fetchRequests = async (profile: UserProfile) => {
    setLoading(true);
    try {
      const data = await getPendingApprovalRequests(profile.role, profile.clubId);
      setRequests(data);
    } catch (error) {
      toast.error("승인 요청 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (req: ClubApprovalRequest) => {
    if (!window.confirm(`'${req.userName}' 님의 요청을 승인하시겠습니까?`)) return;
    try {
      await approveClubRequest(req.id!, req.status, req.toClubId, req.toClubName, req.userId);
      toast.success("승인되었습니다.");
      if (currentUserProfile) fetchRequests(currentUserProfile);
    } catch (error) {
      toast.error("승인 처리에 실패했습니다.");
    }
  };

  const handleReject = async (req: ClubApprovalRequest) => {
    if (!window.confirm(`'${req.userName}' 님의 요청을 거절하시겠습니까?`)) return;
    try {
      await rejectClubRequest(req.id!);
      toast.success("거절되었습니다.");
      if (currentUserProfile) fetchRequests(currentUserProfile);
    } catch (error) {
      toast.error("거절 처리에 실패했습니다.");
    }
  };

  if (loading) {
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
              <h1 className="text-2xl font-black text-slate-900">승인 관리</h1>
              <p className="text-xs text-slate-500 font-medium">가입 및 클럽 변경 요청을 관리합니다.</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => currentUserProfile && fetchRequests(currentUserProfile)}
            className="h-10 w-10 bg-white"
          >
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </header>

        <Card className="border-none shadow-xl overflow-hidden bg-white/80 backdrop-blur-md">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead>사용자</TableHead>
                  <TableHead>요청 종류</TableHead>
                  <TableHead>현재 상태</TableHead>
                  <TableHead>상세 내용</TableHead>
                  <TableHead className="text-right">설정</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-20 text-slate-400 font-medium">
                      대기 중인 요청이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  requests.map((req) => (
                    <TableRow key={req.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="font-bold text-slate-800">{req.userName}</TableCell>
                      <TableCell>
                        {req.type === "JOIN" ? (
                          <span className="bg-teal-100 text-teal-700 px-2 py-0.5 rounded text-xs font-bold">신규 가입</span>
                        ) : (
                          <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs font-bold">클럽 변경</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {req.status === "PENDING_LEAVE" ? (
                          <span className="text-slate-500 text-xs font-bold">탈퇴 승인 대기</span>
                        ) : (
                          <span className="text-blue-500 text-xs font-bold">가입 승인 대기</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {req.type === "CHANGE" ? (
                          <span>
                            <span className="line-through text-slate-400 mr-1">{req.fromClubName}</span>
                            → <strong className="ml-1 text-teal-700">{req.toClubName}</strong>
                          </span>
                        ) : (
                          <span><strong className="text-teal-700">{req.toClubName}</strong> 가입 요청</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleApprove(req)}
                            className="h-8 border-teal-100 text-teal-600 hover:bg-teal-50"
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />
                            승인
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReject(req)}
                            className="h-8 border-red-100 text-red-500 hover:bg-red-50"
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            거절
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
    </div>
  );
}
