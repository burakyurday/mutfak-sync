import {test,expect} from '@playwright/test';
test('dashboard has honest empty state and navigation',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.getByRole('heading',{name:'Mutfak Sync’i kuralım.'})).toBeVisible();await expect(page.getByText('Tarayıcı önizlemesi',{exact:false})).toBeVisible();
 await page.screenshot({path:'artifacts/dashboard.png',fullPage:true});
 for(const name of ['Dosyalar','Yer Aç','Ayarlar']){await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();}
 expect(errors).toEqual([]);
});
test('onboarding selects Naz and requires local folder',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Kurulumu başlat'}).click();
 await page.getByRole('button',{name:'Naz Naz PC klasörü'}).click();await page.getByRole('button',{name:'Devam et'}).click();
 await page.getByText('Google’a bağlanmadan arayüzü dene').click();await page.getByRole('checkbox',{name:'Test modunu kullan'}).check();
 await page.getByRole('button',{name:'Devam et'}).click();await page.getByRole('button',{name:'Devam et'}).click();await expect(page.getByRole('alert')).toContainText('Yerel çalışma klasörünü seç');
 await page.getByRole('textbox',{name:'Çalışma klasörü'}).fill('/tmp/Mutfak Ajans');await page.getByRole('button',{name:'Devam et'}).click();await expect(page.getByRole('heading',{name:'Hazırsın'})).toBeVisible();
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
   if(name==='plugin:app|version')return '0.1.1';
   if(name==='snapshot')return {settings,entries,activity:[],paused:false,error:null,free_bytes:1234567,device:'test-device',progress:null};
   if(name==='archive_plan')return {path:'Müşteriler/Kasım.psd',size:1024,checksum:'verified',remote_id:'test-id',warning:'Çöp kutusu boşaltılana kadar alan boşalmayabilir.'};
   if(name==='archive_file')entries[1].status='cloud_only';
   return null;
  }};
 });
 await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'Yer Aç',exact:true}).click();
 await page.getByRole('button',{name:'Buluta arşivle ve yer aç'}).click();await expect(page.getByRole('dialog')).toContainText('Müşteriler/Kasım.psd');
 await page.getByRole('button',{name:'Vazgeç',exact:true}).click();expect(await page.evaluate(()=>(window as any).testCalls.some((c:any)=>c.name==='archive_file'))).toBe(false);
 await page.getByRole('button',{name:'Buluta arşivle ve yer aç'}).click();await page.getByRole('button',{name:'Onaylıyorum, çöp kutusuna taşı'}).click();await expect(page.getByRole('button',{name:'Geri yükle',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).testCalls.find((c:any)=>c.name==='archive_file').args.confirmed)).toBe(true);
 await page.getByRole('navigation').getByRole('button',{name:'Dosyalar',exact:true}).click();await expect(page.getByText('Müşteriler/Kasım.psd',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Müşteriler klasörü'}).click();await expect(page.getByText('Müşteriler/Kasım.psd',{exact:true})).not.toBeVisible();
 await page.getByRole('navigation').getByRole('button',{name:'Ayarlar',exact:true}).click();await expect(page.getByText('Yazılım güncellemesi · v0.1.1',{exact:true})).toBeVisible();
});

test('Canlı Hub masaüstünü ikinci bir veritabanına bağlamaz',async({page})=>{
 await page.goto('/?hub=live');
 await expect(page.getByRole('heading',{name:'Projeler ve dosyalar tek güvenli alanda.'})).toBeVisible();
 await expect(page.getByText('Neon tabanlı Hub’da çalışır',{exact:false})).toBeVisible();
 await expect(page.getByText('Hub adresi dağıtım sırasında',{exact:false})).toBeVisible();
});

test('Ayarlar ekranında kurulumu sıfırlama açık onay gerektirir',async({page})=>{
 await page.addInitScript(()=>{
  const w=window as unknown as Record<string,any>;
  const settings={user:'Burak',root:'/tmp/test-only',folder_id:'https://drive.google.com/drive/folders/test',mock:false,stability_secs:30,scan_secs:600,bandwidth:'',exclude_dev:false,versions:false};
  w.isTauri=true;w.testCalls=[];
  w.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(name:string,args:any)=>{
   w.testCalls.push({name,args});
   if(name==='plugin:app|version')return '0.1.8';
   if(name==='snapshot')return {settings,entries:[],activity:[],paused:false,error:null,free_bytes:1234567,device:'test-device',progress:null};
   if(name==='disconnect_account')return null;
   return null;
  }};
 });
 await page.goto('/');
 await page.getByRole('navigation').getByRole('button',{name:'Ayarlar',exact:true}).click();
 await expect(page.getByRole('button',{name:'Kurulumu sıfırla'})).toBeVisible();
 await page.getByRole('button',{name:'Kurulumu sıfırla'}).click();
 await expect(page.getByRole('dialog')).toContainText('Kurulumu ve Bağlantıyı Sıfırla');
 await page.getByRole('button',{name:'Vazgeç',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).testCalls.some((c:any)=>c.name==='disconnect_account'))).toBe(false);

 await page.getByRole('button',{name:'Kurulumu sıfırla'}).click();
 await page.getByRole('button',{name:'Onaylıyorum, sıfırla'}).click();
 expect(await page.evaluate(()=>(window as any).testCalls.some((c:any)=>c.name==='disconnect_account'))).toBe(true);
});

