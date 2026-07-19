import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('認証なしでダッシュボードを取得できる', async () => {
  process.env.DATABASE_PATH=join(mkdtempSync(join(tmpdir(),'manufacturing-')),'test.sqlite');
  const { server }=await import(`../src/server.js?test=${Date.now()}`);
  const { db }=await import('../src/db.js');
  const stamp=new Date().toISOString(),produceDepartment=db.prepare("SELECT id FROM departments WHERE code='produce'").get();
  const employeeId=Number(db.prepare("INSERT INTO employees(code,name,department_id,active,created_at,updated_at) VALUES('test_worker','テスト担当',?,1,?,?)").run(produceDepartment.id,stamp,stamp).lastInsertRowid);
  const itemId=Number(db.prepare("INSERT INTO inventory_items(code,name,item_type,department_id,storage_unit,active,created_at,updated_at) VALUES('test_cucumber_raw','きゅうり原料','raw',?,'g',1,?,?)").run(produceDepartment.id,stamp,stamp).lastInsertRowid);
  const lotId=Number(db.prepare("INSERT INTO inventory_lots(item_id,lot_no,received_or_made_on,unit_cost) VALUES(?,'TEST-LOT','2026-07-19',0)").run(itemId).lastInsertRowid);
  db.prepare("INSERT INTO inventory_movements(lot_id,business_date,movement_type,quantity_delta,source_type,department_id,created_at) VALUES(?,'2026-07-19','receipt',10000,'test',?,?)").run(lotId,produceDepartment.id,stamp);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const response=await fetch(`${base}/api/v1/dashboard?department=lotus&period=day&anchor=2026-07-19`);
    assert.equal(response.status,200); const payload=await response.json();
    assert.equal(payload.data.department.name,'れんこん');
    assert.deepEqual(payload.data.process_flow.map(x=>x.name),['水煮加工','チップス加工']);
    const masters=await (await fetch(`${base}/api/v1/masters`)).json();
    const produce=masters.data.departments.find(x=>x.code==='produce'),cucumber=masters.data.products.find(x=>x.code==='produce_cucumber'),harvest=masters.data.processes.find(x=>x.code==='produce_harvest'),selection=masters.data.processes.find(x=>x.code==='produce_sort_pack');
    for(const record of [{process_id:harvest.id,input_qty_g:1000,output_qty_g:1000,waste_qty_g:0},{process_id:selection.id,input_qty_g:1000,output_qty_g:800,waste_qty_g:200}]){
      const saved=await fetch(`${base}/api/v1/process-runs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({work_date:'2026-07-19',department_id:produce.id,product_id:cucumber.id,employee_id:employeeId,input_lot_id:lotId,...record})});assert.equal(saved.status,201);
    }
    const produceResponse=await fetch(`${base}/api/v1/dashboard?department=produce&period=day&anchor=2026-07-19`),producePayload=await produceResponse.json(),cucumberResult=producePayload.data.produce.products.find(x=>x.name==='きゅうり');
    assert.equal(cucumberResult.harvest_qty_g,1000);assert.equal(cucumberResult.selected_qty_g,800);assert.equal(cucumberResult.waste_qty_g,200);assert.equal(cucumberResult.yield_rate,0.8);
    const exception=await fetch(`${base}/api/v1/work-time-exceptions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({work_date:'2026-07-19',department_id:produce.id,employee_id:employeeId,process_id:selection.id,started_at:'2026-07-19T09:00:00+09:00',ended_at:'2026-07-19T10:00:00+09:00',break_minutes:10,exception_reason:'LINE連携前'})});assert.equal(exception.status,201);assert.equal((await exception.json()).data.minutes,50);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
