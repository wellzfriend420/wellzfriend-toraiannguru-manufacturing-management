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
const department=db.prepare('INSERT OR IGNORE INTO departments(code,name,sort_order) VALUES(?,?,?)'); department.run('lotus','れんこん',1); department.run('produce','青果',2);
const departmentId=(code)=>db.prepare('SELECT id FROM departments WHERE code=?').get(code).id;
const insertProcess=db.prepare('INSERT OR IGNORE INTO processes(code,name,department_id,allocation_target,dashboard_role,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');
[['lotus_receipt','入荷','lotus',1,null,1],['lotus_boiled','水煮加工','lotus',1,'primary_process',2],['lotus_chips','チップス加工','lotus',1,'primary_process',3],['lotus_delivery_prep','納品準備','lotus',1,null,4],['lotus_delivery','配達・納品','lotus',1,null,5],['produce_harvest','収穫','produce',1,'primary_process',1],['produce_sort_pack','選別・袋詰め','produce',1,'primary_process',2],['produce_delivery_prep','納品準備','produce',1,null,3],['produce_delivery','配達・納品','produce',1,null,4]].forEach(([code,name,dept,allocation,role,sort])=>insertProcess.run(code,name,departmentId(dept),allocation,role,sort,now(),now()));

export { databasePath };
