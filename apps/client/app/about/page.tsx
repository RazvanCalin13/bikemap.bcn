"use client";

import { Kbd } from "@/components/ui/kbd";
import { COLORS, DEFAULT_SPEEDUP } from "@/lib/config";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

const ArrowIcon = ({ color, showTrail = false }: { color: readonly [number, number, number]; showTrail?: boolean }) => {
  const colorRgb = `rgb(${color.join(", ")})`;
  const gradientId = `trail-${color.join("-")}`;
  return (
    <svg
      width="100"
      height="100"
      viewBox="30 -5 70 70"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 size-3.5 overflow-visible"
    >
      <defs>
        <linearGradient id={gradientId} x1="63.4105" y1="31.2322" x2="63.4105" y2="137.967" gradientUnits="userSpaceOnUse">
          <stop stopColor={colorRgb} />
          <stop offset="0.817308" stopColor={colorRgb} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Trail */}
      <motion.rect
        x="52.4727"
        y="31.2322"
        width="21.8756"
        transform="rotate(45 52.4727 31.2322)"
        fill={`url(#${gradientId})`}
        initial={{ height: 0, opacity: 0 }}
        animate={{
          height: showTrail ? 106.735 : 0,
          opacity: showTrail ? 1 : 0
        }}
        transition={{
          height: { duration: showTrail ? 0.3 : 0.2, ease: "easeOut" },
          opacity: { duration: showTrail ? 0.15 : 0.25, ease: "easeOut" }
        }}
      />
      {/* Arrow */}
      <path
        d="M90.3143 6.98712C90.609 6.86031 90.9358 6.82533 91.2521 6.88673C91.5684 6.94813 91.8596 7.10308 92.088 7.33146C92.3164 7.55983 92.4713 7.85108 92.5327 8.16738C92.5941 8.48368 92.5591 8.81042 92.4323 9.10518L71.5583 60.8878C71.431 61.2027 71.2075 61.4687 70.9194 61.6482C70.6314 61.8276 70.2934 61.9113 69.9536 61.8874C69.6137 61.8635 69.2892 61.7333 69.0262 61.5151C68.7631 61.297 68.5748 61.002 68.4879 60.6721L63.292 40.8028C62.9995 39.6801 62.4121 38.6541 61.5911 37.8313C60.77 37.0086 59.7452 36.4191 58.6231 36.1242L38.7473 30.9315C38.4174 30.8447 38.1225 30.6564 37.9043 30.3933C37.6861 30.1302 37.5559 29.8057 37.532 29.4658C37.5081 29.126 37.5918 28.7881 37.7713 28.5C37.9507 28.212 38.2167 27.9884 38.5316 27.8611L90.3143 6.98712Z"
        fill={colorRgb}
        stroke={colorRgb}
        strokeWidth="6.45837"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const LIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#0a66c2" strokeWidth="1"
    strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect width="4" height="12" x="2" y="9" /><circle cx="4" cy="4" r="2" />
  </svg>
);

const LegendItem = ({ color, label, glowIntensity = "normal" }: { color: readonly [number, number, number]; label: string; glowIntensity?: "normal" | "intense" }) => {
  const [isHovered, setIsHovered] = useState(false);
  const colorRgb = `rgb(${color.join(", ")})`;
  const glowFilter = glowIntensity === "intense"
    ? `drop-shadow(0 0 5px rgba(${color.join(", ")}, 0.8)) drop-shadow(0 0 7px rgba(${color.join(", ")}, 0.6))`
    : `drop-shadow(0 0 8px rgb(${color.join(", ")}))`;

  return (
    <span
      className="group flex items-center gap-2 cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span
        className={cn(
          "block size-2.5 rounded-full transition-[filter] duration-200 transform-gpu",
          isHovered ? "[will-change:filter]" : ""
        )}
        style={{
          backgroundColor: colorRgb,
          filter: isHovered ? glowFilter : "none",
        }}
      />
      <span className="text-zinc-400 group-hover:text-zinc-200 transition-colors">{label}</span>
    </span>
  );
};



