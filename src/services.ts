import {invoke,isTauri} from '@tauri-apps/api/core';
import type {Snapshot} from './types';
export const native=isTauri();
export async function command<T>(name:string,args?:Record<string,unknown>):Promise<T>{if(!native)throw new Error('Bu işlem masaüstü uygulamasında kullanılabilir. Tarayıcı görünümü yalnızca arayüz önizlemesidir.');return invoke<T>(name,args);}
export const emptySnapshot:Snapshot={settings:null,entries:[],activity:[],paused:false,error:null,free_bytes:0,device:'',progress:null};
