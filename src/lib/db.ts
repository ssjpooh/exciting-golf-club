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

export type Frame = {
  throws: string[];
  cumulative: number;
};

export type GameStats = {
  strikeCount: number;
  spareCount: number;
  openCount: number;
};

export type Score = {
  id?: string;
  userId: string;
  date: string;
  frames: Frame[];
  total: number;
  location?: string;
  memo?: string;
  matchType?: string;
  ballUsed?: string;
  stats: GameStats;
  createdAt?: unknown;
};

export type UserRole = "super_admin" | "master" | "staff" | "member";

export type Club = {
  id: string;
  name: string;
  code: string;
  club_owner: string; // 클럽장 UID
  createdAt: unknown;
};

export type ApprovalStatus = "PENDING_LEAVE" | "PENDING_JOIN" | "APPROVED" | "REJECTED";
export type ApprovalType = "JOIN" | "CHANGE";

export type ClubApprovalRequest = {
  id?: string;
  userId: string;
  userName: string;
  type: ApprovalType;
  status: ApprovalStatus;
  fromClubId?: string;
  fromClubName?: string;
  toClubId: string;
  toClubName: string;
  createdAt?: any;
  updatedAt?: any;
};


export type UserProfile = {
  uid: string;
  email: string;
  nickname: string;
  provider: string;
  role: UserRole;
  clubId?: string;
  clubName?: string;
  average: number;
  highScore: number;
  createdAt: unknown;
  lastLoginAt: unknown;
};

// 프레임 목록에서 스트라이크/스페어/오픈 개수 계산
function calculateStats(frames: Frame[]): GameStats {
  let strikeCount = 0;
  let spareCount = 0;
  let openCount = 0;

  for (let i = 0; i < 10; i++) {
    const f = frames[i];
    if (!f || !f.throws) continue;

    const throws = f.throws;

    // 1~9 프레임
    if (i < 9) {
      if (throws[0] === "X") strikeCount++;
      else if (throws[1] === "/") spareCount++;
      else openCount++;
    }
    // 10 프레임 (최대 3투구)
    else {
      let isStrikeOrSpare = false;
      for (const t of throws) {
        if (t === "X") {
          strikeCount++;
          isStrikeOrSpare = true;
        } else if (t === "/") {
          spareCount++;
          isStrikeOrSpare = true;
        }
      }
      if (!isStrikeOrSpare) {
        openCount++;
      }
    }
  }

  return { strikeCount, spareCount, openCount };
}

// 점수 저장
export async function saveScore(
  userId: string,
  data: Omit<Score, "userId" | "stats" | "id" | "createdAt">,
) {
  const stats = calculateStats(data.frames);
  
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
  const stats = calculateStats(data.frames);
  
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
    const timeA = (a.createdAt as any)?.seconds || new Date(a.date).getTime() / 1000;
    const timeB = (b.createdAt as any)?.seconds || new Date(b.date).getTime() / 1000;
    if (timeA !== timeB) {
      return timeB - timeA;
    }
    return b.date.localeCompare(a.date);
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

// 모든 클럽 가져오기
export async function getClubs(): Promise<Club[]> {
  try {
    console.log("Fetching all clubs from Firestore...");
    const clubsRef = collection(db, "clubs");
    // 정렬을 제거하여 필드가 누락된 예전 데이터도 모두 가져오도록 함
    const snapshot = await getDocs(clubsRef);
    
    if (snapshot.empty) {
      console.log("No clubs found in Firestore.");
      return [];
    }



    const clubs: Club[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      clubs.push({ 
        id: doc.id, 
        name: data.name || "Unknown",
        code: data.code || "0000",
        club_owner: data.club_owner || "",
        createdAt: data.createdAt || null,
      } as Club);
    });
    
    console.log(`Successfully fetched ${clubs.length} clubs.`);
    return clubs;
  } catch (error) {
    console.error("getClubs error:", error);
    throw error;
  }
}


