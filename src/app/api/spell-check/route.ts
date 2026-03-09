import { NextResponse } from 'next/server'

export async function POST(req: Request) {
    try {
        const { text } = await req.json()

        if (!text) {
            return NextResponse.json({ corrected: '' })
        }

        // Fetch from Naver Speller Proxy
        const res = await fetch(`https://m.search.naver.com/p/csearch/ocontent/util/SpellerProxy?color_blindness=0&q=${encodeURIComponent(text)}`, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            }
        })

        if (!res.ok) {
            throw new Error('Naver Speller API Server Error')
        }

        const data = await res.json()
        const corrected = data?.message?.result?.notag_html || text

        return NextResponse.json({ corrected })

    } catch (error: any) {
        console.error('[SPELL_CHECK_ERROR]', error)
        // Fallback to original text if the spell-checker fails
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
