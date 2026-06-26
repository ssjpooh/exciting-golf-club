import { getGolfCourseFromDb } from "./db";

const API_BASE_URL = "https://golf-course-api.p.rapidapi.com";
// env 파일에서 API 키를 가져옵니다. (설정되지 않았다면 빈 문자열)
const API_KEY = import.meta.env.VITE_GOLF_API_KEY || "";

/**
 * 1. 골프장 검색 API (이름이나 지역으로 검색)
 * - API 키가 없으면 개발용 더미 데이터를 반환합니다.
 */
export async function searchGolfClubs(keyword: string) {
  if (!API_KEY) {
    console.error("API 키가 설정되지 않았습니다.");
    return [];
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/search?name=${encodeURIComponent(keyword)}`, {
      headers: {
        "Content-Type": "application/json",
        "x-rapidapi-host": "golf-course-api.p.rapidapi.com",
        "x-rapidapi-key": API_KEY
      }
    });
    if (response.ok) {
      const data = await response.json();
      console.log("[Golf API 검색 결과]:", data); // 콘솔창 출력 추가
      
      if (!Array.isArray(data)) {
        return [];
      }

      return data.map((c: any) => ({
        id: c.name, // Use name as ID for robust details fetching
        name: c.name,
        location: `${c.city || ""}, ${c.state || ""}`.trim()
      }));
    } else {
      console.error("API 응답 오류:", response.status);
      return [];
    }
  } catch (error) {
    console.error("API 연결 실패:", error);
    return [];
  }
}

/**
 * 2. 특정 골프장의 코스 및 홀 상세 정보 가져오기 API
 * - API 키가 없으면 18홀 더미 데이터를 생성하여 반환합니다.
 */
export async function getCourseDetails(courseId: string, courseName?: string) {
  // 1순위: DB에 이미 등록되어 있는지 확인
  try {
    const dbCourse = await getGolfCourseFromDb(courseId);
    if (dbCourse) {
      console.log("[Golf API] DB에서 골프장 정보 로드 성공:", dbCourse);
      return {
        id: dbCourse.id,
        name: dbCourse.name,
        holes: dbCourse.holes
      };
    }
  } catch (dbError) {
    console.error("[Golf API] DB 조회 중 오류 발생 (API Fallback 시도):", dbError);
  }

  const searchName = courseName || decodeURIComponent(courseId);

  // 2순위: API를 사용한 조회 (Fallback)
  // 구글 플레이스 ID(보통 ChIJ... 형태)이고 courseName이 없으면 검색할 수 없으므로 바로 패스
  if (!API_KEY || (courseId.startsWith("ChIJ") && !courseName)) {
    console.warn("API 키가 없거나 플레이스 ID만 있어 검색할 수 없습니다. 빈 코스 템플릿을 반환합니다.");
    return {
      id: courseId,
      name: searchName,
      holes: []
    };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/search?name=${encodeURIComponent(searchName)}`, {
      headers: {
        "Content-Type": "application/json",
        "x-rapidapi-host": "golf-course-api.p.rapidapi.com",
        "x-rapidapi-key": API_KEY
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log("[Golf API 코스 상세 결과]:", data);
      
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("No course details found");
      }

      const courseData = data[0];
      
      let holes = [];
      if (courseData.scorecard && Array.isArray(courseData.scorecard)) {
        holes = courseData.scorecard.map((h: any) => {
          let distance = 300; // default fallback
          if (h.tees) {
            const teeKeys = Object.keys(h.tees);
            if (teeKeys.length > 0) {
              distance = h.tees[teeKeys[0]].yards || distance;
            }
          }
          return {
            hole: h.Hole,
            par: h.Par,
            distance: distance,
            handicap: h.Handicap || 0
          };
        });
      }

      return {
        id: courseId, // 맵에서 받은 고유 플레이스 ID 유지
        name: courseData.name,
        holes: holes
      };
    } else {
      console.warn(`API 응답 오류 (${response.status}). 빈 코스 템플릿을 반환합니다.`);
      return {
        id: courseId,
        name: searchName,
        holes: []
      };
    }
  } catch (error) {
    console.error("API 연결 실패:", error);
    return {
      id: courseId,
      name: searchName,
      holes: []
    };
  }
}
