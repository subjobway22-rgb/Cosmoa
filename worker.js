// Cloudflare Worker: 정적 파일(public/)은 assets가 처리하고, /api/* 와 매일 수집(cron)을 여기서 처리한다.
import { createStore, upstashBackend } from './lib/store';
import { createApp } from './lib/app';
import seed from './data/seed-events.json';
import sources from './data/sources.json';

const statics = { 'seed-events.json': seed, 'sources.json': sources };
const build = (env) => createApp({
  store: createStore(upstashBackend(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN), statics),
  adminToken: env.ADMIN_TOKEN,
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const bodyText = ['GET', 'HEAD'].includes(request.method) ? '' : (await request.text()).slice(0, 20000);
    const r = await build(env).handle({
      method: request.method, path: url.pathname, bodyText,
      headers: Object.fromEntries(request.headers), ip: request.headers.get('cf-connecting-ip') || 'unknown',
    });
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff' } });
  },
  // 하루 1회 행사 정보 수집 (wrangler.jsonc의 crons)
  async scheduled(_event, env, ctx) { ctx.waitUntil(build(env).refresh()); },
};