test('Mutfak Hub köprüsü, sürüm geçmişi ve bant genişliği kontrolleri çalışır', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, any>;
    const settings = {
      user: 'Burak',
      root: '/tmp/test-only',
      folder_id: 'https://drive.google.com/drive/folders/test',
      mock: false,
      stability_secs: 30,
      scan_secs: 600,
      bandwidth: '',
      exclude_dev: false,
      versions: true,
      custom_excludes: '*.cache',
      notifications: true,
    };
    const entries = [
      {
        path: 'Müşteriler/Logo.ai',
        kind: 'file',
        size: 2048,
        modified: '1',
        checksum: 'abc123456789',
        status: 'backed_up',
        remote_id: 'remote-1',
        parent_id: 'root',
        last_success: 1,
        retry: 0,
        error: null,
      },
    ];
    w.isTauri = true;
    w.testCalls = [];
    w.__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      invoke: async (name: string, args: any) => {
        w.testCalls.push({ name, args });
        if (name === 'plugin:app|version') return '0.1.8';
        if (name === 'snapshot') return { settings, entries, activity: [], paused: false, error: null, free_bytes: 1234567, device: 'test-device', progress: null };
        if (name === 'file_versions') return [
          { id: 101, path: 'Müşteriler/Logo.ai', remote_path: '.mutfak-versions/Müşteriler/Logo.ai/1', checksum: 'oldchecksum123', created: 1700000000 }
        ];
        return null;
      },
    };
  });
  await page.goto('/');

  // 1. Hub navigation
  await page.getByRole('navigation').getByRole('button', { name: 'Mutfak Hub', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Projeler ve dosyalar tek güvenli alanda.' })).toBeVisible();

  // 2. File table version history modal
  await page.getByRole('navigation').getByRole('button', { name: 'Dosyalar', exact: true }).click();
  await expect(page.getByText('Müşteriler/Logo.ai')).toBeVisible();
  await page.getByRole('button', { name: 'Önceki sürümleri gör' }).click();
  await expect(page.getByRole('dialog')).toContainText('Dosya Sürüm Geçmişi');
  await expect(page.getByRole('button', { name: 'Bu sürüme dön' })).toBeVisible();
  await page.getByLabel('Kapat').click();

  // 3. Settings page bandwidth chip and custom exclude
  await page.getByRole('navigation').getByRole('button', { name: 'Ayarlar', exact: true }).click();
  await page.getByText('Gelişmiş ayarlar', { exact: true }).click();
  await page.getByRole('button', { name: '10 MB/s' }).click();
  await expect(page.getByPlaceholder('Özel sınır (Örn: 15M veya sınırsız için boş bırakın)')).toHaveValue('10M');
  await expect(page.getByPlaceholder('Örn: *.tmp, render_cache/, *.prproj.backup, temp/')).toHaveValue('*.cache');
});


test('Dosya detay modalı, öncelikli yükleme ve pil/bağlantı tasarrufu ayarları çalışır', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, any>;
    const settings = {
      user: 'Burak',
      root: '/tmp/test-only',
      folder_id: 'https://drive.google.com/drive/folders/test',
      mock: false,
      stability_secs: 30,
      scan_secs: 600,
      bandwidth: '',
      exclude_dev: false,
      versions: true,
      battery_saver: false,
      metered_saver: false,
    };
    const entries = [
      {
        path: 'Müşteriler/Katalog.psd',
        kind: 'file',
        size: 50000000,
        modified: '1',
        checksum: 'psdchecksum123456',
        status: 'pending',
        remote_id: null,
        parent_id: 'root',
        last_success: 0,
        retry: 0,
        error: null,
      },
    ];
    w.isTauri = true;
    w.testCalls = [];
    w.__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      invoke: async (name: string, args: any) => {
        w.testCalls.push({ name, args });
        if (name === 'plugin:app|version') return '0.1.8';
        if (name === 'snapshot') return { settings, entries, activity: [], paused: false, error: null, free_bytes: 1234567, device: 'test-device', progress: null };
        if (name === 'prioritize') return null;
        return null;
      },
    };
  });
  await page.goto('/');

  // 1. Files page - click on pending file name to open detail modal
  await page.getByRole('navigation').getByRole('button', { name: /Dosyalar/ }).click();
  await expect(page.getByText('Müşteriler/Katalog.psd')).toBeVisible();
  await page.getByText('Müşteriler/Katalog.psd').click();
  await expect(page.getByRole('dialog')).toContainText('Katalog.psd');
  await expect(page.getByRole('dialog')).toContainText('Doğrulama (MD5 Checksum)');
  await page.getByLabel('Kapat').click();

  // 2. Prioritize button triggers prioritize IPC call
  const prioritizeBtn = page.getByTitle('Sıranın en başına al (Öncelikli yükle)');
  await expect(prioritizeBtn).toBeVisible();
  await prioritizeBtn.click();
  expect(await page.evaluate(() => (window as any).testCalls.some((c: any) => c.name === 'prioritize' && c.args.path === 'Müşteriler/Katalog.psd'))).toBe(true);

  // 3. Settings page - battery saver & metered saver toggles
  await page.getByRole('navigation').getByRole('button', { name: 'Ayarlar', exact: true }).click();
  await page.getByText('Gelişmiş ayarlar', { exact: true }).click();
  await expect(page.getByText('Pil tasarrufu modu')).toBeVisible();
  await expect(page.getByText('Tarifeli bağlantı / Mobil veri tasarrufu')).toBeVisible();
});

