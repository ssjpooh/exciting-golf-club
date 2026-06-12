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
export async function getCourseDetails(courseId: string) {
  if (!API_KEY) {
    throw new Error("API 키가 설정되지 않았습니다.");
  }

  try {
    const searchName = decodeURIComponent(courseId);
    const response = await fetch(`${API_BASE_URL}/search?name=${encodeURIComponent(searchName)}`, {
      headers: {
        "Content-Type": "application/json",
        "x-rapidapi-host": "golf-course-api.p.rapidapi.com",
        "x-rapidapi-key": API_KEY
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log("[Golf API 코스 상세 결과]:", data); // 콘솔창 출력 추가
      
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
        id: courseData.name,
        name: courseData.name,
        holes: holes
      };
    } else {
      console.warn(`API 응답 오류 (${response.status}). 빈 코스 템플릿을 반환합니다.`);
      return {
        id: courseId,
        name: decodeURIComponent(courseId),
        holes: []
      };
    }
  } catch (error) {
    console.error("API 연결 실패:", error);
    return {
      id: courseId,
      name: decodeURIComponent(courseId),
      holes: []
    };
  }
}
