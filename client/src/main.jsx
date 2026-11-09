import React,{useCallback,useRef,useEffect,useMemo,useState} from 'react';import{createRoot}from'react-dom/client';
import{Bell,LayoutDashboard,BriefcaseBusiness,FileText,BarChart3,Plus,Search,Filter,LogOut,ExternalLink,Trash2,Edit3,UploadCloud,Download,CheckCircle2,X,Menu,ChevronDown,CalendarDays,Clock,ArrowUpRight,LockKeyhole,Mail,ChevronLeft,ChevronRight,Link2,ChartNoAxesCombined,UserRound}from'lucide-react';
import './style.css';
import {HighlightSettings} from './HighlightSettings.jsx';
import './dashboard.css';
import {AccountMenu, Count, Notifications, NotificationBell} from './Inbox.jsx';
import {DashboardMetrics} from './DashboardMetrics.jsx';
import {extractTechnologies} from './technologies.js';
import {ProfileAnalytics, ProfileSelect} from './ProfileAnalytics.jsx';
import {memberGroups} from './profile-analytics.js';
const API=import.meta.env.DEV?'':(import.meta.env.VITE_API_URL||'http://localhost:4000');
const SESSION_KEY='jobtrack-session';
function readSession(){try{const raw=localStorage.getItem(SESSION_KEY);return raw?JSON.parse(raw):null}catch{return null}}
function writeSession(session){if(session)localStorage.setItem(SESSION_KEY,JSON.stringify(session));else localStorage.removeItem(SESSION_KEY)}
async function authRequest(path,body){
 let r;try{r=await fetch(API+'/api/auth/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}catch{throw Error('Cannot reach the API. Start it with npm run dev, then try again.')}
 const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||`Request failed (${r.status})`);return data;
}
const STATUSES=['Saved','Applied','Screening','Interview','Offer','Rejected','Withdrawn'];
const GOAL_OPTIONS=[0,25,50,75,100,125];
const goalLabel=goal=>goal===125?'125+':String(goal??100);
const RESUMES=['Frontend_Resume','Node_Resume','Node_Python_Resume','Python_Resume','Java_Resume','.NET_Resume','GO_Resume','AI_ML_Resume'];
const EMPTY={company:'',job_title:'',platform:'LinkedIn',job_url:'',location:'',salary:'',employment_type:'',description:'',technologies:[],status:'Saved',resume_id:null,notes:'',applied_at:null,next_action_at:null,profile_id:null};
const initials=s=>String(s||'?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const date=s=>s?new Date(s.includes('T')?s:s+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
const dateTime=s=>{if(!s)return '—';const raw=String(s);const d=new Date(raw.includes('T')?raw:raw+'T00:00:00');if(Number.isNaN(d.getTime()))return '—';const mm=String(d.getMonth()+1).padStart(2,'0');const dd=String(d.getDate()).padStart(2,'0');const hh=String(d.getHours()).padStart(2,'0');const min=String(d.getMinutes()).padStart(2,'0');return `${mm}/${dd}/${d.getFullYear()}, ${hh}:${min}`};
const C={Saved:'#94A3B8',Applied:'#2879F5',Screening:'#9C64EE',Interview:'#E9A23B',Offer:'#16A571',Rejected:'#EA6570',Withdrawn:'#64748B'};
function App(){const[session,setSession]=useState(()=>readSession()),[page,setPage]=useState(()=>location.hash==='#keyword-highlights'?'Settings':'Dashboard'),[apps,setApps]=useState([]),[resumes,setResumes]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[search,setSearch]=useState(''),[statusFilter,setStatusFilter]=useState('All'),[platformFilter,setPlatformFilter]=useState('All'),[modal,setModal]=useState(null),[menu,setMenu]=useState(false),[myInfo,setMyInfo]=useState(null),[profiles,setProfiles]=useState([]),[activeProfile,setActiveProfile]=useState(''),[profileFilter,setProfileFilter]=useState('all'),[dashFilter,setDashFilter]=useState('all'),[members,setMembers]=useState([]);
 const [collapsed, setCollapsed] = useState(() => {
   try { return localStorage.getItem('jobtrack-sidebar-collapsed') === 'true'; }
   catch { return false; }
 });
 useEffect(() => {
   try { localStorage.setItem('jobtrack-sidebar-collapsed', String(collapsed)); }
   catch { /* The sidebar still works when browser storage is unavailable. */ }
 }, [collapsed]);
 useEffect(() => {
   if (!menu) return;
   function handleEscape(event) {
     if (event.key === 'Escape') {
       setMenu(false);
       document.getElementById('open-navigation')?.focus();
     }
   }
   document.addEventListener('keydown', handleEscape);
   return () => document.removeEventListener('keydown', handleEscape);
 }, [menu]);
 async function request(path,options={}){const current=readSession();if(!current?.access_token)throw Error('Please sign in');let res;try{res=await fetch(API+'/api'+path,{...options,headers:{Authorization:`Bearer ${current.access_token}`,...(!(options.body instanceof FormData)?{'Content-Type':'application/json'}:{}),...(options.headers||{})}})}catch{throw Error('Cannot reach the API. Start it with npm run dev, then try again.')}const body=await res.json().catch(()=>({}));if(!res.ok)throw Error(body.error||`Request failed (${res.status})`);return body}
 const userId = session?.user?.id;
 const [inboxState, setInboxState] = useState({});
 const generation = useRef(0);
 const refreshInbox = useCallback(async () => {
   if (!userId) return;
   const seq = ++generation.current;
   try {
     const items = await request('/notifications');
     if (seq === generation.current) setInboxState({userId, items});
   } catch (e) {
     if (seq === generation.current) setInboxState(last => ({...last, userId, items: last.userId === userId ? last.items : [], error:e.message}));
   }
 }, [userId]);
 useEffect(() => {
   if (!userId) return;
   refreshInbox();
   const timer = setInterval(refreshInbox, 60000);
   window.addEventListener('focus', refreshInbox);
   return () => { ++generation.current; clearInterval(timer); window.removeEventListener('focus',refreshInbox); };
 }, [refreshInbox, userId]);
 const items = inboxState.userId === userId ? inboxState.items || [] : [];
 const unread = items.filter(item => !item.read).length;
 function navigate(next) {
   setPage(next); setMenu(false); setError('');
   if (next === 'Notifications') refreshInbox();
 }
 async function markRead(ids) {
   await request('/notifications/read',{method:'PATCH',body:JSON.stringify({ids})});
   await refreshInbox();
 }
 async function sendNotice(recipient,message) {
   await request('/notifications',{method:'POST',body:JSON.stringify({recipient,message})});
   await refreshInbox();
 }
 async function signOut(){try{await request('/auth/signout',{method:'POST'});}catch(e){console.warn('Server signout:',e.message)}finally{writeSession(null);setNameDraft(null);setSession(null)}}
 async function load(){if(!session)return;setBusy(true);setError('');try{const[a,r,me,p,team]=await Promise.all([request('/applications'),request('/resumes'),request('/me'),request('/profiles'),request('/members').catch(()=>[])]);setApps(a);setResumes(r);setMyInfo(me);setProfiles(p);setMembers(Array.isArray(team)?team:[]);setActiveProfile(current=>p.some(x=>x.id===current)?current:me.account?.profiles?.[0]||p[0]?.id||'')}catch(e){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{if(session)load();else{setApps([]);setResumes([]);setMyInfo(null);setProfiles([]);setActiveProfile('');setMembers([]);setDashFilter('all')}},[session?.user?.id]);
 const viewApps=useMemo(()=>profileFilter==='all'?apps:apps.filter(a=>a.profile_id===profileFilter),[apps,profileFilter]);
 const dashGroups=useMemo(()=>memberGroups({members,apps,profiles,userEmail:session?.user?.email||'',userName:myInfo?.account?.full_name||session?.user?.full_name||''}),[members,apps,profiles,myInfo,session]);
 const dashApps=useMemo(()=>{const owned=new Map(apps.map(app=>[app.id,app]));const source=Array.isArray(members)&&members.length?members.flatMap(member=>(member.applications||[]).map(app=>{const profile=(member.profiles||[]).find(item=>item.id===app.profile_id);const own=owned.get(app.id);return {...own,...app,mine:member.id===session?.user?.id,profiles:own?.profiles||(profile?{profile_name:profile.profile_name||profile.full_name}:null),next_action_at:app.next_action_at||own?.next_action_at||null}})):apps.map(app=>({...app,mine:true}));return dashFilter==='all'?source:source.filter(app=>dashFilter==='__unassigned__' ? !app.profile_id : app.profile_id===dashFilter)},[members,apps,dashFilter,session]);
 const filtered=useMemo(()=>viewApps.filter(a=>(statusFilter==='All'||a.status===statusFilter)&&(platformFilter==='All'||a.platform===platformFilter)&&[a.company,a.job_title,a.platform,a.location].join(' ').toLowerCase().includes(search.toLowerCase())),[viewApps,search,statusFilter,platformFilter]);
 const platforms=[...new Set(viewApps.map(a=>a.platform).filter(Boolean))].sort();
 const counts=Object.fromEntries(STATUSES.map(s=>[s,dashApps.filter(a=>a.status===s).length]));
 const stats=[{name:'Total Applications',value:dashApps.length,icon:BriefcaseBusiness,seriesKey:'total',sub:dashFilter==='all'?'All member profiles':'Selected profile'},{name:'Applied',value:counts.Applied,icon:CheckCircle2,seriesKey:'Applied',sub:'Currently marked applied'},{name:'Interviews',value:counts.Interview,icon:CalendarDays,seriesKey:'Interview',sub:'In the interview stage'},{name:'Offers',value:counts.Offer,icon:ArrowUpRight,seriesKey:'Offer',sub:'Received offers'}];
 const toast=s=>{setNotice(s);setTimeout(()=>setNotice(''),4500)};
 async function saveApp(data,id){setBusy(true);try{await request(id?`/applications/${id}`:'/applications',{method:id?'PATCH':'POST',body:JSON.stringify(data)});setModal(null);toast(id?'Application updated':'Application added');await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function delApp(a){if(!confirm(`Delete application for ${a.company}?`))return;setBusy(true);try{await request(`/applications/${a.id}`,{method:'DELETE'});toast('Application removed');await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function uploadResume(name,file,profileId){if(!file)throw Error('Select a file');const form=new FormData();form.append('name',name);form.append('profile_id',profileId||activeProfile);form.append('file',file);await request('/resumes',{method:'POST',body:form});toast(`${name} uploaded`);await load()}
 async function viewResume(r){try{const{url}=await request(`/resumes/${r.id}/url`);window.open(url,'_blank','noopener,noreferrer')}catch(e){setError(e.message)}}
 async function delResume(r){if(!confirm(`Delete ${r.name}?`))return;try{await request(`/resumes/${r.id}`,{method:'DELETE'});toast('Resume deleted');await load()}catch(e){setError(e.message)}}
 async function saveProfile(values){setBusy(true);setError('');try{const profile=await request('/me',{method:'PATCH',body:JSON.stringify(values)});setMyInfo(x=>({...x,profile}));toast('Profile saved')}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function saveDailyGoal(profileId,value){const next=Number(value);if(!GOAL_OPTIONS.includes(next))return;setBusy(true);setError('');try{const saved=await request('/daily-goal',{method:'PATCH',body:JSON.stringify({profile_id:profileId,daily_goal:next})});const apply=list=>(list||[]).map(profile=>profile.id===saved.profile_id?{...profile,daily_goal:saved.daily_goal}:profile);setProfiles(apply);setMembers(current=>current.map(member=>({...member,profiles:apply(member.profiles)})));toast('Daily goal updated')}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function saveApplicantProfile(data,id){setBusy(true);setError('');try{await request(id?`/profiles/${id}`:'/profiles',{method:id?'PATCH':'POST',body:JSON.stringify(data)});toast(id?'Applicant profile updated':'Applicant profile created');setModal(null);await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function deleteApplicantProfile(profile){if(!confirm(`Delete ${profile.profile_name}? It must have no linked applications or resumes.`))return;setBusy(true);setError('');try{await request(`/profiles/${profile.id}`,{method:'DELETE'});toast('Profile deleted');await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function makeDefaultProfile(profile){setBusy(true);setError('');try{await request(`/profiles/${profile.id}/default`,{method:'POST'});toast('Default profile updated');await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const [nameDraft, setNameDraft] = useState(null);
 const [preferenceVersion, setPreferenceVersion] = useState(0);
 const displayName = useMemo(() => {
   try { return localStorage.getItem('jobtrack-display-' + userId) || ''; }
   catch { return ''; }
 }, [userId, preferenceVersion]);
 const accountName=displayName||myInfo?.account?.full_name||session?.user?.full_name||'';
 const nav=[['Dashboard' ,LayoutDashboard],['Applications',BriefcaseBusiness],['Resumes',FileText],['Analytics',BarChart3],['My Profiles',UserRound]];
 if(!session)return <Auth onSession={next=>{writeSession(next);setSession(next)}}/>;
 return <div className={'shell workspace-theme' + (collapsed ? ' sidebar-collapsed' : '')}>
 {menu && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMenu(false)} />}
 <aside id="workspace-navigation" className={'sidebar ' + (menu ? 'open' : '')}>
   <div className="brand">
     <img src="/icon.png" alt="JobTrack"/>
     <div className="brand-copy"><b>JobTrack</b><small>APPLICATION MANAGER</small></div>
     <button className="sidebar-toggle" aria-controls="workspace-navigation" aria-expanded={!collapsed}
       title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed(value => !value)}>
       {collapsed ? <ChevronRight size={17}/> : <ChevronLeft size={17}/>}
     </button>
     <button className="drawer-close" aria-label="Close navigation" onClick={() => setMenu(false)}><ChevronLeft size={17}/></button>
   </div>
   <div className="nav-group-label">Workspace</div>
   <nav aria-label="Workspace pages">{nav.map(([name, Icon]) => (
     <button key={name} title={name} aria-label={name} aria-current={page === name ? 'page' : undefined}
       className={'nav-item ' + (page === name ? 'active' : '')}
       onClick={() => { setPage(name); setMenu(false); setError(''); }}>
       <Icon size={18}/><span className="nav-caption">{name}</span>
       {name === 'Applications' && <span className="nav-count">{apps.length}</span>}
     </button>
   ))}</nav>
   <div className="sidebar-bottom">
     <AccountMenu key={userId} name={accountName || session.user.email?.split('@')[0]} email={session.user.email}
       role={myInfo?.account?.level || 'Member'} initials={initials(accountName || session.user.email)}
       count={unread} navigate={navigate} signOut={signOut}/>
   </div>
 </aside>
 <div className="main-area"><header className="topbar"><button id="open-navigation" aria-label="Open navigation" aria-controls="workspace-navigation" aria-expanded={menu} className="icon-button mobile-menu" onClick={() => setMenu(!menu)}><Menu/></button><div className="breadcrumb">Workspace <ChevronRight size={14}/> <b>{page}</b></div><NotificationBell items={items} count={unread} mark={markRead} openInbox={() => navigate('Notifications')}
    loading={inboxState.userId !== userId} error={inboxState.userId === userId && inboxState.error} refresh={refreshInbox}/></header>
 <main className="content">{error&&<div className="alert error"><span>{error}</span><button onClick={()=>setError('')}><X size={16}/></button></div>}{notice&&<div className="alert success"><CheckCircle2 size={16}/>{notice}</div>}
 {page==='Dashboard'&&<><div className="page-top"><div><h1>Dashboard</h1><p className="muted">Welcome back, <b>{accountName || session.user.email?.split('@')[0]}</b></p></div><div className="page-actions"><ProfileSelect profiles={profiles} groups={dashGroups} value={dashFilter} onChange={setDashFilter}/><button className="primary-btn" onClick={()=>setModal({type:'application',data:{...EMPTY,profile_id:profiles.some(p=>p.id===dashFilter)?dashFilter:null}})}><Plus size={18}/> Add application</button></div></div><DashboardMetrics stats={stats} apps={dashApps}/>
 <ProfileAnalytics dashboard apps={apps} profiles={profiles} members={members} userEmail={session.user.email} userName={accountName} selectedId={dashFilter} onProfileChange={setDashFilter}/>
 <div className="dash-grid"><div className="panel"><div className="panel-header"><div><h3>Application pipeline</h3><p className="muted tiny">Your applications by current status</p></div><ChartNoAxesCombined size={20} className="muted"/></div><div className="status-list">{STATUSES.map(s=><div key={s} className="status-row"><span className="status-name"><span className="dot" style={{background:C[s]}}/>{s}</span><div className="bar-bg"><div style={{background:C[s],width:(dashApps.length?100*counts[s]/dashApps.length:0)+'%'}}/></div><b>{counts[s]}</b></div>)}</div></div><div className="panel focus-panel"><div className="panel-header"><div><h3>Next steps</h3><p className="muted tiny">Upcoming follow-ups</p></div><Clock size={20} className="muted"/></div>{dashApps.filter(a=>a.next_action_at).sort((a,b)=>a.next_action_at.localeCompare(b.next_action_at)).slice(0,4).map(a=><div className="followup" key={a.id}><div className="company-tile">{initials(a.company)}</div><div><b>{a.company}</b><small>{a.job_title}</small></div><time>{date(a.next_action_at)}</time></div>)}{!dashApps.some(a=>a.next_action_at)&&<div className="empty-small"><CalendarDays size={30}/><b>No upcoming follow-ups</b><p>Add a next-action date to an application.</p></div>}</div></div><div className="panel recent"><div className="panel-header"><div><h3>Recent applications</h3><p className="muted tiny">Your latest tracked opportunities</p></div><button className="text-link" onClick={()=>setPage('Applications')}>View all <ChevronRight size={16}/></button></div><ApplicationTable apps={dashApps.slice(0,5)} onEdit={a=>a.mine!==false&&setModal({type:'application',data:a})} onDelete={delApp}/></div></>}
 {page==='Applications'&&<><div className="page-top"><div><p className="eyebrow">TRACK EVERY OPPORTUNITY</p><h1>Applications</h1><p className="muted">Manage, organize, and update your job applications in one place.</p></div><div className="page-actions"><ProfileSelect profiles={profiles} value={profileFilter} onChange={setProfileFilter}/><button className="primary-btn" onClick={()=>setModal({type:'application',data:{...EMPTY,profile_id:profileFilter==='all'?null:profileFilter}})}><Plus size={18}/> Add application</button></div></div><div className="panel application-panel"><div className="table-toolbar"><div className="search-box"><Search size={18}/><input placeholder="Search company, title, location..." value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="filters"><Filter size={17}/><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option>All</option>{STATUSES.map(s=><option key={s}>{s}</option>)}</select><select value={platformFilter} onChange={e=>setPlatformFilter(e.target.value)}><option>All</option>{platforms.map(s=><option key={s}>{s}</option>)}</select></div></div><div className="table-meta">Showing <b>{filtered.length}</b> of <b>{viewApps.length}</b> applications</div><ApplicationTable apps={filtered} onEdit={a=>setModal({type:'application',data:a})} onDelete={delApp}/></div></>}
 {page==='Resumes'&&<><div className="page-top"><div><p className="eyebrow">YOUR DOCUMENTS</p><h1>Resume library</h1><p className="muted">Keep eight approved resume profiles ready for every opportunity.</p></div><span className="subtle-count">{resumes.filter(r=>r.profile_id===activeProfile).length} / 8 uploaded</span></div><div className="resume-layout"><div className="panel upload-panel"><h3>Upload a resume</h3><p className="muted">Choose an approved resume name and upload a PDF or DOCX file.</p><div className="field"><label>Applicant profile</label><select value={activeProfile} onChange={e=>setActiveProfile(e.target.value)}>{profiles.map(p=><option key={p.id} value={p.id}>{p.profile_name} — {p.full_name||'Unnamed'}</option>)}</select></div><ResumeUploader key={activeProfile} upload={(name,file)=>uploadResume(name,file,activeProfile)}/></div><div className="panel"><div className="panel-header"><div><h3>Your resumes</h3><p className="muted tiny">Stored privately in Supabase Storage</p></div><FileText size={20} className="muted"/></div>{RESUMES.map(n=>{const r=resumes.find(x=>x.name===n&&x.profile_id===activeProfile);return <div className="resume-row" key={n}><div className={'file-icon '+(r?'ready':'')}><FileText size={18}/></div><div className="resume-info"><b>{n}</b><small>{r?r.file_name:'Not uploaded'}</small></div>{r?<><button className="icon-button" onClick={()=>viewResume(r)} title="View / download"><Download size={17}/></button><button className="icon-button danger" onClick={()=>delResume(r)} title="Delete"><Trash2 size={17}/></button></>:<span className="not-uploaded">Missing</span>}</div>})}</div></div></>}
 {page==='My Profiles'&&<MyProfiles profiles={profiles} defaultId={myInfo?.account?.profiles?.[0]||''} members={members} accountId={session.user.id} accountName={accountName} canSetGoal={['manager','admin'].includes(myInfo?.account?.level)} onGoal={saveDailyGoal} busy={busy} add={()=>setModal({type:'profile',data:null})} edit={profile=>setModal({type:'profile',data:profile})} remove={deleteApplicantProfile} setDefault={makeDefaultProfile}/>}
 {page==='Analytics'&&<><div className="page-top"><div><p className="eyebrow">MEMBERS AND PROFILES</p><h1>Analytics</h1><p className="muted">Compare each member and their profiles over time.</p></div></div><ProfileAnalytics apps={apps} profiles={profiles} resumes={resumes} userEmail={session.user.email} userName={accountName} members={members} selectedId={profileFilter} onProfileChange={setProfileFilter}/></>}
 {page === 'Notifications' && <Notifications items={items} loading={inboxState.userId !== userId} error={inboxState.userId === userId && inboxState.error}
   mark={markRead} reload={refreshInbox} admin={myInfo?.account?.level === 'admin'} send={sendNotice}
   recipients={[session.user,...members.filter(m => m.id !== userId && (myInfo?.account?.members || []).includes(m.id))]}/>}
 {page === 'Guide' && <section className="inbox-page"><h1>Workspace guide</h1><div className="panel guide-list">
   <h3>Track an opportunity</h3><p>Open Applications, choose Add application, select an applicant profile, and save the job details.</p>
   <h3>Manage profiles and resumes</h3><p>Create applicant identities under My Profiles. Select a profile in Resumes to upload its documents.</p>
   <h3>Read your notifications</h3><p>The bell shows how many messages are unread. Select a message to mark it read, or use Mark all read to clear the count. Messages appear for seven days.</p>
 </div></section>}
  {page==='Settings'&&<section className="inbox-page settings-page"><div className="page-top"><div><h1>Settings</h1><p className="muted">Your account, sign-in and preferences.</p></div></div>
 <div className="account-settings"><h3>Account</h3><div className="panel settings-account">
 <span className="avatar">{initials(accountName || session.user.email)}</span>
 <div>{nameDraft === null ? <><strong>{accountName || session.user.email}</strong> <button className="icon-button" title="Edit display name" onClick={() => setNameDraft(accountName)}><Edit3 size={15}/></button></> :
 <form onSubmit={e => { e.preventDefault(); try { localStorage.setItem('jobtrack-display-'+userId,nameDraft.trim()); setPreferenceVersion(v=>v+1); setNameDraft(null); } catch {setError('Could not save this browser preference.');} }}>
 <label className="field">Display name on this browser<input autoFocus maxLength={120} value={nameDraft} onChange={e => setNameDraft(e.target.value)}/></label><button className="outline-btn">Save</button> <button type="button" className="outline-btn" onClick={()=>setNameDraft(null)}>Cancel</button></form>}
 <small>{session.user.email}</small></div><span className="profile-badge">{myInfo?.account?.level || 'Member'}</span></div>
 <HighlightSettings key={userId} request={request}/>
 <h3>Sign-in</h3><div className="panel"><strong>Email and password</strong><p className="muted tiny">You sign in with your JobTrack account.</p></div>
 <h3>Notifications</h3><button className="inbox-row" onClick={() => navigate('Notifications')}><Bell size={17}/>Open notifications <Count value={unread}/></button>
 
 </div>
 </section>}
 </main></div>{modal?.type==='application'&&<ApplicationModal key={modal.data.id||'new'} resumes={resumes} profiles={profiles} defaultProfileId={myInfo?.account?.profiles?.[0]} data={modal.data} close={()=>setModal(null)} save={saveApp} busy={busy} request={request}/>} {modal?.type==='profile'&&<ApplicantProfileModal key={modal.data?.id||'new'} data={modal.data} save={saveApplicantProfile} close={()=>setModal(null)} busy={busy}/>}</div>}
const PROFILE_FIELDS=[
 ['full_name','Full name','text'],['location','Location','text'],['date_of_birth','Date of birth','date'],
 ['phone_number','Phone number','tel'],['full_address','Full address','text'],['address_line_2','Address line 2','text'],
 ['city','City','text'],['state_region','State / Region','text'],['postal_code','ZIP / Postal code','text'],
 ['country','Country','text']
];

function ProfileCard({profile,mine,defaultId,edit,remove,setDefault,canSetGoal,onGoal,busy}){
 const goal=GOAL_OPTIONS.includes(profile.daily_goal)?profile.daily_goal:100;
 return <div className="panel applicant-card">
 <div className="applicant-header"><span className="avatar">{initials(profile.full_name||profile.profile_name)}</span><div><h3>{profile.profile_name}</h3><span className="muted tiny">{profile.full_name||'Full name not set'}</span></div>{profile.id===defaultId&&<span className="profile-badge">Default</span>}</div>
 <div className="applicant-meta"><span><Mail size={15}/>{profile.email||'No email'}</span><span><UserRound size={15}/>{profile.phone_number||'No phone number'}</span><span><BriefcaseBusiness size={15}/>{profile.location||profile.city||'Location not set'}</span><span>Today's goal {canSetGoal?<select className="goal-select" value={goal} disabled={busy} onChange={e=>onGoal(profile.id,e.target.value)}>{GOAL_OPTIONS.map(option=><option key={option} value={option}>{goalLabel(option)}</option>)}</select>:<b>{goalLabel(goal)}</b>}</span></div>
 {mine&&<div className="applicant-actions"><button className="outline-btn" onClick={()=>edit(profile)}><Edit3 size={15}/> Edit</button>{profile.id!==defaultId&&<><button className="outline-btn" onClick={()=>setDefault(profile)}>Make default</button><button className="icon-button danger" title="Delete profile" onClick={()=>remove(profile)}><Trash2 size={17}/></button></>}</div>}
 </div>;
}
function MyProfiles({profiles,defaultId,members,accountId,accountName,canSetGoal,onGoal,busy,add,edit,remove,setDefault}){
 const others=(Array.isArray(members)?members:[]).filter(member=>member.id!==accountId);
 const several=others.length>0;
 const groups=[{id:accountId,full_name:accountName},...others];
 return <><div className="page-top"><div><p className="eyebrow">APPLICANT IDENTITIES</p><h1>My Profiles</h1><p className="muted">{several?'Your profiles, then each member’s profiles.':'Create and edit multiple applicant profiles. Each profile has its own contact details, resumes, and applications.'}</p></div><button className="primary-btn" onClick={add}><Plus size={18}/> Add profiles</button></div>
 {groups.map(member=>{const mine=member.id===accountId;const list=mine?profiles:(member.profiles||[]);const name=(member.full_name||'').trim()||member.email||'Member';return <section className="member-profile-section" key={member.id}>{several&&<h2 className="member-profile-heading">{mine?`${name||'You'} · You`:name}</h2>}<div className="applicant-grid">{list.map(profile=><ProfileCard key={profile.id} profile={profile} mine={mine} defaultId={mine?defaultId:''} edit={edit} remove={remove} setDefault={setDefault} canSetGoal={canSetGoal} onGoal={onGoal} busy={busy}/>)}{!list.length&&<div className="panel"><p>{mine?'Create your first applicant profile.':'No profiles for this member.'}</p></div>}</div></section>})}
 </>;
}
function ApplicantProfileModal({data,save,close,busy}){
 const empty=Object.fromEntries(PROFILE_FIELDS.map(([k])=>[k,'']));
 const [form,setForm]=useState({...empty,email:'',bio:'',profile_name:'',...data,date_of_birth:data?.date_of_birth||''});
 const set=(k,v)=>setForm(f=>({...f,[k]:v}));
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="modal"><div className="modal-head"><div><h2>{data?'Edit applicant profile':'Add applicant profile'}</h2><p className="muted tiny">Use this identity when submitting job applications.</p></div><button className="icon-button" onClick={close}><X size={20}/></button></div>
 <form onSubmit={e=>{e.preventDefault();const keys=['profile_name','email',...PROFILE_FIELDS.map(([k])=>k),'bio'];save(Object.fromEntries(keys.map(k=>[k,k==='date_of_birth'?(form[k]||null):(form[k]||'')])),data?.id)}}>
 <div className="modal-fields"><div className="field"><label>Profile name *</label><input required maxLength={80} value={form.profile_name} onChange={e=>set('profile_name',e.target.value)} placeholder="e.g. Main / Contract / Consulting"/></div><div className="field"><label>Application email *</label><input required type="email" maxLength={320} value={form.email} onChange={e=>set('email',e.target.value)}/></div>
 {PROFILE_FIELDS.map(([key,label,type])=><div className={'field '+(key==='full_address'?'wide':'')} key={key}><label>{label}</label><input type={type} maxLength={key==='full_address'?500:200} value={form[key]||''} onChange={e=>set(key,e.target.value)}/></div>)}<div className="field wide"><label>About me</label><textarea rows={3} maxLength={2000} value={form.bio||''} onChange={e=>set('bio',e.target.value)}/></div></div>
 <div className="modal-footer"><button type="button" className="outline-btn" onClick={close}>Cancel</button><button disabled={busy} className="primary-btn"><CheckCircle2 size={17}/>{busy?'Saving...':data?'Save changes':'Create profile'}</button></div></form></div></div>;
}
function ProfileEditor({info,save,busy}){
 const [form,setForm]=useState(()=>Object.fromEntries([...PROFILE_FIELDS.map(([key])=>[key,info?.profile?.[key]||'']),['bio',info?.profile?.bio||'']]));
 const set=(key,value)=>setForm(current=>({...current,[key]:value}));
 return <><div className="page-top"><div><p className="eyebrow">PERSONAL INFORMATION</p><h1>My profile</h1><p className="muted">View and edit the details associated with your account.</p></div></div>
 <div className="panel profile-editor"><div className="panel-header"><div><h3>Profile details</h3><p className="muted tiny">Only you can access your personal profile through this account.</p></div><UserRound size={22}/></div>
 <form onSubmit={e=>{e.preventDefault();save(form)}}>
 <div className="modal-fields"><div className="field"><label>Email address (managed by login)</label><input value={info?.user?.email||''} disabled readOnly type="email"/></div><div className="field"><label>Account level</label><input value={info?.account?.level||'user'} disabled readOnly/></div>
 {PROFILE_FIELDS.map(([key,label,type])=><div className={'field '+(key==='full_address'?'wide':'')} key={key}><label>{label}</label><input type={type} value={form[key]} onChange={e=>set(key,e.target.value)} maxLength={key==='full_address'?500:200}/></div>)}
 <div className="field wide"><label>About me</label><textarea rows="4" maxLength={2000} value={form.bio} onChange={e=>set('bio',e.target.value)}/></div></div>
 <div className="profile-footer"><span className="muted tiny">Profile ID: {info?.account?.profiles?.[0]||info?.profile?.id||'—'}</span><button type="submit" className="primary-btn" disabled={busy}><CheckCircle2 size={17}/>{busy?'Saving...':'Save profile'}</button></div>
 </form></div></>;
}
function ApplicationTable({apps,onEdit,onDelete}){if(!apps.length)return <div className="empty-table"><BriefcaseBusiness size={36}/><b>No applications yet</b><p>Add your first opportunity to start tracking.</p></div>;return <div className="table-scroll"><table><thead><tr><th>COMPANY / ROLE</th><th>PLATFORM</th><th>STATUS</th><th>LOCATION</th><th>PROFILE</th><th>RESUME</th><th>DATE & TIME</th><th>UPDATED</th><th></th></tr></thead><tbody>{apps.map(a=><tr key={a.id}><td><div className="company-cell"><span className="company-tile">{initials(a.company)}</span><div><b>{a.company}</b><small>{a.job_title}</small></div></div></td><td><span className="platform-tag">{a.platform||'Other'}</span></td><td><span className="status-chip" style={{color:C[a.status],background:C[a.status]+'17'}}><i style={{background:C[a.status]}}/>{a.status}</span></td><td>{a.location||'—'}</td><td>{a.profiles?.profile_name||'—'}</td><td className="resume-table-cell">{a.resumes?.name||'—'}</td><td style={{whiteSpace:'nowrap'}}>{dateTime(a.created_at)}</td><td>{date(a.updated_at)}</td><td><div className="row-actions">{a.job_url&&<a className="icon-button" href={a.job_url} target="_blank" rel="noreferrer" title="Open job"><ExternalLink size={16}/></a>}{a.mine!==false&&<><button className="icon-button" onClick={()=>onEdit(a)} title="Edit"><Edit3 size={16}/></button><button className="icon-button danger" onClick={()=>onDelete(a)} title="Delete"><Trash2 size={16}/></button></>}</div></td></tr>)}</tbody></table></div>}
function ApplicationModal({data,resumes,profiles,defaultProfileId,save,close,busy,request}){const[f,setF]=useState({...EMPTY,profile_id:data.profile_id||defaultProfileId,...data}),[tech,setTech]=useState((data.technologies||[]).join(', ')),[duplicate,setDuplicate]=useState({state:'idle',message:'Enter a job URL, or a company name and job title, to check this profile.'});const edit=(k,v)=>setF(p=>({...p,[k]:v}));const onDescription=value=>{edit('description',value);const found=extractTechnologies(value);if(found.length)setTech(found.join(', '));else if(!value.trim())setTech('')};
useEffect(()=>{const profileId=f.profile_id;const company=String(f.company||'').trim();const jobTitle=String(f.job_title||'').trim();const jobUrl=String(f.job_url||'').trim();if(!profileId||(!jobUrl&&!(company&&jobTitle))){setDuplicate({state:'idle',message:'Enter a job URL, or a company name and job title, to check this profile.'});return}let cancel=false;const timer=setTimeout(async()=>{setDuplicate(current=>({...current,state:'checking',message:'Checking this profile…'}));try{const params=new URLSearchParams({profile_id:profileId,job_url:jobUrl,company,job_title:jobTitle});if(data.id)params.set('ignore_id',data.id);const result=await request('/applications/duplicate?'+params);if(cancel)return;setDuplicate(result.duplicate?{state:'duplicate',message:result.message}:{state:'clear',message:'No duplicate for this profile.'})}catch(error){if(!cancel)setDuplicate({state:'error',message:error.message})}},350);return()=>{cancel=true;clearTimeout(timer)}},[f.profile_id,f.company,f.job_title,f.job_url,data.id]);
async function submit(e){e.preventDefault();const profileId=f.profile_id;const company=String(f.company||'').trim();const jobTitle=String(f.job_title||'').trim();const jobUrl=String(f.job_url||'').trim();if(profileId&&(jobUrl||(company&&jobTitle))){try{const params=new URLSearchParams({profile_id:profileId,job_url:jobUrl,company,job_title:jobTitle});if(data.id)params.set('ignore_id',data.id);const result=await request('/applications/duplicate?'+params);if(result.duplicate){setDuplicate({state:'duplicate',message:result.message});return}}catch(error){setDuplicate({state:'error',message:error.message});return}}const {id,user_id,created_at,updated_at,resumes:linkedResume,profiles:linkedProfile,remote_type,resume_name,...payload}=f;if(!data.id && !payload.resume_id)delete payload.resume_id;save({...payload,technologies:tech.split(',').map(x=>x.trim()).filter(Boolean),applied_at:f.applied_at||null,next_action_at:f.next_action_at||null},data.id)}
return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="modal"><div className="modal-head"><div><h2>{data.id?'Edit application':'New application'}</h2><p className="muted tiny">Capture the details of your opportunity</p></div><button className="icon-button" onClick={close}><X size={20}/></button></div><form onSubmit={submit}><div className="modal-fields"><div className="field"><label>Company name *</label><input required maxLength="200" value={f.company} onChange={e=>edit('company',e.target.value)} placeholder="e.g. Mitratech"/></div><div className="field"><label>Job title *</label><input required maxLength="300" value={f.job_title} onChange={e=>edit('job_title',e.target.value)} placeholder="e.g. Senior Software Engineer"/></div><div className="field"><label>Platform</label><select value={f.platform} onChange={e=>edit('platform',e.target.value)}>{['LinkedIn','Indeed','Dice','Greenhouse','Ashby','Lever','Workday','Wellfound','Glassdoor','Jobright','Teal','Company Website','Other'].map(x=><option key={x}>{x}</option>)}</select></div><div className="field"><label>Status</label><select value={f.status} onChange={e=>edit('status',e.target.value)}>{STATUSES.map(x=><option key={x}>{x}</option>)}</select></div><div className="field wide"><label>Job URL</label><input type="url" value={f.job_url} onChange={e=>edit('job_url',e.target.value)} placeholder="https://..."/></div><div className={'field wide duplicate-live '+duplicate.state} role="status"><b>{duplicate.state==='duplicate'?'Already saved for this profile':duplicate.state==='clear'?'No duplicate':duplicate.state==='checking'?'Checking…':'Duplicate check'}</b><span>{duplicate.message}</span></div><div className="field"><label>Location</label><input value={f.location} onChange={e=>edit('location',e.target.value)} placeholder="Remote, United States"/></div><div className="field"><label>Salary</label><input value={f.salary} onChange={e=>edit('salary',e.target.value)} placeholder="$120,000–$150,000"/></div><div className="field"><label>Employment type</label><input value={f.employment_type} onChange={e=>edit('employment_type',e.target.value)} placeholder="Full-time / Contract"/></div><div className="field"><label>Applicant profile *</label><select required value={f.profile_id||''} onChange={e=>setF(prev=>({...prev,profile_id:e.target.value,resume_id:null}))}><option value="" disabled>Select an applicant profile</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.profile_name} — {p.full_name||'Unnamed'}</option>)}</select></div><div className="field"><label>Resume</label><select value={f.resume_id||''} onChange={e=>edit('resume_id',e.target.value||null)}><option value="">{data.id?'No linked resume':'Auto-select uploaded matching resume'}</option>{resumes.filter(r=>r.profile_id===f.profile_id).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div><div className="field"><label>Applied on</label><input type="date" value={f.applied_at||''} onChange={e=>edit('applied_at',e.target.value)}/></div><div className="field"><label>Next action date</label><input type="date" value={f.next_action_at||''} onChange={e=>edit('next_action_at',e.target.value)}/></div><div className="field wide"><label>Job description</label><textarea rows="5" value={f.description} onChange={e=>onDescription(e.target.value)} placeholder="Paste the full job posting here..."/></div><div className="field wide"><label>Technologies (comma-separated)</label><input value={tech} onChange={e=>setTech(e.target.value)} placeholder="React, Node.js, PostgreSQL"/><span className="muted tiny">Filled from the job description as you type. You can edit this list before saving.</span></div><div className="field wide"><label>Notes</label><textarea rows="3" value={f.notes} onChange={e=>edit('notes',e.target.value)} placeholder="Recruiter, interview prep, follow-up notes..."/></div></div><div className="modal-footer"><button type="button" className="outline-btn" onClick={close}>Cancel</button><button disabled={busy||!profiles.length||duplicate.state==='duplicate'} type="submit" className="primary-btn"><CheckCircle2 size={17}/>{busy?'Saving...':duplicate.state==='duplicate'?'Already saved':'Save application'}</button></div></form></div></div>}
function ResumeUploader({upload}){const[name,setName]=useState(RESUMES[0]),[file,setFile]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');return <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await upload(name,file);setFile(null);e.target.reset();setName(RESUMES[0])}catch(e){setError(e.message)}finally{setBusy(false)}}}><div className="field"><label>Resume name</label><select value={name} onChange={e=>setName(e.target.value)}>{RESUMES.map(x=><option key={x}>{x}</option>)}</select></div><label className="drop-zone"><UploadCloud size={34}/><b>{file?file.name:'Click to choose a file'}</b><small>PDF or DOCX, up to 10 MB</small><input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>{error&&<p className="form-error">{error}</p>}<button className="primary-btn full" disabled={!file||busy} type="submit"><UploadCloud size={18}/>{busy?'Uploading...':'Upload resume'}</button><div className="support-note"><LockKeyhole size={17}/><span>Need a different resume name? Contact the support team.</span></div></form>}
function Auth({onSession}){const[mode,setMode]=useState('signin'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[fullName,setFullName]=useState(''),[loading,setLoading]=useState(false),[msg,setMsg]=useState(''),[error,setError]=useState('');
async function submit(e){e.preventDefault();setLoading(true);setMsg('');setError('');try{
 if(mode==='signup'){
  const result=await authRequest('signup',{email,password,full_name:fullName});
  if(!result.session?.access_token)throw Error(result.message||'Account was not created');
  onSession({user:result.user,access_token:result.session.access_token});
 }else if(mode==='reset'){
  const result=await authRequest('forgot-password',{email});setMsg(result.message);
 }else{
  const result=await authRequest('signin',{email,password});
  if(!result.session?.access_token)throw Error('Sign-in did not return a session');
  onSession({user:result.user,access_token:result.session.access_token});
 }
}catch(e){setError(e.message)}finally{setLoading(false)}}
return <div className="auth-page workspace-theme"><div className="auth-decor one"/><div className="auth-decor two"/><div className="auth-card"><div className="auth-brand"><img src="/icon.png" alt="JobTrack icon"/><div><b>JobTrack</b><small>APPLICATION MANAGER</small></div></div><h1>{mode==='signup'?'Create your account':mode==='reset'?'Reset your password':'Welcome back'}</h1><p className="muted">{mode==='signup'?'Creates a local account. No confirmation email is sent.':mode==='reset'?'Password reset email is off. Create a new local account if you cannot sign in.':'Sign in with the local account you create here. A previous Supabase Auth password will not work.'}</p><form onSubmit={submit}>{mode==='signup'&&<div className="field"><label>Full name *</label><input required maxLength="120" value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Your name" autoComplete="name"/></div>}<div className="field"><label>Email address</label><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"/></div>{mode!=='reset'&&<div className="field"><label>Password</label><input required minLength={8} maxLength={128} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete={mode==='signup'?'new-password':'current-password'}/></div>}{error&&<p className="form-error" role="alert">{error}</p>}{msg&&<p className="form-ok" role="status">{msg}</p>}<button className="primary-btn full" disabled={loading}>{loading?'Please wait...':mode==='signup'?'Create account':mode==='reset'?'Send reset link':'Sign in'}<ArrowUpRight size={17}/></button></form><div className="auth-links">{mode==='signin'?<><button type="button" onClick={()=>{setMode('signup');setError('');setMsg('')}}>Create an account</button><button type="button" onClick={()=>{setMode('reset');setError('');setMsg('')}}>Forgot password?</button></>:<button type="button" onClick={()=>{setMode('signin');setError('');setMsg('')}}>Back to sign in</button>}</div><div className="auth-footer"><LockKeyhole size={14}/> Local account. Supabase Auth is off.</div></div></div>}

createRoot(document.getElementById('root')).render(<App/>);
