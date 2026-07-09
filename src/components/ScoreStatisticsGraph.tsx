import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, Legend, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";
import { Score } from "@/lib/db";

interface ScoreStatisticsGraphProps {
  games: Score[];
  fontSizePreset?: 'normal' | 'medium' | 'large' | 'huge';
}

export function ScoreStatisticsGraph({ games, fontSizePreset = 'normal' }: ScoreStatisticsGraphProps) {
  const [activeHoleTab, setActiveHoleTab] = useState<'9' | '18'>('18');

  // 9홀/18홀 별 게임 분류
  const categorizedGames = useMemo(() => {
    return games.filter(g => {
      const holeCount = g.holes?.length || 0;
      if (activeHoleTab === '9') {
        return holeCount === 9;
      } else {
        return holeCount === 18;
      }
    });
  }, [games, activeHoleTab]);

  // 날짜 기준 오름차순 정렬 및 데이터 매핑
  const sortedChartData = useMemo(() => {
    return [...categorizedGames]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(g => {
        const doublePars = g.holes?.filter(h => {
          const parVal = Number(h.par) || 0;
          const scoreVal = Number(h.score) || 0;
          return parVal > 0 && (scoreVal - parVal) === parVal;
        }).length || 0;

        const birdies = g.stats?.birdies || 0;
        const pars = g.stats?.pars || 0;
        const bogeys = g.stats?.bogeys || 0;

        const locationShort = g.location ? g.location.split("(")[0].trim().slice(0, 5) : "";
        const label = `${g.date.slice(5)} ${locationShort}`;

        return {
          name: label,
          fullDate: g.date,
          location: g.location || "기록 없음",
          totalScore: g.total,
          버디: birdies,
          파: pars,
          보기: bogeys,
          양파: doublePars,
        };
      });
  }, [categorizedGames]);

  // 요약 통계량 계산
  const { avgStats, totalGamesCount } = useMemo(() => {
    const count = categorizedGames.length;
    return {
      totalGamesCount: count,
      avgStats: {
        birdies: count > 0 ? (categorizedGames.reduce((sum, g) => sum + (g.stats?.birdies || 0), 0) / count).toFixed(1) : "0.0",
        pars: count > 0 ? (categorizedGames.reduce((sum, g) => sum + (g.stats?.pars || 0), 0) / count).toFixed(1) : "0.0",
        bogeys: count > 0 ? (categorizedGames.reduce((sum, g) => sum + (g.stats?.bogeys || 0), 0) / count).toFixed(1) : "0.0",
        doublePars: count > 0 ? (categorizedGames.reduce((sum, g) => {
          const dp = g.holes?.filter(h => {
            const parVal = Number(h.par) || 0;
            const scoreVal = Number(h.score) || 0;
            return parVal > 0 && (scoreVal - parVal) === parVal;
          }).length || 0;
          return sum + dp;
        }, 0) / count).toFixed(1) : "0.0"
      }
    };
  }, [categorizedGames]);

  // 폰트 크기 프리셋에 따른 클래스 적용
  let containerClass = "p-4 bg-white border border-slate-100 shadow-sm rounded-xl space-y-4";
  let titleClass = "text-sm font-bold text-slate-800 flex items-center justify-between";
  let tabBtnClass = "h-8 px-3 text-xs font-bold rounded-lg transition-all";
  let summaryGridClass = "grid grid-cols-4 gap-2 text-center";
  let summaryLabelClass = "text-[10px] font-bold text-slate-500 uppercase";
  let summaryValClass = "text-base font-black";
  let chartHeight = 240;

  if (fontSizePreset === "medium") {
    containerClass = "p-5 bg-white border border-slate-100 shadow-sm rounded-xl space-y-4.5";
    titleClass = "text-base font-bold text-slate-800 flex items-center justify-between";
    tabBtnClass = "h-9 px-4 text-sm font-bold rounded-lg transition-all";
    summaryLabelClass = "text-xs font-bold text-slate-500 uppercase";
    summaryValClass = "text-lg font-black";
    chartHeight = 260;
  } else if (fontSizePreset === "large") {
    containerClass = "p-6 bg-white border border-slate-200 shadow-md rounded-2xl space-y-5";
    titleClass = "text-lg font-black text-slate-800 flex items-center justify-between";
    tabBtnClass = "h-11 px-5 text-base font-black rounded-xl transition-all";
    summaryLabelClass = "text-sm font-black text-slate-600 uppercase";
    summaryValClass = "text-xl font-black";
    chartHeight = 300;
  } else if (fontSizePreset === "huge") {
    containerClass = "p-7 bg-white border-2 border-slate-200 shadow-lg rounded-2xl space-y-6";
    titleClass = "text-xl sm:text-2xl font-black text-slate-800 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between";
    tabBtnClass = "h-14 px-6 text-lg sm:text-xl font-black rounded-xl transition-all flex-1 text-center";
    summaryGridClass = "grid grid-cols-2 sm:grid-cols-4 gap-3 text-center";
    summaryLabelClass = "text-base font-black text-slate-600 uppercase";
    summaryValClass = "text-2xl font-black";
    chartHeight = 340;
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900/95 text-white p-3 rounded-lg shadow-xl border border-slate-800 text-xs font-bold space-y-1 z-30">
          <p className="text-slate-300 font-extrabold">{data.fullDate}</p>
          <p className="text-[11px] text-teal-400 font-bold truncate max-w-[200px]">{data.location}</p>
          <p className="text-[11px] text-white font-black border-t border-slate-800 pt-1 mt-1">총 스코어: {data.totalScore}타</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-1 text-[10px]">
            <span className="text-red-400">버디: {data.버디}개</span>
            <span className="text-teal-400">파: {data.파}개</span>
            <span className="text-amber-400">보기: {data.보기}개</span>
            <span className="text-blue-400">양파: {data.양파}개</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className={containerClass}>
      <div className={titleClass}>
        <span className="flex items-center gap-1.5 shrink-0">📈 스코어 통계 그래프</span>
        <div className={`shrink-0 ${fontSizePreset === "huge" ? "w-full mt-2" : ""}`}>
          <select
            value={activeHoleTab}
            onChange={(e) => setActiveHoleTab(e.target.value as '9' | '18')}
            className={`rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 font-bold cursor-pointer outline-none transition-colors ${
              fontSizePreset === "huge"
                ? "h-14 text-lg w-full"
                : fontSizePreset === "large"
                  ? "h-11 text-base w-32"
                  : fontSizePreset === "medium"
                    ? "h-9 text-sm w-28"
                    : "h-8 text-xs w-24"
            }`}
          >
            <option value="18">18홀 게임</option>
            <option value="9">9홀 게임</option>
          </select>
        </div>
      </div>

      {totalGamesCount === 0 ? (
        <div className="text-center py-6 text-slate-400 text-xs font-bold border border-dashed rounded-xl">
          해당 기간 내의 {activeHoleTab}홀 라운드 기록이 없습니다.
        </div>
      ) : (
        <>
          <div className={summaryGridClass}>
            <div className="bg-red-50/50 border border-red-100 p-2.5 rounded-xl">
              <div className={summaryLabelClass}>평균 버디</div>
              <div className={`${summaryValClass} text-red-600 mt-1`}>{avgStats.birdies}개</div>
            </div>
            <div className="bg-teal-50/50 border border-teal-100 p-2.5 rounded-xl">
              <div className={summaryLabelClass}>평균 파</div>
              <div className={`${summaryValClass} text-teal-600 mt-1`}>{avgStats.pars}개</div>
            </div>
            <div className="bg-amber-50/50 border border-amber-100 p-2.5 rounded-xl">
              <div className={summaryLabelClass}>평균 보기</div>
              <div className={`${summaryValClass} text-amber-600 mt-1`}>{avgStats.bogeys}개</div>
            </div>
            <div className="bg-blue-50/50 border border-blue-100 p-2.5 rounded-xl">
              <div className={summaryLabelClass}>평균 양파</div>
              <div className={`${summaryValClass} text-blue-600 mt-1`}>{avgStats.doublePars}개</div>
            </div>
          </div>

          <div className="w-full relative pt-2" style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={sortedChartData}
                margin={{ top: 10, right: 5, left: -25, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#64748b", fontSize: fontSizePreset === "huge" ? 14 : 10, fontWeight: "bold" }}
                  axisLine={{ stroke: "#cbd5e1" }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  domain={["dataMin - 5", "dataMax + 5"]}
                  tick={{ fill: "#64748b", fontSize: fontSizePreset === "huge" ? 14 : 10, fontWeight: "bold" }}
                  axisLine={{ stroke: "#cbd5e1" }}
                  tickLine={false}
                />
                <ChartTooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="top"
                  height={36}
                  iconSize={10}
                  iconType="circle"
                  wrapperStyle={{
                    fontSize: fontSizePreset === "huge" ? 14 : 11,
                    fontWeight: "bold",
                    color: "#475569"
                  }}
                />
                <Line type="natural" dataKey="totalScore" stroke="#0d9488" strokeWidth={2} name="총 스코어 (타)" activeDot={{ r: 6 }} dot={{ r: 4 }} />
                <Line type="natural" dataKey="버디" stroke="#ef4444" strokeWidth={2} name="버디" activeDot={{ r: 6 }} dot={{ r: 4 }} />
                <Line type="natural" dataKey="파" stroke="#14b8a6" strokeWidth={2} name="파" activeDot={{ r: 6 }} dot={{ r: 4 }} />
                <Line type="natural" dataKey="보기" stroke="#f59e0b" strokeWidth={2} name="보기" activeDot={{ r: 6 }} dot={{ r: 4 }} />
                <Line type="natural" dataKey="양파" stroke="#3b82f6" strokeWidth={2} name="양파" activeDot={{ r: 6 }} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}
