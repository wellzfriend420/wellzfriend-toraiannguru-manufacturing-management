import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databasePath = resolve(root, process.env.DATABASE_PATH ?? './data/manufacturing.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
export const db = new DatabaseSync(databasePath);
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
db.exec(readFileSync(resolve(root, 'src/schema.sql'), 'utf8'));
if(!db.prepare("SELECT 1 FROM pragma_table_info('process_runs') WHERE name='product_id'").get()) db.exec('ALTER TABLE process_runs ADD COLUMN product_id INTEGER REFERENCES products(id)');
if(!db.prepare("SELECT 1 FROM pragma_table_info('work_sessions') WHERE name='exception_reason'").get()) db.exec('ALTER TABLE work_sessions ADD COLUMN exception_reason TEXT');
if(!db.prepare("SELECT 1 FROM pragma_table_info('work_sessions') WHERE name='company_id'").get()) db.exec('ALTER TABLE work_sessions ADD COLUMN company_id INTEGER REFERENCES companies(id)');
if(!db.prepare("SELECT 1 FROM pragma_table_info('work_sessions') WHERE name='product_id'").get()) db.exec('ALTER TABLE work_sessions ADD COLUMN product_id INTEGER REFERENCES products(id)');
if(!db.prepare("SELECT 1 FROM pragma_table_info('work_sessions') WHERE name='break_mode'").get()) db.exec('ALTER TABLE work_sessions ADD COLUMN break_mode TEXT');
const addColumn=(table,column,definition)=>{if(!db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name=?`).get(column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);};
addColumn('processes','cost_scope',"TEXT NOT NULL DEFAULT 'department_shared'");
addColumn('processes','shared_cost_category','TEXT');
addColumn('receipt_lines','box_count','INTEGER NOT NULL DEFAULT 0');
addColumn('receipt_lines','delivered_quantity','INTEGER NOT NULL DEFAULT 0');
addColumn('receipt_lines','measured_quantity','INTEGER NOT NULL DEFAULT 0');
addColumn('receipt_lines','inspection_waste_quantity','INTEGER NOT NULL DEFAULT 0');
addColumn('receipt_lines','inspection_waste_reason_id','INTEGER REFERENCES inspection_waste_reasons(id)');
addColumn('receipt_lines','inspection_waste_detail','TEXT');
addColumn('receipt_lines','inventory_received_quantity','INTEGER NOT NULL DEFAULT 0');
addColumn('receipt_lines','inspected_by_employee_id','INTEGER REFERENCES employees(id)');
addColumn('shipment_lines','gross_profit_rate','REAL');
addColumn('shipment_lines','preparation_batch_id','INTEGER REFERENCES delivery_preparation_batches(id)');
addColumn('outsourcing_costs','product_id','INTEGER REFERENCES products(id)');
addColumn('stocktakes','memo','TEXT');
addColumn('employees','line_enabled','INTEGER NOT NULL DEFAULT 1');
export const now = () => new Date().toISOString();
export function transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const value=fn(); db.exec('COMMIT'); return value; } catch(error) { db.exec('ROLLBACK'); throw error; } }
export function audit(actor, action, entityType, entityId, details={}) { db.prepare('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?)').run(actor?.id??null,action,entityType,entityId==null?null:String(entityId),JSON.stringify(details),now()); }

function seedSystemActor(username, displayName) {
  if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) return;
  const legacyAuthSchema=db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name='password_hash'").get();
  if(legacyAuthSchema) db.prepare('INSERT INTO users(username,display_name,password_hash,password_salt,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(username,displayName,'unused','unused','admin',now(),now());
  else db.prepare('INSERT INTO users(username,display_name,created_at,updated_at) VALUES(?,?,?,?)').run(username,displayName,now(),now());
}
seedSystemActor('internal','社内管理');
db.prepare('INSERT OR IGNORE INTO companies(code,name,created_at,updated_at) VALUES(?,?,?,?)').run('triangle','とらいアンぐる',now(),now());
const defaultCompanyId=db.prepare("SELECT id FROM companies WHERE code='triangle'").get().id;
db.prepare("INSERT OR IGNORE INTO company_settings(company_id,standard_end_time,grace_minutes,break_mode,line_enabled,unfinished_notification_enabled,timezone,updated_at) VALUES(?,'17:30',30,'line',1,1,'Asia/Tokyo',?)").run(defaultCompanyId,now());
db.prepare('UPDATE work_sessions SET company_id=? WHERE company_id IS NULL').run(defaultCompanyId);
const department=db.prepare('INSERT OR IGNORE INTO departments(code,name,sort_order) VALUES(?,?,?)'); department.run('lotus','れんこん',1); department.run('produce','青果',2);
const departmentId=(code)=>db.prepare('SELECT id FROM departments WHERE code=?').get(code).id;
const insertProduct=db.prepare("INSERT OR IGNORE INTO products(code,name,department_id,sales_unit,standard_price,active,created_at,updated_at) VALUES(?,?,?,'g',0,1,?,?)");
insertProduct.run('produce_cucumber','きゅうり',departmentId('produce'),now(),now());
insertProduct.run('produce_green_onion','ねぎ',departmentId('produce'),now(),now());
const insertProcess=db.prepare('INSERT OR IGNORE INTO processes(code,name,department_id,allocation_target,dashboard_role,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');
db.prepare("UPDATE processes SET code='produce_receipt' WHERE code='produce_harvest' AND NOT EXISTS(SELECT 1 FROM processes WHERE code='produce_receipt')").run();
[['lotus_receipt','入荷','lotus',1,null,1],['lotus_boiled','水煮加工','lotus',1,'primary_process',2],['lotus_chips','チップス加工','lotus',1,'primary_process',3],['lotus_delivery_prep','納品準備','lotus',1,null,4],['lotus_delivery','配達・納品','lotus',1,null,5],['produce_receipt','入荷','produce',1,null,1],['produce_sort_pack','選別・袋詰め','produce',1,'produce_selection',2],['produce_delivery_prep','納品準備','produce',1,null,3],['produce_delivery','配達・納品','produce',1,null,4]].forEach(([code,name,dept,allocation,role,sort])=>insertProcess.run(code,name,departmentId(dept),allocation,role,sort,now(),now()));
db.prepare("UPDATE processes SET dashboard_role='produce_selection' WHERE code='produce_sort_pack' AND dashboard_role='primary_process'").run();
db.prepare("UPDATE processes SET name='入荷',dashboard_role=NULL,active=1 WHERE code='produce_receipt'").run();
db.prepare("UPDATE processes SET cost_scope='department_shared',shared_cost_category=CASE code WHEN 'lotus_chips' THEN 'chips_processing' WHEN 'lotus_delivery_prep' THEN 'delivery_preparation' WHEN 'produce_sort_pack' THEN 'produce_processing' WHEN 'produce_delivery_prep' THEN 'delivery_preparation' ELSE 'other_shared' END").run();
const reasonInsert=db.prepare('INSERT OR IGNORE INTO inspection_waste_reasons(code,name,detail_required,active,sort_order) VALUES(?,?,?,1,?)');
[['damage','傷み',0,1],['decay','腐敗',0,2],['foreign_matter','異物',0,3],['discoloration','変色',0,4],['out_of_spec','規格外',0,5],['quantity_difference','数量・重量差異',0,6],['none','破棄なし',0,7],['other','その他',1,8]].forEach(x=>reasonInsert.run(...x));

const menuInsert=db.prepare('INSERT OR IGNORE INTO line_menu_items(company_id,code,label,parent_id,department_id,process_id,product_id,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
const processByCode=code=>db.prepare('SELECT id,department_id FROM processes WHERE code=?').get(code);
const productByCode=code=>db.prepare('SELECT id FROM products WHERE code=?').get(code);
const seedMenu=(code,label,processCode,productCode,sort)=>{const p=processCode?processByCode(processCode):null;menuInsert.run(defaultCompanyId,code,label,null,p?.department_id??null,p?.id??null,productCode?productByCode(productCode)?.id??null:null,sort,now(),now());};
seedMenu('boiled_lotus','れんこん水煮','lotus_boiled',null,1);seedMenu('chips','チップス加工','lotus_chips',null,2);seedMenu('green_onion','ねぎ','produce_sort_pack','produce_green_onion',3);seedMenu('cucumber','きゅうり','produce_sort_pack','produce_cucumber',4);
menuInsert.run(defaultCompanyId,'outside_group','納品準備・外回り',null,null,null,null,5,now(),now());
const outsideParent=db.prepare("SELECT id FROM line_menu_items WHERE company_id=? AND code='outside_group'").get(defaultCompanyId).id;
for(const [code,label,processCode,sort] of [['delivery_prep','納品準備','lotus_delivery_prep',1],['delivery','納品','lotus_delivery',2],['transport','配達','lotus_delivery',3],['outside','外回り','lotus_delivery',4],['purchase','仕入れ','lotus_receipt',5],['other_non_processing','その他加工外業務','lotus_delivery_prep',6]]){const p=processByCode(processCode);menuInsert.run(defaultCompanyId,code,label,outsideParent,p.department_id,p.id,null,sort,now(),now());}

export { databasePath };
