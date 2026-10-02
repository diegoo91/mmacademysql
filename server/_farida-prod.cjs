const fs=require('fs'),path=require('path'),{Client}=require('pg')
const ROOT='D:/SQL/mm-padel-academy mysql'
function parseEnv(f){const o={};if(!fs.existsSync(f))return o;for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)o[m[1]]=m[2]}return o}
;(async()=>{const u=new URL(parseEnv(path.join(ROOT,'server','.env')).PROD_DATABASE_URL)
const c=new Client({host:u.hostname,port:Number(u.port)||6543,user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),database:(u.pathname||'/').replace(/^\//,'')||'postgres',ssl:{rejectUnauthorized:false},connectionTimeoutMillis:8000,statement_timeout:60000})
await c.connect()
const q=async(s,p)=>(await c.query(s,p)).rows
const far=await q("SELECT user_id,name FROM users WHERE name ILIKE '%farida%'")
console.log('USER:',JSON.stringify(far))
const id=far[0].user_id
const p=await q("SELECT id,ref,date,player_name,player_id,amount,private_sessions,group_sessions,status,method,notes,booking_id,created_at FROM payments WHERE player_id=$1 OR player_name ILIKE '%farida%' ORDER BY id",[id])
console.log('PAYMENTS:',JSON.stringify(p,null,1))
const b=await q("SELECT id,ref,user_id,session_type,sessions_json,sessions,total,status,amount_paid,paid,payment_method,payment_date FROM bookings WHERE user_id=$1 ORDER BY id",[id])
console.log('BOOKINGS:',JSON.stringify(b,null,1))
await c.end()})().catch(e=>{console.error('FATAL',e.message);process.exit(1)})
