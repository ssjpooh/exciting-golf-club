const API_BASE_URL = "https://golfapi.io/api";
// env 파일에서 API 키를 가져옵니다. (설정되지 않았다면 빈 문자열)
const API_KEY = import.meta.env.VITE_GOLF_API_KEY || "";

/**
 * 1. 골프장 검색 API (이름이나 지역으로 검색)
 * - API 키가 없으면 개발용 더미 데이터를 반환합니다.
 */
export async function searchGolfClubs(keyword: string) {
  if (!API_KEY) {
    console.log(`[더미 데이터] "${keyword}" 검색 중...`);
    // 잠시 딜레이를 주어 실제 API처럼 동작하게 함
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return [
      { id: "test-1", name: "안양 베네스트 GC", location: "경기도 안양시" },
      { id: "test-2", name: "가평 베네스트 GC", location: "경기도 가평군" },
      { id: "test-3", name: "남서울 CC", location: "경기도 성남시" }
    ].filter(club => club.name.includes(keyword) || club.location.includes(keyword));
  }

  const response = await fetch(`${API_BASE_URL}/clubs?name=${keyword}`, {
    headers: { Authorization: `Bearer ${API_KEY}` }
  });
  return response.json(); 
}

/**
 * 2. 특정 골프장의 코스 및 홀 상세 정보 가져오기 API
 * - API 키가 없으면 18홀 더미 데이터를 생성하여 반환합니다.
 */
export async function getCourseDetails(courseId: string) {
  if (!API_KEY || courseId.startsWith("test-")) {
    console.log(`[더미 데이터] 코스 정보 가져오는 중... (ID: ${courseId})`);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      id: courseId,
      name: courseId === "test-1" ? "안양 베네스트 GC" : "테스트 골프장",
      // 1번 홀부터 18홀까지 랜덤 파(Par)와 거리 데이터를 생성
      holes: Array.from({ length: 18 }, (_, i) => ({
        hole: i + 1,
        par: [3, 4, 4, 4, 5][Math.floor(Math.random() * 5)], // 파 3~5 무작위
        distance: Math.floor(Math.random() * 200) + 150, // 150~350 야드 무작위
        handicap: Math.floor(Math.random() * 18) + 1
      }))
    };
  }

  const response = await fetch(`${API_BASE_URL}/courses/${courseId}`, {
    headers: { Authorization: `Bearer ${API_KEY}` }
  });
  return response.json();
}
