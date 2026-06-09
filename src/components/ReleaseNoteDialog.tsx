import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { APP_VERSION, RELEASE_NOTES } from "@/lib/version";
import { Sparkles, Bug, Rocket } from "lucide-react";

export function ReleaseNoteDialog() {
  const [open, setOpen] = useState(false);
  const latestRelease = RELEASE_NOTES[0];

  useEffect(() => {
    if (!latestRelease) return;

    const lastSeenVersion = localStorage.getItem("lastSeenVersion");
    
    // Check if the version has changed
    if (lastSeenVersion !== APP_VERSION) {
      if (latestRelease.showPopup) {
        setOpen(true);
      } else {
        // Silently update if it's a minor patch that doesn't need a popup
        localStorage.setItem("lastSeenVersion", APP_VERSION);
      }
    }
  }, [latestRelease]);

  const handleClose = () => {
    localStorage.setItem("lastSeenVersion", APP_VERSION);
    setOpen(false);
  };

  if (!latestRelease) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md bg-white rounded-2xl overflow-hidden border-none shadow-2xl p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>새로운 소식</DialogTitle>
          <div id="dialog-description">익사이팅 볼링 클럽 업데이트 내역</div>
        </DialogHeader>
        <div className="bg-gradient-to-r from-teal-500 to-teal-600 px-6 py-8 text-center relative overflow-hidden" aria-describedby="dialog-description">
          <div className="absolute top-0 right-0 p-4 opacity-20">
            <Sparkles className="w-24 h-24 text-white" />
          </div>
          <h2 className="text-white text-2xl font-black mb-2 relative z-10 flex items-center justify-center gap-2">
            <Rocket className="w-6 h-6" />
            새로운 소식
          </h2>
          <p className="text-teal-50 font-medium relative z-10">
            익사이팅 볼링 클럽이 업데이트 되었습니다!
          </p>
          <div className="mt-4 inline-block bg-white/20 px-3 py-1 rounded-full text-white font-bold text-sm backdrop-blur-sm relative z-10">
            v{latestRelease.version}
          </div>
        </div>

        <div className="px-6 py-6 max-h-[60vh] overflow-y-auto">
          {latestRelease.features && latestRelease.features.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-teal-600 flex items-center gap-2 mb-3 uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                새로운 기능 & 개선사항
              </h3>
              <ul className="space-y-2">
                {latestRelease.features.map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="text-teal-500 mt-0.5">•</span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {latestRelease.bugfixes && latestRelease.bugfixes.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-amber-600 flex items-center gap-2 mb-3 uppercase tracking-wider">
                <Bug className="w-4 h-4" />
                버그 수정
              </h3>
              <ul className="space-y-2">
                {latestRelease.bugfixes.map((fix, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="text-amber-500 mt-0.5">•</span>
                    <span>{fix}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 bg-slate-50 border-t border-slate-100 sm:justify-center">
          <Button 
            onClick={handleClose}
            className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-white font-bold px-8 rounded-xl h-12"
          >
            확인하고 시작하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
