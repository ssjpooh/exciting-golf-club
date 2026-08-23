import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Score, RoundTypeCode } from "@/lib/db";

interface RoundTypeAverageCardProps {
  /** 기간·골프장 필터만 적용된 기록 (라운딩 타입 필터는 적용하지 않음 - 필드/스크린을 나란히 비교하기 위함) */
  games: Score[];
  fontSizePreset?: 'normal' | 'medium' | 'large' | 'huge';
  /** 조회 옵션 바에서 선택된 라운딩 타입 (해당 타일을 강조 표시) */
  roundTypeFilter?: 'all' | RoundTypeCode;
}

type Summary = { count: number; avgTotal: number; avgOverPar: number };

// 9홀/18홀 라운드는 타수 규모가 달라 한데 섞어 평균내면 왜곡되므로 홀 수별로 나눠 계산한다.
const HOLE_BUCKETS: { holeCount: number; label: string; defaultPar: number }[] = [
  { holeCount: 18, label: "18홀", defaultPar: 72 },
  { holeCount: 9, label: "9홀", defaultPar: 36 },
];

function summarize(games: Score[], defaultPar: number): Summary {
  if (games.length === 0) return { count: 0, avgTotal: 0, avgOverPar: 0 };

  let totalSum = 0;
  let overParSum = 0;
  for (const g of games) {
    const totalPar = g.holes?.reduce((sum, h) => sum + (Number(h.par) || 0), 0) || defaultPar;
    totalSum += g.total;
    overParSum += g.total - totalPar;
  }

  return {
    count: games.length,
    avgTotal: totalSum / games.length,
    avgOverPar: overParSum / games.length,
  };
}

