import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { dayKey, caption, dateLabel } from './card.mjs';

export const reelCategories = ['energy', 'calm', 'confidence', 'gratitude', 'kindness', 'laughter'];
const library = JSON.parse(readFileSync(new URL('../content/reel-cards.json', import.meta.url)));
const media = JSON.parse(readFileSync(new URL('../content/reel-media.json', import.meta.url)));
const musicByCategory = { energy: 'Just Keep Walking', calm: 'Dreaming of You', confidence: 'Just Keep Walking', gratitude: 'I Believe in Us', kindness: 'I Believe in Us', laughter: 'Just Keep Walking' };
const tidy = text => text.replace(/[\u2013\u2014]+/g, ', ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

export function reelPlan(day = dayKey()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid Reel date.');
  const offset = (Date.parse(`${day}T12:00:00Z`) - Date.parse('2026-10-07T12:00:00Z')) / 86400000;
  if (!Number.isInteger(offset) || offset < 0 || new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day) throw new Error('Reel date is outside this schedule.');
  const category = reelCategories[offset % reelCategories.length];
  const group = library.find(p => p.id === category);
  const cardNumber = (Math.floor(offset / 6) * 17) % group.cards.length;
  const source = group.cards[cardNumber];
  const card = { ...source, key: source.id, day, date: dateLabel(new Date(`${day}T12:00:00Z`)), category: `${group.name} Pour`, url: `https://positivityjuice.com/card/${source.id}` };
  const message = tidy(card.message), action = tidy(card.action);
  if (!message || !action || message.length > 380 || action.length > 380) throw new Error('Reel copy needs editorial review.');
  return { day, id: `${day}-${source.id}`, design: 'logo-and-words-v2', category, categoryName: group.name, card, message, action, duration: 16, video: media.video[category], music: media.music[musicByCategory[category]], captions: { instagram: caption(card, 'instagram').replace('#TodaysPour', '#ALittleGood'), tiktok: caption(card, 'tiktok').replace('#TodaysPour', '#ALittleGood') } };
}

export async function verifyReelSource(plan, fetchImpl = fetch) {
  const response = await fetchImpl(plan.card.url, { signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Reel source card is unavailable.');
  const { document } = parseHTML(await response.text());
  const article = document.querySelector(`#cardSlot article[data-key="${plan.card.key}"]`);
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  if (clean(article?.querySelector('.jc-msg')?.textContent) !== clean(plan.card.message) || clean(article?.querySelector('.sip:not(.dare) p')?.textContent) !== clean(plan.card.action)) throw new Error('The website Reel message changed. Review it before publishing.');
}

export function duplicateReel(posts, plan, state = null) {
  if (state && (state.day !== plan.day || state.reel !== plan.id)) throw new Error('Another Reel already occupies this date.');
  const texts = new Set([...Object.values(plan.captions), state?.caption].filter(Boolean));
  const found = posts.filter(p => p.id === state?.postId || texts.has(p.text));
  if (found.length > 1) throw new Error('More than one matching Reel exists. Review Buffer.');
  if (!found.length) {
    if (state) throw new Error('An earlier Reel submission is uncertain. Review Buffer before retrying.');
    return null;
  }
  const post = found[0];
  if (post.schedulingType !== 'automatic' || !['scheduled', 'sending', 'sent'].includes(post.status)) throw new Error(`Existing Reel needs attention (${post.status}).`);
  return post;
}

export function reelPostInput(plan, channel, videoUrl, dueAt) {
  return {
    text: plan.captions[channel.service], channelId: channel.id,
    schedulingType: 'automatic', mode: 'customScheduled', dueAt,
    needsApproval: false, saveToDraft: false, aiAssisted: true,
    metadata: channel.service === 'instagram' ? { instagram: { type: 'reel', shouldShareToFeed: true } } : { tiktok: { isAiGenerated: false } },
    assets: [{ video: { url: videoUrl, metadata: { thumbnailOffset: 2000 } } }],
  };
}
