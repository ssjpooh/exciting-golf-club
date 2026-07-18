import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

export type HoleScore = {
  hole: number;
  par: number | "";
  score: number | "";
  putts?: number;
  distance?: number;
  strategy?: string;
  handicap?: number | "";
};

export type GameStats = {
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  worse: number;
  totalPutts: number;
};

export type Score = {
  id?: string;
  userId: string;
  date: string;
  holes: HoleScore[];
  total: number;
  location?: string;
  courseId?: string;
  memo?: string;
  matchType?: string;
  stats: GameStats;
  handicap?: number;
  netScore?: number;
  handicapType?: "none" | "total" | "hole" | "both";
  roundType?: RoundTypeCode;
  createdAt?: unknown;
};

// 라운딩 종류 (필드 / 스크린) - 저장은 코드로, 표시는 코드명으로
export type RoundTypeCode = "field" | "screen";

export const ROUND_TYPES: { code: RoundTypeCode; name: string }[] = [
  { code: "field", name: "필드" },
  { code: "screen", name: "스크린" },
];

export type GolfCourseHole = {
  hole: number;
  par: number;
  distance?: number;
  handicap?: number;
};

export type GolfCourse = {
  id: string;
  name: string;
  holeCount: number;
  totalPar: number;
  holes: GolfCourseHole[];
  createdAt?: unknown;
};

export type UserRole = "super_admin" | "master" | "staff" | "member";


export type UserProfile = {
  uid: string;
  email: string;
  nickname: string;
  provider: string;
  role: UserRole;
  average: number;
  highScore: number;
  handicap?: number;
  createdAt: unknown;
  lastLoginAt: unknown;
};

// 홀별 점수에서 버디, 파, 보기 등 계산
function calculateStats(holes: HoleScore[]): GameStats {
  let birdies = 0;
  let pars = 0;
  let bogeys = 0;
  let doubleBogeys = 0;
  let worse = 0;
  let totalPutts = 0;

  for (const h of holes) {
    if (!h.score) continue;
    const diff = Number(h.score) - (Number(h.par) || 0);
    if (diff < 0) birdies++;
    else if (diff === 0) pars++;
    else if (diff === 1) bogeys++;
    else if (diff === 2) doubleBogeys++;
    else worse++;

    if (h.putts) totalPutts += h.putts;
  }

  return { birdies, pars, bogeys, doubleBogeys, worse, totalPutts };
}

// 점수 저장
export async function saveScore(
  userId: string,
  data: Omit<Score, "userId" | "stats" | "id" | "createdAt">,
) {
  const stats = calculateStats(data.holes || []);
  
  // 클라이언트에서 넘어온 data에 id: undefined 가 포함되어 있으면 Firebase에서 에러가 나므로 제거
  const { id, ...restData } = data as any;
  
  const scoreData: Omit<Score, "id"> = {
    ...restData,
    userId,
    stats,
    createdAt: serverTimestamp(),
  };

  const scoresRef = collection(db, "scores");
  let docRef;
  try {
    docRef = await addDoc(scoresRef, scoreData);
  } catch (error: any) {
    console.error("[saveScore] addDoc 실패:", error);
    throw new Error("scores 컬렉션 추가 권한이 없습니다. (addDoc 실패)");
  }

  // 유저 통계(average, highScore) 갱신
  try {
    await syncUserStats(userId);
  } catch (error: any) {
    console.error("[saveScore] syncUserStats 실패:", error);
    // syncUserStats가 실패해도 점수는 이미 저장되었으므로 여기서 멈추지 않고 경고만 할 수도 있지만, 
    // 유저 스탯 동기화 실패도 권한 문제일 수 있으므로 에러를 던집니다.
    throw new Error("users 통계 업데이트 권한이 없거나 불러오기 실패. (syncUserStats 실패)");
  }

  return docRef.id;
}

