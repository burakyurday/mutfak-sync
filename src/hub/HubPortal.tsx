import {ArrowUpRight,ShieldCheck} from 'lucide-react';
import './hub.css';

const configuredUrl=import.meta.env.VITE_MUTFAK_HUB_URL?.trim();
const hubUrl=configuredUrl&&/^https:\/\//i.test(configuredUrl)?configuredUrl:null;

export function HubPortal(){
 return <main className="hub-auth"><section>
  <span className="brand-mark">m<span>•</span></span>
  <small>MUTFAK HUB</small>
  <h1>Projeler ve dosyalar tek güvenli alanda.</h1>
  <p>Müşteri portalı, ekip yönetimi ve dosya paylaşımı Mutfak Web üzerindeki Neon tabanlı Hub’da çalışır. Masaüstü uygulaması yalnızca güvenilir otomatik yedeklemeyi yönetir.</p>
  {hubUrl?<a className="button primary" href={hubUrl} target="_blank" rel="noreferrer">Mutfak Hub’ı aç <ArrowUpRight size={17}/></a>:<div className="hub-auth-note"><ShieldCheck size={18}/>Hub adresi dağıtım sırasında güvenli web adresi olarak tanımlanacak.</div>}
 </section></main>;
}
