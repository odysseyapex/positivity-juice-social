import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCard, getLiveCard, dayKey, publishingTime, caption, selectChannels, duplicatePost, postInput, assertNoUncertainSubmission } from '../scripts/card.mjs';
import { listDayPosts, createPost } from '../scripts/buffer.mjs';
import { renderCard } from '../scripts/render.mjs';

const now = new Date('2026-10-07T12:40:00Z');
const article = '<article class="juice-card" data-key="gratitude-87"><span class="pill">Gratitude Pour</span><p class="jc-msg">Thank you loses nothing by being late and gains everything by being specific.</p><div class="sip"><p>Write four sentences to one person about something they did years ago.</p></div><div class="sip dare"><p>Name the detail.</p></div></article>';
const html = `<span id="dailyDate">Oct 7, 2026</span><div id="dailySlot" data-key="gratitude-87">${article}</div>`;
const card = parseCard(html, now);
const ig = { id: 'ig1', name: 'positivity_juice', service: 'instagram', organizationId: 'org1' };
const tt = { id: 'tt1', name: '@positivity_juice', service: 'tiktok', organizationId: 'org1' };
const expected = { instagram: 'positivity_juice', tiktok: 'positivity_juice' };

test('live source must match the Eastern date and its stable card', async () => {
  assert.throws(() => parseCard(html.replace('Oct 7', 'Oct 6'), now), /Website date/);
  assert.throws(() => parseCard(html.replace('data-key="gratitude-87"', 'data-key="gratitude-86"'), now), /inconsistent/);
  assert.equal(dayKey(new Date('2026-10-08T02:00:00Z')), '2026-10-07');
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
  assert.throws(() => duplicatePost([{ ...post, text: post.text.replace(card.url, 'another card') }], card), /different card/);
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

test('each platform receives the exact card and automatic photo publishing', () => {
  for (const channel of [ig, tt]) {
    const input = postInput(card, channel, 'https://example.com/card.png', publishingTime(now));
    assert.ok(input.text.includes(card.message));
    assert.ok(input.text.includes(card.action));
    assert.ok(input.text.includes(card.url));
    assert.equal(input.schedulingType, 'automatic');
    assert.equal(input.saveToDraft, false);
    assert.ok(input.assets[0].image.metadata.altText.includes(card.message));
  }
});

test('portrait artwork fits typical copy and refuses unreadable overflow', async () => {
  const { bytes, layout } = await renderCard(card);
  assert.equal(bytes.readUInt32BE(16), 1080);
  assert.equal(bytes.readUInt32BE(20), 1350);
  assert.ok(layout.message.size >= 38 && layout.action.size >= 26);
  await assert.rejects(renderCard({ ...card, message: 'A very long message. '.repeat(150) }), /does not fit/);
});
