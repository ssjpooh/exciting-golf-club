const API_BASE_URL = "https://api.golfcourseapi.com/v1";
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
    const response = await fetch(`${API_BASE_URL}/search?search_query=${encodeURIComponent(keyword)}`, {
      headers: { "Authorization": `Key ${API_KEY}` }
    });
    if (response.ok) {
      const data = await response.json();
      console.log("[Golf API 검색 결과]:", data); // 콘솔창 출력 추가
      return data.courses.map((c: any) => ({
        id: c.id.toString(),
        name: `${c.club_name} - ${c.course_name}`,
        location: `${c.location.city}, ${c.location.state}`
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
    const response = await fetch(`${API_BASE_URL}/courses/${courseId}`, {
      headers: { "Authorization": `Key ${API_KEY}` }
    });
    
    if (response.ok) {
      const responseData = await response.json();
      console.log("[Golf API 코스 상세 결과]:", responseData); // 콘솔창 출력 추가
      
      const courseData = responseData.course || responseData;
      
      let holes = [];
      let defaultTee = null;
      if (courseData.tees && courseData.tees.male && courseData.tees.male.length > 0) {
        defaultTee = courseData.tees.male[0];
        holes = defaultTee.holes.map((h: any, index: number) => ({
          hole: index + 1,
          par: h.par,
          distance: h.yardage,
          handicap: h.handicap
        }));
      }

      const apiHoleCount = defaultTee?.number_of_holes || courseData.holes || courseData.hole_count;
      const validHoles = holes.filter((h: any) => h.par && h.par > 0);
      
      if (apiHoleCount === 9 || (apiHoleCount == null && validHoles.length <= 9)) {
        holes = holes.slice(0, 9);
      }

      return {
        id: courseData.id.toString(),
        name: `${courseData.club_name} - ${courseData.course_name}`,
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
