export async function onRequestGet(context) {
    const { env } = context;
    const url = env.NEXT_PUBLIC_OPENDATA_URL;
    const token = env.NEXT_PUBLIC_OPENDATA_TOKEN;

    if (!url) {
        return new Response(JSON.stringify({ error: 'Data URL not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const headers = {
            'User-Agent': 'BikeMap/1.0',
        };

        if (token) {
            headers['Authorization'] = token;
        }

        const response = await fetch(url, { headers });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'No error details');
            return new Response(JSON.stringify({
                error: `Upstream error: ${response.status} ${response.statusText}`,
                details: errorText
            }), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const contentType = response.headers.get("content-type") || "application/json";
        const body = await response.arrayBuffer();

        return new Response(body, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'no-store, max-age=0',
                'Access-Control-Allow-Origin': '*', // Optional: allow CORS if needed
            }
        });

    } catch (error) {
        return new Response(JSON.stringify({
            error: 'Failed to fetch external data',
            message: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
