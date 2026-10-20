export type User={id:number;name:string;username:string;role:string;organisation:number|null;school:number|null;is_staff?:boolean};
export type Dashboard={counts:{students:number;schools:number;classes:number;open_cases:number;teachers:number};stats:{academic_average:number|null;attendance_rate:number|null;grade_records:number;attendance_records:number};schools:{id:number;name:string;students:number;academic_average:number|null;attendance_rate:number|null}[];recent_cases:Case[];recent_students:Student[];attention:number;recent_notifications:{id:number;title:string;body:string}[]};
export type Student={id:number;first_name:string;last_name:string;full_name?:string;admission_number:string;class_name?:string;school__name?:string;active?:boolean};
export type Case={id:number;title:string;status:string;priority:string;student_id:number;student_name?:string};
export type Resource={id:number;[key:string]:unknown};
let csrfToken='';
export async function request<T>(url:string,options:RequestInit={}):Promise<T>{const method=(options.method||'GET').toUpperCase();if(method!=='GET'&&!csrfToken){const r=await fetch('/api/v1/auth/csrf/',{credentials:'include'});if(r.ok)csrfToken=(await r.json()).csrfToken;}const response=await fetch('/api/v1/'+url.replace(/^\//,''),{...options,credentials:'include',headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'X-CSRFToken':csrfToken}:{}),...(options.headers||{})}});if(!response.ok){let info:any={};try{info=await response.json()}catch{}throw new Error(info.detail||info.non_field_errors?.join(', ')||JSON.stringify(info)||`HTTP ${response.status}`)}return response.json() as Promise<T>}
export const login=(username:string,password:string)=>request<User>('auth/login/',{method:'POST',body:JSON.stringify({username,password})});
export const logout=()=>request('auth/logout/',{method:'POST'});
export const list=async<T>(name:string)=>{const x=await request<{results:T[]} | T[]>(name+'/');return Array.isArray(x)?x:x.results};
export const create=(name:string,data:Record<string,unknown>)=>request<Resource>(name+'/',{method:'POST',body:JSON.stringify(data)});
export const update=(name:string,id:number,data:Record<string,unknown>)=>request<Resource>(`${name}/${id}/`,{method:'PATCH',body:JSON.stringify(data)});
