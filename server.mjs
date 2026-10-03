import http from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const root=dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||3000), host=process.env.HOST||'127.0.0.1';
const origin=new URL(process.env.APP_ORIGIN||`http://localhost:${port}`).origin;
const password=process.env.ADMIN_PASSWORD;
if(!password||password.length<12){console.error('Configura ADMIN_PASSWORD con al menos 12 caracteres en .env.');process.exit(1);}
const salt=randomBytes(16), passwordHash=scryptSync(password,salt,64);
const file=resolve(root,process.env.DATABASE_PATH||'data/sion.sqlite');mkdirSync(dirname(file),{recursive:true});
const db=new DatabaseSync(file);db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS materials(id TEXT PRIMARY KEY,name TEXT NOT NULL,price INTEGER NOT NULL,unit TEXT NOT NULL,zone TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,expires INTEGER NOT NULL);`);
db.exec('DELETE FROM sessions');
const zones=[{id:'castilla',name:'Castilla'},{id:'acacias',name:'Acacías'},{id:'villavicencio',name:'Villavicencio'},{id:'restrepo',name:'Restrepo'}];
const validZone=z=>zones.some(x=>x.id===z);
const secure=origin.startsWith('https:');
const hash=s=>createHash('sha256').update(s).digest('hex');
function sessionToken(req){const match=(req.headers.cookie||'').match(/(?:^|;\s*)sion_session=([a-f0-9]{64})(?:;|$)/);return match?.[1];}
function authenticated(req){const t=sessionToken(req);if(!t)return false;return !!db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND expires>?').get(hash(t),Date.now());}
function cookie(token,age){return `sion_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`;}
function json(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));}
async function body(req){let s='';for await(const c of req){s+=c;if(Buffer.byteLength(s)>32768)throw Object.assign(Error('Solicitud demasiado grande.'),{status:413});}try{return JSON.parse(s);}catch{throw Object.assign(Error('Solicitud no válida.'),{status:400});}}
const failures=new Map();
const allowedFiles={'/':['index.html','text/html; charset=utf-8'],'/administrar':['admin.html','text/html; charset=utf-8'],'/administrar/':['admin.html','text/html; charset=utf-8'],'/styles.css':['styles.css','text/css; charset=utf-8'],'/client.js':['client.js','text/javascript; charset=utf-8'],'/admin.js':['admin.js','text/javascript; charset=utf-8'],'/logo.png':['logo.png','image/png'],'/favicon.svg':['favicon.svg','image/svg+xml']};
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
 try{
 const url=new URL(req.url,origin),path=url.pathname;
 if(req.method==='POST'&&req.headers.origin!==origin)return json(res,403,{error:'Solicitud no válida. Abre el sitio desde su dirección configurada.'});
 if(path==='/api/zonas'&&req.method==='GET')return json(res,200,zones);
 if(path==='/api/sesion'&&req.method==='GET')return json(res,200,{authenticated:authenticated(req)});
 if(path==='/api/ingresar'&&req.method==='POST'){
 const key=req.socket.remoteAddress||'unknown';const attempt=failures.get(key);if(attempt&&attempt.count>=5&&attempt.until>Date.now())return json(res,429,{error:'Demasiados intentos. Espera 15 minutos.'});
 const input=await body(req);const candidate=input?.password;if(typeof candidate!=='string'||candidate.length>512)return json(res,400,{error:'Contraseña no válida.'});
 if(!timingSafeEqual(passwordHash,scryptSync(candidate,salt,64))){const state=attempt&&attempt.until>Date.now()?attempt:{count:0,until:Date.now()+900000};state.count++;failures.set(key,state);return json(res,401,{error:'Contraseña incorrecta.'});}
 failures.delete(key);db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES (?,?)').run(hash(token),Date.now()+28800000);return json(res,200,{ok:true},{'Set-Cookie':cookie(token,28800)});
 }
 if(path==='/api/salir'&&req.method==='POST'){const t=sessionToken(req);if(t)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(t));return json(res,200,{ok:true},{'Set-Cookie':cookie('',0)});}
 if(path==='/api/materiales'&&req.method==='GET'){
 const zone=url.searchParams.get('zona');if(zone===null&&!authenticated(req))return json(res,400,{error:'Selecciona tu zona.'});if(zone!==null&&!validZone(zone))return json(res,400,{error:'Zona no válida.'});
 const q='SELECT id,name,price,unit,zone,updated_at AS updatedAt FROM materials'+(zone!==null?' WHERE zone=?':'')+' ORDER BY name COLLATE NOCASE';return json(res,200,zone!==null?db.prepare(q).all(zone):db.prepare(q).all());
 }
 if(path==='/api/materiales'&&req.method==='POST'){
 if(!authenticated(req))return json(res,403,{error:'Ingresa como administrador para editar.'});
 const input=await body(req);if(!input||typeof input!=='object'||Array.isArray(input))return json(res,400,{error:'Solicitud no válida.'});
 const {id,name,price,unit,zone,action}=input;
 if(id!==undefined&&(typeof id!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(id)))return json(res,400,{error:'Material no válido.'});
 if(action==='delete'){if(!id)return json(res,400,{error:'Falta el material.'});db.prepare('DELETE FROM materials WHERE id=?').run(id);return json(res,200,{ok:true});}
 if(!validZone(zone)||typeof name!=='string'||!name.trim()||name.trim().length>80||!Number.isSafeInteger(price)||price<0||price>100000000||!['kg','unidad','tonelada'].includes(unit))return json(res,400,{error:'Revisa la zona, el nombre, la unidad y el precio entero.'});
 const materialId=id||randomUUID();db.prepare('INSERT INTO materials (id,name,price,unit,zone,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,price=excluded.price,unit=excluded.unit,zone=excluded.zone,updated_at=excluded.updated_at').run(materialId,name.trim(),price,unit,zone,new Date().toISOString());return json(res,200,{ok:true,id:materialId});
 }
 if((req.method==='GET'||req.method==='HEAD')&&allowedFiles[path]){const [f,mime]=allowedFiles[path];const data=readFileSync(resolve(root,'public',f));res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);return;}
 json(res,404,{error:'Página no encontrada.'});
 }catch(e){if(!e.status)console.error('Error al procesar solicitud:',e.message);json(res,e.status||500,{error:e.status?e.message:'No pudimos completar la operación. Intenta nuevamente.'});}
});
const cleanup=setInterval(()=>{for(const [k,v] of failures)if(v.until<Date.now())failures.delete(k);db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());},60000);cleanup.unref();
server.listen(port,host,()=>console.log(`Sion JR listo en ${origin}. Puerto ${port}.`));
function stop(){server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(1),5000).unref();}process.on('SIGTERM',stop);process.on('SIGINT',stop);
