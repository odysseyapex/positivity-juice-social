import { chromium } from 'playwright';

export function decodeWebsiteImage(url) {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(url || '')) throw new Error('The website did not provide a downloadable PNG.');
  const bytes = Buffer.from(url.split(',')[1], 'base64');
  if (bytes.length < 1000 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('The website export is not a valid PNG.');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (width !== 1080 || height !== 1350) throw new Error(`The website export changed size to ${width} by ${height}. Review it before posting.`);
  return { bytes, layout: { width, height, source: 'website-save-image' } };
}

export async function renderCard(card) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, timezoneId: 'America/New_York' });
    const response = await page.goto(card.url, { waitUntil: 'networkidle', timeout: 45000 });
    if (!response?.ok()) throw new Error('The website card page could not be opened.');
    const article = page.locator(`#cardSlot article[data-key="${card.key}"]`);
    await article.waitFor();
    const clean = text => text.replace(/\s+/g, ' ').trim();
    for (const [selector, expected] of [['.jc-msg', card.message], ['.sip:not(.dare) p', card.action], ['.sip.dare p', card.extra]]) {
      if (clean(await article.locator(selector).innerText()) !== expected) throw new Error('The card being downloaded disagrees with today’s website card.');
    }
    // Save the site's own Download data URL unchanged, with its live fonts and artwork.
    const fontsReady = await page.evaluate(async () => {
      const fonts = ['600 34px Fredoka', '500 66px Fredoka', '400 40px "DM Sans"', '500 30px "DM Mono"'];
      const loaded = await Promise.all(fonts.map(font => document.fonts.load(font)));
      await document.fonts.ready;
      return loaded.every(faces => faces.length > 0);
    });
    if (!fontsReady) throw new Error('The website card fonts did not load.');
    await article.locator('.share-more summary').click();
    await article.locator('[data-act="save"]').click();
    await page.locator('#saveModal').waitFor({ state: 'visible' });
    const image = await page.locator('#saveImg').getAttribute('src');
    const download = await page.locator('#saveDl').getAttribute('href');
    if (image !== download) throw new Error('The website preview and download disagree.');
    return decodeWebsiteImage(download);
  } finally { await browser.close(); }
}
