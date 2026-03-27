import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    try {
        const parsedUrl = new URL(url);
        const domain = parsedUrl.hostname;

        // Fetch HTML content with standard headers to prevent blocking
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch URL: ${response.status}`);
        }

        const html = await response.text();

        // Very basic Regex parsers for OpenGraph metadata and title
        const getMeta = (property: string, name: string) => {
            const regex = new RegExp(`<meta\\s+(?:property|name)=["'](?:${property}|${name})["']\\s+content=["'](.*?)["']`, 'i');
            const match = html.match(regex);
            if (match) return match[1];

            // Try reverse order: content="..." property="..."
            const regexReverse = new RegExp(`<meta\\s+content=["'](.*?)["']\\s+(?:property|name)=["'](?:${property}|${name})["']`, 'i');
            const matchReverse = html.match(regexReverse);
            return matchReverse ? matchReverse[1] : null;
        };

        const titleMatch = html.match(/<title>(.*?)<\/title>/i);
        const title = getMeta('og:title', 'title') || (titleMatch ? titleMatch[1] : null);
        const description = getMeta('og:description', 'description');
        const image = getMeta('og:image', 'image');

        return NextResponse.json({
            url,
            domain,
            title: title ? title.trim() : domain,
            description: description ? description.trim() : '',
            image: image ? (image.startsWith('/') ? `${parsedUrl.origin}${image}` : image) : null
        });

    } catch (error) {
        console.error('Link preview error:', error);
        return NextResponse.json({ error: 'Failed to generate link preview' }, { status: 500 });
    }
}
