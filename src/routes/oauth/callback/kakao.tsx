import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { verifyKakaoToken } from "@/lib/auth/server-actions";
import { signInWithCustomFirebaseToken } from "@/lib/auth/providers";

export const Route = createFileRoute("/oauth/callback/kakao")({
  component: KakaoCallback,
});

function KakaoCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get("code");

        if (!code) throw new Error("No authorization code found");

        const redirectUri = `${window.location.origin}/oauth/callback/kakao`;

        // Call server action to exchange code and get custom token
        const result = await verifyKakaoToken({ data: { code, redirectUri } });

        if (result.error) {
          throw new Error(result.error);
        }

        const { customToken, email, nickname } = result;

        // Sign in to Firebase
        await signInWithCustomFirebaseToken(customToken, email, nickname);

        // Redirect to protected page
        navigate({ to: "/scores", replace: true });

      } catch (error: any) {
        console.error("Kakao callback error:", error);
        alert(`카카오 로그인에 실패했습니다.\n사유: ${error?.message || error}`);
        navigate({ to: "/", replace: true });
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="text-center">
        <h2 className="text-lg font-semibold">카카오 로그인 처리 중...</h2>
        <p className="text-sm text-muted-foreground">잠시만 기다려주세요.</p>
      </div>
    </div>
  );
}
