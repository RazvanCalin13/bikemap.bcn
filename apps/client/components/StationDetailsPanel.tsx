
import { Dock, Bike } from "lucide-react";
import { motion } from "motion/react";
import { Kbd } from "./ui/kbd";

interface StationDetailsPanelProps {
    station: {
        station_id: number;
        name: string;
        bikes: number;
        docks: number;
    };
    position?: { x: number; y: number } | null;
    onClose: () => void;
}

export function StationDetailsPanel({ station, position, onClose }: StationDetailsPanelProps) {
    const occupancy = station.bikes + station.docks > 0
        ? station.bikes / (station.bikes + station.docks)
        : 0;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="bg-black/80 backdrop-blur-md text-white/90 px-3 py-3 rounded-xl border border-white/10 shadow-[0_0_24px_rgba(0,0,0,0.6)] w-[200px] absolute z-[10] overflow-hidden"
            style={position ? {
                left: position.x + 40,
                top: position.y - 10, // Offset to be "top-right"
            } : {
                right: '1rem',
                top: '12rem'
            }}
        >
            {/* Selection Highlight Bar */}
            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500/50" />

            {/* Header */}
            <div className="pl-2">
                <h3 className="text-sm font-bold leading-tight mb-0.5">{station.name}</h3>
                <span className="text-[10px] text-white/50 font-mono">ID: {station.station_id}</span>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-2 mt-3 pl-2">
                {/* Bikes */}
                <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 text-white/60 mb-0.5">
                        <Bike className="w-3.5 h-3.5" />
                        <span className="text-[10px] uppercase tracking-wider">Bikes</span>
                    </div>
                    <span className="text-xl font-bold text-[#50C878]">{station.bikes}</span>
                </div>

                {/* Docks */}
                <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 text-white/60 mb-0.5">
                        <Dock className="w-3.5 h-3.5" />
                        <span className="text-[10px] uppercase tracking-wider">Docks</span>
                    </div>
                    <span className="text-xl font-bold text-white/80">{station.docks}</span>
                </div>
            </div>

            {/* Occupancy Context */}
            <div className="mt-3 pl-2 pt-2 border-t border-white/10">
                <div className="flex justify-between items-center text-[10px] text-white/50 mb-1">
                    <span>Occupancy</span>
                    <span>{Math.round(occupancy * 100)}%</span>
                </div>
                <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-indigo-500/80 transition-all duration-500"
                        style={{ width: `${occupancy * 100}%` }}
                    />
                </div>
            </div>

            {/* Footer hint */}
            <div onClick={onClose} className="pl-2 mt-3 pt-2 text-[10px] text-white/40 flex items-center justify-between cursor-pointer hover:text-white/60 transition-colors">
                <div className="flex items-center gap-1">
                    <Kbd>Esc</Kbd> to close
                </div>
            </div>
        </motion.div>
    );
}
