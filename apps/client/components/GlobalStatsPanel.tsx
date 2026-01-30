
import { COLORS, ESTIMATED_TOTAL_FLEET, GRAPH_MIN_SCALE, SIM_GRAPH_WINDOW_SIZE_MS } from "@/lib/config";
import { formatNumber } from "@/lib/format";
import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { useSpring, useTransform, motion } from "motion/react";
import { useAnimationStore } from "@/lib/stores/animation-store";

// Data point for the graph
export type SystemStatsPoint = {
    simTimeMs: number;
    parked: number;
    active: number; // Calculated as Total - Parked - Disabled? Or just Total - Parked.
};

function AnimatedNumber({ value, className }: { value: number, className?: string }) {
    const speedup = useAnimationStore(s => s.speedup);

    // Scale stiffness based on speedup.
    // Base speed (300) -> stiffness 100
    // Max speed (14400) -> stiffness ~5000 (approx 48x faster response)
    // Formula: stiffness = 100 * (speedup / 300)
    // Damping needs to scale too to avoid overshooting: damping = 20 * sqrt(speedup / 300)
    const ratio = speedup / 300;
    const stiffness = 100 * ratio;
    const damping = 20 * Math.sqrt(ratio);

    const spring = useSpring(value, { stiffness, damping });

    // Update spring target when value changes
    useEffect(() => {
        spring.set(value);
    }, [value, spring]);

    const display = useTransform(spring, (latest) => formatNumber(Math.round(latest)));

    return <motion.span className={className}>{display}</motion.span>;
}

type GlobalStatsPanelProps = {
    graphData: SystemStatsPoint[];
    simTimeMs: number;
    bearing: number;
    currentStats: { parked: number, active: number };
};

export type GlobalStatsPanelRef = {
    parkedEl: HTMLSpanElement | null;
    activeEl: HTMLSpanElement | null;
};

const GRAPH_WIDTH = 176;
const GRAPH_HEIGHT = 52;
const PADDING = { top: 4, right: 4, bottom: 14, left: 4 };

