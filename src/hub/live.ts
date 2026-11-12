import{createClient}from'@supabase/supabase-js';
import type{HubFile,HubProject,HubSession,Organization}from'./model';

const url=import.meta.env.VITE_SUPABASE_URL?.trim();
const anon=import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
export const hubConfigured=Boolean(url&&anon);
export const supabase=hubConfigured?createClient(url!,anon!,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;

export interface LiveHubData{session:HubSession;organizations:Organization[];projects:HubProject[];files:HubFile[]}
type Row=Record<string,unknown>;

function required(){if(!supabase)throw new Error('Supabase bağlantı bilgileri eksik.');return supabase;}
function project(row:Row):HubProject{return{id:String(row.id),organizationId:String(row.organization_id),name:String(row.name),status:row.status as HubProject['status'],updatedAt:String(row.updated_at)}}
function file(row:Row):HubFile{return{id:String(row.id),organizationId:String(row.organization_id),projectId:String(row.project_id),name:String(row.name),kind:String(row.mime_type||'DOSYA').split('/').pop()?.toUpperCase().slice(0,6)||'DOSYA',size:Number(row.size_bytes),visibility:row.visibility as HubFile['visibility'],uploadedBy:String(row.uploaded_by),updatedAt:String(row.updated_at),previewStatus:row.preview_status as HubFile['previewStatus']}}

export async function sendOtp(email:string){
 const{error}=await required().auth.signInWithOtp({email,options:{shouldCreateUser:false}});if(error)throw error;
}
export async function verifyOtp(email:string,token:string){
 const{error}=await required().auth.verifyOtp({email,token,type:'email'});if(error)throw error;
}
export async function signOut(){const{error}=await required().auth.signOut();if(error)throw error;}

export async function loadHub():Promise<LiveHubData>{
 const client=required(),{data:{user},error:userError}=await client.auth.getUser();if(userError||!user)throw userError||new Error('Oturum bulunamadı.');
 const[{data:profile,error:profileError},{data:team,error:teamError},{data:membership,error:memberError}]=await Promise.all([
  client.from('hub_profiles').select('display_name').eq('id',user.id).single(),
  client.from('hub_team_members').select('role,active').eq('user_id',user.id).maybeSingle(),
  client.from('hub_organization_members').select('organization_id,role,active').eq('user_id',user.id).eq('active',true).limit(1).maybeSingle(),
 ]);
 if(profileError)throw profileError;if(teamError)throw teamError;if(memberError)throw memberError;
 const isTeam=Boolean(team?.active),organizationId=isTeam?null:String(membership?.organization_id||'');
 if(!isTeam&&!organizationId)throw new Error('Bu hesap aktif bir Mutfak Hub çalışma alanına bağlı değil.');
 const[{data:orgRows,error:orgError},{data:projectRows,error:projectError},{data:fileRows,error:fileError}]=await Promise.all([
  client.from('hub_organizations').select('id,name,slug,status').eq('status','active').order('name'),
  client.from('hub_projects').select('id,organization_id,name,status,updated_at').neq('status','archived').order('updated_at',{ascending:false}),
  client.from('hub_files').select('id,organization_id,project_id,name,mime_type,size_bytes,visibility,uploaded_by,updated_at,preview_status').eq('state','ready').order('updated_at',{ascending:false}).limit(500),
 ]);
 if(orgError)throw orgError;if(projectError)throw projectError;if(fileError)throw fileError;
 const organizations=(orgRows||[]).map((row:Row)=>({id:String(row.id),name:String(row.name),slug:String(row.slug),activeProjects:(projectRows||[]).filter(item=>item.organization_id===row.id&&item.status!=='completed').length,memberCount:0}));
 return{session:{userId:user.id,name:String(profile.display_name),email:user.email||'',role:isTeam?(team?.role==='admin'?'mutfak_admin':'mutfak_staff'):'customer',organizationId},organizations,projects:(projectRows||[]).map((row:Row)=>project(row)),files:(fileRows||[]).map((row:Row)=>file(row))};
}

export async function publishFile(fileId:string){const{error}=await required().functions.invoke('hub-drive',{body:{action:'publish',fileId}});if(error)throw error;}
export async function createProject(organizationId:string,name:string){const{data:{user}}=await required().auth.getUser();if(!user)throw new Error('Oturum bulunamadı.');const{error}=await required().from('hub_projects').insert({organization_id:organizationId,name,created_by:user.id});if(error)throw error;}
export async function createOrganization(name:string){const{error}=await required().functions.invoke('hub-drive',{body:{action:'create-organization',name}});if(error)throw error;}
export async function inviteMember(organizationId:string,email:string,role:'manager'|'editor'|'viewer'='viewer'){const{error}=await required().functions.invoke('hub-drive',{body:{action:'invite',organizationId,email,role}});if(error)throw error;}

export async function uploadOriginal(projectId:string,input:File,onProgress:(value:number)=>void){
 const client=required(),{data:start,error:startError}=await client.functions.invoke('hub-drive',{body:{action:'start-upload',projectId,name:input.name,size:input.size,mimeType:input.type||'application/octet-stream'}});if(startError)throw startError;
 const chunkSize=8*1024*1024;let offset=0,response:Response|null=null;
 if(input.size===0){response=await fetch(start.sessionUrl,{method:'PUT',headers:{'Content-Type':input.type||'application/octet-stream','Content-Range':'bytes */0'},body:new Blob([])});if(!response.ok)throw new Error(`Boş dosya yüklenemedi (${response.status}).`);onProgress(100);}
 while(offset<input.size){const end=Math.min(offset+chunkSize,input.size),chunk=input.slice(offset,end);let failure:unknown=null;for(let attempt=0;attempt<5;attempt++){try{response=await fetch(start.sessionUrl,{method:'PUT',headers:{'Content-Type':input.type||'application/octet-stream','Content-Range':`bytes ${offset}-${end-1}/${input.size}`},body:chunk});if(response.ok||response.status===308){failure=null;break}failure=new Error(`Yükleme başarısız (${response.status}).`);}catch(error){failure=error}await new Promise(resolve=>setTimeout(resolve,500*2**attempt+Math.random()*250));}if(failure)throw failure;offset=end;onProgress(Math.round(offset/input.size*100));}
 const drive=response?await response.json():null;const{error:finishError}=await client.functions.invoke('hub-drive',{body:{action:'finish-upload',uploadId:start.uploadId,driveFileId:drive?.id}});if(finishError)throw finishError;
}

export async function originalDownloadUrl(fileId:string){const client=required(),{data,error}=await client.functions.invoke('hub-drive',{body:{action:'download-token',fileId}});if(error)throw error;return String(data.url);}
export async function previewUrl(fileId:string){const client=required(),{data,error}=await client.functions.invoke('hub-drive',{body:{action:'preview-token',fileId}});if(error)throw error;return String(data.url);}
