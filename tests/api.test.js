import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('認証なしでダッシュボードを取得できる', async () => {
  process.env.DATABASE_PATH=join(mkdtempSync(join(tmpdir(),'manufacturing-')),'test.sqlite');
  const { server }=await import(`../src/server.js?test=${Date.now()}`);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const response=await fetch(`${base}/api/v1/dashboard?department=lotus&period=day&anchor=2026-07-19`);
    assert.equal(response.status,200); const payload=await response.json();
    assert.equal(payload.data.department.name,'れんこん');
    assert.deepEqual(payload.data.process_flow.map(x=>x.name),['水煮加工','チップス加工']);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
