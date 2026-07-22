import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, databasePath } from './db.js';

const backupDir=resolve(process.env.BACKUP_DIR??resolve(databasePath,'..','backups'));
const retentionDays=Number(process.env.BACKUP_RETENTION_DAYS??30);
const stamp=date=>date.toISOString().replaceAll(':','-').replaceAll('.','-');

export function createBackup(date=new Date()){
  mkdirSync(backupDir,{recursive:true});
  const target=resolve(backupDir,`manufacturing-${stamp(date)}.sqlite`),escaped=target.replaceAll("'","''");
  db.exec(`VACUUM INTO '${escaped}'`);
  const cutoff=date.getTime()-retentionDays*86400000;
  for(const name of readdirSync(backupDir))if(name.startsWith('manufacturing-')&&name.endsWith('.sqlite')){const path=resolve(backupDir,name);if(statSync(path).mtimeMs<cutoff)unlinkSync(path);}
  return target;
}

export function scheduleBackups(){
  const run=()=>{try{const recent=existsSync(backupDir)&&readdirSync(backupDir).some(name=>name.endsWith('.sqlite')&&Date.now()-statSync(resolve(backupDir,name)).mtimeMs<86400000);if(!recent)createBackup();}catch(error){console.error('database backup failed',error);}};
  run();const timer=setInterval(run,3600000);timer.unref();return timer;
}
