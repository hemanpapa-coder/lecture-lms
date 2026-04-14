const str = "<p># 📚 강의 전체 정리 ## 창작의 고통과 엔지니어의 길 ### 과제 수행의 어려움: 창작의 본질</p>";

const hasMarkdown = /^#{1,6}\s|\*\*|^[-*+]\s|^\d+\.\s/m.test(str);
console.log("Old hasMarkdown: " + hasMarkdown);

const newHasMarkdown = /(?:^|<p[^>]*>|<div[^>]*>|<br\s*\/?>|\n)\s*(#{1,6}\s|\*\*|[-*+]\s|\d+\.\s)/m.test(str);
console.log("New hasMarkdown: " + newHasMarkdown);

let html = str;
html = html.replace(/(?:^|(?:<p[^>]*>)|(?:<div[^>]*>)|(?:<br\s*\/?>)|\n)\s*#{1}\s+([^<\n]+)/gm, '<h1>$1</h1>')

console.log("New html after h1: " + html);

let oldHtml = str;
oldHtml = oldHtml.replace(/^#{1}\s+(.+)$/gm, '<h1>$1</h1>');
console.log("Old html after h1: " + oldHtml);

