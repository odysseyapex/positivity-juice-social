import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCard, getLiveCard, dayKey, publishingTime, caption, selectChannels, duplicatePost, postInput, assertNoUncertainSubmission } from '../scripts/card.mjs';
import { listDayPosts, createPost } from '../scripts/buffer.mjs';
import { decodeWebsiteImage } from '../scripts/render.mjs';
import { captionThemes } from '../content/captions.mjs';

const now = new Date('2026-10-07T12:40:00Z');
const article = '<article class="juice-card" data-key="gratitude-87"><span class="pill">Gratitude Pour</span><span class="jc-no">Say thank you</span><p class="jc-msg">Thank you loses nothing by being late and gains everything by being specific.</p><div class="sip"><p>Write four sentences to one person about something they did years ago.</p></div><div class="sip dare"><p>Name the detail.</p></div></article>';
const html = `<span id="dailyDate">Oct 7, 2026</span><div id="dailySlot" data-key="gratitude-87">${article}</div>`;
const card = parseCard(html, now);
const ig = { id: 'ig1', name: 'positivity_juice', service: 'instagram', organizationId: 'org1' };
const tt = { id: 'tt1', name: '@positivity_juice', service: 'tiktok', organizationId: 'org1' };
const expected = { instagram: 'positivity_juice', tiktok: 'positivity_juice' };

test('live source must match the Eastern date and its stable card', async () => {
  assert.throws(() => parseCard(html.replace('Oct 7', 'Oct 6'), now), /Website date/);
  assert.throws(() => parseCard(html.replace('data-key="gratitude-87"', 'data-key="gratitude-86"'), now), /inconsistent/);
  assert.equal(dayKey(new Date('2026-10-08T02:00:00Z')), '2026-10-07');
  assert.equal(parseCard(html.replace('Name the detail.', 'Name the detail—then send it.'), now).extra, 'Name the detail—then send it.');
  let calls = 0;
  const mock = async () => new Response(++calls === 1 ? html : `<div id="cardSlot">${article.replace('Thank you loses', 'Something else loses')}</div>`, { headers: { 'content-type': 'text/html' } });
  await assert.rejects(getLiveCard(now, mock), /disagree/);
});

test('nine Eastern follows summer, winter, and DST transition dates', () => {
  for (const [input, expectedTime] of [
    ['2026-10-07T12:40:00Z', '2026-10-07T13:00:00.000Z'],
    ['2026-12-07T12:40:00Z', '2026-12-07T14:00:00.000Z'],
    ['2026-03-08T12:40:00Z', '2026-03-08T13:00:00.000Z'],
    ['2026-11-01T12:40:00Z', '2026-11-01T14:00:00.000Z'],
    ['2026-10-07T15:40:00Z', '2026-10-07T15:42:00.000Z'],
  ]) assert.equal(publishingTime(new Date(input)), expectedTime);
});

test('only the exact connected brand accounts can receive posts', () => {
  assert.deepEqual(selectChannels([{ channels: [ig, tt] }], expected), [ig, tt]);
  for (const channels of [[ig], [ig, tt, ig], [{ ...ig, isDisconnected: true }, tt], [ig, { ...tt, isQueuePaused: true }], [{ ...ig, name: 'personal' }, tt]]) {
    assert.throws(() => selectChannels([{ channels }], expected));
  }
});

