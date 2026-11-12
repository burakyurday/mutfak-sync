import{describe,expect,it}from'vitest';
import{canDownloadOriginal,customerPermissions,visibleFiles}from'./model';
import{customerSession,hubFiles,teamSession}from'./fixtures';

describe('Mutfak Hub tenant boundaries',()=>{
 it('müşteri başka organizasyonun veya iç çalışma dosyasını göremez',()=>{
  expect(visibleFiles(customerSession,hubFiles).map(file=>file.id)).toEqual(['file-brief','file-story']);
 });
 it('Mutfak ekibi bütün organizasyon dosyalarını görebilir',()=>{
  expect(visibleFiles(teamSession,hubFiles)).toHaveLength(hubFiles.length);
 });
 it('müşteri yalnız kendi yüklemesini ve yayınlanan orijinali indirebilir',()=>{
  expect(canDownloadOriginal(customerSession,hubFiles[0])).toBe(true);
  expect(canDownloadOriginal(customerSession,hubFiles[1])).toBe(true);
  expect(canDownloadOriginal(customerSession,hubFiles[2])).toBe(false);
  expect(canDownloadOriginal(customerSession,hubFiles[3])).toBe(false);
 });
 it('müşteri yönetim işlemlerine sahip değildir',()=>{
  expect(customerPermissions).toMatchObject({upload:true,download:true,rename:false,move:false,delete:false,publish:false});
 });
});
