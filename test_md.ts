import * as fs from 'fs';

const code = fs.readFileSync('src/app/archive/[week]/WeekPageClient.tsx', 'utf-8');

// Extract markdownToHtml
const match = code.match(/function markdownToHtml[\s\S]*?^}/m);
if (match) {
    eval(match[0] + "\n\n" + `
    const html = '<p><span style="background-color: transparent; color: rgb(0, 0, 0);">제자리에서 **압축(Compression)과 이완(Rarefaction)**을 반복하며 에너지안을 전달하는 종파 형태를 띕니다.</span></p>';
    console.log("OLD:", html);
    const result = markdownToHtml(html);
    console.log("NEW:", result);
    `);
} else {
    console.log("Not found");
}
