import { createServerFn } from "@tanstack/react-start";
import * as jose from "jose";

import { getEvent } from "vinxi/http";

/**
 * 환경 변수를 찾는 헬퍼 함수 (Cloudflare Workers 호환성 확보)
 */
function getEnvVar(name: string): string | undefined {
  let val: string | undefined = undefined;

  // 1. Cloudflare Workers runtime env (via Vinxi/H3 event context)
  try {
    const event = getEvent();
    val = event?.context?.cloudflare?.env?.[name] || event?.context?.cloudflare?.env?.["VITE_" + name];
    if (val) return val;
  } catch (e) {
    // Not in request context or not supported
  }

  if (name === "VITE_KAKAO_REST_API_KEY") val = import.meta.env.VITE_KAKAO_REST_API_KEY;
  else if (name === "VITE_NAVER_CLIENT_ID") val = import.meta.env.VITE_NAVER_CLIENT_ID;
  else if (name === "VITE_NAVER_CLIENT_SECRET") val = import.meta.env.VITE_NAVER_CLIENT_SECRET;
  else if (name === "FIREBASE_SERVICE_ACCOUNT") val = (import.meta as any).env?.FIREBASE_SERVICE_ACCOUNT || (import.meta as any).env?.VITE_FIREBASE_SERVICE_ACCOUNT;

  if (val) return val;

  try {
    if (typeof process !== "undefined" && process.env) {
      val = process.env[name] || process.env["VITE_" + name];
    }
  } catch (e) {}

  if (val) return val;

  const glob = globalThis as any;
  val = glob?.process?.env?.[name] || glob?.process?.env?.["VITE_" + name] || glob?.[name] || glob?.["VITE_" + name] || glob?.env?.[name];
  
  if (val) return val;

  try {
    val = (import.meta as any).env?.[name] || (import.meta as any).env?.["VITE_" + name];
  } catch (e) {}

  return val;
}

/**
 * Cloudflare Workers 환경에서도 동작하는 수동 Firebase Custom Token 생성기
 */
async function generateCustomToken(uid: string) {
  const serviceAccountVar = getEnvVar("FIREBASE_SERVICE_ACCOUNT");
  
  if (!serviceAccountVar) {
    console.error("FIREBASE_SERVICE_ACCOUNT is missing");
    const glob = globalThis as any;
    const keys = glob.process?.env?.DEBUG_ENV_KEYS || "none";
    const debugInfo = `glob.process: ${!!glob.process}, glob.process.env: ${!!glob.process?.env}, KEYS: ${keys}, VITE_KAKAO in env: ${!!getEnvVar("VITE_KAKAO_REST_API_KEY")}, VITE_FIREBASE_API_KEY in env: ${!!getEnvVar("VITE_FIREBASE_API_KEY")}`;
    throw new Error(`SERVER_ERROR: FIREBASE_SERVICE_ACCOUNT is missing. Debug: ${debugInfo}`);
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountVar);
  } catch (e) {
    throw new Error("SERVER_ERROR: FIREBASE_SERVICE_ACCOUNT is not a valid JSON string.");
  }

  if (!serviceAccount || !serviceAccount.private_key) {
    throw new Error("SERVER_ERROR: FIREBASE_SERVICE_ACCOUNT is missing private_key.");
  }

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600; // 1시간 유효

  // PKCS8 형식의 프라이빗 키 임포트
  const privateKey = await jose.importPKCS8(serviceAccount.private_key, "RS256");

  // Firebase Custom Token (JWT) 서명
  const jwt = await new jose.SignJWT({
    uid: uid,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .setIssuer(serviceAccount.client_email)
    .setSubject(serviceAccount.client_email)
    .setAudience("https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit")
    .sign(privateKey);

  return jwt;
}

// 카카오 토큰 검증 및 커스텀 토큰 발급
export const verifyKakaoToken: any = createServerFn({ method: "POST" }).handler(
  async ({ data: { code, redirectUri } }: any) => {
    console.log("Starting verifyKakaoToken server function...");
    
    try {
      const apiKey = getEnvVar("VITE_KAKAO_REST_API_KEY");
      if (!apiKey) {
        throw new Error("SERVER_ERROR: VITE_KAKAO_REST_API_KEY is not defined in environment variables.");
      }

      // 1. 카카오 액세스 토큰 교환
      const tokenResponse = await fetch("https://kauth.kakao.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: apiKey,
          redirect_uri: redirectUri,
          code,
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        throw new Error(`KAKAO_TOKEN_ERROR: ${errorData}`);
      }
      const { access_token } = await tokenResponse.json();

      // 2. 카카오 유저 정보 조회
      const response = await fetch("https://kapi.kakao.com/v2/user/me", {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-type": "application/x-www-form-urlencoded;charset=utf-8",
        },
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`KAKAO_USER_INFO_ERROR: ${errorData}`);
      }

      const data = await response.json();
      const uid = `kakao:${data.id}`;
      const email = data.kakao_account?.email || null;
      const nickname = data.kakao_account?.profile?.nickname || data.properties?.nickname || null;

      // 3. Firebase 커스텀 토큰 직접 생성
      const customToken = await generateCustomToken(uid);
      return { customToken, email, nickname };
    } catch (error: any) {
      console.error("Kakao login server error:", error);
      return { error: error.message || "Unknown Kakao login error" };
    }
  },
);

// 네이버 토큰 검증 및 커스텀 토큰 발급
export const verifyNaverToken: any = createServerFn({ method: "POST" }).handler(
  async ({ data: { code, state } }: any) => {
    console.log("Starting verifyNaverToken server function...");
    try {
      const clientId = getEnvVar("VITE_NAVER_CLIENT_ID");
      const clientSecret = getEnvVar("VITE_NAVER_CLIENT_SECRET");
      
      if (!clientId || !clientSecret) {
        throw new Error("SERVER_ERROR: Naver Client ID or Secret is not defined in environment variables.");
      }

      // 1. 네이버 액세스 토큰 교환
      const tokenResponse = await fetch(
        `https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${clientId}&client_secret=${clientSecret}&code=${code}&state=${state}`,
      );
      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        throw new Error(`NAVER_TOKEN_ERROR: ${errorData}`);
      }
      const { access_token } = await tokenResponse.json();

      // 2. 네이버 유저 정보 조회
      const response = await fetch("https://openapi.naver.com/v1/nid/me", {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`NAVER_USER_INFO_ERROR: ${errorData}`);
      }

      const { response: data } = await response.json();
      const uid = `naver:${data.id}`;
      const email = data.email || null;
      const nickname = data.nickname || data.name || null;

      // 3. Firebase 커스텀 토큰 직접 생성
      const customToken = await generateCustomToken(uid);
      return { customToken, email, nickname };
    } catch (error: any) {
      console.error("Naver login server error:", error);
      return { error: error.message || "Unknown Naver login error" };
    }
  },
);