export const GlobalStatsPanel = memo(
    forwardRef<GlobalStatsPanelRef, GlobalStatsPanelProps>(function GlobalStatsPanel(
        { graphData, simTimeMs, bearing, currentStats },
        ref
    ) {
        const parkedRef = useRef<HTMLSpanElement>(null);
        const activeRef = useRef<HTMLSpanElement>(null);

        useImperativeHandle(ref, () => ({
            parkedEl: parkedRef.current,
            activeEl: activeRef.current,
        }));

        const { linePaths, areaPaths, maxY } = useMemo(() => {
            if (graphData.length === 0) {
                return { linePaths: { parked: "", active: "" }, areaPaths: { parked: "", active: "" }, maxY: 0 };
            }

            const simWindowStartMs = simTimeMs - SIM_GRAPH_WINDOW_SIZE_MS;
            const simWindowEndMs = simTimeMs;

            // Filter visible window
            const windowData = graphData.filter((d) => d.simTimeMs >= simWindowStartMs && d.simTimeMs <= simWindowEndMs);
            if (windowData.length === 0) {
                return { linePaths: { parked: "", active: "" }, areaPaths: { parked: "", active: "" }, maxY: 0 };
            }

            // Determine scale (Fit to fleet size or max data?)
            // Fitting to ESTIMATED_TOTAL_FLEET keeps context of "Total Capacity".
            // But if we want to see trends, dynamic scale is better.
            // Let's use ESTIMATED_TOTAL_FLEET as baseline max, or max of data if it exceeds.
            const dataMax = Math.max(...windowData.map(d => d.active));
            const maxVal = Math.max(dataMax * 1.2, GRAPH_MIN_SCALE);

            const chartWidth = GRAPH_WIDTH - PADDING.left - PADDING.right;
            const chartHeight = GRAPH_HEIGHT - PADDING.top - PADDING.bottom;

            const scaleX = (t: number) =>
                PADDING.left + ((t - simWindowStartMs) / (simWindowEndMs - simWindowStartMs)) * chartWidth;

            const scaleY = (v: number) =>
                PADDING.top + chartHeight - (v / (maxVal * 1.1)) * chartHeight;

            // Generate paths
            const generatePath = (accessor: (d: SystemStatsPoint) => number) => {
                const points = windowData.map(d => ({ x: scaleX(d.simTimeMs), y: scaleY(accessor(d)) }));
                const line = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");
                const area = line +
                    ` L ${points[points.length - 1].x} ${GRAPH_HEIGHT - PADDING.bottom}` +
                    ` L ${points[0].x} ${GRAPH_HEIGHT - PADDING.bottom} Z`;
                return { line, area };
            };

            const activePaths = generatePath(d => d.active);

            return {
                linePaths: { parked: "", active: activePaths.line },
                areaPaths: { parked: "", active: activePaths.area },
                maxY: maxVal
            };
        }, [graphData, simTimeMs]);

        return (
            <div className="bg-black/45 backdrop-blur-md text-white/90 px-3 py-2 rounded-xl border border-white/10 shadow-[0_0_24px_rgba(0,0,0,0.6)] w-[200px] relative">
                {/* Compass */}
                <div
                    className="absolute top-2 right-2"
                    style={{ transform: `rotate(${-bearing}deg)` }}
                >
                    <svg width="40" height="40" viewBox="0 0 40 40">
                        <circle cx="20" cy="20" r="14" fill="none" stroke="rgba(125, 207, 255, 0.2)" strokeWidth="1" />
                        <path d="M20 9 L22 20 L20 18 L18 20 Z" fill="rgba(125, 207, 255, 0.9)" />
                        <path d="M20 31 L22 20 L20 22 L18 20 Z" fill="rgba(125, 207, 255, 0.3)" />
                        <circle cx="20" cy="20" r="1.5" fill="rgba(125, 207, 255, 0.6)" />
                        <text x="20" y="7" textAnchor="middle" fontSize="8" fill="rgba(125, 207, 255, 0.7)" fontWeight="500">N</text>
                        <text x="20" y="39" textAnchor="middle" fontSize="8" fill="rgba(125, 207, 255, 0.4)" fontWeight="500">S</text>
                        <text x="4" y="22" textAnchor="middle" fontSize="8" fill="rgba(125, 207, 255, 0.4)" fontWeight="500">W</text>
                        <text x="36" y="22" textAnchor="middle" fontSize="8" fill="rgba(125, 207, 255, 0.4)" fontWeight="500">E</text>
                    </svg>
                </div>

                {/* Stats Text */}
                <div className="flex flex-col gap-1 mt-0.5 relative z-10">
                    {/* Active Bikes */}
                    <div className="flex items-baseline gap-1.5 text-left">
                        <AnimatedNumber
                            value={currentStats.active}
                            className="text-xl font-semibold tabular-nums tracking-tight text-[#50C878]"
                        />
                        <span className="text-[10px] tracking-wide text-white/70">IN USE</span>
                    </div>
                    {/* Parked Bikes */}
                    <div className="flex items-baseline gap-1.5 text-left">
                        <AnimatedNumber
                            value={currentStats.parked}
                            className="text-md font-medium tabular-nums tracking-tight text-[#FF3232]"
                        />
                        <span className="text-[10px] tracking-wide text-white/70">PARKED</span>
                    </div>
                </div>


                {/* Graph */}
                <div className="mt-2 relative">
                    <svg
                        width={GRAPH_WIDTH}
                        height={GRAPH_HEIGHT}
                        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
                        className="overflow-visible"
                    >
                        <defs>
                            <linearGradient id="grad-active" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#50C878" stopOpacity="0.3" />
                                <stop offset="100%" stopColor="#50C878" stopOpacity="0" />
                            </linearGradient>
                            <linearGradient id="grad-parked" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#FF3232" stopOpacity="0.3" />
                                <stop offset="100%" stopColor="#FF3232" stopOpacity="0" />
                            </linearGradient>
                        </defs>

                        {/* Time Axis */}
                        <g opacity="0.4" fontSize="8" fill="white">
                            <text x={PADDING.left} y={GRAPH_HEIGHT - 2}>-6h</text>
                            <text x={GRAPH_WIDTH - PADDING.right} y={GRAPH_HEIGHT - 2} textAnchor="end">Now</text>
                        </g>

                        {/* Paths */}
                        {linePaths.active && (
                            <>
                                <path d={areaPaths.active} fill="url(#grad-active)" />
                                <path d={linePaths.active} fill="none" stroke="#50C878" strokeWidth="1.5" strokeLinecap="round" />
                            </>
                        )}


                    </svg>
                </div>
            </div>
        );
    })
);
