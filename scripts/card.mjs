import { parseHTML } from 'linkedom';
import { createHash } from 'node:crypto';
import { captionOverrides, captionThemes } from '../content/captions.mjs';

export const ZONE = 'America/New_York';
export function localParts(now = new Date()) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}
export function dayKey(now = new Date()) {
  const p = localParts(now);
  return `${p.year}-${p.month}-${p.day}`;
}
export function dateLabel(now = new Date()) {
  return new Intl.DateTimeFormat('en-US', { timeZone: ZONE, month: 'short', day: 'numeric', year: 'numeric' }).format(now);
}
const clean = text => (text || '').replace(/\s+/g, ' ').trim();

export function parseCard(html, now = new Date()) {
  const { document } = parseHTML(html);
  const slot = document.querySelector('#dailySlot');
  const card = slot?.querySelector('article.juice-card');
  const key = slot?.getAttribute('data-key');
  const date = clean(document.querySelector('#dailyDate')?.textContent);
  if (date !== dateLabel(now)) throw new Error(`Website date is ${date || 'missing'}, expected ${dateLabel(now)}. Nothing will be posted.`);
  if (!key || !/^(energy|calm|confidence|gratitude|kindness|laughter)-(?:[1-9]\d?|100)$/.test(key) || card?.getAttribute('data-key') !== key) throw new Error('Website daily card is missing or inconsistent.');
  const message = clean(card.querySelector('.jc-msg')?.textContent);
  const action = clean(card.querySelector('.sip:not(.dare) p')?.textContent);
  const extra = clean(card.querySelector('.sip.dare p')?.textContent);
  const category = clean(card.querySelector('.pill')?.textContent);
  const theme = clean(card.querySelector('.jc-no')?.textContent);
  if (!message || !action || !category || message.length > 800 || action.length > 700) throw new Error('The website card is incomplete or unexpectedly long.');
  // Preserve the website card verbatim. Writing preferences are applied to our caption.
  return { key, day: dayKey(now), date, category, theme, message, action, extra, url: `https://positivityjuice.com/card/${key}` };
}

export async function getLiveCard(now = new Date(), fetchImpl = fetch) {
  const response = await fetchImpl(`https://positivityjuice.com/daily?social_date=${dayKey(now)}`, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!response.ok) throw new Error(`Website returned HTTP ${response.status}.`);
  if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('Website did not return HTML.');
  const card = parseCard(await response.text(), now);
  // A second check against the stable permalink prevents a stale or mixed page from being used.
  const permalink = await fetchImpl(card.url, { signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!permalink.ok) throw new Error('The card permalink is unavailable.');
  const { document } = parseHTML(await permalink.text());
  const article = document.querySelector(`#cardSlot article[data-key="${card.key}"]`);
  if (clean(article?.querySelector('.jc-msg')?.textContent) !== card.message || clean(article?.querySelector('.sip:not(.dare) p')?.textContent) !== card.action) throw new Error('Daily card and its permalink disagree.');
  return card;
}

export function caption(card, service) {
  const flavor = card.key.split('-')[0];
  const override = captionOverrides[card.key];
  const options = captionThemes[flavor]?.[card.theme];
  const seed = createHash('sha256').update(`${card.key}|${card.message}|${card.action}`).digest().readUInt32BE(0);
  const body = override?.message === card.message ? override.text : options?.[seed % options.length];
  if (!body) throw new Error(`No reviewed caption is available for ${flavor}: ${card.theme}.`);
  if (/https?:|www\.|[\u2014\u2013-]/i.test(body) || [card.message, card.action, card.extra].some(text => text && body.includes(text))) throw new Error('Caption must add original commentary without links, dashes, or copying the card.');
  const hashtag = flavor[0].toUpperCase() + flavor.slice(1);
  const result = `${body}${service === 'tiktok' ? '\n' : '\n\n'}#PositivityJuice #TodaysPour #${hashtag}`;
  if (result.length > 1000) throw new Error('Caption is too long.');
  return result;
}

export function publishingTime(now = new Date(), hour = 9, minute = 0) {
  // Find today's clock time in Eastern time. Works on both sides of DST without fixed offsets.
  const p = localParts(now);
  const approximate = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour + 4, minute);
  for (const candidate of [approximate, approximate + 3600000]) {
    const local = localParts(new Date(candidate));
    if (local.hour === String(hour).padStart(2, '0') && local.minute === String(minute).padStart(2, '0') && dayKey(new Date(candidate)) === dayKey(now)) return new Date(Math.max(candidate, now.getTime() + 120000)).toISOString();
  }
  throw new Error('Could not determine today’s Eastern publishing time.');
}

