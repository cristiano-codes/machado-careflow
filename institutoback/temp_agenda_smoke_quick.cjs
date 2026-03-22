const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('https://home-production-7dda.up.railway.app', { waitUntil: 'networkidle2', timeout: 120000 });
  console.log('TITLE', await page.title());
  await browser.close();
})();
