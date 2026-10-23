import React,{useCallback,useEffect,useMemo,useState} from 'react';import{createRoot}from'react-dom/client';
import{Activity,ArrowDownRight,ArrowRight,ArrowUpRight,BarChart3,Bell,BookOpen,Building2,CalendarDays,Check,CheckCircle2,ChevronDown,ChevronLeft,ChevronRight,ClipboardCheck,ClipboardList,Download,FileBarChart,GraduationCap,HeartHandshake,LayoutDashboard,LogOut,Menu,MoreHorizontal,Plus,Search,Settings2,ShieldCheck,SlidersHorizontal,Sparkles,Users,UserRound,School,TrendingUp,X,AlertCircle,Clock,PanelLeftClose,Sun,Moon,RefreshCw,Briefcase,Wallet}from'lucide-react';
import{Area,AreaChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis,Bar,BarChart,Cell}from'recharts';
import{request,login,register,logout,list,create,update,createAccount,registerCampus,schoolUsers,type User,type Dashboard,type Resource}from'./api';import PublicHome from './PublicHome';import SchoolSetup from './SchoolSetup';import Reports from './Reports';import Staff from './Staff';import Finance from './Finance';import MyPerformance from './MyPerformance';import './style.css';
const WORKSPACE_NAV=[{name:'Overview',icon:LayoutDashboard},{name:'Campuses',icon:Building2,adminOnly:true},{name:'Schools',icon:School},{name:'School setup',icon:Settings2,adminOnly:true},{name:'Academic years',icon:CalendarDays,adminOnly:true},{name:'Classes',icon:Users},{name:'Subjects',icon:BookOpen},{name:'Students',icon:GraduationCap},{name:'Attendance',icon:ClipboardCheck},{name:'Homework',icon:ClipboardList},{name:'Academics',icon:FileBarChart},{name:'Interventions',icon:HeartHandshake},{name:'Staff',icon:Briefcase,roles:['organisation_admin','school_admin','principal']},{name:'Finance',icon:Wallet,roles:['organisation_admin','school_admin','principal']}];
const SYSTEM_NAV=[{name:'Reports',icon:BarChart3,roles:['organisation_admin','school_admin','principal','teacher']},{name:'My performance',icon:TrendingUp,roles:['student','parent']},{name:'Audit log',icon:ShieldCheck,adminOnly:true},{name:'Notifications',icon:Bell},{name:'Settings',icon:Settings2}];
const NAV_GROUPS=[{sublabel:'ORGANISATION & CAMPUSES',items:['Overview','Campuses','Schools']},{sublabel:'ACADEMIC CONFIGURATION',adminLabel:true,items:['School setup','Academic years']},{sublabel:'ACADEMIC STRUCTURE',items:['Classes','Subjects']},{sublabel:'STUDENTS & LEARNING',items:['Students','Attendance','Homework','Academics']},{sublabel:'STUDENT SUPPORT',items:['Interventions']},{sublabel:'PEOPLE & FINANCE',items:['Staff','Finance']}];
const COLOR=['#715ee8','#23b7a0','#f29d50','#6c9eff','#e477a1','#b4a0e9'];
const initials=(name:string)=>name.split(/\s+/).map(s=>s[0]).join('').slice(0,2).toUpperCase();
const fmt=(n:number|null|undefined,suffix='%')=>n===null||n===undefined?'—':`${n}${suffix}`;
const nice=(s:string)=>s.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const resourceInfo:Record<string,{api:string;title:string;desc:string;columns:{key:string;label:string}[];fields:{key:string;label:string;type?:string;required?:boolean}[]}>= {
 Students:{api:'students',title:'Student directory',desc:'A unified view of learners across your authorised schools.',columns:[{key:'name',label:'Student'},{key:'admission_number',label:'Admission ID'},{key:'class_name',label:'Class'},{key:'gender',label:'Gender'},{key:'active',label:'Status'}],fields:[{key:'first_name',label:'First name',required:true},{key:'last_name',label:'Last name',required:true},{key:'admission_number',label:'Admission number',required:true},{key:'gender',label:'Gender'},{key:'school',label:'School / Campus',required:true},{key:'enrolled_on',label:'Enrolment date',type:'date',required:true}]},
 Schools:{api:'schools',title:'Your schools',desc:'Monitor and manage campuses in your education group.',columns:[{key:'name',label:'School'},{key:'code',label:'School code'},{key:'city',label:'Location'},{key:'attendance_alert_threshold',label:'Attendance alert'}],fields:[{key:'name',label:'School name',required:true},{key:'code',label:'Code',required:true},{key:'city',label:'City'},{key:'attendance_alert_threshold',label:'Attendance alert %',type:'number'}]},
 'Academic years':{api:'years',title:'Academic calendar years',desc:'Define and track school academic sessions, date spans and cycle states.',columns:[{key:'name',label:'Academic Year'},{key:'school_name',label:'School'},{key:'start_date',label:'Start date'},{key:'end_date',label:'End date'},{key:'archived',label:'Status'}],fields:[{key:'school',label:'School / Campus',required:true},{key:'name',label:'Academic year name (e.g. 2026-2027)',required:true},{key:'start_date',label:'Start date',type:'date',required:true},{key:'end_date',label:'End date',type:'date',required:true}]},
 Classes:{api:'classes',title:'Classes & cohorts',desc:'Classroom groups, teaching assignments and academic structure.',columns:[{key:'name',label:'Class'},{key:'grade_level',label:'Grade'},{key:'teacher_name',label:'Lead teacher'},{key:'school_name',label:'School'},{key:'academic_year_name',label:'Academic Year'}],fields:[{key:'name',label:'Class name',required:true},{key:'school',label:'School / Campus',required:true},{key:'academic_year',label:'Academic year',required:true},{key:'grade_level',label:'Grade level (e.g. Grade 8)'},{key:'teacher',label:'Lead teacher'}]},
 Subjects:{api:'subjects',title:'Curriculum subjects',desc:'Curriculum learning areas and subject course codes per school campus.',columns:[{key:'name',label:'Subject'},{key:'code',label:'Code'},{key:'school_name',label:'School'},{key:'active',label:'Status'}],fields:[{key:'school',label:'School / Campus',required:true},{key:'code',label:'Subject code (e.g. ENG, MATH)',required:true},{key:'name',label:'Subject name',required:true}]},
 Academics:{api:'assessments',title:'Academic assessments',desc:'Track tests, marks and assessment publication states.',columns:[{key:'title',label:'Assessment'},{key:'subject_name',label:'Subject'},{key:'class_name',label:'Class'},{key:'max_marks',label:'Max marks'},{key:'published',label:'Published'}],fields:[{key:'title',label:'Assessment title',required:true},{key:'school_class',label:'Class',required:true},{key:'subject',label:'Subject',required:true},{key:'date',label:'Assessment date',type:'date',required:true},{key:'max_marks',label:'Max marks',type:'number',required:true},{key:'weight',label:'Weight',type:'number'}]},
 Attendance:{api:'attendance',title:'Attendance register',desc:'Understand attendance without confusing missing data with absences.',columns:[{key:'student_name',label:'Student'},{key:'date',label:'Date'},{key:'status',label:'Status'},{key:'note',label:'Notes'}],fields:[{key:'student',label:'Student ID',type:'number',required:true},{key:'school_class',label:'Class',required:true},{key:'date',label:'Date',type:'date',required:true},{key:'status',label:'Status',required:true},{key:'note',label:'Notes'}]},
 Homework:{api:'homework',title:'Homework & tasks',desc:'Keep assignments and completion review in one place.',columns:[{key:'title',label:'Assignment'},{key:'due_date',label:'Due date'},{key:'school_class',label:'Class'},{key:'subject',label:'Subject'}],fields:[{key:'title',label:'Title',required:true},{key:'school_class',label:'Class',required:true},{key:'subject',label:'Subject',required:true},{key:'due_date',label:'Due date',type:'date',required:true},{key:'description',label:'Description'}]},
 Interventions:{api:'cases',title:'Student support cases',desc:'Turn transparent indicators into compassionate follow-up.',columns:[{key:'title',label:'Case'},{key:'student_name',label:'Student'},{key:'priority',label:'Priority'},{key:'status',label:'Progress'}],fields:[{key:'title',label:'Case title',required:true},{key:'student',label:'Student ID',type:'number',required:true},{key:'reason',label:'Evidence / reason',required:true},{key:'priority',label:'Priority'},{key:'status',label:'Status'}]},
 Notifications:{api:'notifications',title:'Notifications',desc:'Updates that matter, without unnecessary noise.',columns:[{key:'title',label:'Message'},{key:'body',label:'Description'},{key:'read',label:'Read'},{key:'created_at',label:'Created'}],fields:[]},
};
const Pill=({value}:{value:string|boolean|undefined})=>{const text=typeof value==='boolean'?(value?'Active':'Inactive'):nice(String(value||'—'));const tone=/resolved|completed|present|active|published|true/i.test(text)?'green':/high|absent|overdue|false/i.test(text)?'red':/medium|in progress|late|monitoring/i.test(text)?'amber':'purple';return <span className={'pill '+tone}><span className="pill-dot"/>{text}</span>};
function App(){const[user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true),[page,setPage]=useState('Overview'),[dash,setDash]=useState<Dashboard|null>(null),[records,setRecords]=useState<Resource[]>([]),[search,setSearch]=useState(''),[error,setError]=useState(''),[toast,setToast]=useState(''),[modal,setModal]=useState(false),[sidebar,setSidebar]=useState(false),[dark,setDark]=useState(false),[showNotifications,setShowNotifications]=useState(false),[form,setForm]=useState<Record<string,string>>({}),[filter,setFilter]=useState('All'),[saving,setSaving]=useState(false),[setupSchool,setSetupSchool]=useState<number|null>(null),[refData,setRefData]=useState<{schools:Array<{id:number;name:string}>;years:Array<{id:number;name:string;school?:number}>;teachers:Array<{id:number;name:string;school_id?:number}>;classes:Array<{id:number;name:string;school?:number}>;subjects:Array<{id:number;name:string;code?:string;school?:number}>}>({schools:[],years:[],teachers:[],classes:[],subjects:[]});
 const notify=(msg:string)=>{setToast(msg);setTimeout(()=>setToast(''),3500)};
 useEffect(()=>{request<User>('auth/me/').then(setUser).catch(()=>{}).finally(()=>setLoading(false))},[]);
 const load=useCallback(async()=>{if(!user)return;setError('');try{if(page==='Overview'){setDash(await request<Dashboard>('dashboard/'))}else if(page==='Reports'||page==='Campuses'||page==='Audit log'||page==='Staff'||page==='Finance'||page==='My performance'){}else if(resourceInfo[page]){setRecords(await list<Resource>(resourceInfo[page].api))}else if(page==='Settings'){setRecords(await list<Resource>('schools'))}}catch(e){setError(e instanceof Error?e.message:'Could not load data')}},[page,user]);
 useEffect(()=>{load()},[load]);
 const switchPage=(p:string)=>{setPage(p);setSearch('');setFilter('All');setSidebar(false)};
 const changeTheme=()=>setDark(d=>!d);
 const config=resourceInfo[page];
 const filtered=useMemo(()=>records.filter(r=>{const match=JSON.stringify(r).toLowerCase().includes(search.toLowerCase());const byFilter=filter==='All'||String(r.status||r.priority||r.active||'').toLowerCase()===filter.toLowerCase();return match&&byFilter}),[records,search,filter]);
 const openCreateModal=async()=>{const initialForm:Record<string,string>={enrolled_on:new Date().toISOString().slice(0,10),date:new Date().toISOString().slice(0,10),due_date:new Date(Date.now()+7*86400000).toISOString().slice(0,10),status:page==='Attendance'?'present':page==='Interventions'?'open':'',priority:page==='Interventions'?'medium':''};if(user?.school)initialForm.school=String(user.school);setForm(initialForm);setModal(true);try{const[sc,yr,tc,cl,sb]=await Promise.all([list<{id:number;name:string}>('schools').catch(()=>[]),list<{id:number;name:string;school?:number}>('years').catch(()=>[]),request<{results:Array<{id:number;name:string;school_id?:number}>}>('teachers/').then(r=>r.results).catch(()=>[]),list<{id:number;name:string;school?:number}>('classes').catch(()=>[]),list<{id:number;name:string;code?:string;school?:number}>('subjects').catch(()=>[])]);setRefData({schools:sc,years:yr,teachers:tc,classes:cl,subjects:sb});if(!initialForm.school&&sc.length===1)setForm(prev=>({...prev,school:String(sc[0].id)}));}catch{}};
 const handleCreate=async(e:React.FormEvent)=>{e.preventDefault();if(!config)return;setSaving(true);try{const data:Record<string,unknown>={};for(const f of config.fields){const val=form[f.key];if(val!==undefined&&val!==''){const isNum=['school','academic_year','teacher','school_class','subject','student','max_marks','weight','attendance_alert_threshold'].includes(f.key)||f.type==='number';data[f.key]=isNum?Number(val):val}}await create(config.api,data);setModal(false);setForm({});notify('Record created successfully');await load()}catch(e){notify(e instanceof Error?e.message:'Could not save')}finally{setSaving(false)}};
 if(loading)return <div className="loader-screen"><div className="brand-symbol">◈</div><div>Preparing your workspace…</div></div>;
 if(window.location.pathname==='/'||window.location.pathname==='/home')return <PublicHome authenticated={!!user}/>;
 if(!user)return <Login onLogin={u=>{window.history.replaceState(null,'','/app');setUser(u)}}/>;
 return <div className={'app '+(dark?'dark':'')}>
 <aside className={'sidebar '+(sidebar?'open':'')}><div className="brand"><span className="brand-symbol">◈</span><span className="brand-copy"><strong>optimus<span>orien</span></strong><small>EDUCATION INTELLIGENCE</small></span><button className="mobile-x" onClick={()=>setSidebar(false)}><X size={19}/></button></div>
 <div className="workspace-pill"><span className="workspace-icon"><School size={19}/></span><span className="workspace-name"><b>Northstar Workspace</b><small>Education management</small></span><ChevronDown size={15}/></div>
 <div className="nav-label">WORKSPACE</div><nav>{NAV_GROUPS.map(group=>{const isAdmin=group.adminLabel;if(isAdmin&&!['organisation_admin','school_admin'].includes(user.role))return null;const navItems=WORKSPACE_NAV.filter(item=>group.items.includes(item.name)&&((item as any).roles?(item as any).roles.includes(user.role):(!item.adminOnly||['organisation_admin','school_admin'].includes(user.role))));if(!navItems.length)return null;return <React.Fragment key={group.sublabel}><div className={'nav-sublabel'+(isAdmin?' nav-sublabel-admin':'')}>{group.sublabel}</div>{navItems.map(({name,icon:Icon})=><button key={name} onClick={()=>switchPage(name)} className={'nav-item '+(page===name?'selected':'')}><Icon size={19} strokeWidth={1.9}/><span>{name}</span>{name==='Interventions'&&!!dash?.counts.open_cases&&<em>{dash.counts.open_cases}</em>}</button>)}</React.Fragment>;})}</nav>
<div className="nav-label nav-lower">INSIGHTS & SYSTEM</div><nav>{SYSTEM_NAV.filter(item=>(item as any).roles?(item as any).roles.includes(user.role):(!item.adminOnly||['organisation_admin','school_admin','principal'].includes(user.role))).map(({name,icon:Icon})=><button key={name} onClick={()=>switchPage(name)} className={'nav-item '+(page===name?'selected':'')}><Icon size={19} strokeWidth={1.9}/><span>{name}</span></button>)}</nav>
 <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><Sparkles size={17}/></div><b>More clarity. Better outcomes.</b><p>Use insights to make every school day count.</p><button onClick={()=>switchPage('Reports')}>Explore reports <ArrowRight size={14}/></button><a className="public-sidebar-link" href="/">Public homepage <ArrowUpRight size={13}/></a></div><div className="account"><div className="avatar">{initials(user.name)}</div><div><b>{user.name}</b><small>{nice(user.role)}</small></div><button aria-label="Sign out" onClick={async()=>{await logout();setUser(null)}}><LogOut size={18}/></button></div></div>
 </aside>
 <div className="main-shell"><header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={()=>setSidebar(true)} aria-label="Open menu"><Menu size={21}/></button><div className="breadcrumb">Workspace <ChevronRight size={14}/> <strong>{page}</strong></div></div><div className="topbar-right"><span className="today"><CalendarDays size={16}/>{new Intl.DateTimeFormat('en',{month:'short',day:'numeric',year:'numeric'}).format(new Date())}</span><button className="icon-button" title="Toggle theme" onClick={changeTheme}>{dark?<Sun size={19}/>:<Moon size={19}/>}</button><div className="notif-wrap"><button className="icon-button notification-trigger" title="Notifications" onClick={()=>setShowNotifications(v=>!v)}><Bell size={19}/><i/></button>{showNotifications&&<div className="notification-menu"><b>Recent notifications</b>{(dash?.recent_notifications||[]).length?(dash?.recent_notifications||[]).map(n=><div key={n.id} className="notification-row"><Bell size={15}/><span><strong>{n.title}</strong><small>{n.body}</small></span></div>):<p>Your workspace is up to date.</p>}<button onClick={()=>{setShowNotifications(false);switchPage('Notifications')}}>View all notifications <ArrowRight size={14}/></button></div>}</div><div className="avatar small">{initials(user.name)}</div></div></header>
 <main className="content">{page==='School setup'&&<SchoolSetup user={user} initialSchool={setupSchool} onBack={()=>switchPage('Schools')}/>} {error&&<div className="error-bar"><AlertCircle size={18}/>{error}<button onClick={()=>load()}><RefreshCw size={15}/> Retry</button></div>}
 {page==='Overview'&&<><div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-dot"/> YOUR COMMAND CENTER</div><h1>Good {new Date().getHours()<12?'morning':new Date().getHours()<17?'afternoon':'evening'}, {user.name.split(' ')[0]} <span className="wave">✳</span></h1><p>Here's what's happening across your learning community today.</p></div><button className="primary-btn" onClick={()=>switchPage('Reports')}><FileBarChart size={17}/> View insights <ArrowUpRight size={16}/></button></div>
 <section className="hero-banner"><div className="hero-copy"><span className="hero-kicker"><Sparkles size={15}/> THE BIGGER PICTURE</span><h2>Better insights.<br/><span>Brighter futures.</span></h2><p>Turn everyday school data into meaningful actions that help every learner thrive.</p><button onClick={()=>switchPage('Interventions')}>Explore student support <ArrowRight size={17}/></button></div><div className="hero-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="glass glass-a"><div className="mini-orb">↗</div><span>Academic growth</span><strong>{fmt(dash?.stats.academic_average)}</strong><div className="mini-bars"><i/><i/><i/><i/><i/></div></div><div className="glass glass-b"><CheckCircle2 size={18}/><span>Stronger together</span></div><div className="floating-star star-one">✦</div><div className="floating-star star-two">✧</div></div></section>
 <div className="section-heading"><div><h3>At a glance</h3><p>Your education ecosystem, in numbers</p></div><span className="live-tag"><span/> Live workspace data</span></div>
 <div className="stats-grid"><Stat icon={GraduationCap}label="Total students"value={dash?.counts.students??0}foot="Across authorised schools"tone="lavender"/><Stat icon={School}label="Active schools"value={dash?.counts.schools??0}foot="In your workspace"tone="mint"/><Stat icon={TrendingUp}label="Academic average"value={fmt(dash?.stats.academic_average)}foot={`${dash?.stats.grade_records??0} recorded grades`}tone="peach"/><Stat icon={ClipboardCheck}label="Attendance rate"value={fmt(dash?.stats.attendance_rate)}foot={`${dash?.stats.attendance_records??0} recorded sessions`}tone="blue"/></div>
 <div className="dashboard-grid"><section className="panel chart-panel"><div className="panel-head"><div><h3>School performance</h3><p>Academic results across your schools</p></div><div className="head-chip"><Activity size={15}/> Academic overview</div></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={(dash?.schools||[]).map((s,i)=>({name:s.name.length>13?s.name.slice(0,13)+'…':s.name,value:s.academic_average||0,index:i}))} margin={{top:20,right:15,left:-18,bottom:0}}><defs><linearGradient id="chartfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#826bee" stopOpacity={0.24}/><stop offset="95%" stopColor="#826bee" stopOpacity={0.005}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf0f6" strokeDasharray="4 6"/><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill:'#929bad',fontSize:11}} dy={13}/><YAxis domain={[0,100]} axisLine={false} tickLine={false} tick={{fill:'#929bad',fontSize:11}}/><Tooltip contentStyle={{borderRadius:15,border:'1px solid #eee',boxShadow:'0 12px 35px #28336b18'}} formatter={(v)=>`${v}%`}/><Area dataKey="value" stroke="#7863e6" strokeWidth={3} fill="url(#chartfill)" type="monotone" dot={{r:5,fill:'#7863e6',strokeWidth:3,stroke:'#fff'}} activeDot={{r:7}}/></AreaChart></ResponsiveContainer></div><div className="chart-footer"><span className="legend-dot"/> Published assessment averages <span className="foot-note">Based on available records</span></div></section>
 <section className="panel attention-panel"><div className="panel-head"><div><h3>Needs your attention</h3><p>Student support follow-ups</p></div><span className="attention-count">{dash?.counts.open_cases??0} open</span></div><div className="case-list">{dash?.recent_cases.length?dash.recent_cases.slice(0,4).map((c,i)=><div className="case-item" key={c.id}><div className={'case-badge c'+i}>{c.priority==='high'?<AlertCircle size={18}/>:<HeartHandshake size={18}/>}</div><div className="case-text"><strong>{c.title}</strong><span>{c.student_name||`Student #${c.student_id}`}</span></div><Pill value={c.priority}/></div>):<Empty small text="No outstanding support cases."/>}</div><button className="view-link" onClick={()=>switchPage('Interventions')}>Manage support cases <ArrowRight size={17}/></button></section></div>
 <div className="dashboard-grid lower"><section className="panel students-panel"><div className="panel-head"><div><h3>Recently added students</h3><p>Latest learners in your workspace</p></div><button className="text-link" onClick={()=>switchPage('Students')}>View all <ArrowRight size={16}/></button></div><div className="simple-table"><div className="simple-tr table-title"><span>STUDENT</span><span>ADMISSION ID</span><span>SCHOOL</span></div>{dash?.recent_students.map((s,i)=><div className="simple-tr" key={s.id}><span className="student-label"><span className="student-avatar" style={{background:COLOR[i%COLOR.length]+'1b',color:COLOR[i%COLOR.length]}}>{initials(s.first_name+' '+s.last_name)}</span><b>{s.first_name} {s.last_name}</b></span><span>{s.admission_number}</span><span>{s.school__name}</span></div>)}</div></section><section className="panel pulse-panel"><div className="panel-head"><div><h3>Workspace pulse</h3><p>The numbers behind your progress</p></div><MoreHorizontal size={20} color="#a6adbb"/></div><div className="pulse-feature"><div className="pulse-ring"><strong>{fmt(dash?.stats.attendance_rate)}</strong><small>Attendance</small></div><div className="pulse-copy"><span className="pulse-chip"><Activity size={14}/> Key indicator</span><h4>Every day counts.</h4><p>Attendance reflects recorded eligible sessions, not unrecorded days.</p></div></div><div className="pulse-bottom"><div><strong>{dash?.counts.classes??0}</strong><span>Classes</span></div><div><strong>{dash?.counts.teachers??0}</strong><span>Teachers</span></div><div><strong>{dash?.counts.open_cases??0}</strong><span>Review cases</span></div></div></section></div></>}
 {config&&<><div className="page-header"><div><div className="eyebrow">WORKSPACE / {page.toUpperCase()}</div><h1>{config.title}</h1><p>{config.desc}</p></div>{config.fields.length>0&&user.role!=='student'&&user.role!=='parent'&&<button className="primary-btn" onClick={openCreateModal}><Plus size={17}/> Add {page==='Students'?'student':page==='Schools'?'school':page==='Interventions'?'case':page==='Academic years'?'academic year':page==='Classes'?'class':page==='Subjects'?'subject':'record'}</button>}</div><div className="resource-summary"><div className="resource-icon"><LayersIcon page={page}/></div><div><strong>{records.length}</strong><span>Total {page.toLowerCase()} records</span></div><div className="resource-side"><CheckCircle2 size={17}/> Synced with your workspace</div></div><section className="panel resource-panel"><div className="toolbar"><div className="searchbox"><Search size={18}/><input aria-label="Search records" value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search ${page.toLowerCase()}...`}/>{search&&<button onClick={()=>setSearch('')}><X size={14}/></button>}</div><div className="toolbar-right"><span className="result-count">{filtered.length} results</span><button className="outline-btn" onClick={()=>load()}><RefreshCw size={16}/> Refresh</button>{page==='Students'&&<a className="outline-btn" href="/api/v1/exports/students.csv"><Download size={16}/> Export CSV</a>}</div></div><div className="table-scroll"><table className="data-table"><thead><tr>{config.columns.map(c=><th key={c.key}>{c.label}</th>)}<th/></tr></thead><tbody>{filtered.map((r,i)=><tr key={r.id}>{config.columns.map((c,j)=><td key={c.key}>{j===0?<div className="student-label"><span className="student-avatar" style={{background:COLOR[i%COLOR.length]+'18',color:COLOR[i%COLOR.length]}}>{initials(String(c.key==='name'?r.full_name||`${r.first_name||''} ${r.last_name||''}`:r[c.key]||'OO'))}</span><strong>{c.key==='name'?String(r.full_name||`${r.first_name} ${r.last_name}`):String(r[c.key]||'—')}</strong></div>:typeof r[c.key]==='boolean'||['status','priority'].includes(c.key)?<Pill value={r[c.key] as string|boolean}/>:<span>{c.key==='gender'?(r.gender==='male'?'Boy':r.gender==='female'?'Girl':'—'):String(r[c.key]??'—')}</span>}</td>)}<td>{page==='Schools'&&['organisation_admin','school_admin'].includes(user.role)&&<button className="setup-table-button" onClick={()=>{setSetupSchool(Number(r.id));switchPage('School setup')}}><Settings2 size={14}/> Configure</button>}<button title="More information" className="table-more" onClick={()=>notify(`Record #${r.id} • ${page}`)}><MoreHorizontal size={19}/></button></td></tr>)}</tbody></table>{!filtered.length&&<Empty text={search?'No matching records. Try a different search.':'No records yet. Add your first entry to get started.'}/>}</div><div className="table-footer"><span>Showing {filtered.length} of {records.length} records</span><span>All authorised records <ShieldCheck size={15}/></span></div></section></>}
   {page==='Campuses'&&<CampusesPage user={user} notify={notify} onSetupSchool={(id)=>{setSetupSchool(id);switchPage('School setup')}}/>}
   {page==='Audit log'&&<AuditLogView notify={notify}/>}
  {page==='Reports'&&<Reports user={user}/>}
  {page==='Staff'&&<Staff user={user} notify={notify}/>}
  {page==='Finance'&&<Finance user={user} notify={notify}/>}
  {page==='My performance'&&<MyPerformance/>}
 {page==='Settings'&&<><div className="page-header"><div><div className="eyebrow">PREFERENCES / CONFIGURATION</div><h1>Workspace settings</h1><p>Make the platform work for your school community.</p></div></div><div className="settings-grid"><section className="panel setting-card"><div className="setting-icon"><UserRound size={23}/></div><h3>Account & access</h3><p>Signed in as <b>{user.name}</b>, with the {nice(user.role)} role. School and organisation permissions are enforced by the backend.</p><div className="setting-detail"><span>Username</span><strong>{user.username}</strong></div><div className="setting-detail"><span>Role</span><Pill value={user.role}/></div></section>{user.organisation&&<section className="panel setting-card"><div className="setting-icon"><School size={23}/></div><h3>Organisation details</h3><p>Governing educational network and data policy for your workspace.</p><div className="setting-detail"><span>Organisation</span><strong>{user.organisation_name||`Organisation #${user.organisation}`}</strong></div><div className="setting-detail"><span>Student data policy</span><Pill value={user.allow_org_admin_student_access?'Full access':'Anonymised only'}/></div>{user.school_name&&<div className="setting-detail"><span>Campus assignment</span><strong>{user.school_name}</strong></div>}<button className="outline-btn" style={{marginTop:'14px'}} onClick={()=>switchPage('Schools')}>View campuses <ArrowRight size={15}/></button></section>}<section className="panel setting-card"><div className="setting-icon"><SlidersHorizontal size={23}/></div><h3>Appearance</h3><p>Choose the workspace experience that feels right for you.</p><div className="setting-detail"><span>Dark mode</span><button className={'toggle '+(dark?'on':'')} onClick={changeTheme}><i/></button></div></section><section className="panel setting-card"><div className="setting-icon"><ShieldCheck size={23}/></div><h3>Data protection</h3><p>Your workspace uses authenticated server APIs and scoped school data access. For additional setup controls, use Django administration.</p><button className="outline-btn" onClick={()=>notify('Ask a system administrator for configuration access.')}>System information <ArrowRight size={15}/></button></section></div></>}
 </main><footer className="footer"><span>© {new Date().getFullYear()} Optimus Orien. Made for better education.</span><span><span className="online-indicator"/> Secure school intelligence platform</span></footer></div>
 {modal&&config&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(false)}}><div className="modal-card"><div className="modal-head"><div className="modal-icon"><Plus size={20}/></div><div><h3>Create {page==='Interventions'?'support case':page==='Academic years'?'academic year':page==='Classes'?'class':page==='Subjects'?'subject':page.slice(0,-1).toLowerCase()}</h3><p>Complete the details below to add a new entry.</p></div><button onClick={()=>setModal(false)}><X size={20}/></button></div><form onSubmit={handleCreate}><div className="modal-fields">{config.fields.map(f=>{
  if(f.key==='school')return <label key={f.key}>{f.label}{f.required&&<span className="required"> *</span>}<select required={f.required} value={form.school||''} onChange={e=>setForm(s=>({...s,school:e.target.value}))}><option value="">Select a school campus…</option>{refData.schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>;
  if(f.key==='academic_year'){const yrs=form.school?refData.years.filter(y=>!y.school||String(y.school)===form.school):refData.years;return <label key={f.key}>{f.label}{f.required&&<span className="required"> *</span>}<select required={f.required} value={form.academic_year||''} onChange={e=>setForm(s=>({...s,academic_year:e.target.value}))}><option value="">Select academic year…</option>{yrs.map(y=><option key={y.id} value={y.id}>{y.name}</option>)}</select></label>;}
  if(f.key==='teacher'){const tchs=form.school?refData.teachers.filter(t=>!t.school_id||String(t.school_id)===form.school):refData.teachers;return <label key={f.key}>{f.label}{f.required&&<span className="required"> *</span>}<select value={form.teacher||''} onChange={e=>setForm(s=>({...s,teacher:e.target.value}))}><option value="">Unassigned (optional)</option>{tchs.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>;}
  if(f.key==='school_class'){const cls=form.school?refData.classes.filter(c=>!c.school||String(c.school)===form.school):refData.classes;return <label key={f.key}>{f.label}{f.required&&<span className="required"> *</span>}<select required={f.required} value={form.school_class||''} onChange={e=>setForm(s=>({...s,school_class:e.target.value}))}><option value="">Select class…</option>{cls.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>;}
  if(f.key==='subject'){const subs=form.school?refData.subjects.filter(s=>!s.school||String(s.school)===form.school):refData.subjects;return <label key={f.key}>{f.label}{f.required&&<span className="required"> *</span>}<select required={f.required} value={form.subject||''} onChange={e=>setForm(s=>({...s,subject:e.target.value}))}><option value="">Select subject…</option>{subs.map(sub=><option key={sub.id} value={sub.id}>{sub.name} {sub.code?`(${sub.code})`:''}</option>)}</select></label>;}
  if(f.key==='gender')return <label key={f.key}>{f.label}<select value={form.gender||''} onChange={e=>setForm(s=>({...s,gender:e.target.value}))}><option value="">Not specified</option><option value="male">Boy</option><option value="female">Girl</option></select></label>;
  if(f.key==='status'&&page==='Attendance')return <label key={f.key}>{f.label}{f.required&&<span className="required"> *</span>}<select required={f.required} value={form.status||'present'} onChange={e=>setForm(s=>({...s,status:e.target.value}))}><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="excused">Excused</option></select></label>;
  if(f.key==='priority'&&page==='Interventions')return <label key={f.key}>{f.label}{f.required&&<span className="required"> *</span>}<select value={form.priority||'medium'} onChange={e=>setForm(s=>({...s,priority:e.target.value}))}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>;
  if(f.key==='status'&&page==='Interventions')return <label key={f.key}>{f.label}{f.required&&<span className="required"> *</span>}<select value={form.status||'open'} onChange={e=>setForm(s=>({...s,status:e.target.value}))}><option value="open">Open</option><option value="in_progress">In progress</option><option value="monitoring">Monitoring</option><option value="resolved">Resolved</option></select></label>;
  return <label key={f.key}>{f.label}{f.required&&<span className="required"> *</span>}<input required={f.required} type={f.type||'text'} value={form[f.key]||''} onChange={e=>setForm(s=>({...s,[f.key]:e.target.value}))} placeholder={f.label}/></label>;
})}</div><div className="modal-footer"><button type="button" className="outline-btn" onClick={()=>setModal(false)}>Cancel</button><button className="primary-btn" disabled={saving}>{saving?'Saving…':'Create record'} <ArrowRight size={16}/></button></div></form></div></div>}
 {toast&&<div className="toast"><CheckCircle2 size={18}/>{toast}<button onClick={()=>setToast('')}><X size={16}/></button></div>}
 </div>
}
function LayersIcon({page}:{page:string}){return page==='Students'?<GraduationCap size={23}/>:page==='Schools'?<School size={23}/>:page==='Attendance'?<ClipboardCheck size={23}/>:page==='Interventions'?<HeartHandshake size={23}/>:page==='Academic years'?<CalendarDays size={23}/>:page==='Subjects'?<BookOpen size={23}/>:page==='Classes'?<Users size={23}/>:<FileBarChart size={23}/>}
function Stat({icon:Icon,label,value,foot,tone}:{icon:typeof Users;label:string;value:string|number;foot:string;tone:string}){return <div className="stat-card"><div className={'stat-icon '+tone}><Icon size={21}/></div><div className="stat-value">{value}</div><div className="stat-label">{label}</div><div className="stat-foot"><span className="tiny-dot"/> {foot}</div><div className={'stat-decor '+tone}/></div>}
function Empty({text,small=false}:{text:string;small?:boolean}){return <div className={'empty '+(small?'empty-small':'')}><span><ClipboardList size={25}/></span><strong>Nothing to show yet</strong><p>{text}</p></div>}
function Login({onLogin}:{onLogin:(user:User)=>void}){
  const [tab,setTab]=useState<'signin'|'register'>(()=>
    window.location.search.includes('tab=register')||window.location.pathname==='/register'?'register':'signin'
  );
  const [name,setName]=useState(''),[pass,setPass]=useState('');
  const [regForm,setRegForm]=useState({
    first_name:'',
    last_name:'',
    email:'',
    username:'',
    password:'',
    organisation_name:'',
    school_name:'',
    city:'',
    role:'organisation_admin'
  });
  const [pending,setPending]=useState(false),[error,setError]=useState('');

  async function submitLogin(e:React.FormEvent){
    e.preventDefault();
    setPending(true);
    setError('');
    try{
      onLogin(await login(name,pass));
    }catch(e){
      setError(e instanceof Error?e.message:'Sign in failed');
    }finally{
      setPending(false);
    }
  }

  async function submitRegister(e:React.FormEvent){
    e.preventDefault();
    setPending(true);
    setError('');
    try{
      onLogin(await register(regForm));
    }catch(e){
      setError(e instanceof Error?e.message:'Registration failed');
    }finally{
      setPending(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="login-brand">
          <span className="brand-symbol">◈</span>
          <strong>optimus<span>orien</span></strong>
        </div>
        <div className="login-art">
          <div className="login-circle one"/>
          <div className="login-circle two"/>
          <div className="login-glass">
            <div className="login-insight-icon"><TrendingUp size={23}/></div>
            <span>Student performance</span>
            <strong>Growing together</strong>
            <div className="login-line"><i/><i/><i/><i/><i/><i/></div>
          </div>
          <div className="login-glass second"><CheckCircle2 size={20}/> Meaningful progress, every day</div>
        </div>
        <div className="login-left-copy">
          <div className="hero-kicker"><Sparkles size={15}/> INTELLIGENCE WITH EMPATHY</div>
          <h1>Every learner has<br/>a story. <em>See the full picture.</em></h1>
          <p>One thoughtful workspace for schools, educators and brighter educational futures.</p>
        </div>
        <span className="login-copyright">© {new Date().getFullYear()} Optimus Orien</span>
      </div>
      <div className="login-right">
        <div className="login-form-wrap">
          <div className="login-welcome-icon"><GraduationCap size={26}/></div>

          <div className="login-tabs">
            <button
              type="button"
              className={'login-tab '+(tab==='signin'?'active':'')}
              onClick={()=>{setTab('signin');setError('');}}
            >
              Sign In
            </button>
            <button
              type="button"
              className={'login-tab '+(tab==='register'?'active':'')}
              onClick={()=>{setTab('register');setError('');}}
            >
              Create Account
            </button>
          </div>

          {tab==='signin'?(
            <>
              <span className="eyebrow">WELCOME BACK</span>
              <h2>Your workspace awaits.</h2>
              <p>Sign in to access your school intelligence dashboard.</p>
              <form onSubmit={submitLogin}>
                <label>
                  Username
                  <input autoComplete="username" required value={name} onChange={e=>setName(e.target.value)} placeholder="Enter your username"/>
                </label>
                <label>
                  Password
                  <input autoComplete="current-password" required type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="Enter your password"/>
                </label>
                {error&&<div className="login-error"><AlertCircle size={16}/>{error}</div>}
                <button type="submit" className="login-submit" disabled={pending}>
                  {pending?'Signing in…':'Sign in to workspace'} <ArrowRight size={18}/>
                </button>
              </form>
              <div className="login-switch-row">
                <span>New educational institution?</span>
                <button type="button" className="text-link-btn" onClick={()=>{setTab('register');setError('');}}>
                  Create account & register school →
                </button>
              </div>
              <div className="demo-credentials">
                <div><ShieldCheck size={16}/><strong>Authorised Workspace Access</strong></div>
                <p>Sign in with your educational credentials. For account recovery or access requests, contact your school administrator.</p>
              </div>
            </>
          ):(
            <>
              <span className="eyebrow">INSTITUTION SETUP</span>
              <h2>Create your workspace.</h2>
              <p>Register your education organisation, campus, and founding administrator account.</p>
              <form onSubmit={submitRegister}>
                <div className="login-grid-2">
                  <label>
                    First name
                    <input required value={regForm.first_name} onChange={e=>setRegForm({...regForm,first_name:e.target.value})} placeholder="e.g. Eleanor"/>
                  </label>
                  <label>
                    Last name
                    <input required value={regForm.last_name} onChange={e=>setRegForm({...regForm,last_name:e.target.value})} placeholder="e.g. Vance"/>
                  </label>
                </div>
                <label>
                  Official email address
                  <input required type="email" autoComplete="email" value={regForm.email} onChange={e=>setRegForm({...regForm,email:e.target.value})} placeholder="admin@school.org"/>
                </label>
                <div className="login-grid-2">
                  <label>
                    Username
                    <input required autoComplete="username" value={regForm.username} onChange={e=>setRegForm({...regForm,username:e.target.value})} placeholder="e.g. admin_eleanor"/>
                  </label>
                  <label>
                    Password (min 8 chars)
                    <input required type="password" autoComplete="new-password" value={regForm.password} onChange={e=>setRegForm({...regForm,password:e.target.value})} placeholder="Choose a secure password"/>
                  </label>
                </div>
                <label>
                  Organisation / Trust / Group Name
                  <input required value={regForm.organisation_name} onChange={e=>setRegForm({...regForm,organisation_name:e.target.value})} placeholder="e.g. St. Jude Educational Trust"/>
                </label>
                <div className="login-grid-2">
                  <label>
                    Initial Campus Name
                    <input value={regForm.school_name} onChange={e=>setRegForm({...regForm,school_name:e.target.value})} placeholder="e.g. Main City Campus (Optional)"/>
                  </label>
                  <label>
                    City / Jurisdiction
                    <input value={regForm.city} onChange={e=>setRegForm({...regForm,city:e.target.value})} placeholder="e.g. Lahore, London"/>
                  </label>
                </div>
                <label>
                  Administrative Role
                  <select value={regForm.role} onChange={e=>setRegForm({...regForm,role:e.target.value})}>
                    <option value="organisation_admin">Organisation Administrator (Full trust & multi-campus control)</option>
                    <option value="school_admin">Campus Administrator (Single school management)</option>
                    <option value="teacher">Educator / Academic Lead</option>
                  </select>
                </label>
                {error&&<div className="login-error"><AlertCircle size={16}/>{error}</div>}
                <button type="submit" className="login-submit" disabled={pending}>
                  {pending?'Creating workspace…':'Create workspace & sign in'} <ArrowRight size={18}/>
                </button>
              </form>
              <div className="login-switch-row">
                <span>Already registered?</span>
                <button type="button" className="text-link-btn" onClick={()=>{setTab('signin');setError('');}}>
                  Sign in to existing account →
                </button>
              </div>
            </>
          )}

          <div className="login-security"><ShieldCheck size={16}/> Your data belongs to your school community.</div>
          <a className="login-home-link" href="/"><ChevronLeft size={16}/> Back to public homepage</a>
        </div>
      </div>
    </div>
  );
}
function CampusesPage({user,notify,onSetupSchool}:{user:User;notify:(m:string)=>void;onSetupSchool:(id:number)=>void}){
 const [schools,setSchools]=useState<Resource[]>([]);
 const [loading,setLoading]=useState(true);
 const [addModal,setAddModal]=useState(false);
 const [addForm,setAddForm]=useState<Record<string,string>>({campus_type:'Branch Campus',country:'PK',timezone:'Asia/Karachi',attendance_alert_threshold:'80',grade_alert_threshold:'60'});
 const [saving,setSaving]=useState(false);
 const [expandedSchool,setExpandedSchool]=useState<number|null>(null);
 const [schoolUserMap,setSchoolUserMap]=useState<Record<number,Array<{id:number;name:string;username:string;email?:string;role:string;date_joined?:string;admission_number?:string}>>>({});
 const [schoolClassMap,setSchoolClassMap]=useState<Record<number,Array<{id:number;name:string}>>>({});
 const [schoolStudentMap,setSchoolStudentMap]=useState<Record<number,Array<{id:number;name:string}>>>({});
 const [accountForm,setAccountForm]=useState<Record<number,Record<string,string>>>({});
 const [accountSaving,setAccountSaving]=useState<Record<number,boolean>>({});
 
 const isOrgAdmin=user.role==='organisation_admin'||user.is_superuser;
 const isSchoolAdmin=['organisation_admin','school_admin','principal'].includes(user.role);

 const load=async()=>{
  setLoading(true);
  try{setSchools(await list<Resource>('schools'))}catch{}finally{setLoading(false)}
 };
 useEffect(()=>{load()},[]);

 const toggleAccounts=async(id:number)=>{
  if(expandedSchool===id){setExpandedSchool(null);return;}
  setExpandedSchool(id);
  if(!schoolUserMap[id]){
   try{
    const [uRes, cRes, sRes] = await Promise.all([
     schoolUsers(id).catch(()=>({results:[]})),
     list<{id:number;name:string;school?:number}>('classes').catch(()=>[]),
     list<{id:number;first_name?:string;last_name?:string;full_name?:string;school?:number}>('students').catch(()=>[])
    ]);
    setSchoolUserMap(m=>({...m,[id]:uRes.results}));
    setSchoolClassMap(m=>({...m,[id]:cRes.filter(c=>!c.school||c.school===id)}));
    setSchoolStudentMap(m=>({...m,[id]:sRes.filter(s=>!s.school||s.school===id).map(st=>({id:st.id,name:st.full_name||`${st.first_name||''} ${st.last_name||''}`}))}));
   }catch{}
  }
 };

 const handleRegisterCampus=async(e:React.FormEvent)=>{
  e.preventDefault();
  setSaving(true);
  try{
   await registerCampus(addForm);
   setAddModal(false);
   setAddForm({campus_type:'Branch Campus',country:'PK',timezone:'Asia/Karachi',attendance_alert_threshold:'80',grade_alert_threshold:'60'});
   notify('Campus registered successfully with initialised configuration');
   await load();
  }catch(e){
   notify(e instanceof Error?e.message:'Could not register campus');
  }finally{
   setSaving(false);
  }
 };

 const handleCreateAccount=async(e:React.FormEvent,schoolId:number)=>{
  e.preventDefault();
  setAccountSaving(s=>({...s,[schoolId]:true}));
  const f=accountForm[schoolId]||{};
  try{
   const payload:Record<string,unknown>={
    first_name:f.first_name,
    last_name:f.last_name,
    email:f.email,
    username:f.username,
    password:f.password,
    role:f.role,
    school:schoolId
   };
   if(f.admission_number) payload.admission_number=f.admission_number;
   if(f.gender) payload.gender=f.gender;
   if(f.class_id) payload.class_id=Number(f.class_id);
   if(f.student_id) payload.student_id=Number(f.student_id);

   await createAccount(payload);
   notify(`Account for ${f.first_name} ${f.last_name} created successfully as ${f.role.replace('_',' ')}`);
   setAccountForm(m=>({...m,[schoolId]:{}}));
   const r=await schoolUsers(schoolId);
   setSchoolUserMap(m=>({...m,[schoolId]:r.results}));
  }catch(ex){
   notify(ex instanceof Error?ex.message:'Could not create account');
  }finally{
   setAccountSaving(s=>({...s,[schoolId]:false}));
  }
 };

 const setAccountField=(schoolId:number,key:string,val:string)=>setAccountForm(m=>({...m,[schoolId]:{...(m[schoolId]||{}),[key]:val}}));
 const setAddField=(key:string,val:string)=>setAddForm(f=>({...f,[key]:val}));
 const COLOR2=['#715ee8','#23b7a0','#f29d50','#6c9eff','#e477a1','#8b5cf6'];

 return <><div className="page-header"><div><div className="eyebrow">WORKSPACE / CAMPUSES</div><h1>Campus & institutional management</h1><p>Authorised multi-campus network directory, educational setup readiness, and role-scoped institutional account provisioning.</p></div>{isOrgAdmin&&<button className="primary-btn" onClick={()=>{setAddForm({campus_type:'Branch Campus',country:'PK',timezone:'Asia/Karachi',attendance_alert_threshold:'80',grade_alert_threshold:'60'});setAddModal(true)}}><Plus size={17}/> Register campus</button>}</div>
 {loading?<div className="empty"><span><Building2 size={25}/></span><strong>Loading campuses…</strong></div>:schools.length===0?<div className="empty"><span><Building2 size={25}/></span><strong>Nothing to show yet</strong><p>No campuses found in your organisation. Register your first campus to get started.</p></div>:
 <div className="campus-grid">{schools.map((s,i)=>{
  const sid=Number(s.id);
  const expanded=expandedSchool===sid;
  const users=schoolUserMap[sid]||[];
  const classes=schoolClassMap[sid]||[];
  const students=schoolStudentMap[sid]||[];
  const af=accountForm[sid]||{};
  const as2=accountSaving[sid]||false;
  const cfg=(s.school_settings as Record<string,unknown>)||{};
  const cType=String(cfg.campus_type||'Branch Campus');
  const cEmail=String(cfg.contact_email||'');
  const cPhone=String(cfg.contact_phone||'');
  const cTz=String(s.timezone||'');

  return <div className="campus-card" key={sid}>
   <div className="campus-card-header">
    <div className="campus-icon" style={{background:COLOR2[i%COLOR2.length]+'1a',color:COLOR2[i%COLOR2.length]}}><Building2 size={21}/></div>
    <div className="campus-card-info">
     <h3>{String(s.name||'—')}</h3>
     <div className="campus-badge-row">
      <span className="campus-code">{String(s.code||'')}</span>
      <span className="campus-tag">{cType}</span>
      {Boolean(s.country)&&<span className="campus-tag">{String(s.country)}</span>}
     </div>
    </div>
   </div>
   <div className="campus-card-meta">
    <div><span>Location</span><strong>{s.city?`${String(s.city)}${s.jurisdiction?`, ${String(s.jurisdiction)}`:''}`:'—'}</strong></div>
    <div><span>Attendance alert</span><strong>{s.attendance_alert_threshold!=null?s.attendance_alert_threshold+'%':'80%'}</strong></div>
    <div><span>Academic alert</span><strong>{s.grade_alert_threshold!=null?s.grade_alert_threshold+'%':'60%'}</strong></div>
    {Boolean(cTz)&&<div><span>Timezone</span><strong>{cTz}</strong></div>}
    {Boolean(cEmail)&&<div><span>Contact email</span><strong>{cEmail}</strong></div>}
    {Boolean(cPhone)&&<div><span>Phone</span><strong>{cPhone}</strong></div>}
   </div>
   <div className="campus-card-actions">
    {isSchoolAdmin&&<button className="outline-btn" onClick={()=>onSetupSchool(sid)}><Settings2 size={14}/> Configure setup</button>}
    <button className={'outline-btn'+(expanded?' active-btn':'')} onClick={()=>toggleAccounts(sid)}><Users size={14}/> Manage Accounts ({users.length||'View'})</button>
   </div>
   {expanded&&<div className="accounts-panel">
    <div className="accounts-panel-head"><strong>Campus user directory • {String(s.name)}</strong></div>
    {users.length>0?<div className="accounts-list">{users.map(u=>{
     const rClass=u.role==='organisation_admin'||u.role==='school_admin'?'role-admin':u.role==='principal'?'role-principal':u.role==='teacher'?'role-teacher':u.role==='student'?'role-student':'role-parent';
     return <div className="account-row" key={u.id}>
      <div className="account-avatar" style={{background:COLOR2[u.id%COLOR2.length]+'22',color:COLOR2[u.id%COLOR2.length]}}>{(u.name||u.username).slice(0,2).toUpperCase()}</div>
      <div>
       <div className="account-meta">
        <b>{u.name}</b>
        <span className={'account-role-pill '+rClass}>{u.role.replace('_',' ')}</span>
       </div>
       <small>@{u.username}{u.email?` • ${u.email}`:''}{u.admission_number?` • ID: ${u.admission_number}`:''}{u.date_joined?` • Joined ${u.date_joined}`:''}</small>
      </div>
     </div>;
    })}</div>:<p className="accounts-empty">No institutional accounts provisioned for this campus yet.</p>}
    
    {isSchoolAdmin&&<><div className="accounts-divider">Provision new account (Part 5 §18, SEC-018)</div>
    <form className="account-create-form" onSubmit={e=>handleCreateAccount(e,sid)}>
     <div className="acf-row">
      <label>First name <span className="required">*</span><input required value={af.first_name||''} onChange={e=>setAccountField(sid,'first_name',e.target.value)} placeholder="Legal first name"/></label>
      <label>Last name <span className="required">*</span><input required value={af.last_name||''} onChange={e=>setAccountField(sid,'last_name',e.target.value)} placeholder="Legal last name"/></label>
     </div>
     <div className="acf-row">
      <label>Email address <span className="required">*</span><input required type="email" value={af.email||''} onChange={e=>setAccountField(sid,'email',e.target.value)} placeholder="name@institution.edu"/></label>
      <label>Username <span className="required">*</span><input required value={af.username||''} onChange={e=>setAccountField(sid,'username',e.target.value)} placeholder="Unique username"/></label>
     </div>
     <div className="acf-row">
      <label>Password <span className="required">*</span><input required type="password" value={af.password||''} onChange={e=>setAccountField(sid,'password',e.target.value)} placeholder="Min 8 characters"/></label>
      <label>Institutional role <span className="required">*</span>
       <select required value={af.role||''} onChange={e=>setAccountField(sid,'role',e.target.value)}>
        <option value="">Select role…</option>
        {isOrgAdmin&&<option value="school_admin">School Administrator</option>}
        {isOrgAdmin&&<option value="principal">Campus Principal / Head</option>}
        <option value="teacher">Educator / Teacher</option>
        <option value="student">Student / Learner</option>
        <option value="parent">Parent / Guardian</option>
        {isOrgAdmin&&<option value="organisation_admin">Organisation Administrator</option>}
       </select>
      </label>
     </div>
     
     {af.role==='student'&&<div className="acf-row">
      <label>Gender<select value={af.gender||''} onChange={e=>setAccountField(sid,'gender',e.target.value)}><option value="">Not specified</option><option value="male">Boy</option><option value="female">Girl</option></select></label>
      <label>Admission number<input value={af.admission_number||''} onChange={e=>setAccountField(sid,'admission_number',e.target.value)} placeholder="e.g. ADM-2026-001 (or auto-generated)"/></label>
      <label>Assign to class
       <select value={af.class_id||''} onChange={e=>setAccountField(sid,'class_id',e.target.value)}>
        <option value="">Unassigned (Select class later)</option>
        {classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
       </select>
      </label>
     </div>}

     {af.role==='parent'&&<div className="acf-row">
      <label>Link to student / ward
       <select value={af.student_id||''} onChange={e=>setAccountField(sid,'student_id',e.target.value)}>
        <option value="">Select student…</option>
        {students.map(st=><option key={st.id} value={st.id}>{st.name}</option>)}
       </select>
      </label>
      <label>Assigned campus<input readOnly value={String(s.name)} className="readonly-input"/></label>
     </div>}

     {af.role==='teacher'&&<div className="acf-row">
      <label>Lead classroom assignment
       <select value={af.class_id||''} onChange={e=>setAccountField(sid,'class_id',e.target.value)}>
        <option value="">No class assigned yet</option>
        {classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
       </select>
      </label>
      <label>Assigned campus<input readOnly value={String(s.name)} className="readonly-input"/></label>
     </div>}

     <div className="acf-actions"><button type="submit" className="primary-btn" disabled={as2}>{as2?'Provisioning account…':'Provision account'} <ArrowRight size={15}/></button></div>
    </form></>}
   </div>}
  </div>;
 })}</div>}
 
 {addModal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setAddModal(false)}}><div className="modal-card modal-card-wide"><div className="modal-head"><div className="modal-icon"><Plus size={20}/></div><div><h3>Register institutional campus</h3><p>Configure complete campus identity, location, time zone, pathways, and alert thresholds (Parts 1, 4 & 19).</p></div><button onClick={()=>setAddModal(false)}><X size={20}/></button></div>
  <form onSubmit={handleRegisterCampus}>
   <div className="modal-fields modal-fields-2col">
    <div className="modal-section-title">1. Campus Identity</div>
    <label>Campus name <span className="required">*</span><input required value={addForm.name||''} onChange={e=>setAddField('name',e.target.value)} placeholder="e.g. Northstar Academy — Main Campus"/></label>
    <label>Campus code <span className="required">*</span><input required value={addForm.code||''} onChange={e=>setAddField('code',e.target.value)} placeholder="e.g. NSA-MAIN"/></label>
    <label>Campus type
     <select value={addForm.campus_type||'Branch Campus'} onChange={e=>setAddField('campus_type',e.target.value)}>
      <option value="Main Campus">Main Campus</option>
      <option value="Branch Campus">Branch Campus</option>
      <option value="Junior Campus">Junior Campus</option>
      <option value="Senior Campus">Senior Campus</option>
      <option value="Preparatory Campus">Preparatory Campus</option>
     </select>
    </label>
    <label>Primary educational programme<input value={addForm.programmes||''} onChange={e=>setAddField('programmes',e.target.value)} placeholder="e.g. Cambridge IGCSE, Matriculation"/></label>
    
    <div className="modal-section-title">2. Location & Jurisdiction</div>
    <label>Country
     <select value={addForm.country||'PK'} onChange={e=>setAddField('country',e.target.value)}>
      <option value="PK">PK — Pakistan</option>
      <option value="AE">AE — United Arab Emirates</option>
      <option value="GB">GB — United Kingdom</option>
      <option value="US">US — United States</option>
      <option value="SA">SA — Saudi Arabia</option>
      <option value="QA">QA — Qatar</option>
      <option value="MY">MY — Malaysia</option>
      <option value="CA">CA — Canada</option>
     </select>
    </label>
    <label>Jurisdiction / Province<input value={addForm.jurisdiction||''} onChange={e=>setAddField('jurisdiction',e.target.value)} placeholder="e.g. Sindh, Punjab, Federal"/></label>
    <label>City<input value={addForm.city||''} onChange={e=>setAddField('city',e.target.value)} placeholder="City / Municipality"/></label>
    <label>Official time zone
     <select value={addForm.timezone||'Asia/Karachi'} onChange={e=>setAddField('timezone',e.target.value)}>
      <option value="Asia/Karachi">Asia/Karachi (PKT UTC+5)</option>
      <option value="Asia/Dubai">Asia/Dubai (GST UTC+4)</option>
      <option value="Europe/London">Europe/London (GMT/BST)</option>
      <option value="America/New_York">America/New_York (EST/EDT)</option>
      <option value="UTC">UTC Universal</option>
     </select>
    </label>
    <label style={{gridColumn:'1 / -1'}}>Campus street address<input value={addForm.address||''} onChange={e=>setAddField('address',e.target.value)} placeholder="Full physical street address"/></label>

    <div className="modal-section-title">3. Official Communications & Thresholds</div>
    <label>Official campus email<input type="email" value={addForm.contact_email||''} onChange={e=>setAddField('contact_email',e.target.value)} placeholder="admin.campus@institution.edu"/></label>
    <label>Contact phone<input value={addForm.contact_phone||''} onChange={e=>setAddField('contact_phone',e.target.value)} placeholder="+92 21 34567890"/></label>
    <label>Attendance alert threshold (%)<input type="number" min="0" max="100" value={addForm.attendance_alert_threshold||'80'} onChange={e=>setAddField('attendance_alert_threshold',e.target.value)}/></label>
    <label>Academic alert threshold (%)<input type="number" min="0" max="100" value={addForm.grade_alert_threshold||'60'} onChange={e=>setAddField('grade_alert_threshold',e.target.value)}/></label>
   </div>
   <div className="modal-footer">
    <button type="button" className="outline-btn" onClick={()=>setAddModal(false)}>Cancel</button>
    <button className="primary-btn" disabled={saving}>{saving?'Registering campus…':'Register campus'} <ArrowRight size={16}/></button>
   </div>
  </form>
 </div></div>}
 </>;
}
function AuditLogView({notify}:{notify:(m:string)=>void}){
 const [logs,setLogs]=useState<Resource[]>([]);
 const [loading,setLoading]=useState(true);
 const [search,setSearch]=useState('');
 useEffect(()=>{
  list<Resource>('audit').then(setLogs).catch(()=>{}).finally(()=>setLoading(false));
 },[]);
 const filtered=useMemo(()=>logs.filter(l=>JSON.stringify(l).toLowerCase().includes(search.toLowerCase())),[logs,search]);
 return <>
  <div className="page-header">
   <div>
    <div className="eyebrow">SYSTEM & SECURITY / AUDIT TRAIL</div>
    <h1>Immutable audit log</h1>
    <p>Complete traceability of administrative modifications, account provisioning, transfers, and configuration activations (Part 5 §21, Part 18 SEC-056).</p>
   </div>
  </div>
  <div className="resource-summary">
   <div className="resource-icon"><ShieldCheck size={23}/></div>
   <div><strong>{logs.length}</strong><span>Total recorded security events</span></div>
   <div className="resource-side"><CheckCircle2 size={17}/> Tamper-evident ledger</div>
  </div>
  <section className="panel audit-panel">
   <div className="toolbar">
    <div className="searchbox"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Filter audit events by actor, action, or resource…"/>{search&&<button onClick={()=>setSearch('')}><X size={14}/></button>}</div>
    <div className="toolbar-right"><span className="result-count">{filtered.length} events</span></div>
   </div>
   <div className="table-scroll">
    <table className="audit-table">
     <thead>
      <tr>
       <th>Timestamp</th>
       <th>Action</th>
       <th>Resource</th>
       <th>Target ID</th>
       <th>Changes summary</th>
      </tr>
     </thead>
     <tbody>
      {filtered.map(l=>{
       const act=String(l.action||'');
       const aClass=act.includes('create')?'act-create':act.includes('update')?'act-update':act.includes('transfer')?'act-transfer':'act-setup';
       const ch=l.changes?JSON.stringify(l.changes):'—';
       return <tr key={l.id}>
        <td><Clock size={12} style={{marginRight:5,verticalAlign:'middle'}}/>{l.created_at?new Date(String(l.created_at)).toLocaleString():'—'}</td>
        <td><span className={'action-pill '+aClass}>{act.replace('_',' ')}</span></td>
        <td><strong>{String(l.resource||'—')}</strong></td>
        <td>#{String(l.resource_id||'—')}</td>
        <td style={{maxWidth:350,wordBreak:'break-word',fontFamily:'monospace',fontSize:11,color:'#636b83'}}>{ch}</td>
       </tr>;
      })}
     </tbody>
    </table>
    {!filtered.length&&<Empty text={search?'No matching audit events found.':'No audit events recorded yet.'}/>}
   </div>
  </section>
 </>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
