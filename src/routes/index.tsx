import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signInWithGoogle, signInWithApple, signInAnonymouslyUser } from "@/lib/auth/providers";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Plus, LogOut } from "lucide-react";
import { 
  createOrUpdateUser, 
  getUserProfile, 
  getUserActiveApprovalRequest 
} from "@/lib/db";

export const Route = createFileRoute("/")({
  component: LoginPage,
});

function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // 로그인 상태 및 프로필 완성도 체크
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsLoading(true);
        try {
          let profile = await getUserProfile(user.uid);
          if (!profile) {
            // 최초 로그인 시 레이스 컨디션 방지를 위해 문서가 없으면 바로 생성
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
            
            // 이름과 클럽 선택 정보가 없으면 가입 정보 설정 화면 활성화
            if (!profile.clubId && !activeRequest) {
              navigate({ to: "/profile-setup", replace: true });
            } else {
              navigate({ to: "/scores", replace: true });
            }
          }
        } catch (err) {
          console.error("Profile check error:", err);
        } finally {
          setIsLoading(false);
        }
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    try {
      const user = await signInAnonymouslyUser();
      // 익명 로그인 시에도 Firestore 프로필을 미리 생성하여 scores 페이지에서의 레이스 컨디션을 방지합니다.
      await createOrUpdateUser({
        uid: user.uid,
        email: null,
        displayName: "익명 회원",
        providerData: [],
      });
      // createOrUpdateUser 완료 후 onAuthStateChanged가 흐름을 처리하도록 함
    } catch (error) {
      console.error("Login failed", error);
      alert("로그인에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const isKakao = () => {
    if (typeof window === "undefined") return false;
    return /KAKAOTALK/i.test(navigator.userAgent);
  };

  const handleSocialLogin = async (provider: Provider) => {
    if (isLoading) return;

    if (provider === "google" && isKakao()) {
      const url = window.location.href;
      window.location.href = `kakaotalk://web/openExternalApp?url=${encodeURIComponent(url)}`;
      return;
    }

    setIsLoading(true);
    try {
      if (provider === "google") {
        await signInWithGoogle();
        // onAuthStateChanged에서 감지하여 이동/설정 처리하므로 별도 navigate 제거
      } else if (provider === "apple") {
        await signInWithApple();
      } else if (provider === "kakao") {
        const redirectUri = `${window.location.origin}/oauth/callback/kakao`;
        const kakaoUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${import.meta.env.VITE_KAKAO_REST_API_KEY}&redirect_uri=${redirectUri}&response_type=code`;
        window.location.href = kakaoUrl;
      } else if (provider === "naver") {
        const redirectUri = `${window.location.origin}/oauth/callback/naver`;
        const state = Math.random().toString(36).substring(7);
        const naverUrl = `https://nid.naver.com/oauth2.0/authorize?client_id=${import.meta.env.VITE_NAVER_CLIENT_ID}&response_type=code&redirect_uri=${redirectUri}&state=${state}`;
        window.location.href = naverUrl;
      }
    } catch (error) {
      console.error(`Login with ${provider} failed`, error);
      alert("로그인에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-teal-50 via-white to-amber-50 px-4 py-10">
      <Card className="w-full max-w-md p-8 sm:p-10 shadow-2xl border-none bg-white/80 backdrop-blur-sm">
        <header className="text-center mb-10">
          <div className="text-6xl mb-4 animate-bounce">⛳</div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">
            은주는
            <br />
            골프왕
          </h1>
          <p className="text-sm text-slate-500 mt-3 font-medium">
            로그인하고 나만의 골프 기록을 관리하세요!
          </p>
        </header>

        <div className="space-y-3">
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-100" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold text-slate-400">
              <span className="bg-white px-3">SNS 계정으로 시작하기</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {/* 
            <SocialButton
              provider="kakao"
              label="카카오톡으로 시작하기"
              onClick={() => handleSocialLogin("kakao")}
              isLoading={isLoading}
            />
            <SocialButton
              provider="naver"
              label="네이버로 시작하기"
              onClick={() => handleSocialLogin("naver")}
              isLoading={isLoading}
            />
            */}
            <SocialButton
              provider="google"
              label="구글 계정으로 시작하기"
              onClick={() => handleSocialLogin("google")}
              isLoading={isLoading}
            />
            {/* 애플 개발자 계정이 없으므로 임시로 숨김 처리 */}
            {/* <SocialButton
              provider="apple"
              label="Apple로 시작하기"
              onClick={() => handleSocialLogin("apple")}
              isLoading={isLoading}
            /> */}
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-400 mt-10 leading-relaxed">
          로그인 시 서비스 이용약관 및 <br />
          개인정보 처리방침에 동의하는 것으로 간주됩니다.
        </p>
      </Card>

      {/* PWA 설치 안내 섹션 */}
      <PWAInstallSection />
    </main>
  );
}

function PWAInstallSection() {
  const [showInstall, setShowInstall] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 이미 PWA 앱으로 실행 중인지 확인
    if (window.matchMedia("(display-mode: standalone)").matches) {
      return;
    }

    // 이전에 설치했거나 닫기(X)를 누른 적이 있는지 확인
    const installed = localStorage.getItem("pwa-installed");
    const dismissed = localStorage.getItem("pwa-dismissed");
    if (installed === "true" || dismissed === "true") {
      setIsDismissed(true);
      return;
    }

    const ua = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua);
    const safari =
      ua.includes("safari") &&
      !ua.includes("chrome") &&
      !ua.includes("crios") &&
      !ua.includes("kakaotalk");

    setIsIOS(ios);
    setIsSafari(safari);

    if ((window as any).deferredPrompt) {
      setShowInstall(true);
    }

    const handleInstallAvailable = () => setShowInstall(true);
    const handleAppInstalled = () => {
      localStorage.setItem("pwa-installed", "true");
      setShowInstall(false);
    };

    window.addEventListener("pwa-install-available", handleInstallAvailable);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("pwa-install-available", handleInstallAvailable);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    const promptEvent = (window as any).deferredPrompt;
    if (!promptEvent) return;

    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    
    if (outcome === "accepted") {
      localStorage.setItem("pwa-installed", "true");
    }
    
    (window as any).deferredPrompt = null;
    setShowInstall(false);
  };

  const handleDismiss = () => {
    localStorage.setItem("pwa-dismissed", "true");
    setShowInstall(false);
    setIsDismissed(true);
  };

  if (isDismissed) return null;

  if (isIOS) {
    return (
      <Card className="mt-8 w-full max-w-md p-5 bg-gradient-to-br from-teal-50 to-white border-teal-100 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
        <button onClick={handleDismiss} className="absolute top-3 right-3 text-teal-400 hover:text-teal-700">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <div className="flex items-start gap-4 text-left pt-1">
          <div className="bg-teal-600 p-2 rounded-xl text-white shadow-md shadow-teal-600/20 mt-1">
            <Plus className="w-5 h-5" />
          </div>
          <div className="space-y-2 pr-4">
            <h4 className="text-sm font-black text-teal-900 leading-none">
              앱으로 설치해서 더 편하게!
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
      <Card className="mt-8 w-full max-w-md p-5 bg-teal-600 text-white border-none shadow-xl shadow-teal-600/20 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
        <button onClick={handleDismiss} className="absolute top-2 right-2 text-teal-200 hover:text-white p-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <div className="flex items-center justify-between gap-4 text-left pt-2">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
              <Plus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="text-sm font-bold tracking-tight">홈 화면에 앱 추가</h4>
              <p className="text-[11px] text-teal-50 opacity-80">
                설치하면 주소창 없이 앱처럼 깔끔하게 써요!
              </p>
            </div>
          </div>
          <Button
            onClick={handleInstallClick}
            size="sm"
            className="bg-white text-teal-600 hover:bg-teal-50 font-bold whitespace-nowrap"
          >
            지금 설치
          </Button>
        </div>
      </Card>
    );
  }

  return null;
}

