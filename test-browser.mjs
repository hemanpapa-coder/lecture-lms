import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  await page.goto('http://localhost:3005/?view=admin&course=5aaae369-e668-416d-abc4-1979fc045eba&student=81414856-fb25-4e71-96f7-b2e88a38ae1c', { waitUntil: 'networkidle0' });
  
  await browser.close();
})();
