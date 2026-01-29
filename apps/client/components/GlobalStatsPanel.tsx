
import { COLORS, ESTIMATED_TOTAL_FLEET, GRAPH_MIN_SCALE, SIM_GRAPH_WINDOW_SIZE_MS } from "@/lib/config";
import { formatNumber } from "@/lib/format";
import { forwardRef, memo, useImperativeHandle, useMemo, useRef } from "react";

// Data point for the graph
export type SystemStatsPoint = {
    simTimeMs: number;
    parked: number;
    active: number; // Calculated as Total - Parked - Disabled? Or just Total - Parked.
};

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
            const dataMax = Math.max(...windowData.map(d => Math.max(d.parked, d.active)));
            const maxVal = Math.max(ESTIMATED_TOTAL_FLEET, dataMax, GRAPH_MIN_SCALE);

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

            const parkedPaths = generatePath(d => d.parked);
            const activePaths = generatePath(d => d.active);

            return {
                linePaths: { parked: parkedPaths.line, active: activePaths.line },
                areaPaths: { parked: parkedPaths.area, active: activePaths.area },
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
                        <span ref={activeRef} className="text-xl font-semibold tabular-nums tracking-tight text-[#50C878]">
                            {formatNumber(currentStats.active)}
                        </span>
                        <span className="text-[10px] tracking-wide text-white/70">IN USE</span>
                    </div>
                    {/* Parked Bikes */}
                    <div className="flex items-baseline gap-1.5 text-left">
                        <span ref={parkedRef} className="text-md font-medium tabular-nums tracking-tight text-[#FF3232]">
                            {formatNumber(currentStats.parked)}
                        </span>
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
                            <text x={PADDING.left} y={GRAPH_HEIGHT - 2}>-3h</text>
                            <text x={GRAPH_WIDTH - PADDING.right} y={GRAPH_HEIGHT - 2} textAnchor="end">Now</text>
                        </g>

                        {/* Paths */}
                        {linePaths.active && (
                            <>
                                <path d={areaPaths.active} fill="url(#grad-active)" />
                                <path d={linePaths.active} fill="none" stroke="#50C878" strokeWidth="1.5" strokeLinecap="round" />
                            </>
                        )}
                        {linePaths.parked && (
                            <>
                                <path d={areaPaths.parked} fill="url(#grad-parked)" />
                                <path d={linePaths.parked} fill="none" stroke="#FF3232" strokeWidth="1.5" strokeLinecap="round" />
                            </>
                        )}

                    </svg>
                </div>
            </div>
        );
    })
);
