import { formatDateShort, formatTimeOnly } from "@/lib/format";
import { useAnimationStore } from "@/lib/stores/animation-store";
import { Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

type Props = {
  simulationTime: number; // seconds from animation start
  startDate: Date; // animation start date
};

export function TimeDisplay({ simulationTime, startDate }: Props) {
  const isLoadingTrips = useAnimationStore((s) => s.isLoadingTrips);
  const displayTimeMs = startDate.getTime() + simulationTime * 1000;

  return (
    <div className="bg-black/45 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 shadow-[0_0_24px_rgba(0,0,0,0.6)] flex flex-col items-center relative">
      <AnimatePresence>
        {isLoadingTrips && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Loader2 className="size-6 animate-spin text-white/70" />
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        initial={false}
        animate={{
          opacity: isLoadingTrips ? 0 : 1,
          filter: isLoadingTrips ? "blur(8px)" : "blur(0px)",
        }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="flex flex-col items-center"
      >
        <div className="text-white/90 text-xs tracking-wide font-mono">
          {formatDateShort(displayTimeMs)}
        </div>
        <div className="text-xl font-semibold tabular-nums text-white/90 tracking-tight">
          {formatTimeOnly(displayTimeMs)}
        </div>
      </motion.div>
    </div>
  );
}
