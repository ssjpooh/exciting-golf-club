// 카카오 JavaScript SDK 로더 + 친구 초대(공유) 헬퍼
// 로그인은 REST API 키를 쓰지만, 공유하기(Kakao.Share)는 JavaScript 키를 사용한다.
// 카카오 개발자 콘솔 > 앱 설정 > 플랫폼 > Web 에 서비스 도메인이 등록되어 있어야 동작한다.

const KAKAO_SDK_URL = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";

declare global {
  interface Window {
    Kakao?: any;
  }
}

let sdkPromise: Promise<void> | null = null;

function loadKakaoSdk(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("브라우저 환경이 아닙니다."));
  }
  if (window.Kakao) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = KAKAO_SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("카카오 SDK를 불러오지 못했습니다."));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

async function ensureKakao(): Promise<any> {
  await loadKakaoSdk();
  const Kakao = window.Kakao;
  if (!Kakao) throw new Error("카카오 SDK를 사용할 수 없습니다.");

  const jsKey = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY;
  if (!jsKey) throw new Error("카카오 JavaScript 키가 설정되지 않았습니다.");

  if (!Kakao.isInitialized()) {
    Kakao.init(jsKey);
  }
  return Kakao;
}

// 카카오톡 공유창을 띄워 친구에게 앱 초대 링크를 보낸다.
export async function inviteFriendsViaKakao() {
  const Kakao = await ensureKakao();
  const url = window.location.origin;

  Kakao.Share.sendDefault({
    objectType: "feed",
    content: {
      title: "은주는 골프왕 ⛳",
      description: "골프 스코어를 기록하고 통계로 분석해요. 같이 골프왕에 도전해요!",
      imageUrl: `${url}/icon.png`,
      link: {
        mobileWebUrl: url,
        webUrl: url,
      },
    },
    buttons: [
      {
        title: "앱에서 시작하기",
        link: {
          mobileWebUrl: url,
          webUrl: url,
        },
      },
    ],
  });
}
