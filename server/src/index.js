import 'dotenv/config';
import express from 'express'; import cors from 'cors'; import helmet from 'helmet'; import morgan from 'morgan'; import rateLimit from 'express-rate-limit';
import multer from 'multer'; import {createClient} from '@supabase/supabase-js'; import {z} from 'zod';
import {recommendResume,RESUME_NAMES} from './resume-selector.js';
import {duplicateMessage,findProfileDuplicate} from './duplicate-application.js';
import {createAccount,deleteAccount,findAccountByEmail,readToken,signToken,verifyPassword} from './local-auth.js';
import {registerHighlights} from './highlights.js';
import {createInbox} from './notifications.js';
const inbox = createInbox();
const app=express(); const PORT=Number(process.env.PORT||4000);
const URL=process.env.SUPABASE_URL; const KEY=process.env.SUPABASE_ANON_KEY;
if(!URL||!KEY){console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY. See server/.env.example');process.exit(1)}
// Allow only configured web clients and installed Chrome extension IDs.
const allowedOrigins = new Set([
  ...(process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(','),
  ...(process.env.EXTENSION_ORIGIN || '').split(',')
].map(s=>s.trim()).filter(Boolean));
app.disable('x-powered-by');
app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'}}));
app.use(cors({origin(origin, callback) {
  // Requests without Origin include native/local clients. The extension iframe
  // sends a chrome-extension origin, which must be readable from this API.
  if(!origin || allowedOrigins.has(origin) || origin.startsWith('chrome-extension://'))return callback(null,true);
  return callback(new Error('CORS origin not permitted: '+origin));
}}));
app.use(express.json({limit:'2mb'}));app.use(morgan('tiny'));
app.use('/api',rateLimit({windowMs:60*1000,limit:120,standardHeaders:'draft-7',legacyHeaders:false}));
const db=(userId)=>createClient(URL,KEY,{global:{headers:{'x-jobtrack-user-id':userId}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const admin=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const apiError=(res,error,status=400)=>res.status(status).json({error:typeof error==='string'?error:error?.message||'Request failed'});
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
async function auth(req,res,next){const token=/^Bearer (.+)$/i.exec(req.headers.authorization||'')?.[1];if(!token)return apiError(res,'Please sign in',401);
 const payload=await readToken(token);if(!payload)return apiError(res,'Invalid or expired session',401);
 req.user={id:payload.sub,email:payload.email};req.db=db(req.user.id);next();}
const uuid=z.string().uuid();
const Str=(max=500)=>z.string().max(max).optional().default('');
const application=z.object({company:z.string().trim().min(1).max(200),job_title:z.string().trim().min(1).max(300),platform:Str(80),job_url:Str(2048),location:Str(250),salary:Str(200),employment_type:Str(100),description:Str(100000),technologies:z.array(z.string().max(100)).max(100).optional().default([]),status:z.enum(['Saved','Applied','Screening','Interview','Offer','Rejected','Withdrawn']).optional().default('Saved'),resume_id:uuid.nullable().optional(),profile_id:uuid.nullable().optional(),notes:Str(20000),applied_at:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),next_action_at:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()});
const credentials=z.object({email:z.string().trim().email().max(320),password:z.string().min(8).max(128)});
const signupInput=credentials.extend({full_name:z.string().trim().min(1,'Full name is required').max(120)});
const resetInput=z.object({email:z.string().trim().email().max(320)});
const profileInput=z.object({
 email:z.string().trim().email().max(320),
 full_name:z.string().trim().max(120),
 location:z.string().trim().max(200),
 date_of_birth:z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/),z.literal(''),z.null()]).transform(v=>v||null),
 full_address:z.string().trim().max(500),
 address_line_2:z.string().trim().max(250),
 city:z.string().trim().max(120),
 state_region:z.string().trim().max(120),
 postal_code:z.string().trim().max(30),
 country:z.string().trim().max(120),
 phone_number:z.string().trim().max(40),
 bio:z.string().trim().max(2000)
}).partial().strict();
const PROFILE_COLUMNS='id,profile_name,email,full_name,location,date_of_birth,full_address,address_line_2,city,state_region,postal_code,country,phone_number,bio,daily_goal,created_at,updated_at';
const authLimiter=rateLimit({windowMs:15*60*1000,limit:15,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many authentication attempts. Try again later.'}});
const publicUser=user=>user?{id:user.id,email:user.email,full_name:user.fullName||user.full_name||''}:null;
async function rememberFullName(account){
 const name=String(account?.fullName||account?.full_name||'').trim();
 if(!account?.id||!name)return;
 await admin.rpc('provision_jobtrack_account',{account_id:account.id,account_email:account.email||'',account_name:name});
}
app.post('/api/auth/signup',authLimiter,wrap(async(req,res)=>{
 const parsed=signupInput.safeParse(req.body);if(!parsed.success)return apiError(res,parsed.error.issues[0].message);
 const {email,password,full_name}=parsed.data;
 if(await findAccountByEmail(email))return apiError(res,'An account with that email already exists',409);
 const account=await createAccount({email,password,fullName:full_name});
 const {error}=await admin.rpc('provision_jobtrack_account',{account_id:account.id,account_email:account.email,account_name:full_name||''});
 if(error){await deleteAccount(account.id);return apiError(res,`${error.message} Run supabase/migrations/011_local_auth.sql in the Supabase SQL editor, then create the account again.`)}
 const access_token=await signToken(account);
 res.status(201).json({user:publicUser(account),session:{access_token},requires_email_confirmation:false,message:'Account created.'});
}));
app.post('/api/auth/signin',authLimiter,wrap(async(req,res)=>{
 const parsed=credentials.safeParse(req.body);if(!parsed.success)return apiError(res,parsed.error.issues[0].message);
 const account=await findAccountByEmail(parsed.data.email);
 if(!account||!(await verifyPassword(parsed.data.password,account.passwordHash)))return apiError(res,'Invalid email or password',401);
 await rememberFullName(account).catch(()=>{});
 res.json({user:publicUser(account),session:{access_token:await signToken(account)}});
}));
app.post('/api/auth/forgot-password',authLimiter,wrap(async(req,res)=>{
 const parsed=resetInput.safeParse(req.body);if(!parsed.success)return apiError(res,parsed.error.issues[0].message);
 res.json({message:'Password reset email is off while Supabase Auth is disabled. Create a new local account instead.'});
}));
app.get('/api/health',(req,res)=>res.json({ok:true,app:'JobTrack API'}));
app.use('/api',wrap(auth));
registerHighlights(app,wrap);
app.get('/api/notifications', wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store').json(await inbox.list(req.user.id));
}));
app.patch('/api/notifications/read', wrap(async (req, res) => {
  const parsed = z.array(z.union([uuid, z.literal('welcome')])).safeParse(req.body?.ids);
  if (!parsed.success) return apiError(res, 'Select valid notifications');
  await inbox.mark(req.user.id, parsed.data);
  res.sendStatus(204);
}));
app.post('/api/notifications', wrap(async (req, res) => {
  const parsed = z.object({ recipient: uuid, message: z.string().trim().min(1).max(2000) }).safeParse(req.body);
  if (!parsed.success) return apiError(res, 'Choose a recipient and enter a message up to 2,000 characters.');
  const { data, error } = await req.db.from('users').select('level,members').eq('id', req.user.id).single();
  if (error) return apiError(res, error);
  const { recipient, message } = parsed.data;
  if (data.level !== 'admin' || !(recipient === req.user.id || data.members?.includes(recipient)))
    return apiError(res, 'Only admins can notify accounts in their workspace.', 403);
  await inbox.send(recipient, 'Admin', message);
  res.status(201).json({ ok: true });
}));
app.get('/api/me',wrap(async(req,res)=>{
 const localAccount=await findAccountByEmail(req.user.email);
 await rememberFullName(localAccount||req.user).catch(()=>{});
 const profileId=await defaultProfile(req);
 const [profileResult,accountResult]=await Promise.all([
  profileId?req.db.from('profiles').select(PROFILE_COLUMNS).eq('id',profileId).maybeSingle():Promise.resolve({data:null,error:null}),
  req.db.from('users').select('id,email,full_name,level,profiles,members,created_at').eq('id',req.user.id).maybeSingle()
 ]);
 let {data,error}=profileResult;
 if(error&&profileId&&/daily_goal/i.test(error.message||'')){
  ({data,error}=await req.db.from('profiles').select(PROFILE_COLUMNS.replace(',daily_goal','')).eq('id',profileId).maybeSingle());
  if(data)data={...data,daily_goal:100};
 }
 let {data:account,error:accountError}=accountResult;
 if(accountError&&/full_name/i.test(accountError.message||'')){
  ({data:account,error:accountError}=await req.db.from('users').select('id,email,level,profiles,members,created_at').eq('id',req.user.id).maybeSingle());
  if(account)account.full_name=localAccount?.fullName||'';
 }
 if(accountError&&/members/i.test(accountError.message||'')){
  ({data:account,error:accountError}=await req.db.from('users').select('id,email,level,profiles,created_at').eq('id',req.user.id).maybeSingle());
  if(account){
   account.full_name=account.full_name||localAccount?.fullName||'';
   account.members=account.level==='user'?[account.id]:[];
  }
 }
 if(error||accountError)return apiError(res,error||accountError);
 res.json({user:publicUser(req.user),account,profile:data});
}));
app.patch('/api/daily-goal',wrap(async(req,res)=>{
 const profileId=String(req.body?.profile_id||'');
 if(!uuid.safeParse(profileId).success)return apiError(res,'Choose a profile');
 const goal=z.number().int().refine(value=>[0,25,50,75,100,125].includes(value)).safeParse(req.body?.daily_goal);
 if(!goal.success)return apiError(res,'Choose 0, 25, 50, 75, 100, or 125+');
 const {data:account,error:readError}=await req.db.from('users').select('level').eq('id',req.user.id).maybeSingle();
 if(readError)return apiError(res,readError);
 if(!account)return apiError(res,'Account not found',404);
 if(!['manager','admin'].includes(account.level))return apiError(res,'Only a manager or admin can change the daily goal',403);
 const {data,error}=await req.db.rpc('set_daily_goal',{target_profile:profileId,next_goal:goal.data});
 if(error){
  if(/set_daily_goal|daily_goal|PGRST202|schema cache/i.test(error.message||''))return apiError(res,'Run supabase/migrations/016_daily_goal.sql in the Supabase SQL editor, then save the goal again.');
  return apiError(res,error);
 }
 res.json({profile_id:profileId,daily_goal:data});
}));
app.get('/api/members',wrap(async(req,res)=>{
 const {data,error}=await req.db.rpc('member_workspace');
 if(error){
  const message=error.message||'';
  if(/member_workspace|PGRST202|schema cache/i.test(message))return res.json([]);
  return apiError(res,error);
 }
 res.json(Array.isArray(data)?data:[]);
}));
app.patch('/api/me',wrap(async(req,res)=>{
 const parsed=profileInput.omit({email:true}).safeParse(req.body);if(!parsed.success)return apiError(res,parsed.error.issues[0].message);
 if(Object.keys(parsed.data).length===0)return apiError(res,'No profile fields supplied');
 const profileId=await defaultProfile(req);if(!profileId)return apiError(res,'Create an applicant profile first',409);await ownedProfile(req,profileId);
 const {data,error}=await req.db.from('profiles').update(parsed.data).eq('id',profileId).select(PROFILE_COLUMNS).single();
 if(error)return apiError(res,error);res.json(data);
}));
app.post('/api/auth/signout',wrap(async(req,res)=>{res.json({ok:true})}));

// Multiple applicant identities belong to one authenticated account.
const newProfile=profileInput.extend({profile_name:z.string().trim().min(1).max(80)});
async function accountProfiles(req){
 const {data,error}=await req.db.from('users').select('profiles').eq('id',req.user.id).single();
 if(error)throw error;
 const ids=(Array.isArray(data.profiles)?data.profiles:[]).filter(id=>uuid.safeParse(id).success);
 return {ids,defaultId:ids[0]||null};
}
async function ownedProfile(req,id){
 if(!uuid.safeParse(id).success)throw Object.assign(new Error('Invalid profile ID'),{status:400});
 const account=await accountProfiles(req);
 if(!account.ids.includes(id))throw Object.assign(new Error('Profile not found in your account'),{status:404});
 const {data,error}=await req.db.from('profiles').select('id').eq('id',id).maybeSingle();
 if(error)throw error;
 if(!data)throw Object.assign(new Error('Profile not found in your account'),{status:404});
 return data;
}
async function defaultProfile(req){return (await accountProfiles(req)).defaultId;}
app.get('/api/profiles',wrap(async(req,res)=>{
 const account=await accountProfiles(req);
 if(!account.ids.length)return res.json([]);
 let {data,error}=await req.db.from('profiles').select(PROFILE_COLUMNS).in('id',account.ids);
 if(error&&/daily_goal/i.test(error.message||'')){
  ({data,error}=await req.db.from('profiles').select(PROFILE_COLUMNS.replace(',daily_goal','')).in('id',account.ids));
  if(data)data=data.map(row=>({...row,daily_goal:100}));
 }
 if(error)return apiError(res,error);
 const index=new Map((data||[]).map(row=>[row.id,row]));
 res.json(account.ids.map(id=>index.get(id)).filter(Boolean));
}));
app.post('/api/profiles',wrap(async(req,res)=>{
 const parsed=newProfile.safeParse(req.body);if(!parsed.success)return apiError(res,parsed.error.issues[0].message);
 const {data,error}=await req.db.rpc('create_applicant_profile',{profile_data:{...parsed.data,email:parsed.data.email||req.user.email||''}});
 if(error)return apiError(res,error);res.status(201).json(data);
}));
app.patch('/api/profiles/:id',wrap(async(req,res)=>{
 if(!uuid.safeParse(req.params.id).success)return apiError(res,'Invalid profile ID');await ownedProfile(req,req.params.id);
 const parsed=newProfile.partial().strict().safeParse(req.body);if(!parsed.success)return apiError(res,parsed.error.issues[0].message);
 if(!Object.keys(parsed.data).length)return apiError(res,'No profile fields supplied');
 const {data,error}=await req.db.from('profiles').update(parsed.data).eq('id',req.params.id).select(PROFILE_COLUMNS).single();
 if(error)return apiError(res,error);res.json(data);
}));
app.post('/api/profiles/:id/default',wrap(async(req,res)=>{
 if(!uuid.safeParse(req.params.id).success)return apiError(res,'Invalid profile ID');await ownedProfile(req,req.params.id);
 const {error}=await req.db.rpc('set_default_applicant_profile',{target_profile_id:req.params.id});
 if(error)return apiError(res,error);res.json({ok:true,profiles_id:req.params.id});
}));
app.delete('/api/profiles/:id',wrap(async(req,res)=>{
 if(!uuid.safeParse(req.params.id).success)return apiError(res,'Invalid profile ID');await ownedProfile(req,req.params.id);
 if(await defaultProfile(req)===req.params.id)return apiError(res,'Choose another default profile before deleting this one');
 const [{count:a,error:ae},{count:r,error:re}]=await Promise.all([
  req.db.from('applications').select('id',{count:'exact',head:true}).eq('profile_id',req.params.id),
  req.db.from('resumes').select('id',{count:'exact',head:true}).eq('profile_id',req.params.id)
 ]);
 if(ae||re)return apiError(res,ae||re);
 if(a||r)return apiError(res,'Profile has linked applications or resumes; reassign or remove those records first',409);
 const {error}=await req.db.rpc('delete_applicant_profile',{target_profile_id:req.params.id});
 if(error)return apiError(res,error);res.json({ok:true});
}));

// Resolve resume IDs against the signed-in user's library, never another user's record.
async function resolveResumeId(req, input, profileId) {
 if (input.resume_id !== undefined) {
   if (input.resume_id === null) return null;
   const {data,error}=await req.db.from('resumes').select('id').eq('id',input.resume_id).eq('user_id',req.user.id).eq('profile_id',profileId).maybeSingle();
   if(error)throw error;
   if(!data)throw Object.assign(new Error('Selected resume does not belong to your account'),{status:400});
   return data.id;
 }
 const recommended=recommendResume([input.job_title||'',...(input.technologies||[]),input.description||''].join(' '));
 const {data,error}=await req.db.from('resumes').select('id').eq('user_id',req.user.id).eq('name',recommended).eq('profile_id',profileId).order('uploaded_at',{ascending:false}).limit(1).maybeSingle();
 if(error)throw error;
 return data?.id||null;
}
const APP_SELECT='*,resumes:resume_id(id,name,file_name),profiles:profile_id(id,profile_name,full_name)';
async function profileDuplicate(req, profileId, fields, ignoreId) {
 const {data,error}=await req.db.from('applications').select('id,company,job_title,job_url,status,profile_id').eq('user_id',req.user.id).eq('profile_id',profileId);
 if(error)throw error;
 const match=findProfileDuplicate(data||[],{profileId,jobUrl:fields.job_url,company:fields.company,jobTitle:fields.job_title,ignoreId});
 return match?{...match,message:duplicateMessage(match)}:null;
}
app.get('/api/applications/duplicate',wrap(async(req,res)=>{
 const profileId=String(req.query.profile_id||'');
 if(!uuid.safeParse(profileId).success)return apiError(res,'Choose a profile before checking duplicates');
 await ownedProfile(req,profileId);
 const ignoreId=String(req.query.ignore_id||'');
 const match=await profileDuplicate(req,profileId,{job_url:req.query.job_url,company:req.query.company,job_title:req.query.job_title},uuid.safeParse(ignoreId).success?ignoreId:undefined);
 res.json(match?{duplicate:true,reason:match.reason,application:match.application,message:match.message}:{duplicate:false});
}));
app.get('/api/applications',wrap(async(req,res)=>{let q=req.db.from('applications').select(APP_SELECT).order('created_at',{ascending:false}).limit(500);
 if(req.query.status&&req.query.status!=='All')q=q.eq('status',String(req.query.status));
 if(req.query.platform&&req.query.platform!=='All')q=q.eq('platform',String(req.query.platform));
 const {data,error}=await q;if(error)return apiError(res,error);let rows=data||[];
 if(req.query.q){const term=String(req.query.q).toLowerCase().slice(0,120);rows=rows.filter(a=>[a.company,a.job_title,a.location,a.platform,a.description].some(v=>String(v||'').toLowerCase().includes(term)))}
 res.json(rows)}));
app.post('/api/applications',wrap(async(req,res)=>{const parsed=application.safeParse(req.body);if(!parsed.success)return apiError(res,parsed.error.issues[0].message);
 const input={...parsed.data,user_id:req.user.id};input.profile_id=input.profile_id||await defaultProfile(req);if(!input.profile_id)return apiError(res,'Create an applicant profile first',409);await ownedProfile(req,input.profile_id);const duplicate=await profileDuplicate(req,input.profile_id,input);if(duplicate)return apiError(res,duplicate.message,409);if(!input.platform)input.platform='Other';input.resume_id=await resolveResumeId(req,input,input.profile_id);
 const {data,error}=await req.db.from('applications').insert(input).select(APP_SELECT).single();if(error)return apiError(res,error,error.code==='23505'?409:400);res.status(201).json(data)}));
app.patch('/api/applications/:id',wrap(async(req,res)=>{if(!uuid.safeParse(req.params.id).success)return apiError(res,'Invalid ID');const patch=application.partial().safeParse(req.body);if(!patch.success)return apiError(res,patch.error.issues[0].message);if(!Object.keys(patch.data).length)return apiError(res,'No fields provided');
 const {data:existing,error:existingError}=await req.db.from('applications').select('profile_id,resume_id').eq('id',req.params.id).eq('user_id',req.user.id).maybeSingle();if(existingError)return apiError(res,existingError);if(!existing)return apiError(res,'Not found',404);
 const profileId=patch.data.profile_id||existing.profile_id||await defaultProfile(req);if(!profileId)return apiError(res,'Create an applicant profile first',409);await ownedProfile(req,profileId);
 const {data:current,error:currentError}=await req.db.from('applications').select('company,job_title,job_url').eq('id',req.params.id).eq('user_id',req.user.id).maybeSingle();if(currentError)return apiError(res,currentError);
 const duplicate=await profileDuplicate(req,profileId,{...current,...patch.data},req.params.id);if(duplicate)return apiError(res,duplicate.message,409);
 if(patch.data.profile_id!==undefined&&patch.data.profile_id!==existing.profile_id&&patch.data.resume_id===undefined)patch.data.resume_id=null;
 if(patch.data.resume_id!==undefined)patch.data.resume_id=await resolveResumeId(req,patch.data,profileId);
 patch.data.profile_id=profileId;
 const {data,error}=await req.db.from('applications').update(patch.data).eq('id',req.params.id).eq('user_id',req.user.id).select(APP_SELECT).maybeSingle();if(error)return apiError(res,error);if(!data)return apiError(res,'Not found',404);res.json(data)}));
app.delete('/api/applications/:id',wrap(async(req,res)=>{if(!uuid.safeParse(req.params.id).success)return apiError(res,'Invalid ID');const {data,error}=await req.db.from('applications').delete().eq('id',req.params.id).eq('user_id',req.user.id).select('id').maybeSingle();if(error)return apiError(res,error);if(!data)return apiError(res,'Not found',404);res.json({ok:true})}));
app.post('/api/recommend-resume',(req,res)=>res.json({resume_name:recommendResume(req.body?.technologies||req.body?.description||'')}));
app.get('/api/resumes',wrap(async(req,res)=>{const {data,error}=await req.db.from('resumes').select('*').eq('user_id',req.user.id).order('uploaded_at',{ascending:false});if(error)return apiError(res,error);res.json(data)}));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024}});
app.post('/api/resumes',upload.single('file'),wrap(async(req,res)=>{const name=req.body?.name;
 if(!RESUME_NAMES.includes(name))return apiError(res,'Please select an approved resume name');if(!req.file)return apiError(res,'Choose a PDF or DOCX');
 const pdf=req.file.originalname.toLowerCase().endsWith('.pdf')&&req.file.buffer.subarray(0,5).toString()==='%PDF-';
 const docx=req.file.originalname.toLowerCase().endsWith('.docx')&&req.file.buffer.subarray(0,2).toString()==='PK';
 if(!pdf&&!docx)return apiError(res,'Only PDF and DOCX files are allowed');
 const type=pdf?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
 const profileId=req.body?.profile_id||await defaultProfile(req);if(!uuid.safeParse(profileId).success)return apiError(res,'Invalid profile ID');await ownedProfile(req,profileId);
 const path=`${req.user.id}/${profileId}/${name}/${crypto.randomUUID()}.${pdf?'pdf':'docx'}`;
 const {error:uploadError}=await req.db.storage.from('resumes').upload(path,req.file.buffer,{contentType:type,upsert:false});if(uploadError)return apiError(res,uploadError);
 const {data:prior,error:priorError}=await req.db.from('resumes').select('id,file_path').eq('profile_id',profileId).eq('name',name).maybeSingle();
 if(priorError){await req.db.storage.from('resumes').remove([path]);return apiError(res,priorError)}
 const record={user_id:req.user.id,profile_id:profileId,name,file_path:path,file_name:req.file.originalname,uploaded_at:new Date().toISOString()};
 const write=prior
  ? req.db.from('resumes').update(record).eq('id',prior.id).eq('profile_id',profileId)
  : req.db.from('resumes').insert(record);
 const {data,error}=await write.select().single();
 if(error){await req.db.storage.from('resumes').remove([path]);return apiError(res,error.code==='23505'?'This resume name is already saved for the profile. Run supabase/migrations/012_resume_owner_rls.sql in the Supabase SQL editor, then upload again.':error)}
 if(prior?.file_path&&prior.file_path!==path)await req.db.storage.from('resumes').remove([prior.file_path]);res.status(201).json(data)}));
