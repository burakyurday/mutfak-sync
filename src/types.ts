export interface Settings {
  user: 'Burak' | 'Naz';
  root: string;
  folder_id: string;
  mock: boolean;
  stability_secs: number;
  scan_secs: number;
  bandwidth: string;
  exclude_dev: boolean;
  versions: boolean;
  custom_excludes?: string;
  notifications?: boolean;
  battery_saver?: boolean;
  metered_saver?: boolean;
}
export interface FileVersion {
  id: number;
  path: string;
  remote_path: string;
  checksum: string;
  created: number;
}
export interface DriveQuota {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  trash_bytes: number;
}
export interface Entry {path:string;kind:string;size:number;modified:string;checksum:string;status:string;remote_id:string|null;parent_id:string|null;last_success:number|null;retry:number;error:string|null}
export interface Snapshot {settings:Settings|null;entries:Entry[];activity:{at:number;message:string}[];paused:boolean;error:string|null;free_bytes:number;device:string;progress:{bytes:number;total:number;speed:number}|null}
export interface ArchivePlan {path:string;size:number;checksum:string;remote_id:string;warning:string}
export const defaultSettings: Settings = {
  user: 'Burak',
  root: '',
  folder_id: '',
  mock: false,
  stability_secs: 30,
  scan_secs: 600,
  bandwidth: '',
  exclude_dev: false,
  versions: false,
  custom_excludes: '',
  notifications: true,
  battery_saver: false,
  metered_saver: false,
};
export const statuses:Record<string,string>={backed_up:'Yedeklendi',pending:'Bekliyor',uploading:'Yükleniyor',error:'Hata',cloud_only:'Sadece bulutta',local_missing:'Yerel kopya yok',archiving:'Arşivleniyor',excluded:'Hariç tutuldu'};
export interface ErrorBadge {
  category: 'auth' | 'network' | 'quota' | 'locked' | 'rate_limit' | 'general';
  label: string;
  detail: string;
  action?: 'reconnect' | 'retry';
}
export function classifyError(raw: string | null | undefined): ErrorBadge | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.startsWith('auth:') || s.includes('oturum') || s.includes('token') || s.includes('invalid_grant')) {
    return {
      category: 'auth',
      label: 'Yetki Yenileme',
      detail: 'Google Drive oturum süresi doldu. Ayarlar ekranından hesabı yeniden bağlayın.',
      action: 'reconnect',
    };
  }
  if (s.startsWith('locked:') || s.includes('kullanımda') || s.includes('os error 32') || s.includes('sharing violation')) {
    return {
      category: 'locked',
      label: 'Dosya Kullanımda',
      detail: 'Dosya Photoshop veya başka bir programda açık/kaydediliyor. İşlem bitince otomatik yüklenecek.',
    };
  }
  if (s.startsWith('quota:') || s.includes('quotaexceeded') || s.includes('storagequotaexceeded') || (s.includes('kota') && !s.includes('istek'))) {
    return {
      category: 'quota',
      label: 'Depolama Dolu',
      detail: 'Google Drive depolama alanı veya günlük aktarım kotası aşıldı.',
    };
  }
  if (s.startsWith('rate_limit:') || s.includes('ratelimitexceeded') || s.includes('istek sınırı')) {
    return {
      category: 'rate_limit',
      label: 'İstek Sınırı',
      detail: 'Google API istek sınırı aşıldı, kısa süre içinde otomatik denenecek.',
    };
  }
  if (s.startsWith('network:') || s.startsWith('offline:') || s.includes('ağ') || s.includes('bağlantı') || s.includes('dial tcp') || s.includes('timeout') || s.includes('connection')) {
    return {
      category: 'network',
      label: 'Ağ Bağlantısı',
      detail: 'İnternet bağlantısı kurulamadı veya zaman aşımına uğradı. Bağlantı sağlandığında devam edecek.',
      action: 'retry',
    };
  }
  return {
    category: 'general',
    label: 'Kontrol Gerekli',
    detail: raw,
    action: 'retry',
  };
}
export function bytes(n:number){if(n===0)return '0 B';const units=['B','KB','MB','GB','TB'];const i=Math.min(4,Math.floor(Math.log(n)/Math.log(1024)));return `${(n/1024**i).toLocaleString('tr-TR',{maximumFractionDigits:1})} ${units[i]}`;}
export function tree(entries:Entry[]){return [...entries].sort((a,b)=>a.path.localeCompare(b.path,'tr'));}
