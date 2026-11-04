// Verify the public suspension through Nginx; the API's private Docker address is intentionally excluded.
import assert from 'node:assert/strict';
const base = process.argv[2] || 'https://web3.sqdxw.top';
const closed = [
  '/agent', '/agent/', '/agent?tab=api', '/agent.data', '/%61gent',
  '/api/mcp', '/api/mcp/', '/api/v1/items', '/api/v1/agent', '/api/v1/agent/latest', '/api/v1/btc-monitor',
  '/feed.xml', '/feed', '/feed/all.xml', '/feed/full.xml', '/feed/daily.xml', '/feed/weekly.xml', '/feed/monthly.xml',
  '/feed/category/security.xml', '/rss', '/rss.xml', '/atom.xml', '/llms.txt', '/openapi-v1.json',
];
for (const path of closed) {
  const response = await fetch(base + path, {redirect:'manual'});
  assert.equal(response.status,404,path);
  assert.match(response.headers.get('cache-control') || '',/no-store/,path);
  await response.body?.cancel();
}
for (const method of ['POST','OPTIONS','HEAD']) {
  const response = await fetch(base+'/api/mcp', {method});
  assert.equal(response.status,404,method+' /api/mcp');
  await response.body?.cancel();
}
for (const path of ['/', '/all', '/hot', '/daily', '/daily/archive', '/topics', '/starred', '/btc', '/about', '/more', '/terms', '/privacy', '/admin/login', '/api/health']) {
  const response = await fetch(base+path);
  assert.equal(response.status,200,path);
  const body = await response.text();
  if(!path.startsWith('/api/')) {
    assert.ok(!/href=["']\/agent(?:[?"'])/.test(body),path+' advertises Agent');
    assert.ok(!/href=["']\/feed\.xml["']/.test(body),path+' advertises RSS');
  }
  if(path==='/btc') assert.match(body,/BTC 市场状态/);
}
const sitemap=await (await fetch(base+'/sitemap.xml')).text();
assert.ok(!sitemap.includes('/agent</loc>'),'sitemap advertises Agent');
const robots=await (await fetch(base+'/robots.txt')).text();
assert.ok(!robots.includes('Allow: /api/'),'robots advertises public APIs');
console.log('PASS: 24 public paths and 3 MCP methods closed; 14 website routes, discovery files and removed links verified.');
