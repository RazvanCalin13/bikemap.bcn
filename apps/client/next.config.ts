import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: false,
  webpack: (config, { webpack }) => {
    // Suppress the "Critical dependency" warning from duckdb-node.cjs
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /duckdb-node\.cjs/, message: /Critical dependency/ },
    ];

    config.plugins.push(
      new webpack.ProgressPlugin((percentage: number, message: string, ...args: string[]) => {
        // Output a simple counter/progress to show activity
        // We use process.stdout.write to update lines if possible, or just console.log
        const percent = Math.round(percentage * 100);
        // Only log significantly to avoid spamming 
        if (percent % 10 === 0 && percent < 100) {
          console.log(`Compiling... ${percent}% - ${message} ${args.join(' ')}`);
        }
      })
    );
    return config;
  },
};

export default nextConfig;
