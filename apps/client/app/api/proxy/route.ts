import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Simple in-memory cache to prevent 429s during development hot-reloads
let cachedData: ArrayBuffer | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 30 * 1000;

export async function GET() {
    const url = process.env.NEXT_PUBLIC_OPENDATA_URL;
    const token = process.env.NEXT_PUBLIC_OPENDATA_TOKEN;

    if (!url) {
        console.error('[Proxy] Error: NEXT_PUBLIC_OPENDATA_URL is not defined.');
        return NextResponse.json({ error: 'Data URL not configured' }, { status: 500 });
    }

    const now = Date.now();
    if (cachedData && (now - lastFetchTime < CACHE_TTL_MS)) {
        return new NextResponse(cachedData, {
            headers: {
                'Content-Type': 'application/json',
                'X-Proxy-Cache': 'HIT',
            }
        });
    }

    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'BikeMap/1.0', ...(token ? { 'Authorization': token } : {}) }
        });

        if (!response.ok) {
            return NextResponse.json({ error: 'Upstream error' }, { status: response.status });
        }

        const buffer = await response.arrayBuffer();
        cachedData = buffer;
        lastFetchTime = now;

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': response.headers.get("content-type") || "application/json",
                'X-Proxy-Cache': 'MISS'
            }
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
