import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadLocalEnv, getAccounts, listDayPosts, createPost } from './buffer.mjs';
import { getLiveCard, parseCard, localParts, dayKey, caption, selectChannels, publishingTime, duplicatePost, postInput, assertNoUncertainSubmission } from './card.mjs';
import { renderCard } from './render.mjs';
import { readRepoFile, writeRepoFile, githubRequest } from './github.mjs';

loadLocalEnv();
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const options = new Set(process.argv.slice(2));
const now = new Date();
const out = new URL('../output/', import.meta.url);
mkdirSync(out, { recursive: true });
const report = { day: dayKey(now), posts: [] };
const saveReport = () => writeFileSync(new URL('last-run.json', out), JSON.stringify(report, null, 2));
const preview = options.has('--preview') || options.has('--fixture');

try {
  if (options.has('--scheduled')) {
    if (process.env.PUBLISH_ENABLED !== 'true') { console.log('Daily publishing is not enabled.'); process.exit(0); }
    const hour = Number(localParts(now).hour);
    if (hour < 8 || hour > 12) { console.log('Outside the Eastern morning window.'); process.exit(0); }
  }
  if (!preview && !options.has('--publish') && !options.has('--scheduled')) throw new Error('Choose --preview or --publish.');
  const card = options.has('--fixture') ? parseCard(readFileSync(new URL('../.private/daily.html', import.meta.url), 'utf8'), now) : await getLiveCard(now);
  report.card = card;
  const rendered = await renderCard(card);
  writeFileSync(new URL('todays-pour.png', out), rendered.bytes);
  writeFileSync(new URL('card.json', out), JSON.stringify({ ...card, layout: rendered.layout }, null, 2));
  for (const service of ['instagram', 'tiktok']) writeFileSync(new URL(`${service}-caption.txt`, out), caption(card, service));
  console.log(`${card.date}: ${card.category}. ${card.message}`);
  if (preview) { report.mode = 'preview'; console.log('Preview created. No posts were sent.'); }
  else {
    const channels = selectChannels(await getAccounts(), config.expectedHandles);
    const repo = process.env.GITHUB_REPOSITORY || config.repository;
    const repository = await githubRequest(`/repos/${repo}`);
    if (repository.private) throw new Error('Public image hosting has not been enabled. The repository is still private.');
    const hash = createHash('sha256').update(rendered.bytes).digest('hex').slice(0, 12);
    const imagePath = `cards/${card.day}-${card.key}-${hash}.png`;
    const imageUrl = `https://raw.githubusercontent.com/${repo}/main/${imagePath}`;
    await writeRepoFile(repo, imagePath, rendered.bytes, `Prepare Today’s Pour for ${card.day}`);
    // Wait for the image to be fetchable before passing its public URL to Buffer.
    let available = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
      if (response.ok && response.headers.get('content-type')?.startsWith('image/') && Buffer.from(await response.arrayBuffer()).equals(rendered.bytes)) { available = true; break; }
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    if (!available) throw new Error('The public image is not available yet. No post was submitted.');
    for (const channel of channels) {
      // A durable intent is written before each mutation. Uncertain results stop retries.
      const statePath = `state/${card.day}/${channel.service}.json`;
      const stored = await readRepoFile(repo, statePath);
      const state = stored ? JSON.parse(stored.bytes.toString('utf8')) : null;
      const existing = duplicatePost(await listDayPosts(channel, card), card);
      if (existing) {
        if (existing.status !== 'sent' && Date.parse(existing.dueAt) < Date.now() - 3600000) throw new Error(`${channel.service} is still ${existing.status} more than an hour after its due time. Review Buffer.`);
        report.posts.push({ service: channel.service, status: existing.status, id: existing.id, url: existing.externalLink || null, reused: true });
        await writeRepoFile(repo, statePath, Buffer.from(JSON.stringify({ day: card.day, card: card.key, outcome: 'accepted', postId: existing.id }, null, 2)), `Confirm ${channel.service} for ${card.day}`);
        console.log(`${channel.service}: already ${existing.status}. No duplicate created.`);
        continue;
      }
      assertNoUncertainSubmission(state);
      if (dayKey(new Date()) !== card.day) throw new Error('The Eastern date changed before publishing. Nothing further will be submitted.');
      await writeRepoFile(repo, statePath, Buffer.from(JSON.stringify({ day: card.day, card: card.key, outcome: 'pending', startedAt: new Date().toISOString() }, null, 2)), `Reserve ${channel.service} for ${card.day}`);
      const post = await createPost(postInput(card, channel, imageUrl, publishingTime(new Date(), config.publishHour, config.publishMinute)));
      await writeRepoFile(repo, statePath, Buffer.from(JSON.stringify({ day: card.day, card: card.key, outcome: 'accepted', postId: post.id }, null, 2)), `Confirm ${channel.service} for ${card.day}`);
      report.posts.push({ service: channel.service, status: post.status, id: post.id, url: post.externalLink || null });
      console.log(`${channel.service}: ${post.status} for ${post.dueAt}.`);
    }
    report.mode = 'publish';
  }
} catch (error) {
  report.error = String(error.message).replaceAll(process.env.BUFFER_API_KEY || '\u0000', '[redacted]');
  console.error(report.error); process.exitCode = 1;
} finally { saveReport(); }
