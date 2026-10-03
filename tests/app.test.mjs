import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
const temporary=mkdtempSync(resolve('.sion-test-'));
const password=randomBytes(24).toString('hex');
async function freePort(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port;}
test('Authentication, zone isolation, validation and durable prices',async()=>{
 const port=await freePort(),origin=`http://127.0.0.1:${port}`;let child;
 async function start(){child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',APP_ORIGIN:origin,ADMIN_PASSWORD:password,DATABASE_PATH:resolve(temporary,'prices.sqlite')},stdio:['ignore','pipe','pipe']});await new Promise((r,j)=>{const timer=setTimeout(()=>j(Error('Startup timed out')),10000);child.stdout.once('data',()=>{clearTimeout(timer);r();});child.once('exit',c=>{clearTimeout(timer);j(Error('Server exited '+c));});});}
 async function stop(){if(!child||child.exitCode!==null)return;await new Promise(r=>{child.once('exit',r);child.kill('SIGTERM');});}
 let cookie='';async function request(path,body,extra={}){const r=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json',Origin:origin}),...(cookie?{Cookie:cookie}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};}
 try{await start();assert.equal((await fetch(origin+'/')).status,200);assert.equal((await fetch(origin+'/administrar')).status,200);assert.equal((await fetch(origin+'/logo.png')).status,200);
 assert.equal((await request('/api/materiales')).status,400);assert.equal((await request('/api/materiales?zona=no-existe')).status,400);
 assert.equal((await request('/api/materiales',{name:'Cartón',price:1000,unit:'kg',zone:'castilla'})).status,403);
 assert.equal((await request('/api/ingresar',{password:'incorrecta'})).status,401);assert.equal((await request('/api/ingresar',{password},{Origin:'https://otro.example'})).status,403);
 const login=await request('/api/ingresar',{password});assert.equal(login.status,200);assert.match(login.cookie,/HttpOnly/);assert.match(login.cookie,/SameSite=Strict/);cookie=login.cookie.split(';')[0];
 const ids={};for(const [i,zone]of ['castilla','acacias','villavicencio','restrepo'].entries()){const r=await request('/api/materiales',{name:'Cartón',price:1000+i*100,unit:'kg',zone});assert.equal(r.status,200);ids[zone]=r.data.id;}
 assert.equal((await request('/api/materiales',{name:'Cartón',price:-1,unit:'kg',zone:'castilla'})).status,400);assert.equal((await request('/api/materiales',{name:'Cartón',price:1000,unit:'kg',zone:'otra'})).status,400);
 assert.equal((await request('/api/materiales',{id:ids.acacias,name:'Cartón',price:2000,unit:'kg',zone:'acacias'})).status,200);
 for(const [zone,expected]of Object.entries({castilla:1000,acacias:2000,villavicencio:1200,restrepo:1300})){const r=await request('/api/materiales?zona='+zone);assert.equal(r.data.length,1);assert.equal(r.data[0].price,expected);}
 await stop();await start();cookie='';assert.equal((await request('/api/materiales?zona=acacias')).data[0].price,2000);assert.equal((await request('/api/materiales',{action:'delete',id:ids.acacias})).status,403);
 cookie=(await request('/api/ingresar',{password})).cookie.split(';')[0];assert.equal((await request('/api/materiales',{action:'delete',id:ids.acacias})).status,200);assert.equal((await request('/api/materiales?zona=acacias')).data.length,0);
 assert.equal((await request('/api/salir',{})).status,200);assert.equal((await request('/api/materiales',{name:'Cartón',price:1000,unit:'kg',zone:'castilla'})).status,403);
 }finally{await stop();rmSync(temporary,{recursive:true,force:true});}
});
