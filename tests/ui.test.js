import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const html=readFileSync(resolve(root,'public/index.html'),'utf8');
const app=readFileSync(resolve(root,'public/app.js'),'utf8');
const inputs=readFileSync(resolve(root,'public/phase1-inputs.js'),'utf8');
const css=readFileSync(resolve(root,'public/mobile-design.css'),'utf8');

test('Phase1の下部導線と在庫初期登録が表示される',()=>{
  assert.match(html,/ホーム[\s\S]*入力[\s\S]*メニュー/);
  assert.doesNotMatch(html,/<small>在庫<\/small>|<small>マスタ<\/small>/);
  assert.doesNotMatch(html,/id="bottomMenuButton"/);
  assert.match(html,/id="openingInventoryForm"/);
  assert.match(html,/data-operation="inventory-opening"/);
  assert.match(html,/data-inventory-action="stocktake"/);
  assert.match(html,/data-inventory-action="opening"/);
  assert.match(app,/data-bottom-view/);
});

test('LINE利用者管理は従業員カードから直接操作する',()=>{
  assert.doesNotMatch(html,/id="registrationCodeForm"/);
  assert.match(html,/id="lineUsersList" class="line-user-grid"/);
  assert.match(app,/function lineUserCard/);
  assert.match(app,/data-issue-line-code/);
  assert.match(app,/statusRank/);
});

test('取引先マスタは自動採番と仕入・販売条件を持つ',()=>{
  assert.match(html,/id="partnerMasterForm"/);
  assert.doesNotMatch(html,/id="partnerMasterForm"(?:(?!<\/form>).)*name="code"/s);
  for(const field of ['is_supplier','is_customer','supplier_payment_method','supplier_closing_day','supplier_payment_day','supplier_payment_account','customer_receipt_method','customer_closing_day','customer_receipt_day','customer_receipt_account','memo'])assert.match(html,new RegExp(`name="${field}"`));
  assert.match(inputs,/function editPartner/);
});

test('検品票と部門連動のUI契約を維持する',()=>{
  assert.match(html,/備考（破棄理由）<textarea name="memo" rows="3" required>/);
  assert.match(inputs,/x\.department_id===departmentId/);
  assert.match(css,/\.inspection-sheet form \{ display:grid/);
  assert.match(css,/\.inventory-mode-opening #inventoryListPanel/);
});

test('ダッシュボードへログイン・権限UIを表示しない',()=>{
  assert.doesNotMatch(html,/ユーザーID|パスワード|権限区分|ログイン・権限設計/);
  assert.doesNotMatch(app,/ユーザーID|パスワード|権限区分|ログイン・権限設計/);
  assert.match(css,/#dashboardView \{ height:calc\(100d?vh/);
});

test('作業履歴はUTCをJST表示し訂正時にUTCへ戻す',()=>{
  assert.match(app,/timeZone:'Asia\/Tokyo'/);
  assert.match(app,/const jstInputToUtc=/);
  assert.match(app,/\+09:00/);
  assert.match(app,/payload\.started_at=jstInputToUtc/);
  assert.match(app,/payload\.ended_at=jstInputToUtc/);
});