export default function AboutPage() {
  const router = useRouter();

  // Esc key handler to go back
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        router.replace("/");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  return (
    <div className="min-h-dvh bg-background font-mono">
      <main className="max-w-152 mx-auto px-6 py-12 md:py-24">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <Link
          href="/"
          className="flex items-center gap-0.5 group mb-8 md:fixed md:top-6 md:left-6 md:mb-0"
        >
          <ArrowLeft suppressHydrationWarning className="size-4 text-white/50 group-hover:text-white transition-colors" />
          <Kbd className="bg-transparent text-white/50 group-hover:text-white transition-colors">
            Back (ESC)
          </Kbd>
        </Link>
        <h1 className="text-3xl font-semibold text-zinc-100 mb-8">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <Link href="/" className="inline-flex items-center gap-2.5 hover:text-white transition-colors">
            <img src="/logo.png" alt="" width={30} height={30} />
            <span>bikemap.bcn</span>
          </Link>
        </h1>

        <h2 className="text-lg font-medium text-white mb-6">About</h2>

        <div className="space-y-6 text-zinc-400">
          <p>
            bikemap.bcn is a visualization of bike station activity of the past year or so of {" "}
            <a
              href="https://www.bicing.barcelona/"
              className="text-zinc-300 font-medium hover:text-zinc-100 underline underline-offset-4"
            >
              Bicing
            </a>
            , the bike-sharing service of <strong>Barcelona</strong>.
          </p>

          <p>
            Each colored dot represents one of the 544 bike docking stations,
            {` from information published by the City of Barcelona. The dot's color and size indicate the station's occupancy at a given time and a sublte 'pulse' animation
            indicates every time a station gains or loses a bike.`}
          </p>

          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            {/* Legend for station status is shown on the map */}
            <LegendItem color={COLORS.occupancy.high as [number, number, number]} label="+80% Station Capacity" />
            <LegendItem color={COLORS.occupancy.medium as [number, number, number]} label="50-80% Station Capacity" />
            <LegendItem color={COLORS.occupancy.low as [number, number, number]} label="10-50% Station Capacity" />
            <LegendItem color={COLORS.occupancy.empty as [number, number, number]} label="-10% Station Capacity" />
          </div>

          <br />

          <p>
            The simulation starts at <strong>{DEFAULT_SPEEDUP}x normal speed</strong> by default but you can change the date and time to the past and manipulate time in incremental steps.
          </p>

          <hr className="border-white/10" />

          <h2 className="text-lg font-medium text-white">Technical Details</h2>

          <ul className="list-disc list-inside space-y-3">
            <li>
              <span className="font-medium text-zinc-300">No backend</span> —
              Processed data is stored in Apache Parquet files and queried by DuckDB WASM directly in the browser.
            </li>
            <li>
              <span className="font-medium text-zinc-300">GPU rendering</span> —
              Deck.gl renders the station status visualization efficiently.
            </li>
            <li>
              <span className="font-medium text-zinc-300">Efficient Loading</span> —
              Data is loaded incrementally to minimize bandwidth.
            </li>
          </ul>

          <hr className="border-white/10" />

          <h2 className="text-lg font-medium text-white">Limitations</h2>

          <p>
            The data is not real-time and is only updated periodically. It also has gaps as the data is not always available from the City. Hopefully, this will improve in the future.
          </p>

          <hr className="border-white/10" />

          <h2 className="text-lg font-medium text-white">Reasoning</h2>

          <p>
            I did this as a weekend project because I love the city and enjoy using Bicing myself.
          </p>

          <p className="flex items-center gap-2">
            <a
              href="https://www.linkedin.com/in/razzcalin"
              className="inline-flex items-center gap-1.5 text-white/70 hover:text-white transition-colors border-b border-current pb-0.5"
            >
              <LIcon className="size-3" />
              @RazzCalin
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
