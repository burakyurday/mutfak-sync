import type{HubFile,HubProject,HubSession,Organization}from'./model';

export const organizations:Organization[]=[
 {id:'org-flexi',name:'Flexi',slug:'flexi',activeProjects:3,memberCount:2},
 {id:'org-nova',name:'Nova Coffee',slug:'nova-coffee',activeProjects:2,memberCount:3},
 {id:'org-atelier',name:'Atelier 34',slug:'atelier-34',activeProjects:1,memberCount:1},
];
export const projects:HubProject[]=[
 {id:'prj-campaign',organizationId:'org-flexi',name:'Kasım Kampanyası',status:'review',updatedAt:'2026-11-12T08:42:00Z'},
 {id:'prj-brand',organizationId:'org-flexi',name:'Marka Dosyaları',status:'active',updatedAt:'2026-11-11T15:10:00Z'},
 {id:'prj-menu',organizationId:'org-nova',name:'Kış Menüsü',status:'active',updatedAt:'2026-11-12T07:20:00Z'},
];
export const hubFiles:HubFile[]=[
 {id:'file-brief',organizationId:'org-flexi',projectId:'prj-campaign',name:'Kampanya Brief.pdf',kind:'PDF',size:2_400_000,visibility:'customer_upload',uploadedBy:'user-flexi',updatedAt:'2026-11-12T08:42:00Z',previewStatus:'ready'},
 {id:'file-story',organizationId:'org-flexi',projectId:'prj-campaign',name:'Kasım Story v3.jpg',kind:'JPG',size:4_800_000,visibility:'published',uploadedBy:'staff-burak',updatedAt:'2026-11-12T08:10:00Z',previewStatus:'ready'},
 {id:'file-working',organizationId:'org-flexi',projectId:'prj-campaign',name:'Kasım Story çalışma.psd',kind:'PSD',size:842_000_000,visibility:'internal',uploadedBy:'staff-burak',updatedAt:'2026-11-12T08:03:00Z',previewStatus:'processing'},
 {id:'file-menu',organizationId:'org-nova',projectId:'prj-menu',name:'Kış Menü Taslak.ai',kind:'AI',size:126_000_000,visibility:'internal',uploadedBy:'staff-naz',updatedAt:'2026-11-12T07:20:00Z',previewStatus:'ready'},
];
export const teamSession:HubSession={userId:'staff-burak',name:'Burak',email:'burak@mutfakajans.com',role:'mutfak_admin',organizationId:null};
export const customerSession:HubSession={userId:'user-flexi',name:'Deniz Akın',email:'deniz@flexi.com',role:'customer',organizationId:'org-flexi'};
