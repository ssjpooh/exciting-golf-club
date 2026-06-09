import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithCustomToken,
  signInAnonymously,
} from "firebase/auth";
import { auth } from "../firebase";
import { createOrUpdateUser } from "../db";

export const signInAnonymouslyUser = async () => {
  try {
    const result = await signInAnonymously(auth);
    return result.user;
  } catch (error) {
    console.error("Anonymous sign-in failed", error);
    throw error;
  }
};

export const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    await createOrUpdateUser({
      uid: result.user.uid,
      email: result.user.email,
      displayName: result.user.displayName,
      providerData: result.user.providerData,
    });
    return result.user;
  } catch (error) {
    console.error("Google sign-in error:", error);
    throw error;
  }
};

export const signInWithApple = async () => {
  const provider = new OAuthProvider("apple.com");
  try {
    const result = await signInWithPopup(auth, provider);
    await createOrUpdateUser({
      uid: result.user.uid,
      email: result.user.email,
      displayName: result.user.displayName,
      providerData: result.user.providerData,
    });
    return result.user;
  } catch (error) {
    console.error("Apple sign-in error:", error);
    throw error;
  }
};

export const signInWithCustomFirebaseToken = async (
  customToken: string,
  fallbackEmail?: string | null,
  fallbackDisplayName?: string | null
) => {
  try {
    const result = await signInWithCustomToken(auth, customToken);
    await createOrUpdateUser({
      uid: result.user.uid,
      email: result.user.email || fallbackEmail || null,
      displayName: result.user.displayName || fallbackDisplayName || null,
      providerData: result.user.providerData,
    });
    return result.user;
  } catch (error) {
    console.error("Custom token sign-in error:", error);
    throw error;
  }
};
