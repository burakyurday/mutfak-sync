import {test,expect} from '@playwright/test';
test('dashboard has honest empty state and navigation',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.getByRole('heading',{name:'Her şey yerli yerinde.'})).toBeVisible();await expect(page.getByText('Tarayıcı önizlemesi',{exact:false})).toBeVisible();
 await page.screenshot({path:'artifacts/dashboard.png',fullPage:true});
 for(const name of ['Dosyalar','Aktivite','Depolama','Ayarlar']){await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();}
 expect(errors).toEqual([]);
});
test('onboarding selects Naz and requires local folder',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Kurulumu başlat'}).click();
 await page.getByRole('button',{name:'Devam et'}).click();await page.getByRole('button',{name:'Naz Google Drive / Naz PC'}).click();
 await page.getByRole('button',{name:'Devam et'}).click();await expect(page.getByRole('checkbox',{name:/Mock bulut/})).toBeChecked();
 await page.getByRole('button',{name:'Devam et'}).click();await expect(page.getByText('└ Naz PC / projelerin')).toBeVisible();
 await page.getByRole('button',{name:'Devam et'}).click();await page.getByRole('button',{name:'Devam et'}).click();await expect(page.getByRole('alert')).toContainText('Yerel çalışma klasörünü seç');
 await page.getByRole('textbox',{name:'Yerel çalışma klasörü'}).fill('/tmp/Mutfak Ajans');await page.getByRole('button',{name:'Devam et'}).click();await expect(page.getByRole('heading',{name:'Her şey hazır.'})).toBeVisible();
 await page.getByRole('button',{name:'Yedeklemeyi başlat'}).click();await expect(page.getByRole('alert')).toContainText('masaüstü');
});
test('theme switch and search work',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Temayı değiştir'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.getByRole('button',{name:'Temayı değiştir'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.screenshot({path:'artifacts/dashboard-dark.png',fullPage:true});
 await page.getByRole('navigation').getByRole('button',{name:'Dosyalar',exact:true}).click();await page.getByPlaceholder('Dosya veya klasör ara…').fill('İş.psd');await expect(page.getByText('Çalışma klasöründe henüz dosya bulunamadı.')).toBeVisible();
});

test('archive requires a preview and explicit confirmation in the UI',async({page})=>{
 await page.addInitScript(()=>{
  const w=window as unknown as Record<string,any>;
  const settings={user:'Burak',root:'/tmp/test-only',folder_id:'',mock:true,stability_secs:30,scan_secs:600,bandwidth:'',exclude_dev:false,versions:false};
  const entries=[{path:'Müşteriler',kind:'directory',size:0,modified:'1',checksum:'',status:'backed_up',remote_id:'folder',parent_id:'root',last_success:1,retry:0,error:null},{path:'Müşteriler/Kasım.psd',kind:'file',size:1024,modified:'1',checksum:'verified',status:'backed_up',remote_id:'test-id',parent_id:'folder',last_success:1,retry:0,error:null}];
  w.isTauri=true;w.testCalls=[];
  w.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(name:string,args:any)=>{
   w.testCalls.push({name,args});
   if(name==='snapshot')return {settings,entries,activity:[],paused:false,error:null,free_bytes:1234567,device:'test-device',progress:null};
   if(name==='archive_plan')return {path:'Müşteriler/Kasım.psd',size:1024,checksum:'verified',remote_id:'test-id',warning:'Çöp kutusu boşaltılana kadar alan boşalmayabilir.'};
   if(name==='archive_file')entries[1].status='cloud_only';
   return null;
  }};
 });
 await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'Depolama',exact:true}).click();
 await page.getByRole('button',{name:'Buluta arşivle ve yer aç'}).click();await expect(page.getByRole('dialog')).toContainText('Müşteriler/Kasım.psd');
 await page.getByRole('button',{name:'Vazgeç',exact:true}).click();expect(await page.evaluate(()=>(window as any).testCalls.some((c:any)=>c.name==='archive_file'))).toBe(false);
 await page.getByRole('button',{name:'Buluta arşivle ve yer aç'}).click();await page.getByRole('button',{name:'Onaylıyorum, çöp kutusuna taşı'}).click();await expect(page.getByRole('button',{name:'Geri yükle',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).testCalls.find((c:any)=>c.name==='archive_file').args.confirmed)).toBe(true);
 await page.getByRole('navigation').getByRole('button',{name:'Dosyalar',exact:true}).click();await expect(page.getByText('Müşteriler/Kasım.psd',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Müşteriler klasörü'}).click();await expect(page.getByText('Müşteriler/Kasım.psd',{exact:true})).not.toBeVisible();
});
