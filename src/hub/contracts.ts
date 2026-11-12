import type{HubFile,HubProject,HubSession,Organization}from'./model';

export interface HubRepository{
 session():Promise<HubSession>;
 organizations():Promise<Organization[]>;
 projects(organizationId?:string):Promise<HubProject[]>;
 files(organizationId?:string):Promise<HubFile[]>;
 publish(fileId:string):Promise<void>;
}

export interface OriginalStorage{
 createResumableUpload(input:{organizationId:string;projectId:string;name:string;size:number}):Promise<{uploadId:string;uploadUrl:string}>;
 createExpiringDownload(fileId:string):Promise<{url:string;expiresAt:string}>;
}

export interface PreviewService{
 enqueue(fileId:string):Promise<void>;
 previewUrl(fileId:string):Promise<{url:string;expiresAt:string}|null>;
}

// Supabase service-role and Google OAuth credentials belong in the server
// implementation of these contracts. They must never be bundled into React.
