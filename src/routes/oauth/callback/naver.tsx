import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { verifyNaverToken } from "@/lib/auth/server-actions";
import { signInWithCustomFirebaseToken } from "@/lib/auth/providers";

export const Route = createFileRoute("/oauth/callback/naver")({
  component: NaverCallback,
});

function NaverCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get("code");
        const state = urlParams.get("state");

        if (!code || !state) throw new Error("No authorization code or state found");

        // Call server action to exchange code and get custom token
        const result = await verifyNaverToken({ data: { code, state } });

        if (result.error) {
          throw new Error(result.error);
        }

        const { customToken, email, nickname } = result;

        // Sign in to Firebase
        await signInWithCustomFirebaseToken(customToken, email, nickname);

        // Redirect to protected page
        navigate({ to: "/scores", replace: true });

      } catch (error) {
        console.error("Naver callback error:", error);
        alert("네이버 로그인에 실패했습니다.");
        navigate({ to: "/", replace: true });
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="text-center">
        <h2 className="text-lg font-semibold">네이버 로그인 처리 중...</h2>
        <p className="text-sm text-muted-foreground">잠시만 기다려주세요.</p>
      </div>
    </div>
  );
}