test('existing and uncertain submissions cannot cause duplicates', () => {
  const post = { id: 'p1', text: caption(card, 'instagram'), status: 'scheduled', schedulingType: 'automatic' };
  assert.equal(duplicatePost([post], card), post);
  assert.equal(duplicatePost([], card), null);
  assert.throws(() => duplicatePost([post, post], card), /More than one/);
  assert.throws(() => duplicatePost([post], card, { card: 'gratitude-86', postId: post.id }), /different card/);
  const legacy = { ...post, text: `Today's Pour | ${card.date}\n${card.url}` };
  assert.equal(duplicatePost([legacy], card), legacy);
  assert.throws(() => duplicatePost([{ ...legacy, text: legacy.text.replace(card.url, 'another card') }], card), /different card/);
  const edited = { ...post, text: 'Caption edited manually after publishing.' };
  assert.equal(duplicatePost([edited], card, { card: card.key, postId: edited.id }), edited);
  assert.equal(duplicatePost([edited], card, { card: card.key, outcome: 'pending', caption: edited.text }), edited);
  for (const status of ['draft', 'error', 'needs_approval']) assert.throws(() => duplicatePost([{ ...post, status }], card), /already exists/);
  assert.throws(() => duplicatePost([{ ...post, schedulingType: 'notification' }], card), /manual/);
  for (const outcome of ['pending', 'accepted']) assert.throws(() => assertNoUncertainSubmission({ outcome }), /earlier submission/);
  assert.doesNotThrow(() => assertNoUncertainSubmission(null));
});

test('duplicate lookup follows every Buffer page with valid query variables', async () => {
  let calls = 0;
  const posts = await listDayPosts(ig, card, async (query, variables) => {
    assert.deepEqual(variables.input.sort, [{ field: 'createdAt', direction: 'desc' }]);
    assert.deepEqual(variables.input.filter.channelIds, ['ig1']);
    calls++;
    assert.equal(variables.after, calls === 1 ? null : 'next');
    return { posts: { edges: [{ node: { id: `p${calls}` } }], pageInfo: { endCursor: 'next', hasNextPage: calls === 1 } } };
  });
  assert.equal(calls, 2);
  assert.deepEqual(posts.map(p => p.id), ['p1', 'p2']);
});

test('uncertain Buffer mutation is attempted once only', async () => {
  let calls = 0;
  await assert.rejects(createPost({}, async () => { calls++; throw new Error('Request timed out'); }), /timed out/);
  assert.equal(calls, 1);
  await assert.rejects(createPost({ channelId: 'ig1' }, async () => ({ createPost: { post: { channelId: 'ig1', status: 'draft', schedulingType: 'automatic' } } })), /unexpected post status/);
});

test('each platform receives a human caption without the card copy or a link', () => {
  for (const channel of [ig, tt]) {
    const input = postInput(card, channel, 'https://example.com/card.png', publishingTime(now));
    assert.ok(input.text.includes('Ever remember something kind'));
    assert.ok(!input.text.includes(card.message));
    assert.ok(!input.text.includes(card.action));
    assert.ok(!input.text.includes(card.url));
    assert.doesNotMatch(input.text, /https?:|Send a little good to someone/);
    assert.equal(input.schedulingType, 'automatic');
    assert.equal(input.saveToDraft, false);
    assert.ok(input.assets[0].image.metadata.altText.includes(card.message));
  }
});

test('website download bytes pass through unchanged and wrong formats stop', () => {
  const original = Buffer.alloc(1200);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(original);
  original.writeUInt32BE(1080, 16); original.writeUInt32BE(1350, 20);
  const exported = decodeWebsiteImage(`data:image/png;base64,${original.toString('base64')}`);
  assert.deepEqual(exported.bytes, original);
  assert.equal(exported.layout.source, 'website-save-image');
  assert.throws(() => decodeWebsiteImage('https://example.com/image.png'), /downloadable PNG/);
  original.writeUInt32BE(1200, 16);
  assert.throws(() => decodeWebsiteImage(`data:image/png;base64,${original.toString('base64')}`), /changed size/);
});

test('every reviewed theme has conversational captions and unknown themes stop', () => {
  for (const [flavor, themes] of Object.entries(captionThemes)) for (const [theme, choices] of Object.entries(themes)) {
    assert.ok(choices.length >= 2);
    for (const body of choices) {
      assert.doesNotMatch(body, /https?:|[\u2013\u2014-]/);
      assert.ok(body.length > 80 && body.length < 500);
    }
    assert.ok(caption({ ...card, key: `${flavor}-1`, message: 'An unrelated source line.', theme }, 'instagram'));
  }
  assert.throws(() => caption({ ...card, key: 'calm-1', theme: 'A new theme' }, 'instagram'), /No reviewed caption/);
});
