import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Phase2AのPIN、HMAC、重複防止、LINE打刻、訂正履歴が動作する', async () => {
  process.env.DATABASE_PATH=join(mkdtempSync(join(tmpdir(),'manufacturing-phase2a-')),'test.sqlite');
  process.env.ADMIN_PIN='2468';
  process.env.N8N_SHARED_SECRET='phase2a-test-secret';
  const { server }=await import(`../src/server.js?phase2a=${Date.now()}`);
  const { db }=await import('../src/db.js');
  const stamp=new Date().toISOString(),lotus=db.prepare("SELECT id FROM departments WHERE code='lotus'").get();
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='line_events'").get().name,'line_events');
  assert.equal(db.prepare("SELECT name FROM companies WHERE code='triangle'").get().name,'とらいアンぐる');
  const employeeId=Number(db.prepare("INSERT INTO employees(code,name,department_id,active,created_at,updated_at) VALUES('line_worker','LINE担当',?,1,?,?)").run(lotus.id,stamp,stamp).lastInsertRowid);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const signed=async(eventId,payload,timestamp=new Date().toISOString())=>{
    const body=JSON.stringify(payload),signature=createHmac('sha256',process.env.N8N_SHARED_SECRET).update(`${eventId}.${timestamp}.${body}`).digest('hex');
    return fetch(`${base}/api/v1/integrations/n8n/line-events`,{method:'POST',headers:{'content-type':'application/json','x-wf-event-id':eventId,'x-wf-timestamp':timestamp,'x-wf-signature':signature},body});
  };
  try {
    assert.equal((await fetch(`${base}/api/v1/admin/line-users`)).status,401);
    const unlock=await fetch(`${base}/api/v1/admin/unlock`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pin:'2468'})});
    assert.equal(unlock.status,200);const cookie=unlock.headers.get('set-cookie').split(';')[0],adminHeaders={'content-type':'application/json',cookie};
    const codeResponse=await fetch(`${base}/api/v1/admin/line-registration-codes`,{method:'POST',headers:adminHeaders,body:JSON.stringify({employee_id:employeeId,valid_minutes:60})});
    assert.equal(codeResponse.status,201);const code=(await codeResponse.json()).data.code;
    const registered=await signed('event-register',{action:'register',line_user_id:'U-test',registration_code:code,display_name:'テスト'});
    assert.equal(registered.status,200);assert.match((await registered.json()).data.message,/登録が完了/);
    const duplicate=await signed('event-register',{action:'register',line_user_id:'U-test',registration_code:code,display_name:'テスト'});
    assert.equal(duplicate.status,200);assert.equal((await duplicate.json()).data.duplicate,true);
    const invalid=await fetch(`${base}/api/v1/integrations/n8n/line-events`,{method:'POST',headers:{'content-type':'application/json','x-wf-event-id':'bad','x-wf-timestamp':new Date().toISOString(),'x-wf-signature':'bad'},body:'{}'});
    assert.equal(invalid.status,401);
    assert.deepEqual(db.prepare('SELECT status FROM line_events ORDER BY id').all().map(x=>x.status),['processed','duplicate','error']);
    await fetch(`${base}/api/v1/admin/company-settings`,{method:'PATCH',headers:adminHeaders,body:JSON.stringify({break_mode:'line'})});
    const started=await signed('event-start',{action:'start',line_user_id:'U-test',menu_code:'boiled_lotus',occurred_at:'2026-07-19T09:00:00+09:00',event_id:'event-start'});assert.equal(started.status,200);
    const mismatched=await signed('event-mismatch',{action:'status',line_user_id:'U-test',event_id:'different-event'});assert.equal(mismatched.status,400);assert.match((await mismatched.json()).error.message,/EventID/);
    const blocked=await signed('event-second',{action:'start',line_user_id:'U-test',menu_code:'chips',occurred_at:'2026-07-19T09:10:00+09:00'});assert.equal(blocked.status,400);
    const breakWhileWorking=await signed('event-break-blocked',{action:'break_start',line_user_id:'U-test',occurred_at:'2026-07-19T10:00:00+09:00'});assert.equal(breakWhileWorking.status,400);assert.match((await breakWhileWorking.json()).data.message,/作業を先に終了/);
    const ended=await signed('event-end',{action:'finish',menu_code:null,line_user_id:'U-test',occurred_at:'2026-07-19T11:00:00+09:00',event_id:'event-end'});assert.equal(ended.status,200);const endData=(await ended.json()).data;assert.match(endData.message,/作業120分・休憩0分/);
    const session=db.prepare("SELECT * FROM work_sessions WHERE external_id='event-start'").get();assert.equal(session.minutes,120);assert.equal(session.break_minutes,0);
    const breakStarted=await signed('event-break',{action:'break_start',line_user_id:'U-test',occurred_at:'2026-07-19T11:00:00+09:00'});assert.equal(breakStarted.status,200);assert.equal((await breakStarted.json()).data.state,'break');
    const workDuringBreak=await signed('event-work-during-break',{action:'start',line_user_id:'U-test',menu_code:'chips',occurred_at:'2026-07-19T11:05:00+09:00'});assert.equal(workDuringBreak.status,400);assert.match((await workDuringBreak.json()).data.message,/休憩を先に終了/);
    const breakEnded=await signed('event-break-end',{action:'finish',line_user_id:'U-test',occurred_at:'2026-07-19T11:15:00+09:00'});assert.equal(breakEnded.status,200);assert.equal((await breakEnded.json()).data.state,'idle');
    const breakRow=db.prepare("SELECT * FROM standalone_break_sessions WHERE external_id='event-break'").get();assert.equal(breakRow.minutes,15);assert.equal(breakRow.status,'completed');
    const correction=await fetch(`${base}/api/v1/admin/work-sessions/${session.id}`,{method:'PATCH',headers:adminHeaders,body:JSON.stringify({break_minutes:10,reason:'休憩打刻の確認訂正'})});assert.equal(correction.status,200);assert.equal((await correction.json()).data.minutes,110);
    assert.equal(db.prepare('SELECT COUNT(*) total FROM work_session_corrections WHERE work_session_id=?').get(session.id).total,1);
    const submenu=await signed('event-submenu',{action:'start',line_user_id:'U-test',menu_code:'outside_group'});assert.equal(submenu.status,200);
    const submenuData=(await submenu.json()).data;assert.equal(submenuData.state,'submenu');
    assert.deepEqual(submenuData.menu.map(x=>[x.code,x.label]),[
      ['delivery_prep','納品準備'],
      ['delivery','納品'],
      ['outside','外回り'],
      ['other_non_processing','その他業務'],
    ]);
    assert.equal(db.prepare("SELECT active FROM line_menu_items WHERE company_id=1 AND code='transport'").get()?.active??0,0);
    assert.equal(db.prepare("SELECT active FROM line_menu_items WHERE company_id=1 AND code='purchase'").get()?.active??0,0);
    const produceSubmenu=await signed('event-produce-submenu',{action:'start',line_user_id:'U-test',menu_code:'produce_group'});assert.equal(produceSubmenu.status,200);
    assert.deepEqual((await produceSubmenu.json()).data.menu.map(x=>[x.code,x.label]),[['green_onion','ねぎ'],['cucumber','きゅうり']]);
    await fetch(`${base}/api/v1/admin/company-settings`,{method:'PATCH',headers:adminHeaders,body:JSON.stringify({break_mode:'fixed'})});
    await fetch(`${base}/api/v1/admin/fixed-breaks`,{method:'POST',headers:adminHeaders,body:JSON.stringify({name:'夜間休憩',start_time:'23:30',end_time:'00:30'})});
    assert.equal((await signed('event-night-start',{action:'start',line_user_id:'U-test',menu_code:'boiled_lotus',occurred_at:'2026-07-19T23:00:00+09:00'})).status,200);
    const nightEnd=await signed('event-night-end',{action:'end',line_user_id:'U-test',occurred_at:'2026-07-20T01:00:00+09:00'});assert.equal(nightEnd.status,200);assert.match((await nightEnd.json()).data.message,/作業60分・休憩60分/);
    await fetch(`${base}/api/v1/masters/employees/${employeeId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({line_enabled:false,employment_status:'active'})});
    const disabledCode=await fetch(`${base}/api/v1/admin/line-registration-codes`,{method:'POST',headers:adminHeaders,body:JSON.stringify({employee_id:employeeId,valid_minutes:60})});assert.equal(disabledCode.status,400);assert.match((await disabledCode.json()).error.message,/LINE連携対象/);
    assert.equal(db.prepare('SELECT active FROM line_users WHERE employee_id=?').get(employeeId).active,0);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
