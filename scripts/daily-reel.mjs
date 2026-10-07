import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadLocalEnv, getAccounts, listDayPosts, createPost } from './buffer.mjs';
import { dayKey, localParts, selectChannels, publishingTime } from './card.mjs';
import { reelPlan, verifyReelSource, duplicateReel, reelPostInput } from './reel.mjs';
import { readRepoFile, writeRepoFile, githubRequest, publishReelAsset } from './github.mjs';

loadLocalEnv();
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const flags = new Set(process.argv.slice(2));
const preview = flags.has('--preview');
const day = dayKey();
const report = { day, mode: preview ? 'preview' : 'publish', posts: [] };
const directory = new URL(`../output/reels/${day}/`, import.meta.url);
mkdirSync(directory, { recursive: true });
try {
  if (flags.has('--scheduled')) {
    if (process.env.PUBLISH_ENABLED !== 'true' || process.env.PUBLISH_REELS_ENABLED !== 'true') { console.log('Daily Reels are disabled.'); process.exit(0); }
    const hour = Number(localParts().hour);
    if (hour < 8 || hour > 12) { console.log('Outside the Eastern preparation window.'); process.exit(0); }
  }
  if (!preview && !flags.has('--publish') && !flags.has('--scheduled')) throw new Error('Choose --preview or --publish.');
  const plan = reelPlan(day);
  report.reel = plan.id;
  report.category = plan.category;
  await verifyReelSource(plan);
  const repo = process.env.GITHUB_REPOSITORY || config.repository;
  const work = [];
  if (!preview) {
    if ((await githubRequest(`/repos/${repo}`)).private) throw new Error('Approved public video hosting is unavailable.');
    for (const channel of selectChannels(await getAccounts(), config.expectedHandles)) {
      const path = `state/${day}/reel-${channel.service}.json`;
      const saved = await readRepoFile(repo, path);
      const state = saved ? JSON.parse(saved.bytes.toString('utf8')) : null;
      const found = duplicateReel(await listDayPosts(channel, plan.card), plan, state);
      if (found) {
        if (!state || state.outcome !== 'accepted' || state.postId !== found.id) {
          await writeRepoFile(repo, path, Buffer.from(JSON.stringify({ ...state, day, reel: plan.id, category: plan.category, sourceCard: plan.card.key, caption: found.text, dueAt: found.dueAt, outcome: 'accepted', postId: found.id }, null, 2)), `Reconcile ${channel.service} Reel for ${day}`);
        }
        report.posts.push({ service: channel.service, id: found.id, status: found.status, dueAt: found.dueAt, url: found.externalLink || null, reused: true });
        console.log(`${channel.service}: Reel already ${found.status}. No duplicate created.`);
      } else work.push({ channel, path });
    }
  }
  if (preview || work.length) {
    const planPath = new URL('plan.json', directory);
    const savedPlan = existsSync(planPath) ? JSON.parse(readFileSync(planPath)) : null;
    const videoPath = new URL('reel.mp4', directory);
    const proofPath = new URL('render.json', directory);
    const samePlan = JSON.stringify(savedPlan) === JSON.stringify(plan);
    writeFileSync(planPath, JSON.stringify(plan, null, 2));
    let valid = false;
    if (samePlan && existsSync(proofPath) && existsSync(videoPath)) {
      const proof = JSON.parse(readFileSync(proofPath));
      valid = proof.sha256 === createHash('sha256').update(readFileSync(videoPath)).digest('hex');
    }
    if (!valid) {
      const result = spawnSync(process.env.PYTHON_BINARY || 'python3', [fileURLToPath(new URL('render-reel.py', import.meta.url)), fileURLToPath(planPath)], { stdio: 'inherit', windowsHide: true });
      if (result.status !== 0) throw new Error('Reel rendering did not complete.');
    }
    if (!preview) {
      const bytes = readFileSync(videoPath);
      const digest = createHash('sha256').update(bytes).digest('hex');
      const videoUrl = await publishReelAsset(repo, `${plan.id}-${digest.slice(0,12)}.mp4`, bytes, digest);
      report.videoUrl = videoUrl;
      for (const { channel, path } of work) {
        // Recheck immediately before the intent and mutation, including on a partial retry.
        const current = await readRepoFile(repo, path);
        if (current) throw new Error('A Reel submission appeared during preparation. Review it before retrying.');
        const existing = duplicateReel(await listDayPosts(channel, plan.card), plan);
        if (existing) throw new Error('A matching Reel appeared during preparation. Run verification before retrying.');
        if (dayKey() !== day) throw new Error('The Eastern date changed. No further Reel will be submitted.');
        const input = reelPostInput(plan, channel, videoUrl, publishingTime(new Date(), config.reelPublishHour, config.reelPublishMinute));
        const state = { day, reel: plan.id, category: plan.category, sourceCard: plan.card.key, caption: input.text, dueAt: input.dueAt, videoUrl, music: `${plan.music.title} by ${plan.music.author}`, outcome: 'pending', startedAt: new Date().toISOString() };
        await writeRepoFile(repo, path, Buffer.from(JSON.stringify(state, null, 2)), `Reserve ${channel.service} Reel for ${day}`);
        const post = await createPost(input);
        await writeRepoFile(repo, path, Buffer.from(JSON.stringify({ ...state, outcome: 'accepted', postId: post.id }, null, 2)), `Confirm ${channel.service} Reel for ${day}`);
        report.posts.push({ service: channel.service, id: post.id, status: post.status, dueAt: post.dueAt, url: post.externalLink || null });
        console.log(`${channel.service}: ${post.status} Reel for ${post.dueAt}.`);
      }
    } else console.log(`${plan.categoryName} preview ready. No posts submitted.`);
  }
} catch (error) {
  report.error = String(error.message).replaceAll(process.env.BUFFER_API_KEY || '\u0000', '[redacted]');
  console.error(report.error);
  process.exitCode = 1;
} finally { writeFileSync(new URL('last-run.json', directory), JSON.stringify(report, null, 2)); }
