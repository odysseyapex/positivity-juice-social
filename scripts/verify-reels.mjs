import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { loadLocalEnv, getAccounts, bufferQuery } from './buffer.mjs';
import { dayKey, selectChannels } from './card.mjs';
import { readRepoFile } from './github.mjs';

loadLocalEnv();
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const repo = process.env.GITHUB_REPOSITORY || config.repository;
const day = dayKey();
const queued = process.argv.includes('--queued');
const result = { day, posts: [] };
try {
  for (const channel of selectChannels(await getAccounts(), config.expectedHandles)) {
    const record = await readRepoFile(repo, `state/${day}/reel-${channel.service}.json`);
    const state = record && JSON.parse(record.bytes.toString('utf8'));
    if (!state?.postId || state.day !== day) throw new Error(`${channel.service} has no confirmed Reel for today.`);
    const { post } = await bufferQuery('query($input: PostInput!) { post(input: $input) { id channelId status dueAt externalLink schedulingType } }', { input: { id: state.postId } });
    if (post.channelId !== channel.id || post.schedulingType !== 'automatic' || Date.parse(post.dueAt) !== Date.parse(state.dueAt)) throw new Error('The Reel account, schedule, or publishing method changed.');
    result.posts.push({ service: channel.service, ...post });
    console.log(`${channel.service}: ${post.status}, ${post.dueAt}${post.externalLink ? ` ${post.externalLink}` : ''}`);
    if (!(queued ? ['scheduled', 'sending', 'sent'] : ['sent']).includes(post.status)) throw new Error(`${channel.service} Reel needs attention (${post.status}).`);
  }
} catch (error) {
  result.error = String(error.message).replaceAll(process.env.BUFFER_API_KEY || '\u0000', '[redacted]');
  console.error(result.error);
  process.exitCode = 1;
} finally {
  mkdirSync(new URL('../output/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../output/reel-verification.json', import.meta.url), JSON.stringify(result, null, 2));
}