app.get('/api/resumes/:id/url',wrap(async(req,res)=>{if(!uuid.safeParse(req.params.id).success)return apiError(res,'Invalid ID');const {data,error}=await req.db.from('resumes').select('file_path').eq('id',req.params.id).eq('user_id',req.user.id).maybeSingle();if(error||!data)return apiError(res,'Resume not found',404);
 const signed=await req.db.storage.from('resumes').createSignedUrl(data.file_path,60);if(signed.error)return apiError(res,signed.error);res.json({url:signed.data.signedUrl})}));
app.delete('/api/resumes/:id',wrap(async(req,res)=>{if(!uuid.safeParse(req.params.id).success)return apiError(res,'Invalid ID');const {data,error}=await req.db.from('resumes').select('file_path').eq('id',req.params.id).eq('user_id',req.user.id).maybeSingle();if(error||!data)return apiError(res,'Resume not found',404);
 const removed=await req.db.storage.from('resumes').remove([data.file_path]);if(removed.error)return apiError(res,removed.error);
 const deleted=await req.db.from('resumes').delete().eq('id',req.params.id).eq('user_id',req.user.id);if(deleted.error)return apiError(res,deleted.error);res.json({ok:true})}));
app.use((err,req,res,next)=>{console.error(err);if(err.code==='LIMIT_FILE_SIZE')return apiError(res,'Maximum file size is 10 MB',413);apiError(res,err.status===400?err.message:'Internal server error',err.status===400?400:500)});
app.listen(PORT,()=>console.log(`JobTrack API listening on http://localhost:${PORT}`));
