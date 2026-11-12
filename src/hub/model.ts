export type HubRole='mutfak_admin'|'mutfak_staff'|'customer';
export type FileVisibility='internal'|'published'|'customer_upload';

export interface HubSession{userId:string;name:string;email:string;role:HubRole;organizationId:string|null}
export interface Organization{id:string;name:string;slug:string;activeProjects:number;memberCount:number}
export interface HubProject{id:string;organizationId:string;name:string;status:'active'|'review'|'completed';updatedAt:string}
export interface HubFile{id:string;organizationId:string;projectId:string;name:string;kind:string;size:number;visibility:FileVisibility;uploadedBy:string;updatedAt:string;previewStatus:'ready'|'processing'|'unavailable'}

export const isTeam=(session:HubSession)=>session.role==='mutfak_admin'||session.role==='mutfak_staff';

export function canViewFile(session:HubSession,file:HubFile){
 if(isTeam(session))return true;
 return session.organizationId===file.organizationId&&file.visibility!=='internal';
}

export function canDownloadOriginal(session:HubSession,file:HubFile){
 if(isTeam(session))return true;
 return session.organizationId===file.organizationId&&(file.visibility==='customer_upload'||file.visibility==='published');
}

export function visibleFiles(session:HubSession,files:HubFile[]){return files.filter(file=>canViewFile(session,file));}

export const customerPermissions={upload:true,download:true,rename:false,move:false,delete:false,invite:false,publish:false} as const;
