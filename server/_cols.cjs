const fs=require('fs'),path=require('path'),{Client}=require('pg')
const ROOT='D:/SQL/mm-padel-academy mysql'
function parseEnv(f){const o={};if(!fs.existsSync(f))return o;for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)o[m[1]]=m[2]}return o}
;(async()=>{const u=new URL(parseEnv(path.join(ROOT,'server','.env')).PROD_DATABASE_URL)
const c=new Client({host:u.hostname,port:Number(u.port)||6543,user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),database:(u.pathname||'/').replace(/^\//,'')||'postgres',ssl:{rejectUnauthorized:false},connectionTimeoutMillis:8000})
await c.connect()
for(const t of ['users','slots','bookings','payments']){
  const r=await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[t])
  console.log(t+': '+r.rows.map(x=>x.column_name).join(', '))
}
await c.end()})().catch(e=>{console.error('FATAL',e.message);process.exit(1)})
