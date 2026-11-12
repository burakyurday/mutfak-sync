export interface Settings {user:'Burak'|'Naz';root:string;folder_id:string;mock:boolean;stability_secs:number;scan_secs:number;bandwidth:string;exclude_dev:boolean;versions:boolean}
export interface Entry {path:string;kind:string;size:number;modified:string;checksum:string;status:string;remote_id:string|null;parent_id:string|null;last_success:number|null;retry:number;error:string|null}
export interface Snapshot {settings:Settings|null;entries:Entry[];activity:{at:number;message:string}[];paused:boolean;error:string|null;free_bytes:number;device:string;progress:{bytes:number;total:number;speed:number}|null}
export interface ArchivePlan {path:string;size:number;checksum:string;remote_id:string;warning:string}
export const defaultSettings:Settings={user:'Burak',root:'',folder_id:'',mock:false,stability_secs:30,scan_secs:600,bandwidth:'',exclude_dev:false,versions:false};
export const statuses:Record<string,string>={backed_up:'Yedeklendi',pending:'Bekliyor',uploading:'Yükleniyor',error:'Hata',cloud_only:'Sadece bulutta',local_missing:'Yerel kopya yok',archiving:'Arşivleniyor',excluded:'Hariç tutuldu'};
export function bytes(n:number){if(n===0)return '0 B';const units=['B','KB','MB','GB','TB'];const i=Math.min(4,Math.floor(Math.log(n)/Math.log(1024)));return `${(n/1024**i).toLocaleString('tr-TR',{maximumFractionDigits:1})} ${units[i]}`;}
export function tree(entries:Entry[]){return [...entries].sort((a,b)=>a.path.localeCompare(b.path,'tr'));}