test('Yeni Proje Klasörü, Ajans Karnesi, Odaklanma Modu ve Canlı Drive Kota Göstergesi çalışır', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, any>;
    const settings = {
      user: 'Burak',
      root: '/tmp/test-only',
      folder_id: 'https://drive.google.com/drive/folders/test',
      mock: false,
      stability_secs: 30,
      scan_secs: 600,
      bandwidth: '',
      exclude_dev: false,
      versions: true,
      battery_saver: false,
      metered_saver: false,
    };
    const entries = [
      {
        path: 'Müşteriler/Katalog.psd',
        kind: 'file',
        size: 50000000,
        modified: '1',
        checksum: 'psdchecksum123456',
        status: 'backed_up',
        remote_id: 'remote-1',
        parent_id: 'root',
        last_success: 1,
        retry: 0,
        error: null,
      },
    ];
    w.isTauri = true;
    w.testCalls = [];
    w.__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      invoke: async (name: string, args: any) => {
        w.testCalls.push({ name, args });
        if (name === 'plugin:app|version') return '0.1.8';
        if (name === 'snapshot') return { settings, entries, activity: [], paused: false, error: null, free_bytes: 1234567, device: 'test-device', progress: null };
        if (name === 'create_project_folder') return ['Acme/01_Ham_Gorseller', 'Acme/02_Tasarim_PSD_AI'];
        if (name === 'drive_quota') return { total_bytes: 5368709120000, used_bytes: 1500000000000, free_bytes: 3868709120000, trash_bytes: 4200000000 };
        return null;
      },
    };
  });
  await page.goto('/');

  // 1. Odaklanma Modu (Zen mode) toggle in header
  const zenBtn = page.getByTitle('Odaklanma modu (Sessiz çalış)');
  await expect(zenBtn).toBeVisible();
  await zenBtn.click();
  await expect(page.getByText('Odaklanma Modu Açık:', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Modu Kapat' }).click();

  // 2. Overview - Ajans Karnesi Modal
  await page.getByRole('button', { name: 'Ajans Karnesi' }).click();
  await expect(page.getByRole('dialog')).toContainText('Mutfak Ajans · Stüdyo Sağlık Karnesi');
  await expect(page.getByRole('dialog')).toContainText('Burak PC & Naz PC');
  await page.getByLabel('Kapat').click();

  // 3. Files - Yeni Proje Klasörü modal
  await page.getByRole('navigation').getByRole('button', { name: /Dosyalar/ }).click();
  await page.getByRole('button', { name: 'Yeni Proje Klasörü' }).click();
  await expect(page.getByRole('dialog')).toContainText('Standart Proje Klasörü Oluştur');
  await expect(page.getByRole('dialog')).toContainText('01_Ham_Gorseller');
  await page.getByPlaceholder('Örn: Acme_Kurumsal veya 2026_Katalog').fill('Acme_Proje');
  await page.getByRole('button', { name: 'Klasör Yapısını Oluştur' }).click();
  expect(await page.evaluate(() => (window as any).testCalls.some((c: any) => c.name === 'create_project_folder' && c.args.name === 'Acme_Proje'))).toBe(true);

  // 4. Storage - Google Drive Quota Meter
  await page.getByRole('navigation').getByRole('button', { name: 'Yer Aç', exact: true }).click();
  await expect(page.getByText('Google Drive Bulut Depolama (5.0 TB Planı)')).toBeVisible();
  await expect(page.getByText('Drive Çöp Kutusu:', { exact: false })).toBeVisible();
});
