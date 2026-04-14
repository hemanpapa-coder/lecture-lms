const { JSDOM } = require("jsdom");
const dom = new JSDOM(`<!DOCTYPE html><div># Title\n## Subtitle\nText</div>`);
console.log(dom.window.document.querySelector("div").innerHTML);