export function selectChannels(accounts, expected) {
  const selected = [];
  for (const [service, handle] of Object.entries(expected)) {
    const matches = accounts.flatMap(a => a.channels).filter(c => c.service === service && c.name.replace(/^@/, '').toLowerCase() === handle.toLowerCase());
    if (matches.length !== 1) throw new Error(`Connect exactly one ${service} account named @${handle} in Buffer. Found ${matches.length}.`);
    const channel = matches[0];
    if (channel.isDisconnected || channel.isLocked || channel.isQueuePaused) throw new Error(`${service} is disconnected, locked, or paused in Buffer.`);
    selected.push(channel);
  }
  return selected;
}

export function duplicatePost(posts, card, state = null) {
  if (state?.card && state.card !== card.key) throw new Error('A different card has already been prepared for this date. Review Buffer.');
  const texts = new Set([caption(card, 'instagram'), caption(card, 'tiktok'), state?.caption].filter(Boolean));
  const legacyTitle = `Today's Pour | ${card.date}`;
  const matches = posts.filter(p => p.id === state?.postId || texts.has(p.text) || p.text?.includes(legacyTitle));
  if (matches.length > 1) throw new Error('More than one Today’s Pour post already exists for this day. Review Buffer before continuing.');
  if (!matches.length) return null;
  const found = matches[0];
  if (found.text?.includes(legacyTitle) && !found.text.includes(card.url)) throw new Error('A different card has already been prepared for this date. Review Buffer.');
  if (['error', 'draft', 'needs_approval'].includes(found.status)) throw new Error(`Today’s Pour already exists with status ${found.status}. Resolve that post in Buffer instead of creating another.`);
  if (found.schedulingType !== 'automatic') throw new Error('The existing post requires manual publishing. Review Buffer.');
  return found;
}

export function assertNoUncertainSubmission(state) {
  if (state) throw new Error('An earlier submission record has no matching Buffer post. Review it before retrying.');
}

export function manualPostState(state, card, service) {
  if (state?.outcome !== 'manual') return null;
  if (state.day !== card.day || state.card !== card.key || state.service !== service) throw new Error('Manual post record does not match this card, date, and platform.');
  if (!['awaiting_music', 'under_review', 'sent'].includes(state.status)) throw new Error('Manual post status needs review.');
  if (state.status === 'sent' && (!state.externalLink || !state.verifiedAt)) throw new Error('Manual publication has no saved verification.');
  return { service, status: state.status, url: state.externalLink || null, manual: true, reused: true, verifiedAt: state.verifiedAt || null };
}

export function postInput(card, channel, imageUrl, dueAt) {
  const metadata = channel.service === 'instagram'
    ? { instagram: { type: 'post', shouldShareToFeed: true } }
    : { tiktok: { title: "Today's Pour 💙" } };
  return {
    text: caption(card, channel.service), channelId: channel.id,
    schedulingType: 'automatic', mode: 'customScheduled', dueAt,
    needsApproval: false, saveToDraft: false, aiAssisted: true, metadata,
    assets: [{ image: { url: imageUrl, metadata: { altText: `Positivity Juice. ${card.category}. ${card.message} Tiny action: ${card.action} If you are feeling brave: ${card.extra}` } } }],
  };
}
