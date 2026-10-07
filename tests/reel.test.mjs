import test from 'node:test';
import assert from 'node:assert/strict';
import { reelPlan, reelCategories, verifyReelSource, duplicateReel, reelPostInput } from '../scripts/reel.mjs';
import { publishingTime } from '../scripts/card.mjs';

test('all six categories rotate with 600 distinct website messages', () => {
  const ids = new Set();
  for (let offset = 0; offset < 600; offset++) {
    const day = new Date(Date.UTC(2026, 9, 7 + offset)).toISOString().slice(0, 10);
    const plan = reelPlan(day);
    assert.equal(plan.category, reelCategories[offset % 6]);
    assert.ok(!ids.has(plan.card.key));
    ids.add(plan.card.key);
    for (const text of [plan.message, plan.action, ...Object.values(plan.captions)]) assert.doesNotMatch(text, /[\u2013\u2014-]/);
    for (const text of Object.values(plan.captions)) {
      assert.doesNotMatch(text, /https?:|Send a little good to someone|#TodaysPour/);
      assert.ok(!text.includes(plan.card.message));
      assert.ok(!text.includes(plan.card.action));
    }
    assert.equal(new URL(plan.card.url).hostname, 'positivityjuice.com');
    assert.match(plan.video.sha256, /^[a-f0-9]{64}$/);
    assert.match(plan.music.sha256, /^[a-f0-9]{64}$/);
  }
  for (const day of ['2026-10-06', '2027-02-30', 'invalid']) assert.throws(() => reelPlan(day), /date/);
});

test('Reels remain at seven Eastern through both DST changes', () => {
  for (const [input, expected] of [
    ['2026-10-07T12:00:00Z', '2026-10-07T23:00:00.000Z'],
    ['2026-11-01T13:00:00Z', '2026-11-02T00:00:00.000Z'],
    ['2027-03-14T12:00:00Z', '2027-03-14T23:00:00.000Z'],
  ]) assert.equal(publishingTime(new Date(input), 19, 0), expected);
});

test('Reels use automatic video posts and a supported video thumbnail offset', () => {
  const plan = reelPlan('2026-10-07');
  for (const service of ['instagram', 'tiktok']) {
    const input = reelPostInput(plan, { id: service, service }, 'https://example.com/reel.mp4', '2026-10-07T23:00:00.000Z');
    assert.equal(input.text, plan.captions[service]);
    assert.equal(input.schedulingType, 'automatic');
    assert.equal(input.saveToDraft, false);
    assert.equal(input.assets.length, 1);
    assert.equal(input.assets[0].video.metadata.thumbnailOffset, 2000);
    assert.equal(input.assets[0].video.thumbnailUrl, undefined);
    if (service === 'instagram') assert.equal(input.metadata.instagram.type, 'reel');
  }
});

test('an uncertain or edited Reel never creates a second submission', () => {
  const plan = reelPlan('2026-10-07');
  const post = { id: 'r1', text: plan.captions.instagram, status: 'scheduled', schedulingType: 'automatic' };
  const state = { day: plan.day, reel: plan.id, caption: post.text, postId: post.id, outcome: 'accepted' };
  assert.equal(duplicateReel([], plan), null);
  assert.equal(duplicateReel([post], plan), post);
  assert.equal(duplicateReel([{ ...post, text: 'An edited caption.' }], plan, state).id, post.id);
  assert.equal(duplicateReel([post], plan, { ...state, postId: undefined, outcome: 'pending' }), post);
  assert.throws(() => duplicateReel([], plan, state), /uncertain/);
  assert.throws(() => duplicateReel([post, post], plan), /More than one/);
  assert.throws(() => duplicateReel([post], plan, { ...state, day: '2026-10-08' }), /Another Reel/);
  for (const status of ['draft', 'error', 'needs_approval']) assert.throws(() => duplicateReel([{ ...post, status }], plan), /attention/);
  assert.throws(() => duplicateReel([{ ...post, schedulingType: 'notification' }], plan), /attention/);
});

test('missing or changed website copy stops publication', async () => {
  const plan = reelPlan('2026-10-07');
  const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  const html = `<div id="cardSlot"><article data-key="${plan.card.key}"><p class="jc-msg">${escape(plan.card.message)}</p><div class="sip"><p>${escape(plan.card.action)}</p></div></article></div>`;
  const response = body => async () => new Response(body, { headers: { 'content-type': 'text/html' } });
  await verifyReelSource(plan, response(html));
  await assert.rejects(verifyReelSource(plan, response(html.replace(escape(plan.card.message), 'A new website message.'))), /changed/);
  await assert.rejects(verifyReelSource(plan, async () => new Response('', { status: 404 })), /unavailable/);
});
