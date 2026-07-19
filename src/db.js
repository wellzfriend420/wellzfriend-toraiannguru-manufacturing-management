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
[['lotus_receipt','入荷','lotus',1,null,1],['lotus_boiled','水煮加工','lotus',1,'primary_process',2],['lotus_chips','チップス加工','lotus',1,'primary_process',3],['lotus_delivery_prep','納品準備','lotus',1,null,4],['lotus_delivery','配達・納品','lotus',1,null,5],['produce_harvest','収穫','produce',1,'produce_harvest',1],['produce_sort_pack','選別・袋詰め','produce',1,'produce_selection',2],['produce_delivery_prep','納品準備','produce',1,null,3],['produce_delivery','配達・納品','produce',1,null,4]].forEach(([code,name,dept,allocation,role,sort])=>insertProcess.run(code,name,departmentId(dept),allocation,role,sort,now(),now()));
db.prepare("UPDATE processes SET dashboard_role='produce_harvest' WHERE code='produce_harvest' AND dashboard_role='primary_process'").run();
db.prepare("UPDATE processes SET dashboard_role='produce_selection' WHERE code='produce_sort_pack' AND dashboard_role='primary_process'").run();

const menuInsert=db.prepare('INSERT OR IGNORE INTO line_menu_items(company_id,code,label,parent_id,department_id,process_id,product_id,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
const processByCode=code=>db.prepare('SELECT id,department_id FROM processes WHERE code=?').get(code);
const productByCode=code=>db.prepare('SELECT id FROM products WHERE code=?').get(code);
const seedMenu=(code,label,processCode,productCode,sort)=>{const p=processCode?processByCode(processCode):null;menuInsert.run(defaultCompanyId,code,label,null,p?.department_id??null,p?.id??null,productCode?productByCode(productCode)?.id??null:null,sort,now(),now());};
seedMenu('boiled_lotus','れんこん水煮','lotus_boiled',null,1);seedMenu('chips','チップス加工','lotus_chips',null,2);seedMenu('green_onion','ねぎ','produce_sort_pack','produce_green_onion',3);seedMenu('cucumber','きゅうり','produce_sort_pack','produce_cucumber',4);
menuInsert.run(defaultCompanyId,'outside_group','納品準備・外回り',null,null,null,null,5,now(),now());
const outsideParent=db.prepare("SELECT id FROM line_menu_items WHERE company_id=? AND code='outside_group'").get(defaultCompanyId).id;
for(const [code,label,processCode,sort] of [['delivery_prep','納品準備','lotus_delivery_prep',1],['delivery','納品','lotus_delivery',2],['transport','配達','lotus_delivery',3],['outside','外回り','lotus_delivery',4],['purchase','仕入れ','lotus_receipt',5],['other_non_processing','その他加工外業務','lotus_delivery_prep',6]]){const p=processByCode(processCode);menuInsert.run(defaultCompanyId,code,label,outsideParent,p.department_id,p.id,null,sort,now(),now());}

export { databasePath };