type Provider = "google" | "apple" | "kakao" | "naver";

function SocialButton({
  provider,
  label,
  onClick,
  isLoading,
}: {
  provider: Provider;
  label: string;
  onClick: () => void;
  isLoading: boolean;
}) {
  const styles: Record<Provider, string> = {
    google: "bg-white text-black border border-border hover:bg-secondary",
    apple: "bg-black text-white hover:bg-black/90",
    kakao: "bg-[#FEE500] text-black hover:bg-[#FEE500]/90",
    naver: "bg-[#03C75A] text-white hover:bg-[#03C75A]/90",
  };

  const icons: Record<Provider, React.ReactNode> = {
    google: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"
        />
      </svg>
    ),
    apple: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
        <path d="M16.365 1.43c0 1.14-.46 2.23-1.21 3.02-.81.85-2.13 1.5-3.22 1.41-.14-1.12.42-2.27 1.17-3.04.83-.85 2.24-1.48 3.26-1.39zM20.5 17.36c-.56 1.29-.83 1.86-1.55 3-1 1.59-2.41 3.57-4.16 3.59-1.55.02-1.95-1.01-4.06-1-2.11.01-2.55 1.02-4.1 1-1.75-.02-3.09-1.81-4.09-3.4-2.79-4.45-3.08-9.67-1.36-12.45 1.22-1.97 3.15-3.13 4.96-3.13 1.84 0 3 1.01 4.52 1.01 1.48 0 2.38-1.01 4.51-1.01 1.61 0 3.31.88 4.52 2.39-3.97 2.18-3.32 7.86.81 9.99z" />
      </svg>
    ),
    kakao: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
        <path d="M12 3C6.48 3 2 6.48 2 10.8c0 2.79 1.86 5.24 4.66 6.62-.2.71-.74 2.66-.85 3.07-.13.51.19.5.4.36.16-.11 2.61-1.77 3.66-2.49.7.1 1.41.16 2.13.16 5.52 0 10-3.48 10-7.72S17.52 3 12 3z" />
      </svg>
    ),
    naver: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
        <path d="M16.273 12.845 7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727z" />
      </svg>
    ),
  };

  return (
    <Button
      type="button"
      disabled={isLoading}
      onClick={onClick}
      className={`w-full gap-2 cursor-pointer ${styles[provider]} ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
      aria-label={`${label}로 로그인`}
    >
      {isLoading ? (
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icons[provider]
      )}
      <span className="text-sm">{label}</span>
    </Button>
  );
}
