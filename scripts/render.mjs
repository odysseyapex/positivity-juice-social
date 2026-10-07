import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';

GlobalFonts.registerFromPath(fileURLToPath(new URL('../assets/fonts/Fredoka.ttf', import.meta.url)), 'Fredoka');
GlobalFonts.registerFromPath(fileURLToPath(new URL('../assets/fonts/DM-Sans.ttf', import.meta.url)), 'DM Sans');

const colors = { cream: '#FFF9ED', navy: '#0F2E63', blue: '#2BA6FA', light: '#E9F2FE', white: '#FFFFFF', yellow: '#FFD836' };
function wrap(ctx, text, width) {
  const lines = []; let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > width && line) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}
function fittedText(ctx, text, box, options = {}) {
  const { family = 'DM Sans', weight = 400, max = 48, min = 24, lineHeight = 1.22 } = options;
  for (let size = max; size >= min; size--) {
    ctx.font = `${weight} ${size}px "${family}"`;
    const lines = wrap(ctx, text, box.width);
    if (lines.length * size * lineHeight <= box.height && lines.every(line => ctx.measureText(line).width <= box.width)) {
      lines.forEach((line, i) => ctx.fillText(line, box.x, box.y + i * size * lineHeight));
      return { size, lines: lines.length };
    }
  }
  throw new Error('Card text does not fit the artwork. Nothing will be published.');
}
function round(ctx, x, y, w, h, radius, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill(); }

export async function renderCard(card) {
  const canvas = createCanvas(1080, 1350), ctx = canvas.getContext('2d');
  ctx.textBaseline = 'top';
  ctx.fillStyle = colors.cream; ctx.fillRect(0, 0, 1080, 1350);
  round(ctx, 0, 0, 1080, 18, 0, colors.blue);
  const logo = await loadImage(fileURLToPath(new URL('../assets/pj-logo.png', import.meta.url)));
  const logoHeight = 175, logoWidth = logo.width * logoHeight / logo.height;
  ctx.drawImage(logo, 878, 65, logoWidth, logoHeight);
  ctx.fillStyle = colors.navy;
  ctx.font = '700 25px "DM Sans"'; ctx.fillText('POSITIVITY JUICE', 76, 77);
  ctx.font = '600 76px "Fredoka"'; ctx.fillText("Today's Pour", 72, 127);
  ctx.font = '400 26px "DM Sans"'; ctx.fillText(card.date, 76, 221);

  round(ctx, 62, 289, 956, 619, 40, colors.navy);
  round(ctx, 56, 280, 956, 619, 40, colors.white);
  round(ctx, 93, 320, 380, 60, 30, colors.light);
  ctx.fillStyle = colors.navy;
  ctx.font = '700 26px "DM Sans"'; ctx.fillText(card.category.toUpperCase(), 119, 335);
  const messageLayout = fittedText(ctx, card.message, { x: 99, y: 423, width: 877, height: 377 }, { family: 'Fredoka', weight: 600, max: 72, min: 38, lineHeight: 1.16 });
  round(ctx, 101, 839, 128, 8, 4, colors.blue);

  round(ctx, 56, 939, 956, 249, 32, colors.light);
  ctx.fillStyle = colors.navy;
  ctx.font = '700 26px "DM Sans"'; ctx.fillText('ONE SMALL THING', 96, 969);
  const actionLayout = fittedText(ctx, card.action, { x: 96, y: 1015, width: 867, height: 148 }, { max: 38, min: 26, lineHeight: 1.25 });
  ctx.font = '600 30px "Fredoka"'; ctx.fillText('Pour something good into your day.', 74, 1234);
  ctx.font = '700 23px "DM Sans"'; ctx.fillText('positivityjuice.com', 74, 1283);
  ctx.font = '400 23px "DM Sans"'; ctx.textAlign = 'right'; ctx.fillText('@positivity_juice', 1006, 1283);
  return { bytes: canvas.toBuffer('image/png'), layout: { width: 1080, height: 1350, message: messageLayout, action: actionLayout } };
}
