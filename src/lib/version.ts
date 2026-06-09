export const APP_VERSION = "1.0.0";

export interface ReleaseNote {
  version: string;
  date: string;
  showPopup: boolean;
  features: string[];
  bugfixes: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "1.0.0",
    date: "2026-06-09",
    showPopup: true, // 메이저/마이너 업데이트 시 true, 단순 버그 수정 시 false
    features: [
      "익사이팅 볼링 클럽 앱 정식 릴리스 (v1.0.0)",
      "나만의 볼링 점수 기록 및 캘린더 분석 기능",
      "구글 지도를 활용한 주변 볼링장 검색 및 연동",
      "실시간 최대 예상 점수(Max Possible Score) 계산 기능 추가",
      "새로운 릴리스 노트 팝업 기능 도입",
    ],
    bugfixes: [
      "점수 입력 인터페이스 편의성 개선",
    ],
  },
];
