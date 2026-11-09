import {createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const scryptAsync=promisify(scrypt);
const dataDir=path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const accountsPath=path.join(dataDir, 'accounts.json');
const secretPath=path.join(dataDir, 'auth-secret');
const TOKEN_TTL_MS=7*24*60*60*1000;

async function ensureDir(){await mkdir(dataDir,{recursive:true})}
async function secret(){
 if(process.env.LOCAL_AUTH_SECRET)return process.env.LOCAL_AUTH_SECRET;
 await ensureDir();
 try{return (await readFile(secretPath,'utf8')).trim()}
 catch{
  const value=randomBytes(32).toString('hex');
  await writeFile(secretPath,value,{flag:'wx'});
  return value;
 }
}
async function readAccounts(){
 try{const parsed=JSON.parse(await readFile(accountsPath,'utf8'));return Array.isArray(parsed)?parsed:[]}
 catch{return []}
}
async function writeAccounts(accounts){
 await ensureDir();
 await writeFile(accountsPath,JSON.stringify(accounts,null,2));
}
export async function hashPassword(password){
 const salt=randomBytes(16);
 const hash=await scryptAsync(password,salt,32);
 return `${salt.toString('hex')}.${hash.toString('hex')}`;
}
export async function verifyPassword(password,stored){
 const [saltHex,hashHex]=String(stored||'').split('.');
 if(!saltHex||!hashHex)return false;
 const actual=await scryptAsync(password,Buffer.from(saltHex,'hex'),32);
 const expected=Buffer.from(hashHex,'hex');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export async function findAccountByEmail(email){
 const needle=String(email||'').trim().toLowerCase();
 return (await readAccounts()).find(account=>account.email===needle)||null;
}
export async function createAccount({email,password,fullName}){
 const accounts=await readAccounts();
 const normalized=String(email||'').trim().toLowerCase();
 if(accounts.some(account=>account.email===normalized)){
  const error=new Error('An account with that email already exists');
  error.status=409;
  throw error;
 }
 const account={id:randomUUID(),email:normalized,fullName:fullName||'',passwordHash:await hashPassword(password)};
 accounts.push(account);
 await writeAccounts(accounts);
 return account;
}
export async function deleteAccount(id){
 await writeAccounts((await readAccounts()).filter(account=>account.id!==id));
}
export async function signToken(account){
 const key=await secret();
 const body=Buffer.from(JSON.stringify({sub:account.id,email:account.email,exp:Date.now()+TOKEN_TTL_MS})).toString('base64url');
 const sig=createHmac('sha256',key).update(body).digest('base64url');
 return `${body}.${sig}`;
}
export async function readToken(token){
 if(typeof token!=='string'||!token.includes('.'))return null;
 const [body,sig]=token.split('.');
 if(!body||!sig)return null;
 const key=await secret();
 const expected=createHmac('sha256',key).update(body).digest();
 let actual;
 try{actual=Buffer.from(sig,'base64url')}catch{return null}
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
 try{
  const payload=JSON.parse(Buffer.from(body,'base64url').toString());
  if(!payload?.sub||!payload?.email||typeof payload.exp!=='number'||payload.exp<Date.now())return null;
  return payload;
 }catch{return null}
}