// 클럽 추가 (슈퍼 관리자용)
export async function addClub(name: string) {
  try {
    const trimmedName = name.trim();
    const clubsRef = collection(db, "clubs");
    
    // 1. 중복 이름 체크
    const qName = query(clubsRef, where("name", "==", trimmedName));
    const snapName = await getDocs(qName);
    
    if (!snapName.empty) {
      throw new Error("ALREADY_EXISTS_NAME");
    }

    // 2. 자동 코드 생성 (0000-9999)
    const allClubsSnap = await getDocs(clubsRef);
    let maxCode = -1;
    
    allClubsSnap.forEach(doc => {
      const code = parseInt(doc.data().code);
      if (!isNaN(code) && code > maxCode) {
        maxCode = code;
      }
    });
    
    const nextCode = (maxCode + 1).toString().padStart(4, "0");
    if (maxCode >= 9999) {
      throw new Error("MAX_CLUB_LIMIT_REACHED");
    }

    // 3. 실제 쓰기 시도
    const docRef = await addDoc(clubsRef, {
      name: trimmedName,
      code: nextCode,
      club_owner: "", // 초기에는 클럽장 없음
      createdAt: serverTimestamp(),
    });
    
    console.log(`Success! Club created: ${trimmedName} (${nextCode})`);
    return docRef.id;
  } catch (error: any) {
    console.error("Critical error in addClub:", error);
    throw error;
  }
}





