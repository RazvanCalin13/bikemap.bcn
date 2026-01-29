
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    // Construct URL from IDs provided by user (or use env var override)
    const PACKAGE_ID = "6aa3416d-ce1a-494d-861b-7bd07f069600";
    const RESOURCE_ID = "1b215493-9e63-4a12-8980-2d7e0fa19f85";
    const targetUrl = process.env.NEXT_PUBLIC_OPENDATA_URL ||
        `https://opendata-ajuntament.barcelona.cat/data/dataset/${PACKAGE_ID}/resource/${RESOURCE_ID}/download/recurs.json`;

    const token = process.env.NEXT_PUBLIC_OPENDATA_TOKEN;

    if (!token) {
        return NextResponse.json({ error: "Server misconfiguration: Missing Token" }, { status: 500 });
    }

    try {
        const headers: HeadersInit = {
            "Authorization": token
        };

        console.log(`[Proxy] Fetching ${targetUrl}...`);
        const response = await fetch(targetUrl, { headers });

        if (!response.ok) {
            return NextResponse.json(
                { error: `Upstream error: ${response.status} ${response.statusText}` },
                { status: response.status }
            );
        }

        // Stream the data back
        // We can just return the body directly
        return new NextResponse(response.body, {
            status: 200,
            headers: {
                "Content-Type": response.headers.get("Content-Type") || "application/json",
                // Cache for a bit to avoid hitting rate limits?
                "Cache-Control": "public, max-age=300"
            }
        });

    } catch (error) {
        console.error("[Proxy] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