export function RoundTypeAverageCard({ games, fontSizePreset = 'normal', roundTypeFilter = 'all' }: RoundTypeAverageCardProps) {
  // 홀 수(18/9) x 라운딩 타입(필드/스크린/전체) 별 평균 타수
  const buckets = useMemo(() => {
    return HOLE_BUCKETS.map(bucket => {
      const inBucket = games.filter(g => (g.holes?.length || 0) === bucket.holeCount);
      return {
        ...bucket,
        field: summarize(inBucket.filter(g => (g.roundType ?? 'field') === 'field'), bucket.defaultPar),
        screen: summarize(inBucket.filter(g => (g.roundType ?? 'field') === 'screen'), bucket.defaultPar),
        all: summarize(inBucket, bucket.defaultPar),
      };
    }).filter(b => b.all.count > 0);
  }, [games]);

  // 라운딩 타입별 라운드 횟수 (홀 수와 무관한 전체 집계 - 헤더 요약줄용)
  const typeCounts = useMemo(() => {
    const field = games.filter(g => (g.roundType ?? 'field') === 'field').length;
    const screen = games.filter(g => (g.roundType ?? 'field') === 'screen').length;
    return { total: games.length, field, screen };
  }, [games]);

  // 폰트 크기 프리셋
  let containerClass = "p-4 bg-white border border-slate-100 shadow-sm rounded-xl space-y-3";
  let titleClass = "text-sm font-bold text-slate-800 flex items-center gap-2 flex-wrap justify-between";
  let hintClass = "text-[10px] font-bold text-slate-400";
  let bucketLabelClass = "text-[11px] font-black text-slate-500";
  let tileLabelClass = "text-[10px] font-black uppercase";
  let tileValueClass = "text-lg font-black";
  let tileSubClass = "text-[10px] font-bold text-slate-400";
  let tilePadClass = "p-2.5 rounded-xl border";
  let countBadgeClass = "px-2 py-1 rounded-lg border text-[11px] font-black";

  if (fontSizePreset === "medium") {
    containerClass = "p-5 bg-white border border-slate-100 shadow-sm rounded-xl space-y-3.5";
    titleClass = "text-base font-bold text-slate-800 flex items-center gap-2 flex-wrap justify-between";
    hintClass = "text-xs font-bold text-slate-400";
    bucketLabelClass = "text-xs font-black text-slate-500";
    tileLabelClass = "text-xs font-black uppercase";
    tileValueClass = "text-xl font-black";
    tileSubClass = "text-xs font-bold text-slate-400";
    tilePadClass = "p-3 rounded-xl border";
    countBadgeClass = "px-2.5 py-1 rounded-lg border text-xs font-black";
  } else if (fontSizePreset === "large") {
    containerClass = "p-6 bg-white border border-slate-200 shadow-md rounded-2xl space-y-4";
    titleClass = "text-lg font-black text-slate-800 flex items-center gap-2.5 flex-wrap justify-between";
    hintClass = "text-sm font-bold text-slate-500";
    bucketLabelClass = "text-sm font-black text-slate-600";
    tileLabelClass = "text-sm font-black uppercase";
    tileValueClass = "text-2xl font-black";
    tileSubClass = "text-sm font-bold text-slate-500";
    tilePadClass = "p-4 rounded-2xl border";
    countBadgeClass = "px-3 py-1.5 rounded-lg border text-sm font-black";
  } else if (fontSizePreset === "huge") {
    containerClass = "p-7 bg-white border-2 border-slate-200 shadow-lg rounded-2xl space-y-5";
    titleClass = "text-xl sm:text-2xl font-black text-slate-800 flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap sm:justify-between";
    hintClass = "text-base font-bold text-slate-500";
    bucketLabelClass = "text-base font-black text-slate-600";
    tileLabelClass = "text-base font-black uppercase";
    tileValueClass = "text-3xl font-black";
    tileSubClass = "text-base font-bold text-slate-500";
    tilePadClass = "p-4 rounded-2xl border";
    countBadgeClass = "px-3.5 py-2 rounded-xl border text-base font-black";
  }

  const tiles: { key: 'field' | 'screen' | 'all'; label: string; box: string; text: string; ring: string }[] = [
    { key: "field", label: "필드", box: "bg-emerald-50/60 border-emerald-100", text: "text-emerald-700", ring: "ring-2 ring-emerald-400" },
    { key: "screen", label: "스크린", box: "bg-indigo-50/60 border-indigo-100", text: "text-indigo-700", ring: "ring-2 ring-indigo-400" },
    { key: "all", label: "전체", box: "bg-slate-50 border-slate-200", text: "text-slate-700", ring: "ring-2 ring-slate-400" },
  ];

  return (
    <Card className={containerClass}>
      <div className={titleClass}>
        <span className="flex items-center gap-1.5">⛳ 라운딩 타입별 평균 타수</span>
        <span className={hintClass}>그로스(기본) 기준 · 기간/골프장 필터 반영</span>
      </div>

      {/* 라운드 타입별 친 횟수 요약: 라운드 타입(총 N회) : 필드(N회) / 스크린(N회) */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`${countBadgeClass} bg-slate-100 border-slate-200 text-slate-700`}>
          라운드 타입 총 {typeCounts.total}회
        </span>
        <span className="text-slate-300 font-black">:</span>
        <span className={`${countBadgeClass} bg-emerald-50 border-emerald-200 text-emerald-700`}>
          필드 {typeCounts.field}회
        </span>
        <span className="text-slate-300 font-black">/</span>
        <span className={`${countBadgeClass} bg-indigo-50 border-indigo-200 text-indigo-700`}>
          스크린 {typeCounts.screen}회
        </span>
      </div>

      {buckets.length === 0 ? (
        <div className="text-center py-6 text-slate-400 text-xs font-bold border border-dashed rounded-xl">
          평균을 계산할 라운드 기록이 없습니다.
        </div>
      ) : (
        buckets.map(bucket => (
          <div key={bucket.holeCount} className="space-y-1.5">
            {/* 9홀 기록이 있을 때만 두 구간이 함께 보이므로 홀 수 라벨을 항상 표기 */}
            <div className={bucketLabelClass}>{bucket.label} 라운드 · 총 {bucket.all.count}회</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {tiles.map(tile => {
                const s = bucket[tile.key];
                const isActive =
                  (tile.key === "all" && roundTypeFilter === "all") ||
                  (tile.key !== "all" && roundTypeFilter === tile.key);
                const hasData = s.count > 0;

                return (
                  <div
                    key={tile.key}
                    className={`${tilePadClass} ${tile.box} ${isActive ? tile.ring : ""} ${hasData ? "" : "opacity-60"}`}
                  >
                    <div className={`${tileLabelClass} ${tile.text}`}>{tile.label}</div>
                    <div className={`${tileValueClass} ${tile.text} mt-1`}>
                      {hasData ? `${s.avgTotal.toFixed(1)}타` : "-"}
                    </div>
                    <div className={`${tileSubClass} mt-0.5`}>
                      {hasData
                        ? `${s.count}라운드 · 평균 ${s.avgOverPar >= 0 ? "+" : ""}${s.avgOverPar.toFixed(1)}`
                        : "기록 없음"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </Card>
  );
}
