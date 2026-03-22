import fetch from 'node-fetch'
import 'dotenv/config'

async function search() {
  const key = process.env.GEMINI_API_KEY
  console.log("Using key length:", key?.length)
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Find a direct high-resolution image URL for the product 'Yamaha HS8 studio monitor'. Return ONLY the raw URL starting with http, nothing else." }] }],
      tools: [{ googleSearch: {} }] // Note: v1beta uses googleSearch for grounding sometimes, or googleSearchRetrieval
    })
  })
  const data = await res.json()
  console.dir(data, { depth: null })
}
search()