// 유저의 클럽 정보 업데이트
export async function updateUserClub(userId: string, clubId: string, clubName: string) {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    clubId,
    clubName,
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

  // 슈퍼 관리자로 지정할 이메일들
  const adminEmails = [
    "tlsejdzkzk@gmail.com",
    "tkdwnslpooh@gmail.com",
    "ssjpooh@kakao.com",
    "tlsejdzkzk1@naver.com",
    "shin.sangjun@icloud.com",
  ];
  const isTargetAdmin = user.email && adminEmails.includes(user.email);

  if (!userSnap.exists()) {
    // 최초 가입 시 기본 등급은 'member' (단, 관리자 메일은 super_admin)
    let role: UserRole = "member";
    if (isTargetAdmin) {
      role = "super_admin";
    }

    const initialNickname = user.displayName || user.email?.split("@")[0] || "회원";

    await setDoc(userRef, {
      uid: user.uid,
      email: user.email || "",
      nickname: initialNickname,
      provider,
      role,
      average: 0,
      highScore: 0,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
  } else {
    // 기존 유저 로그인 시간 갱신 및 관리자 등급 강제 업데이트
    const existingData = userSnap.data() as UserProfile;
    const updateData: any = {
      lastLoginAt: serverTimestamp(),
    };

    if (isTargetAdmin && existingData.role !== "super_admin") {
      updateData.role = "super_admin";
    }

    if (!existingData.nickname || existingData.nickname === "볼링러" || existingData.nickname === "회원") {
      const fallbackNickname = user.displayName || user.email?.split("@")[0];
      if (fallbackNickname && fallbackNickname !== "볼링러" && fallbackNickname !== "회원") {
        updateData.nickname = fallbackNickname;
      }
    }

    try {
      await updateDoc(userRef, updateData);
    } catch (e) {
      console.warn("Failed to update user login time/role on login (ignoring):", e);
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

// 클럽 이름 수정
export async function updateClubName(clubId: string, newName: string) {
  try {
    const trimmedName = newName.trim();
    const clubsRef = collection(db, "clubs");
    const qName = query(clubsRef, where("name", "==", trimmedName));
    const snapName = await getDocs(qName);
    
    if (!snapName.empty && snapName.docs.some(doc => doc.id !== clubId)) {
      throw new Error("ALREADY_EXISTS_NAME");
    }

    const clubRef = doc(db, "clubs", clubId);
    await updateDoc(clubRef, { name: trimmedName });

    const usersRef = collection(db, "users");
    const qUsers = query(usersRef, where("clubId", "==", clubId));
    const usersSnap = await getDocs(qUsers);
    
    const batch = writeBatch(db);
    usersSnap.forEach((userDoc) => {
      batch.update(userDoc.ref, { clubName: trimmedName });
    });
    await batch.commit();

    console.log(`Club name updated successfully to: ${trimmedName}`);
  } catch (error) {
    console.error("updateClubName error:", error);
    throw error;
  }
}

// --- 클럽 승인 시스템 함수 ---

// 승인 요청 생성
export async function createClubApprovalRequest(
  userId: string,
  userName: string,
  type: ApprovalType,
  toClubId: string,
  toClubName: string,
  fromClubId?: string,
  fromClubName?: string
) {
  // 이미 진행 중인 요청이 있는지 확인 (방어 로직)
  const activeReq = await getUserActiveApprovalRequest(userId);
  if (activeReq) {
    throw new Error("ALREADY_HAS_ACTIVE_REQUEST");
  }

  const status: ApprovalStatus = type === "JOIN" ? "PENDING_JOIN" : "PENDING_LEAVE";

  const reqData: Omit<ClubApprovalRequest, "id"> = {
    userId,
    userName,
    type,
    toClubId,
    toClubName,
    fromClubId,
    fromClubName,
    status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  
  // undefined 값이 있으면 Firebase 에러가 나므로 제거
  Object.keys(reqData).forEach(key => {
    if ((reqData as any)[key] === undefined) {
      delete (reqData as any)[key];
    }
  });

  const reqRef = collection(db, "approvals");
  const docRef = await addDoc(reqRef, reqData);
  return docRef.id;
}

// 특정 유저의 활성화된 승인 요청 조회
export async function getUserActiveApprovalRequest(userId: string): Promise<ClubApprovalRequest | null> {
  try {
    const reqRef = collection(db, "approvals");
    const q = query(reqRef, where("userId", "==", userId));
    const snap = await getDocs(q);
    
    for (const doc of snap.docs) {
      const data = doc.data() as ClubApprovalRequest;
      if (data.status === "PENDING_JOIN" || data.status === "PENDING_LEAVE") {
        return { id: doc.id, ...data };
      }
    }
  } catch (error) {
    console.error("getUserActiveApprovalRequest error (returning null):", error);
  }
  return null;
}

// 관리자 권한별 대기 중인 승인 요청 조회
export async function getPendingApprovalRequests(userRole: UserRole, userClubId?: string): Promise<ClubApprovalRequest[]> {
  const reqRef = collection(db, "approvals");
  const requests: ClubApprovalRequest[] = [];

  if (userRole === "super_admin") {
    // 슈퍼 관리자는 모든 PENDING_JOIN, PENDING_LEAVE 조회
    const qJoin = query(reqRef, where("status", "==", "PENDING_JOIN"));
    const qLeave = query(reqRef, where("status", "==", "PENDING_LEAVE"));
    const [snapJoin, snapLeave] = await Promise.all([getDocs(qJoin), getDocs(qLeave)]);
    
    snapJoin.forEach(doc => requests.push({ id: doc.id, ...doc.data() } as ClubApprovalRequest));
    snapLeave.forEach(doc => requests.push({ id: doc.id, ...doc.data() } as ClubApprovalRequest));
  } else if ((userRole === "master" || userRole === "staff") && userClubId) { 
    // 클럽장, 운영진은 자신의 클럽으로 오는 JOIN, 자신의 클럽에서 나가는 LEAVE 조회
    const qJoin = query(reqRef, where("toClubId", "==", userClubId));
    const qLeave = query(reqRef, where("fromClubId", "==", userClubId));
    
    const [snapJoin, snapLeave] = await Promise.all([getDocs(qJoin), getDocs(qLeave)]);
    snapJoin.forEach(doc => {
      const data = doc.data() as ClubApprovalRequest;
      if (data.status === "PENDING_JOIN") {
        requests.push({ id: doc.id, ...data } as ClubApprovalRequest);
      }
    });
    snapLeave.forEach(doc => {
      const data = doc.data() as ClubApprovalRequest;
      if (data.status === "PENDING_LEAVE") {
        requests.push({ id: doc.id, ...data } as ClubApprovalRequest);
      }
    });
  }

  // 최신순 정렬 (createdAt.seconds 처리 방어)
  return requests.sort((a, b) => {
    const timeA = a.createdAt?.seconds || 0;
    const timeB = b.createdAt?.seconds || 0;
    return timeB - timeA;
  });
}

// 승인 처리
export async function approveClubRequest(reqId: string, currentStatus: ApprovalStatus, toClubId: string, toClubName: string, userId: string) {
  const docRef = doc(db, "approvals", reqId);
  
  if (currentStatus === "PENDING_LEAVE") {
    // 기존 클럽 탈퇴 승인 -> 새 클럽 가입 대기 상태로 변경
    await updateDoc(docRef, {
      status: "PENDING_JOIN",
      updatedAt: serverTimestamp()
    });
  } else if (currentStatus === "PENDING_JOIN") {
    // 새 클럽 가입 승인 -> 최종 승인 상태로 변경 및 유저 정보 업데이트
    await updateDoc(docRef, {
      status: "APPROVED",
      updatedAt: serverTimestamp()
    });
    // 유저의 소속 클럽 업데이트
    await updateUserClub(userId, toClubId, toClubName);
  }
}

// 거절 처리
export async function rejectClubRequest(reqId: string) {
  const docRef = doc(db, "approvals", reqId);
  await updateDoc(docRef, {
    status: "REJECTED",
    updatedAt: serverTimestamp()
  });
}

