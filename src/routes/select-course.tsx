import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { searchGolfClubs } from "@/lib/golfApi";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MapSearchDialog } from "@/components/MapSearchDialog";
import { MapPin } from "lucide-react";

export const Route = createFileRoute("/select-course")({
  component: SelectCoursePage,
});

function SelectCoursePage() {
  const [isMapOpen, setIsMapOpen] = useState(false);
  const navigate = useNavigate();



  const handleSelectCourse = async (courseName: string, placeId: string) => {
    try {
      const courseId = placeId || encodeURIComponent(courseName);
      navigate({ 
        to: "/scores", 
        search: { 
          courseId,
          courseName
        } 
      });
    } catch (error) {
      console.error("Failed to select golf course", error);
      navigate({ to: "/scores" });
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <Card className="w-full max-w-md p-8 sm:p-10 shadow-xl border-none bg-white text-center">
        <div className="mx-auto bg-teal-100 text-teal-600 w-16 h-16 rounded-full flex items-center justify-center mb-6">
          <MapPin className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">골프장 선택하기</h1>
        <p className="text-sm text-slate-500 mb-8">
          라운딩하실 골프장을 지도에서 검색하고 선택해주세요.
        </p>

        <Button 
          onClick={() => setIsMapOpen(true)}
          className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold h-12 text-base flex items-center justify-center gap-2"
        >
          지도에서 골프장 검색하기
        </Button>
      </Card>

      {/* Google Maps API Key가 로드되어야 작동합니다 */}
      <MapSearchDialog 
        open={isMapOpen} 
        onOpenChange={setIsMapOpen} 
        onSelectGolfCourse={handleSelectCourse} 
      />
    </main>
  );
}
