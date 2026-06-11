const API_BASE_URL = "https://api.golfcourseapi.com/v1";
// env 파일에서 API 키를 가져옵니다. (설정되지 않았다면 빈 문자열)
const API_KEY = import.meta.env.VITE_GOLF_API_KEY || "";

/**
 * 1. 골프장 검색 API (이름이나 지역으로 검색)
 * - API 키가 없으면 개발용 더미 데이터를 반환합니다.
 */
export async function searchGolfClubs(keyword: string) {
  if (API_KEY) {
    try {
      const response = await fetch(`${API_BASE_URL}/search?search_query=${encodeURIComponent(keyword)}`, {
        headers: { "Authorization": `Key ${API_KEY}` }
      });
      if (response.ok) {
        const data = await response.json();
        return data.courses.map((c: any) => ({
          id: c.id.toString(),
          name: `${c.club_name} - ${c.course_name}`,
          location: `${c.location.city}, ${c.location.state}`
        }));
      }
    } catch (error) {
      console.error("API 연결 실패, 더미 데이터로 대체합니다:", error);
    }
  }

  console.log(`[더미 데이터] "${keyword}" 검색 중...`);
  // 잠시 딜레이를 주어 실제 API처럼 동작하게 함
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return [
    { id: "test-1", name: "안양 베네스트 GC", location: "경기도 안양시" },
    { id: "test-2", name: "가평 베네스트 GC", location: "경기도 가평군" },
    { id: "test-3", name: "남서울 CC", location: "경기도 성남시" }
  ].filter(club => club.name.includes(keyword) || club.location.includes(keyword));
}

/**
 * 2. 특정 골프장의 코스 및 홀 상세 정보 가져오기 API
 * - API 키가 없으면 18홀 더미 데이터를 생성하여 반환합니다.
 */
export async function getCourseDetails(courseId: string) {
  if (API_KEY && !courseId.startsWith("test-")) {
    try {
      const response = await fetch(`${API_BASE_URL}/courses/${courseId}`, {
        headers: { "Authorization": `Key ${API_KEY}` }
      });
      if (response.ok) {
        const responseData = await response.json();
        // API 응답이 { course: { ... } } 형태로 올 수 있으므로 처리
        const courseData = responseData.course || responseData;
        
        // 남성 티박스 중 첫 번째를 기준으로 정보를 구성합니다.
        let holes = [];
        let defaultTee = null;
        if (courseData.tees && courseData.tees.male && courseData.tees.male.length > 0) {
          defaultTee = courseData.tees.male[0];
          holes = defaultTee.holes.map((h: any, index: number) => ({
            hole: index + 1,
            par: h.par,
            distance: h.yardage, // 야드(Yard) 단위를 거리로 사용
            handicap: h.handicap
          }));
        }

        // API 응답에 명시된 홀 수(number_of_holes)가 있거나, 
        // 10번 홀 이후의 데이터가 비정상(예: par가 0)일 경우 9홀로 판단하여 자릅니다.
        const apiHoleCount = defaultTee?.number_of_holes || courseData.holes || courseData.hole_count;
        const validHoles = holes.filter(h => h.par && h.par > 0);
        
        if (apiHoleCount === 9 || (apiHoleCount == null && validHoles.length <= 9)) {
          holes = holes.slice(0, 9);
        }

        return {
          id: courseData.id.toString(),
          name: `${courseData.club_name} - ${courseData.course_name}`,
          holes: holes
        };
      }
    } catch (error) {
      console.error("API 연결 실패, 더미 데이터로 대체합니다:", error);
    }
  }

  console.log(`[더미 데이터] 코스 정보 가져오는 중... (ID: ${courseId})`);
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const decodedName = courseId === "test-1" ? "안양 베네스트 GC" : 
                      courseId === "test-2" ? "가평 베네스트 GC" : 
                      courseId === "test-3" ? "남서울 CC" : decodeURIComponent(courseId);

  return {
    id: courseId,
    name: decodedName,
    // 더미 데이터 생성 (API 연동이 안 된 경우 기본 18홀)
    holes: Array.from({ length: 18 }, (_, i) => ({
      hole: i + 1,
      par: [3, 4, 4, 4, 5][Math.floor(Math.random() * 5)], // 파 3~5 무작위
      distance: Math.floor(Math.random() * 200) + 150, // 150~350 야드 무작위
      handicap: Math.floor(Math.random() * 18) + 1
    }))
  };
}
