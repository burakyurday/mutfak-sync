import {describe,it,expect} from 'vitest';
import {bytes,tree,defaultSettings,classifyError} from './types';
describe('Dosya sunumu',()=>{it('büyük dosya boyutlarını biçimler',()=>{expect(bytes(5*1024**3)).toBe('5 GB');expect(bytes(0)).toBe('0 B');});it('Türkçe yolları bozmadan sıralar',()=>{const entries=[{path:'Müşteriler/İş.psd'},{path:'Arşiv/Şubat.ai'}] as Parameters<typeof tree>[0];expect(tree(entries).map(v=>v.path)).toEqual(['Arşiv/Şubat.ai','Müşteriler/İş.psd']);expect(entries[0].path).toBe('Müşteriler/İş.psd');});it('güvenli varsayılanlar kullanır',()=>{expect(defaultSettings.stability_secs).toBe(30);expect(defaultSettings.scan_secs).toBe(600);expect(defaultSettings.mock).toBe(false);});});
describe('Akıllı Hata Sınıflandırıcısı',()=>{
  it('boş veya tanımsız hatada null döner',()=>{
    expect(classifyError(null)).toBeNull();
    expect(classifyError(undefined)).toBeNull();
    expect(classifyError('')).toBeNull();
  });
  it('yetki ve token hatalarını auth kategorisine ayırır',()=>{
    const badge = classifyError('AUTH: Google Drive oturumunun süresi doldu.');
    expect(badge?.category).toBe('auth');
    expect(badge?.action).toBe('reconnect');
  });
  it('Photoshop ve kilitli dosya hatalarını locked kategorisine ayırır',()=>{
    const badge = classifyError('LOCKED: Dosya başka bir uygulama (Photoshop vb.) tarafından kullanımda.');
    expect(badge?.category).toBe('locked');
    expect(badge?.label).toBe('Dosya Kullanımda');
  });
  it('ağ ve bağlantı kopmalarını network kategorisine ayırır',()=>{
    const badge = classifyError('NETWORK: Ağ bağlantısı kurulamadı veya kesildi.');
    expect(badge?.category).toBe('network');
    expect(badge?.action).toBe('retry');
  });
  it('kota ve depolama doluluklarını quota kategorisine ayırır',()=>{
    const badge = classifyError('QUOTA: Google Drive depolama alanı doldu veya günlük kota aşıldı.');
    expect(badge?.category).toBe('quota');
  });
});
