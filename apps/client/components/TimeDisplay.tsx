import { formatDateShort, formatTimeOnly } from "@/lib/format";
import { useAnimationStore } from "@/lib/stores/animation-store";

import { useCallback } from "react";
import { Minus, Plus } from "lucide-react";
import { DEFAULT_SPEEDUP, SPEED_LEVELS } from "@/lib/config";

type Props = {
  simTimeMs: number; // simulation ms from animation start
  realWindowStartDate: Date; // animation window start date (real time)
};

const SLOW_LOADING_THRESHOLD_MS = 5000;

export function TimeDisplay({ simTimeMs, realWindowStartDate }: Props) {
  const isPlaying = useAnimationStore((s) => s.isPlaying);
  const speedup = useAnimationStore((s) => s.speedup);
  const setSpeedup = useAnimationStore((s) => s.setSpeedup);
  const realDisplayTimeMs = realWindowStartDate.getTime() + simTimeMs;

  const changeSpeed = useCallback((direction: 1 | -1) => {
    // Find closest current level index
    let currentIndex = SPEED_LEVELS.findIndex(s => s === speedup);
    if (currentIndex === -1) {
      // If custom speed, find closest
      let minDiff = Infinity;
      SPEED_LEVELS.forEach((val, idx) => {
        const diff = Math.abs(val - speedup);
        if (diff < minDiff) {
          minDiff = diff;
          currentIndex = idx;
        }
      });
    }

    const nextIndex = Math.max(0, Math.min(SPEED_LEVELS.length - 1, currentIndex + direction));
    setSpeedup(SPEED_LEVELS[nextIndex]);
  }, [speedup, setSpeedup]);

  // Check if we are "Live" (within 15 minutes of real current time)
  // This depends on the animation start date being recent logic
  const diffFromNow = Math.abs(realDisplayTimeMs - Date.now());
  const isLive = diffFromNow < 15 * 60 * 1000;

  return (
    <div className="bg-black/45 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 shadow-[0_0_24px_rgba(0,0,0,0.6)] flex flex-col items-center relative">
      <div className="flex items-center gap-1">
        <button
          onClick={() => changeSpeed(-1)}
          className="p-1.5 hover:bg-white/10 active:bg-white/20 rounded-full transition-colors text-white/50 hover:text-white"
          aria-label="Slower"
        >
          <Minus className="w-3 h-3" />
        </button>

        <div
          onClick={() => setSpeedup(DEFAULT_SPEEDUP)}
          className="flex flex-col items-center cursor-pointer hover:bg-white/5 rounded px-2 py-0.5 transition-colors group"
          title="Reset Speed"
        >
          <div className="text-white/90 text-xs tracking-wide font-mono group-hover:text-white">
            {formatDateShort(realDisplayTimeMs)}
          </div>

          {isLive ? (
            <div className="text-xl font-bold tracking-wider text-[#50C878] flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 bg-[#50C878] rounded-full shadow-[0_0_8px_#50C878] animate-pulse"
                style={{ animationDuration: '4s' }}
              />
              LIVE
            </div>
          ) : (
            <div className="text-xl font-semibold tabular-nums text-white/90 tracking-tight group-hover:text-white">
              {formatTimeOnly(realDisplayTimeMs)}
            </div>
          )}
        </div>

        <button
          onClick={() => changeSpeed(1)}
          className="p-1.5 hover:bg-white/10 active:bg-white/20 rounded-full transition-colors text-white/50 hover:text-white"
          aria-label="Faster"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
