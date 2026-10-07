import { readFileSync } from 'node:fs';

export function loadLocalEnv() {
  try {
    for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export async function bufferQuery(query, variables = {}, fetchImpl = fetch) {
  const key = process.env.BUFFER_API_KEY;
  if (!key) throw new Error('The Buffer key has not been saved yet.');
  const response = await fetchImpl('https://api.buffer.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`Buffer returned HTTP ${response.status}.`);
  const result = await response.json();
  if (result.errors?.length) throw new Error(result.errors.map(e => e.message).join('; ').replaceAll(key, '[redacted]'));
  if (!result.data) throw new Error('Buffer returned no data.');
  return result.data;
}

export async function getAccounts() {
  const { account } = await bufferQuery('query { account { organizations { id name } } }');
  const result = [];
  for (const organization of account.organizations) {
    const { channels } = await bufferQuery('query($input: ChannelsInput!) { channels(input: $input) { id name displayName service type organizationId externalLink isDisconnected isLocked isQueuePaused timezone } }', { input: { organizationId: organization.id } });
    result.push({ organization, channels });
  }
  return result;
}

export async function listDayPosts(channel, card, queryImpl = bufferQuery) {
  const posts = [];
  let after = null;
  const startDate = new Date(Date.parse(`${card.day}T00:00:00Z`) - 86400000).toISOString();
  const endDate = new Date(Date.parse(`${card.day}T00:00:00Z`) + 2 * 86400000).toISOString();
  for (let page = 0; page < 20; page++) {
    const result = await queryImpl('query($input: PostsInput!, $after: String) { posts(input: $input, first: 100, after: $after) { edges { node { id text status channelId schedulingType dueAt externalLink } } pageInfo { endCursor hasNextPage } } }', { input: { organizationId: channel.organizationId, filter: { channelIds: [channel.id], startDate, endDate }, sort: [{ field: 'createdAt', direction: 'desc' }] }, after });
    posts.push(...result.posts.edges.map(e => e.node));
    if (!result.posts.pageInfo.hasNextPage) return posts;
    after = result.posts.pageInfo.endCursor;
    if (!after) throw new Error('Buffer pagination was incomplete.');
  }
  throw new Error('Too many posts to safely check for duplicates.');
}

export async function createPost(input, queryImpl = bufferQuery) {
  // Never automatically retry this mutation. A timeout might mean the post was accepted.
  const result = await queryImpl('mutation($input: CreatePostInput!) { createPost(input: $input) { __typename ... on PostActionSuccess { post { id status dueAt channelId schedulingType externalLink } } ... on MutationError { message } } }', { input });
  if (!result.createPost.post) throw new Error(`Buffer did not confirm a post: ${result.createPost.message || result.createPost.__typename}`);
  const post = result.createPost.post;
  if (post.channelId !== input.channelId || post.schedulingType !== 'automatic' || !['scheduled', 'sending', 'sent'].includes(post.status)) throw new Error(`Buffer returned unexpected post status ${post.status}. Review the existing post.`);
  return post;
}
