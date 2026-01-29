"use client";

import { motion, AnimatePresence } from "motion/react";

interface StationFocusOverlayProps {
    point: { x: number; y: number } | null;
    color?: string;
}

export function StationFocusOverlay({ point, color = "#50C878" }: StationFocusOverlayProps) {
    return (
        <AnimatePresence>
            {point && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="absolute inset-0 z-[5] pointer-events-none overflow-hidden"
                    style={{
                        background: `radial-gradient(circle at ${point.x}px ${point.y}px, transparent 20px, rgba(0, 0, 0, 0.7) 120px, rgba(0, 0, 0, 0.85) 100%)`,
                    }}
                >
                    {/* High-contrast focus ring/dot */}
                    <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", damping: 15, stiffness: 200, delay: 0.1 }}
                        style={{
                            position: "absolute",
                            left: point.x,
                            top: point.y,
                            transform: "translate(-50%, -50%)",
                        }}
                    >
                        {/* The "Outer Ring" for pop */}
                        <div
                            className="w-10 h-10 rounded-full border-2 border-white/40 animate-ping absolute -left-5 -top-5"
                            style={{ borderColor: color }}
                        />
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