// 점수 수정
export async function updateSavedScore(
  scoreId: string,
  userId: string,
  data: Omit<Score, "userId" | "stats" | "id" | "createdAt">,
) {
  const stats = calculateStats(data.holes || []);
  
  // 클라이언트에서 넘어온 data에 id: undefined 가 포함되어 있으면 Firebase에서 에러가 나므로 제거
  const { id, ...restData } = data as any;
  
  const scoreData = {
    ...restData,
    stats,
    updatedAt: serverTimestamp(),
  };

  const scoreRef = doc(db, "scores", scoreId);
  await updateDoc(scoreRef, scoreData);

  // 유저 통계(average, highScore) 갱신
  await syncUserStats(userId);
}

// 점수 삭제
export async function deleteSavedScore(scoreId: string, userId: string) {
  const scoreRef = doc(db, "scores", scoreId);
  await deleteDoc(scoreRef);

  // 유저 통계(average, highScore) 갱신
  await syncUserStats(userId);
}

export function sortScoresDesc(scores: Score[]): Score[] {
  return scores.sort((a, b) => {
    // Sort by date (YYYY-MM-DD) descending first
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    // If dates are same, fallback to createdAt timestamp descending
    const timeA = (a.createdAt as any)?.seconds || 0;
    const timeB = (b.createdAt as any)?.seconds || 0;
    return timeB - timeA;
  });
}

// 유저별 점수 가져오기
export async function getUserScores(userId: string): Promise<Score[]> {
  const scoresRef = collection(db, "scores");
  // 인덱스 생성 오류 방지를 위해 서버 정렬 대신 클라이언트 정렬 사용
  const q = query(scoresRef, where("userId", "==", userId));
  const snapshot = await getDocs(q);

  const scores: Score[] = [];
  snapshot.forEach((doc) => {
    scores.push({ id: doc.id, ...doc.data() } as Score);
  });

  // 등록일시(createdAt) 및 날짜순으로 클라이언트 사이드 내림차순 정렬
  return sortScoresDesc(scores);
}

// 유저의 통계 갱신 (모든 점수를 불러와 에버리지 및 최고 점수 계산)
export async function syncUserStats(userId: string) {
  try {
    const scoresRef = collection(db, "scores");
    const q = query(scoresRef, where("userId", "==", userId));
    const snapshot = await getDocs(q);

    let totalScore = 0;
    let highScore = 0;
    let count = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (typeof data.total === "number") {
        totalScore += data.total;
        count++;
        if (data.total > highScore) {
          highScore = data.total;
        }
      }
    });

    const average = count > 0 ? Math.round(totalScore / count) : 0;

    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, {
      average,
      highScore,
    });
  } catch (error) {
    console.error("Failed to update user stats (permission or read restriction):", error);
  }
}

// 유저 프로필 가져오기
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    return userSnap.data() as UserProfile;
  }
  return null;
}

// 유저 프로필 실시간 구독
export function subscribeUserProfile(
  userId: string,
  onUpdate: (profile: UserProfile | null) => void
) {
  const userRef = doc(db, "users", userId);
  return onSnapshot(
    userRef,
    (docSnap) => {
      if (docSnap.exists()) {
        onUpdate(docSnap.data() as UserProfile);
      } else {
        onUpdate(null);
      }
    },
    (error) => {
      console.error("subscribeUserProfile error:", error);
      onUpdate(null);
    }
  );
}

// 모든 유저 가져오기 (관리자 전용)
export async function getAllUsers(): Promise<UserProfile[]> {
  const usersRef = collection(db, "users");
  const snapshot = await getDocs(usersRef);
  const users: UserProfile[] = [];
  snapshot.forEach((doc) => {
    users.push(doc.data() as UserProfile);
  });
  return users;
}

// 모든 유저 등급 수정 (관리자 전용)
export async function updateUserRole(userId: string, newRole: UserRole) {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    role: newRole,
  });
}

