import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';



// Simple in-memory cache to prevent 429s during development hot-reloads
let cachedData: ArrayBuffer | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function GET() {
    const url = process.env.NEXT_PUBLIC_OPENDATA_URL;
    const token = process.env.NEXT_PUBLIC_OPENDATA_TOKEN;

    if (!url) {
        console.error('[Proxy] Error: NEXT_PUBLIC_OPENDATA_URL is not defined in environment variables.');
        return NextResponse.json({ error: 'Data URL not configured' }, { status: 500 });
    }

    // Check cache first
    const now = Date.now();
    if (cachedData && (now - lastFetchTime < CACHE_TTL_MS)) {
        console.log(`[Proxy] Serving cached data (expires in ${Math.round((CACHE_TTL_MS - (now - lastFetchTime)) / 1000)}s)`);
        return new NextResponse(cachedData, {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, max-age=0',
                'X-Proxy-Cache': 'HIT',
            }
        });
    }

    try {
        console.log(`[Proxy] Fetching ${url}...`);

        const headers: HeadersInit = {
            'User-Agent': 'BikeMap/1.0', // Some APIs block requests without a User-Agent
        };

        if (token) {
            headers['Authorization'] = `${token}`; // Try standard Auth header, though specific API might differ
        }

        const response = await fetch(url, { headers });

        if (!response.ok) {
            console.error(`[Proxy] Upstream error: ${response.status} ${response.statusText}`);
            const errorText = await response.text().catch(() => 'No error details');

            // If we have stale cache, serve it as fallback in case of error (optional, but good for stability)
            if (cachedData) {
                console.warn('[Proxy] Upstream failed, serving stale cache.');
                return new NextResponse(cachedData, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-store, max-age=0',
                        'X-Proxy-Cache': 'STALE',
                        'X-Proxy-Error': response.status.toString()
                    }
                });
            }

            console.error(`[Proxy] Upstream response body: ${errorText}`);
            return NextResponse.json(
                { error: `Upstream error: ${response.status} ${response.statusText}`, details: errorText },
                { status: response.status }
            );
        }

        const contentType = response.headers.get("content-type") || "application/json";
        const buffer = await response.arrayBuffer();

        // Update cache
        cachedData = buffer;
        lastFetchTime = Date.now();

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'no-store, max-age=0', // Avoid caching errors or stale data during dev
                'X-Proxy-Cache': 'MISS'
            }
        });

    } catch (error: any) {
        console.error('[Proxy] Network/Server Error:', error);

        // Fallback to cache on network error if available
        if (cachedData) {
            console.warn('[Proxy] Network error, serving stale cache.');
            return new NextResponse(cachedData, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Proxy-Cache': 'STALE_NET_ERR'
                }
            });
        }

        return NextResponse.json({
            error: 'Failed to fetch external data',
            message: error.message
        }, { status: 500 });
    }
}
