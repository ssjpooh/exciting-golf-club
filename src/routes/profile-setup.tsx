import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { 
  createOrUpdateUser,
  getUserProfile, 
  updateUserNickname, 
  createClubApprovalRequest, 
  getUserActiveApprovalRequest, 
  getClubs, 
  Club 
} from "@/lib/db";
import { toast } from "sonner";

export const Route = createFileRoute("/profile-setup")({
  component: ProfileSetupPage,
});

function ProfileSetupPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [nicknameInput, setNicknameInput] = useState("");
  const [selectedClubId, setSelectedClubId] = useState("");
  const [clubs, setClubs] = useState<Club[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    // 클럽 목록 로드
    getClubs().then(setClubs).catch(console.error);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // 로그인 안 되어 있으면 로그인 페이지로
        navigate({ to: "/", replace: true });
        return;
      }

      try {
        let profile = await getUserProfile(user.uid);
        if (!profile) {
          await createOrUpdateUser({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            providerData: user.providerData,
          });
          profile = await getUserProfile(user.uid);
        }

        if (profile) {
          const activeRequest = await getUserActiveApprovalRequest(user.uid);
          
          // 이미 클럽이 있거나 가입 대기 요청이 있다면 즉시 scores 페이지로 이동
          if (profile.clubId || activeRequest) {
            navigate({ to: "/scores", replace: true });
          } else {
            // 기본 닉네임 설정 (이전 정보 또는 소셜명, 이메일 아이디)
            setNicknameInput(profile.nickname || user.displayName || user.email?.split("@")[0] || "");
            setIsLoading(false);
          }
        }
      } catch (err) {
        console.error("Profile setup check error:", err);
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nicknameInput.trim()) {
      toast.error("이름을 입력해주세요.");
      return;
    }
    if (!selectedClubId) {
      toast.error("가입 신청할 클럽을 선택해주세요.");
      return;
    }

    setIsLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) return;

      const club = clubs.find((c) => c.id === selectedClubId);
      if (!club) return;

      // 1. 닉네임 업데이트
      try {
        await updateUserNickname(user.uid, nicknameInput.trim());
      } catch (err: any) {
        console.error("updateUserNickname failed:", err);
        throw new Error("닉네임 업데이트 권한 오류 (users 컬렉션): " + err.message);
      }

      // 2. 가입 요청 생성
      try {
        await createClubApprovalRequest(
          user.uid,
          nicknameInput.trim(),
          "JOIN",
          club.id,
          club.name
        );
      } catch (err: any) {
        console.error("createClubApprovalRequest failed:", err);
        throw new Error("가입 요청 생성 권한 오류 (approvals 컬렉션): " + err.message);
      }

      toast.success("프로필 설정 및 가입 신청이 완료되었습니다!");
      navigate({ to: "/scores", replace: true });
    } catch (err: any) {
      console.error("Save profile setup error:", err);
      toast.error("설정 저장에 실패했습니다: " + (err.message || err));
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-teal-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-teal-50 via-white to-amber-50 px-4 py-10">
      <Card className="w-full max-w-md p-8 sm:p-10 shadow-2xl border-none bg-white/80 backdrop-blur-sm">
        <header className="text-center mb-8">
          <div className="text-5xl mb-3">🎳</div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">프로필 및 클럽 가입</h1>
          <p className="text-xs text-slate-500 mt-2 font-medium">
            가입을 위해 회원님의 이름(닉네임)을 확인하고 <br />
            소속되실 볼링 클럽을 선택해 주세요.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="setup-nickname" className="text-xs font-bold text-slate-500 uppercase">
              이름 / 닉네임
            </Label>
            <Input
              id="setup-nickname"
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              placeholder="이름을 입력해 주세요"
              className="h-11 border-slate-200 focus:border-teal-500"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="setup-club" className="text-xs font-bold text-slate-500 uppercase">
              가입할 볼링 클럽
            </Label>
            <select
              id="setup-club"
              value={selectedClubId}
              onChange={(e) => setSelectedClubId(e.target.value)}
              className="flex h-11 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 font-medium"
              required
            >
              <option value="">클럽을 선택해 주세요</option>
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name}
                </option>
              ))}
            </select>
          </div>

          <Button
            type="submit"
            disabled={!nicknameInput.trim() || !selectedClubId}
            className="w-full h-12 bg-teal-600 hover:bg-teal-700 text-white font-black text-base shadow-lg shadow-teal-600/20 active:scale-[0.98] transition-all cursor-pointer mt-2"
          >
            설정 저장 및 가입 신청
          </Button>
        </form>
      </Card>
    </main>
  );
}

export default ProfileSetupPage;