// 유저 생성 또는 갱신 (로그인 시 호출)
export async function createOrUpdateUser(user: {
  uid: string;
  email: string | null;
  displayName: string | null;
  providerData: { providerId: string }[];
}) {
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  let provider = "email";
  if (user.providerData && user.providerData.length > 0) {
    provider = user.providerData[0].providerId.replace(".com", "");
  }

  // 슈퍼 관리자로 지정할 이메일 (scores.tsx isSuperAdminEmail / firestore.rules isAdminEmail과 동일하게 유지할 것)
  const adminEmails = ["tlsejdzkzk@gmail.com"];
  const isTargetAdmin = user.email && adminEmails.includes(user.email);

  if (!userSnap.exists()) {
    // 최초 가입 시 기본 등급은 'member' (단, 관리자 메일은 super_admin)
    let role: UserRole = "member";
    if (isTargetAdmin) {
      role = "super_admin";
    }

    const initialNickname = user.displayName || user.email?.split("@")[0] || "회원";

    const newUserDoc = {
      uid: user.uid,
      email: user.email || "",
      nickname: initialNickname,
      provider,
      role,
      average: 0,
      highScore: 0,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    };

    try {
      await setDoc(userRef, newUserDoc);
    } catch (e) {
      // 보안 규칙상 super_admin 자동 승급은 토큰에 이메일이 있는 로그인(구글/애플)만 가능.
      // 카카오/네이버(커스텀 토큰)는 거부될 수 있으므로 member로 생성하고, 승급은 관리자가 수동으로.
      if (role === "super_admin") {
        console.warn("super_admin 생성이 거부되어 member로 생성합니다:", e);
        await setDoc(userRef, { ...newUserDoc, role: "member" });
      } else {
        throw e;
      }
    }
  } else {
    // 기존 유저 로그인 시간 갱신 및 관리자 등급 강제 업데이트
    const existingData = userSnap.data() as UserProfile;
    const updateData: any = {
      lastLoginAt: serverTimestamp(),
    };

    // 카카오/네이버 등 메일 정보가 비어있었거나 갱신되었을 때 항상 메일 주소 최신화 보장
    if (user.email && existingData.email !== user.email) {
      updateData.email = user.email;
    }

    if (isTargetAdmin && existingData.role !== "super_admin") {
      updateData.role = "super_admin";
    }

    if (!existingData.nickname || existingData.nickname === "회원") {
      const fallbackNickname = user.displayName || user.email?.split("@")[0];
      if (fallbackNickname && fallbackNickname !== "회원") {
        updateData.nickname = fallbackNickname;
      }
    }

    try {
      await updateDoc(userRef, updateData);
    } catch (e) {
      // 보안 규칙상 role 자동 승급이 거부된 경우(카카오/네이버 커스텀 토큰), role 제외하고 재시도
      if (updateData.role) {
        try {
          const { role: _role, ...rest } = updateData;
          await updateDoc(userRef, rest);
        } catch (e2) {
          console.warn("Failed to update user login time on login (ignoring):", e2);
        }
      } else {
        console.warn("Failed to update user login time/role on login (ignoring):", e);
      }
    }
  }
}

// 유저 정보 삭제 (관리자 전용)
export async function deleteUserRecord(userId: string) {
  const userRef = doc(db, "users", userId);
  await deleteDoc(userRef);
}

// 유저 닉네임 수정 (관리자 전용)
export async function updateUserNickname(userId: string, newNickname: string) {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    nickname: newNickname,
  });
}

// 골프장 정보 단건 조회
export async function getGolfCourseFromDb(courseId: string): Promise<GolfCourse | null> {
  const courseRef = doc(db, "golf_courses", courseId);
  const courseSnap = await getDoc(courseRef);
  if (courseSnap.exists()) {
    return courseSnap.data() as GolfCourse;
  }
  return null;
}

// 신규 골프장 정보 저장
export async function saveGolfCourseToDb(course: GolfCourse): Promise<void> {
  const courseRef = doc(db, "golf_courses", course.id);
  await setDoc(courseRef, {
    ...course,
    createdAt: serverTimestamp(),
  });
}

// 유저 프로필 필드 직접 수정 (예: 핸디캡)
export async function updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<void> {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, data);
}


