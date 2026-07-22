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
    const produce=masters.data.departments.find(x=>x.code==='produce'),cucumber=masters.data.products.find(x=>x.code==='produce_cucumber'),selection=masters.data.processes.find(x=>x.code==='produce_sort_pack'),noneReason=masters.data.inspection_waste_reasons.find(x=>x.code==='none');
    const employeeMasterResponse=await fetch(`${base}/api/v1/masters/employees`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'employee_master_test',name:'従業員マスタ確認',department_id:produce.id,hourly_rate:1350,line_enabled:false,employment_status:'active',effective_from:'2026-07-01'})});assert.equal(employeeMasterResponse.status,201);const employeeMasterId=(await employeeMasterResponse.json()).data.id;
    let employeeMaster=(await (await fetch(`${base}/api/v1/masters`)).json()).data.employees.find(x=>x.id===employeeMasterId);assert.equal(employeeMaster.hourly_rate,1350);assert.equal(employeeMaster.line_enabled,0);assert.equal(employeeMaster.active,1);
    const employeeMasterUpdate=await fetch(`${base}/api/v1/masters/employees/${employeeMasterId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({code:'employee_master_test',name:'従業員マスタ更新',department_id:produce.id,hourly_rate:1450,line_enabled:true,employment_status:'retired',effective_from:'2026-07-15'})});assert.equal(employeeMasterUpdate.status,200);employeeMaster=(await (await fetch(`${base}/api/v1/masters`)).json()).data.employees.find(x=>x.id===employeeMasterId);assert.equal(employeeMaster.name,'従業員マスタ更新');assert.equal(employeeMaster.hourly_rate,1450);assert.equal(employeeMaster.line_enabled,1);assert.equal(employeeMaster.active,0);
    db.prepare('UPDATE inventory_items SET product_id=? WHERE id=?').run(cucumber.id,itemId);
    const partnerId=Number(db.prepare("INSERT INTO partners(code,name,partner_type,active,created_at,updated_at) VALUES('test_supplier','テスト仕入先','supplier',1,?,?)").run(stamp,stamp).lastInsertRowid);
    const receipt=await fetch(`${base}/api/v1/receipts`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({receipt_date:'2026-07-19',department_id:produce.id,partner_id:partnerId,item_id:itemId,box_count:1,employee_id:employeeId,delivered_quantity:1000,measured_quantity:1000,inspection_waste_quantity:0,inspection_waste_reason_id:noneReason.id})});assert.equal(receipt.status,201);const receiptData=(await receipt.json()).data;
    for(const record of [{process_id:selection.id,input_qty_g:1000,output_qty_g:800,waste_qty_g:200}]){
      const saved=await fetch(`${base}/api/v1/process-runs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({work_date:'2026-07-19',department_id:produce.id,product_id:cucumber.id,employee_id:employeeId,input_lot_id:lotId,...record})});assert.equal(saved.status,201);
    }
    const produceResponse=await fetch(`${base}/api/v1/dashboard?department=produce&period=day&anchor=2026-07-19`),producePayload=await produceResponse.json(),cucumberResult=producePayload.data.produce.products.find(x=>x.name==='きゅうり');
    assert.equal(cucumberResult.measured_qty_g,1000);assert.equal(cucumberResult.selected_qty_g,800);assert.equal(cucumberResult.waste_qty_g,200);assert.equal(cucumberResult.yield_rate,0.8);
    const rateResponse=await fetch(`${base}/api/v1/labor-cost-rates`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({employee_id:employeeId,rate_type:'hourly',rate_amount:1200,effective_from:'2026-07-01'})});assert.equal(rateResponse.status,201);
    const exception=await fetch(`${base}/api/v1/work-time-exceptions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({work_date:'2026-07-19',department_id:produce.id,employee_id:employeeId,process_id:selection.id,started_at:'2026-07-19T09:00:00+09:00',ended_at:'2026-07-19T10:00:00+09:00',break_minutes:10,exception_reason:'LINE連携前'})});assert.equal(exception.status,201);const exceptionData=(await exception.json()).data;assert.equal(exceptionData.minutes,50);assert.equal(exceptionData.labor_cost_amount,1000);
    const rawCost=await fetch(`${base}/api/v1/purchase-costs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({receipt_line_id:receiptData.receipt_line_id,purchase_amount:10000})});assert.equal(rawCost.status,201);
    const finishedItemId=Number(db.prepare("INSERT INTO inventory_items(code,name,item_type,department_id,product_id,storage_unit,active,created_at,updated_at) VALUES('test_cucumber_finished','きゅうり完成品','finished',?,?,'bag',1,?,?)").run(produce.id,cucumber.id,stamp,stamp).lastInsertRowid);db.prepare('UPDATE products SET inventory_item_id=? WHERE id=?').run(finishedItemId,cucumber.id);
    const packagingItemId=Number(db.prepare("INSERT INTO inventory_items(code,name,item_type,department_id,storage_unit,active,created_at,updated_at) VALUES('test_bag','テスト袋','packaging',?,'piece',1,?,?)").run(produce.id,stamp,stamp).lastInsertRowid);
    const packageReceipt=await fetch(`${base}/api/v1/receipts`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({receipt_date:'2026-07-19',department_id:produce.id,partner_id:partnerId,item_id:packagingItemId,box_count:1,employee_id:employeeId,delivered_quantity:100,measured_quantity:100,inspection_waste_quantity:0,inspection_waste_reason_id:noneReason.id,unit:'piece'})});assert.equal(packageReceipt.status,201);const packageReceiptData=(await packageReceipt.json()).data;
    assert.equal((await fetch(`${base}/api/v1/purchase-costs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({receipt_line_id:packageReceiptData.receipt_line_id,purchase_amount:1000})})).status,201);
    const receivedRawLot=db.prepare('SELECT id FROM inventory_lots WHERE lot_no=?').get(receiptData.lot_no).id,packagingLot=db.prepare('SELECT id FROM inventory_lots WHERE lot_no=?').get(packageReceiptData.lot_no).id;
    const productionResponse=await fetch(`${base}/api/v1/production-batches`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({production_date:'2026-07-19',department_id:produce.id,consumptions:[{inventory_lot_id:receivedRawLot,quantity:1000}],outputs:[{product_id:cucumber.id,item_id:finishedItemId,completed_weight_g:800,completed_count:100}]})});assert.equal(productionResponse.status,201);const production=(await productionResponse.json()).data;
    const preparationResponse=await fetch(`${base}/api/v1/delivery-preparations`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({preparation_date:'2026-07-19',department_id:produce.id,materials:[{product_id:cucumber.id,inventory_lot_id:packagingLot,used_quantity:100,prepared_product_quantity:100}]})});assert.equal(preparationResponse.status,201);const preparation=(await preparationResponse.json()).data;
    const shipmentResponse=await fetch(`${base}/api/v1/shipments`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({delivery_date:'2026-07-19',department_id:produce.id,partner_id:partnerId,settlement_type:'cash',lines:[{product_id:cucumber.id,inventory_lot_id:production.outputs[0].lot_id,preparation_batch_id:preparation.id,quantity:10,unit_price:200}]})});assert.equal(shipmentResponse.status,201);const shipment=(await shipmentResponse.json()).data.lines[0];assert.equal(shipment.sales_amount,2000);assert.equal(shipment.direct_cost_amount,1100);assert.equal(shipment.gross_profit_amount,900);assert.equal(shipment.gross_profit_rate,0.45);
    assert.deepEqual(db.prepare('SELECT cost_type,amount FROM shipment_cost_details WHERE shipment_line_id=? ORDER BY cost_type').all(shipment.id).map(x=>({...x})),[{cost_type:'packaging',amount:100},{cost_type:'raw_material',amount:1000}]);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
