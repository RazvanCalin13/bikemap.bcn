
import { ChevronDown, ChevronUp } from "lucide-react";
import React, { useState } from 'react';

interface DistrictStat {
    name: string;
    totalBikes: number;
    totalCapacity: number;
    occupancyRate: number; // 0-1
}

interface NeighborhoodStatsProps {
    stats: DistrictStat[];
}

export const NeighborhoodStats: React.FC<NeighborhoodStatsProps> = ({ stats }) => {
    const [isCollapsed, setIsCollapsed] = useState(true);
    // Sort by occupancy or name? Let's sort by Occupancy descending for "analytics" feel
    const sortedStats = [...stats].sort((a, b) => b.occupancyRate - a.occupancyRate);

    return (
        <div className="bg-black/80 backdrop-blur-md rounded-xl text-white w-[200px] border border-white/10 shadow-xl overflow-hidden transition-all duration-300">
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 transition-colors"
            >
                <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-400">
                    Per District
                </h3>
                {isCollapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
            </button>

            {!isCollapsed && (
                <div className="p-4 pt-0 space-y-3 max-h-[60vh] overflow-y-auto no-scrollbar border-t border-white/10 mt-2">
                    {sortedStats.map((stat) => (
                        <div key={stat.name} className="flex flex-col gap-1">
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-semibold text-gray-200">{stat.name}</span>
                                <span className="text-gray-400">{stat.totalBikes} bikes</span>
                            </div>

                            {/* Progress Bar */}
                            <div className="relative h-2 w-full bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className="absolute top-0 left-0 h-full rounded-full transition-all duration-500 ease-out"
                                    style={{
                                        width: `${stat.occupancyRate * 100}%`,
                                        backgroundColor: getOccupancyColor(stat.occupancyRate)
                                    }}
                                />
                            </div>
                            <div className="text-[10px] text-right text-gray-500">
                                {Math.round(stat.occupancyRate * 100)}% usage
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

function getOccupancyColor(p: number): string {
    if (p < 0.1) return '#FF3232'; // Red - Empty
    if (p < 0.5) return '#FFA500'; // Orange
    if (p < 0.8) return '#FFFF00'; // Yellow
    return '#50C878'; // Green - High
}
