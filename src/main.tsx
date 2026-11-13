import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { listen } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  Cloud,
  CloudUpload,
  Folder,
  HardDrive,
  History,
  LayoutDashboard,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sun,
  Moon,
  Monitor,
  ArrowLeft,
  File,
  AlertCircle,
  Archive,
  SlidersHorizontal,
  ExternalLink,
  Info,
  Layers,
  Sparkles
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { enable, disable } from '@tauri-apps/plugin-autostart';
import { command, native, emptySnapshot } from './services';
import { bytes, defaultSettings, statuses, tree, classifyError } from './types';
import type { Settings, Snapshot, ArchivePlan, Entry } from './types';
import { checkForAppUpdate, installAppUpdate } from './updater';
import type { AvailableUpdate } from './updater';
import './styles/app.css';

type Page = 'overview' | 'files' | 'activity' | 'storage' | 'settings';
type FileCategory = 'all' | 'backed_up' | 'pending' | 'locked' | 'errors';
type UpdateState = {
  phase: 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'installing' | 'error';
  available?: AvailableUpdate;
  downloaded?: number;
  total?: number;
  message?: string;
};

const pages: { id: Page; label: string; icon: typeof Cloud }[] = [
  { id: 'overview', label: 'Ana Sayfa', icon: LayoutDashboard },
  { id: 'files', label: 'Dosyalar', icon: Folder },
  { id: 'storage', label: 'Yer Aç', icon: HardDrive },
  { id: 'settings', label: 'Ayarlar', icon: SettingsIcon },
];

const pageNames: Record<Page, string> = {
  overview: 'Ana Sayfa',
  files: 'Dosyalar',
  activity: 'İşlem Geçmişi',
  storage: 'Yer Aç',
  settings: 'Ayarlar',
};

const time = (n: number) =>
  new Date(n * 1000).toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

function connectionLabel(snapshot: Snapshot, pending: Entry[]): string {
  if (!snapshot.settings) return 'Kurulum gerekli';
  if (snapshot.settings.mock) return 'Test modu';
  const errors = pending
    .filter((e) => e.status === 'error' && e.error)
    .map((e) => classifyError(e.error));
  if (errors.length > 0) {
    if (errors.some((e) => e?.category === 'auth')) return 'Yetki yenilenmeli';
    if (errors.some((e) => e?.category === 'quota')) return 'Drive alanı dolu';
    if (errors.some((e) => e?.category === 'network')) return 'İnternet bekleniyor';
    if (errors.every((e) => e?.category === 'locked')) return 'Dosya kaydediliyor (Photoshop)';
    return 'Kontrol gerekiyor';
  }
  return 'Google Drive bağlı';
}

function getFormatBadge(path: string, kind: string): { label: string; cls: string } {
  if (kind === 'directory') return { label: 'DIR', cls: 'folder' };
  const ext = path.split('.').pop()?.toLowerCase() || '';
  if (ext === 'psd') return { label: 'PSD', cls: 'psd' };
  if (ext === 'ai') return { label: 'AI', cls: 'ai' };
  if (ext === 'pdf') return { label: 'PDF', cls: 'pdf' };
  if (ext === 'xls' || ext === 'xlsx') return { label: 'XLS', cls: 'xls' };
  if (ext === 'indd') return { label: 'INDD', cls: 'indd' };
  return { label: ext.toUpperCase().slice(0, 4) || 'DOSYA', cls: 'general' };
}

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [page, setPage] = useState<Page>('overview');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [fileFilter, setFileFilter] = useState<FileCategory>('all');
  const [onboarding, setOnboarding] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'system');
  const [plan, setPlan] = useState<ArchivePlan | null>(null);
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);
  const [appVersion, setAppVersion] = useState('0.1.6');
  const [updateState, setUpdateState] = useState<UpdateState>({ phase: 'idle' });

  const refresh = async () => {
    if (native) {
      try {
        setSnapshot(await command<Snapshot>('snapshot'));
      } catch (e) {
        setError(String(e));
      }
    }
  };

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!native) return;
    const cleanup = listen<Page>('navigate', (e) => setPage(e.payload));
    return () => {
      void cleanup.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  const run = async (name: string, args?: Record<string, unknown>, success?: string) => {
    setBusy(true);
    setError('');
    try {
      await command(name, args);
      if (success) setNotice(success);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const files = snapshot.entries.filter((e) => e.kind === 'file');
  const backed = files.filter((e) => e.status === 'backed_up' || e.status === 'cloud_only');
  const pending = files.filter((e) => ['pending', 'uploading', 'error'].includes(e.status));
  const total = backed.reduce((n, e) => n + e.size, 0);
  const latest = Math.max(0, ...backed.map((e) => e.last_success || 0));
  const profile = snapshot.settings?.user || 'Mutfak Ajans';

  const prevPending = React.useRef(pending.length);
  useEffect(() => {
    if (prevPending.current > 0 && pending.length === 0 && backed.length > 0) {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Mutfak Sync', {
          body: 'Tüm dosyalarınız Google Drive’a başarıyla yedeklendi.',
          icon: '/brand/mutfak-ajans-logo.png',
        });
      }
    }
    prevPending.current = pending.length;
  }, [pending.length, backed.length]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  const archive = async (e: Entry) => {
    setBusy(true);
    try {
      setPlan(await command<ArchivePlan>('archive_plan', { path: e.path }));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const checkUpdates = async (manual = false) => {
    if (!native) {
      if (manual) setUpdateState({ phase: 'error', message: 'Güncelleme kontrolü yalnız masaüstü uygulamasında çalışır.' });
      return;
    }
    setUpdateState({ phase: 'checking' });
    try {
      const available = await checkForAppUpdate();
      setUpdateState(available ? { phase: 'available', available } : { phase: 'latest' });
    } catch (e) {
      if (manual) setUpdateState({ phase: 'error', message: `Güncelleme kontrol edilemedi: ${String(e)}` });
      else setUpdateState({ phase: 'idle' });
    }
  };

  const installUpdate = async () => {
    if (updateState.phase !== 'available' || !updateState.available) return;
    if (files.some((file) => file.status === 'uploading')) {
      setUpdateState({ ...updateState, phase: 'error', message: 'Aktif yükleme tamamlandıktan sonra güncellemeyi kur.' });
      return;
    }
    const available = updateState.available;
    setUpdateState({ phase: 'downloading', available, downloaded: 0 });
    try {
      await installAppUpdate(
        () => command<boolean>('prepare_update'),
        () => command('resume_after_failed_update'),
        (downloaded, total) => setUpdateState({ phase: 'downloading', available, downloaded, total })
      );
      setUpdateState({ phase: 'installing', available });
    } catch (e) {
      setUpdateState({ phase: 'error', available, message: `Güncelleme kurulamadı: ${String(e)}` });
    }
  };

  useEffect(() => {
    if (!native) return;
    void getVersion().then(setAppVersion).catch(() => {});
    const startup = setTimeout(() => void checkUpdates(false), 8_000);
    const periodic = setInterval(() => void checkUpdates(false), 6 * 60 * 60 * 1000);
    return () => {
      clearTimeout(startup);
      clearInterval(periodic);
    };
  }, []);

  // Filtered files for Files page
  const filteredEntries = snapshot.entries.filter((e) => {
    const matchSearch = e.path.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr'));
    if (!matchSearch) return false;
    if (e.kind === 'directory') return true; // keep directory in tree
    if (fileFilter === 'all') return true;
    if (fileFilter === 'backed_up') return e.status === 'backed_up' || e.status === 'cloud_only';
    if (fileFilter === 'pending') return e.status === 'pending' || e.status === 'uploading';
    if (fileFilter === 'locked') return e.status === 'error' && classifyError(e.error)?.category === 'locked';
    if (fileFilter === 'errors') return e.status === 'error';
    return true;
  });

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          aria-label="Mutfak Sync ana sayfa"
          onClick={(e) => {
            e.preventDefault();
            setPage('overview');
          }}
        >
          <img className="brand-logo" src="/brand/mark.svg" alt="Mutfak Ajans" />
          <div className="brand-text">
            <span className="brand-name">mutfak</span>
            <span className="brand-product">SYNC</span>
          </div>
        </a>
        <nav aria-label="Ana menü">
          {pages.map((p) => (
            <button
              key={p.id}
              className={page === p.id ? 'nav-item active' : 'nav-item'}
              onClick={() => setPage(p.id)}
            >
              <p.icon size={18} />
              {p.label}
              {p.id === 'files' && pending.length > 0 && <span className="nav-count">{pending.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <span className="avatar small">{profile[0]}</span>
            <div>
              <strong>{profile}</strong>
              <small>{snapshot.settings ? `${profile} PC` : 'Kurulum bekleniyor'}</small>
            </div>
            <span className={'dot ' + (snapshot.settings ? 'green' : '')} />
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <strong>{pageNames[page]}</strong>
          </div>
          <div className="top-actions">
            <span className="connection">
              <span className={'dot ' + (snapshot.settings ? 'green' : '')} />
              {connectionLabel(snapshot, pending)}
            </span>
            <button
              className="icon-button"
              aria-label="Temayı değiştir"
              onClick={() => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')}
            >
              {theme === 'system' ? <Monitor size={17} /> : theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}
            </button>
          </div>
        </header>

        <div className="main-content">
          {!native && (
            <div className="preview-banner">
              <Monitor size={16} />
              Tarayıcı önizlemesi · Gerçek yedekleme ve dosya işlemleri masaüstü uygulamasında çalışır.
            </div>
          )}

          {error || snapshot.error ? (
            <div className="alert" role="alert">
              <AlertCircle size={18} />
              <span>{error || snapshot.error}</span>
              <button onClick={() => setError('')}>×</button>
            </div>
          ) : null}

          {notice && (
            <div className="notice" role="status">
              <Check size={16} />
              {notice}
              <button onClick={() => setNotice('')}>×</button>
            </div>
          )}

          {updateState.phase === 'available' && updateState.available && (
            <div className="notice update-notice" role="status">
              <ArrowDownToLine size={18} />
              <span>
                <strong>Mutfak Sync {updateState.available.version} hazır.</strong> Yedekleme tamamlandığında güvenli
                güncellemeyi kurabilirsin.
              </span>
              <button
                className="button primary"
                disabled={files.some((file) => file.status === 'uploading')}
                onClick={() => void installUpdate()}
              >
                İndir ve kur
              </button>
            </div>
          )}

          <section className="page-heading">
            <div>
              <h1>{page === 'overview' ? (snapshot.settings ? 'Dosyaların güvende.' : 'Mutfak Sync’i kuralım.') : pageNames[page]}</h1>
              <p>
                {page === 'overview'
                  ? snapshot.settings
                    ? 'Yedekleme arka planda otomatik çalışıyor.'
                    : 'Dört kısa adımda yedeklemeyi başlat.'
                  : page === 'files'
                  ? 'Yedeklenen dosyalarını gör ve ara.'
                  : page === 'activity'
                  ? 'Son yapılan işlemleri gör.'
                  : page === 'storage'
                  ? 'Doğrulanmış dosyaları buluta arşivleyerek yer aç.'
                  : 'Temel ve gelişmiş ayarları yönet.'}
              </p>
            </div>
            <div className="heading-actions">
              {snapshot.settings ? (
                <>
                  <button className="button quiet" disabled={busy} onClick={() => void run('pause')}>
                    {snapshot.paused ? <Play size={16} /> : <Pause size={16} />} {snapshot.paused ? 'Devam et' : 'Duraklat'}
                  </button>
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => void run('backup_now', {}, 'Dosyaların kontrol ediliyor.')}
                  >
                    <RefreshCw size={16} /> Şimdi kontrol et
                  </button>
                </>
              ) : (
                <button className="button primary large" onClick={() => setOnboarding(true)}>
                  <CloudUpload size={18} /> Kurulumu başlat
                </button>
              )}
            </div>
          </section>

          {page === 'overview' && !snapshot.settings && (
            <SetupWelcome onStart={() => setOnboarding(true)} onLearnMore={() => setShowHowItWorks(true)} />
          )}

          {page === 'overview' && snapshot.settings && (
            <>
              <section className="health-card">
                <div className="health-icon">
                  <ShieldCheck size={30} />
                </div>
                <div>
                  <div className="health-title">
                    {snapshot.paused
                      ? 'Yedekleme duraklatıldı.'
                      : pending.some((e) => e.status === 'error')
                      ? 'Bazı dosyalar yeniden denenecek.'
                      : pending.length
                      ? 'Dosyaların yedekleniyor.'
                      : 'Her şey güncel.'}
                    <span className="tag">{snapshot.settings.mock ? 'TEST MODU' : 'OTOMATİK'}</span>
                  </div>
                  <p>
                    {latest ? `Son başarılı yedekleme: ${time(latest)}` : 'İlk yedekleme için dosyalar taranıyor.'}
                  </p>
                </div>
                <Cloud size={64} className="health-cloud" />
              </section>

              <section className="stats-grid">
                <Stat icon={CheckCheck} label="Yedeklenen" value={backed.length.toLocaleString('tr-TR')} detail="doğrulanmış dosya" />
                <Stat icon={History} label="Bekleyen" value={pending.length.toLocaleString('tr-TR')} detail={snapshot.paused ? 'yedekleme duraklatıldı' : 'dosya sırada'} />
                <Stat icon={HardDrive} label="Boş alan" value={bytes(snapshot.free_bytes)} detail="bu bilgisayarda" />
              </section>

              <section className="two-column">
                <div className="panel backup-panel">
                  <PanelTitle title="Yedekleme merkezi" sub="Çalışma alanından buluta, güvenle." />
                  <div className="backup-route">
                    <div className="route-icon">
                      <Monitor size={27} />
                    </div>
                    <div className="route-line">
                      <span />
                      <span />
                      <span />
                      <CloudUpload size={22} />
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="route-icon cloud">
                      <Cloud size={28} />
                    </div>
                  </div>
                  <div className="route-labels">
                    <div>
                      <strong>{snapshot.settings ? `${profile} PC` : 'Bu bilgisayar'}</strong>
                      <small>{snapshot.settings?.root || 'Yerel çalışma klasörü'}</small>
                    </div>
                    <div>
                      <strong>{snapshot.settings?.mock ? 'Mock bulut' : 'Google Drive'}</strong>
                      <small>Mutfak Ajans / {snapshot.settings ? `${profile} PC` : 'Cihaz klasörü'}</small>
                    </div>
                  </div>
                  <div className="transfer-status">
                    <span className={'dot ' + (snapshot.paused ? '' : 'green')} />
                    {snapshot.paused
                      ? 'Duraklatıldı'
                      : pending.some((e) => e.status === 'uploading')
                      ? 'Aktarım devam ediyor'
                      : pending.length
                      ? 'Dosyaların kararlı hale gelmesi bekleniyor'
                      : 'Aktif aktarım yok'}
                    <span className="muted">{snapshot.settings ? 'Otomatik' : 'Kurulum gerekli'}</span>
                  </div>
                  {snapshot.progress && (
                    <div className="live-progress">
                      <progress max={snapshot.progress.total || 1} value={snapshot.progress.bytes} />
                      <span>
                        {bytes(snapshot.progress.bytes)} / {bytes(snapshot.progress.total)} · {bytes(snapshot.progress.speed)}/sn
                      </span>
                    </div>
                  )}
                  <div className="subtle-note">
                    <ShieldCheck size={15} />
                    Yerel silmeler bulut kopyalarını etkilemez.
                  </div>
                </div>

                <div className="panel">
                  <PanelTitle title="Son aktiviteler" action="Tümünü gör" onClick={() => setPage('activity')} />
                  <ActivityList items={snapshot.activity.slice(0, 4)} />
                </div>
              </section>

              <section className="panel">
                <PanelTitle title="Dosyaların" sub="Son yedekleme durumuna bir bakış." action="Tüm dosyalar" onClick={() => setPage('files')} />
                <FileTable
                  entries={files.slice(0, 5)}
                  empty="İlk dosyan için hazırız. Kurulumu tamamladıktan sonra çalışma klasörüne eklediğin dosyalar burada görünecek."
                />
              </section>

              <footer>
                <span>
                  <ShieldCheck size={14} /> Güvenli aktarım. Kontrol her zaman sende.
                </span>
                <span>
                  Mutfak Ajans için tasarlandı <span className="footer-dot">•</span> v{appVersion}
                </span>
              </footer>
            </>
          )}

          {page === 'files' && (
            <section className="panel">
              {/* Image 2 Clay Reflection Shelf */}
              <div className="shelf-container">
                <div className="reflection-shelf">
                  <div className="shelf-badge psd" title="Adobe Photoshop">PSD</div>
                  <div className="shelf-badge ai" title="Adobe Illustrator">AI</div>
                  <div className="shelf-badge pdf" title="Adobe PDF Belgesi">PDF</div>
                  <div className="shelf-badge indd" title="Adobe InDesign">INDD</div>
                  <div className="shelf-badge xls" title="Excel / Rapor">XLS</div>
                  <div className="shelf-badge drive" title="Google Drive Senkronu">DRIVE</div>
                </div>
              </div>

              <div className="file-toolbar">
                {/* Image 2 Category Filter Pills */}
                <div className="pill-filter-bar">
                  <button
                    className={'filter-pill ' + (fileFilter === 'all' ? 'active' : '')}
                    onClick={() => setFileFilter('all')}
                  >
                    Tümü
                  </button>
                  <button
                    className={'filter-pill ' + (fileFilter === 'backed_up' ? 'active' : '')}
                    onClick={() => setFileFilter('backed_up')}
                  >
                    Yedeklenenler
                  </button>
                  <button
                    className={'filter-pill ' + (fileFilter === 'pending' ? 'active' : '')}
                    onClick={() => setFileFilter('pending')}
                  >
                    Sırada
                  </button>
                  <button
                    className={'filter-pill ' + (fileFilter === 'locked' ? 'active' : '')}
                    onClick={() => setFileFilter('locked')}
                  >
                    Kullanımda (Photoshop)
                  </button>
                  <button
                    className={'filter-pill ' + (fileFilter === 'errors' ? 'active' : '')}
                    onClick={() => setFileFilter('errors')}
                  >
                    Hatalar
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <label className="search-capsule">
                    <Search size={16} />
                    <input
                      placeholder="Dosya veya klasör ara…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <button className="button" onClick={() => void run('open_location', { kind: 'local' })}>
                    <Folder size={16} /> Klasörü aç
                  </button>
                </div>
              </div>

              <FileTable
                entries={tree(filteredEntries)}
                onRestore={(e) => void run('restore', { path: e.path }, 'Dosya orijinal konumuna geri yüklendi.')}
                empty="Çalışma klasöründe henüz dosya bulunamadı."
              />
            </section>
          )}

          {page === 'activity' && (
            <section className="panel">
              <PanelTitle title="İşlem geçmişi" sub="Son 100 işlem · yerel kayıtlar" />
              <ActivityList items={snapshot.activity} />
            </section>
          )}

          {page === 'storage' && (
            <>
              <section className="stats-grid storage-stats">
                <Stat icon={HardDrive} label="Yerel boş alan" value={snapshot.settings ? bytes(snapshot.free_bytes) : '—'} detail="Çalışma klasörünün diski" />
                <Stat icon={Cloud} label="Doğrulanmış yedekler" value={bytes(total)} detail={`${backed.length} dosya`} />
                <Stat
                  icon={Archive}
                  label="Arşivlenebilir"
                  value={bytes(files.filter((e) => e.status === 'backed_up').reduce((a, b) => a + b.size, 0))}
                  detail="Son kontrol işlem öncesi yapılır"
                />
              </section>

              <div className="notice persistent">
                <ShieldCheck size={18} />
                Yer açma yalnızca checksum, boyut ve uzak dosya kimliği doğrulandıktan sonra, açık onayınla yapılır. Çöp kutusu
                boşaltılana kadar alan kazanılmayabilir.
              </div>

              <section className="panel">
                <PanelTitle title="Büyük dosyalar" sub="Bulut kopyası doğrulanmış dosyaları güvenle arşivle." />
                {files.length === 0 ? (
                  <Empty icon={HardDrive} text="Depolama bilgileri ilk yedeklemeden sonra burada görünecek." />
                ) : (
                  [...files]
                    .sort((a, b) => b.size - a.size)
                    .slice(0, 30)
                    .map((e) => (
                      <div className="storage-row" key={e.path}>
                        <span className={'format-pill ' + getFormatBadge(e.path, e.kind).cls}>
                          {getFormatBadge(e.path, e.kind).label}
                        </span>
                        <div>
                          <strong>{e.path}</strong>
                          <small>{statuses[e.status]}</small>
                        </div>
                        <span>{bytes(e.size)}</span>
                        {e.status === 'cloud_only' ? (
                          <button className="button" disabled={busy} onClick={() => void run('restore', { path: e.path }, 'Dosya geri yüklendi.')}>
                            <ArrowDownToLine size={15} /> Geri yükle
                          </button>
                        ) : (
                          <button className="button" disabled={busy || e.status !== 'backed_up'} onClick={() => void archive(e)}>
                            <Archive size={15} /> Buluta arşivle ve yer aç
                          </button>
                        )}
                      </div>
                    ))
                )}
              </section>
              <p className="footnote">
                Google One 5 TB planı kullanıcı tarafından belirtilen bilgidir. Hesap kotası bu sürümde API üzerinden okunmaz. Buluttaki
                PSD dosyasını düzenlemek için önce geri indir.
              </p>
            </>
          )}

          {page === 'settings' && (
            <SettingsPage
              initial={snapshot.settings}
              busy={busy}
              onSave={(s) => run('configure', { settings: s }, 'Ayarlar kaydedildi.')}
              onStart={() => setOnboarding(true)}
              onReconnect={() => void run('connect_drive', { folder: snapshot.settings?.folder_id }, 'Google Drive bağlantısı yenilendi.')}
              onDisconnect={() => setDisconnectConfirm(true)}
              onDiagnostics={() => void run('diagnostics', {}, 'Tanılama dosyası uygulama veri klasörüne kaydedildi. Kimlik bilgileri içermez.')}
              theme={theme}
              setTheme={setTheme}
              appVersion={appVersion}
              updateState={updateState}
              onCheckUpdate={() => void checkUpdates(true)}
              onInstallUpdate={() => void installUpdate()}
            />
          )}
        </div>
      </main>

      {onboarding && (
        <Onboarding
          onClose={() => setOnboarding(false)}
          onDone={async (s, autostart) => {
            await command('configure', { settings: s });
            if (autostart) await enable();
            setOnboarding(false);
            await refresh();
          }}
        />
      )}

      {showHowItWorks && (
        <HowItWorksModal onClose={() => setShowHowItWorks(false)} onStart={() => { setShowHowItWorks(false); setOnboarding(true); }} />
      )}

      {plan && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="archive-title">
            <span className="modal-symbol">
              <Archive size={28} />
            </span>
            <h2 id="archive-title">Bulut kopyası doğrulandı.</h2>
            <p>{plan.path}</p>
            <div className="summary">
              <span>Çöp kutusuna taşınacak</span>
              <strong>{bytes(plan.size)}</strong>
            </div>
            <p>{plan.warning}</p>
            <p>Yerel dosya kaldırılmadan hemen önce tekrar doğrulanır. Google Drive kopyası korunur.</p>
            <div className="modal-actions">
              <button className="button" onClick={() => setPlan(null)}>
                Vazgeç
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={async () => {
                  await run('archive_file', { plan, confirmed: true }, 'Dosya çöp kutusuna taşındı. Bulut kopyası korundu.');
                  setPlan(null);
                }}
              >
                Onaylıyorum, çöp kutusuna taşı
              </button>
            </div>
          </section>
        </div>
      )}

      {disconnectConfirm && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
            <span className="modal-symbol" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
              <AlertCircle size={28} />
            </span>
            <h2 id="reset-title">Kurulumu ve Bağlantıyı Sıfırla</h2>
            <p>Mutfak Sync'in bu bilgisayardaki oturumu, izleme listesi ve ayarları kaldırılacaktır.</p>
            <div className="summary">
              <span>Yerel ve Drive dosyaları</span>
              <strong>Kesinlikle silinmez</strong>
            </div>
            <p>Sıfırlama sonrasında farklı bir kullanıcı veya klasör seçimi için ilk kurulum ekranı açılacaktır.</p>
            <div className="modal-actions">
              <button className="button" onClick={() => setDisconnectConfirm(false)}>
                Vazgeç
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={async () => {
                  await run('disconnect_account', {}, 'Kurulum sıfırlandı. Yeni kurulum yapabilirsiniz.');
                  setDisconnectConfirm(false);
                  setPage('overview');
                }}
              >
                Onaylıyorum, sıfırla
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// Image 1 & 4 Hero Glass Card
function SetupWelcome({ onStart, onLearnMore }: { onStart: () => void; onLearnMore: () => void }) {
  return (
    <section className="setup-welcome-hero">
      <div className="hero-content">
        <span className="hero-kicker">TEK YÖNLÜ BULUT GÜVENCESİ</span>
        <h2 className="hero-title">Mutfak Ajans için bulut yedeklemesinde yeni bir dönem!</h2>
        <p className="hero-description">
          Tasarım ve müşteri dosyalarını tek tek gönderme, mail veya mesajla versiyon arama devri bitti. Bilgisayarında
          çalıştığın PSD, AI ve PDF dosyaları yerelden silinse dahi Google Drive kopyan daima güvende kalır.
        </p>

        {/* Image 1 3D Showcase */}
        <div className="sync-showcase-3d">
          <div className="cloud-pill-3d" title="Google Drive Bulut Depolama">
            <div className="cloud-cap" />
            <div className="colored-strip strip-yellow" />
            <div className="colored-strip strip-red" />
            <div className="colored-strip strip-blue" />
          </div>

          <div className="sync-arrows-3d" title="Otomatik Kesintisiz Senkronizasyon">
            <RefreshCw size={24} />
          </div>

          <div className="badge-3d psd" title="Adobe Photoshop Çalışmaları">
            PSD
          </div>

          <div className="badge-3d xls" title="Excel ve Tablolar">
            XLS
          </div>

          <div className="badge-3d pdf" title="PDF Dokümanları ve Baskılar">
            PDF
          </div>
        </div>

        {/* Image 4 Dual Pill CTAs */}
        <div className="hero-actions">
          <button className="button primary large" onClick={onStart}>
            <CloudUpload size={18} /> Hemen Başlayalım <ChevronRight size={18} />
          </button>
          <button className="button glass large" onClick={onLearnMore}>
            <Info size={18} /> Nasıl Çalışır?
          </button>
        </div>

        <div className="setup-promises">
          <span>
            <Check size={16} /> Yerel silmeler Drive kopyasını silmez
          </span>
          <span>
            <Check size={16} /> Klasör yapın olduğu gibi korunur
          </span>
          <span>
            <Check size={16} /> Arka planda sessiz çalışır
          </span>
        </div>
      </div>
    </section>
  );
}

function HowItWorksModal({ onClose, onStart }: { onClose: () => void; onStart: () => void }) {
  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="how-title">
        <div className="modal-top">
          <span className="modal-symbol">
            <Sparkles size={28} />
          </span>
          <button className="icon-button" aria-label="Kapat" onClick={onClose}>
            ×
          </button>
        </div>
        <h2 id="how-title">Mutfak Sync Nasıl Çalışır?</h2>
        <p>Tasarımcıların iş akışını bölmeden, arka planda tam veri güvenliği sağlamak üzere tasarlandı.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', margin: '24px 0' }}>
          <div className="ready-card" style={{ margin: 0 }}>
            <ShieldCheck size={26} />
            <div>
              <strong>1. Tek Yönlü Yedekleme Garantisi</strong>
              <span>Veri kaybı riski kesinlikle sıfırdır</span>
              <small>
                Bilgisayarınızdan yerel bir dosya veya klasör silinse dahi Google Drive’daki kopyası hiçbir zaman silinmez.
                İstediğiniz an buluttan geri indirebilirsiniz.
              </small>
            </div>
          </div>

          <div className="ready-card" style={{ margin: 0 }}>
            <Layers size={26} />
            <div>
              <strong>2. Photoshop ve Kilitli Dosya Koruması</strong>
              <span>Büyük PSD ve video kayıtlarında kesinti yaşanmaz</span>
              <small>
                Photoshop, Illustrator veya Premiere projenizi kaydederken dosya kilitlense bile sistem hata vermek yerine
                kaydın bitmesini bekler ve kilit açıldığı an anında yükler.
              </small>
            </div>
          </div>

          <div className="ready-card" style={{ margin: 0 }}>
            <Cloud size={26} />
            <div>
              <strong>3. Akıllı Bildirim ve Arka Plan</strong>
              <span>İşiniz bittiğinde sizi bilgilendirir</span>
              <small>
                Tüm dosyalarınız Google Drive’a aktarıldığında masaüstü bildirimi alırsınız. İnternet kesilirse veya Drive
                kotası dolarsa anlaşılır Türkçe mesajlarla rehberlik eder.
              </small>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="button" onClick={onClose}>
            Anladım
          </button>
          <button className="button primary large" onClick={onStart}>
            <CloudUpload size={16} /> Hemen Başla
          </button>
        </div>
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value, detail }: { icon: typeof Cloud; label: string; value: string; detail: string }) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function PanelTitle({ title, sub, action, onClick }: { title: string; sub?: string; action?: string; onClick?: () => void }) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {action && (
        <button className="text-button" onClick={onClick}>
          {action}
          <ArrowUpRight size={14} />
        </button>
      )}
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: typeof Cloud; text: string }) {
  return (
    <div className="empty">
      <span>
        <Icon size={24} />
      </span>
      <p>{text}</p>
    </div>
  );
}

function ActivityList({ items }: { items: Snapshot['activity'] }) {
  return items.length ? (
    <div className="activity-list">
      {items.map((a, i) => (
        <div key={`${a.at}-${i}`} className="activity-item">
          <span className="activity-check">
            <Check size={14} />
          </span>
          <div>
            <p>{a.message}</p>
            <small>{time(a.at)}</small>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <Empty icon={History} text="Henüz bir aktivite yok. Yedeklemelerin başladığında burada takip edebilirsin." />
  );
}

function FileTable({
  entries,
  empty,
  onRestore,
}: {
  entries: Entry[];
  empty: string;
  onRestore?: (e: Entry) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const visible = entries.filter((e) => ![...collapsed].some((p) => e.path.startsWith(p + '/')));

  return entries.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Dosya adı</th>
            <th>Boyut</th>
            <th>Son yedekleme</th>
            <th>Durum</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((e) => {
            const badge = classifyError(e.error);
            const fmt = getFormatBadge(e.path, e.kind);
            return (
              <tr key={e.path}>
                <td>
                  <span className="file-name" style={{ paddingLeft: Math.min(e.path.split('/').length - 1, 6) * 12 }}>
                    {e.kind === 'directory' ? (
                      <span className="file-icon folder">
                        <button
                          className="icon-button"
                          aria-label={`${e.path} klasörü`}
                          aria-expanded={!collapsed.has(e.path)}
                          onClick={() =>
                            setCollapsed((current) => {
                              const next = new Set(current);
                              if (next.has(e.path)) next.delete(e.path);
                              else next.add(e.path);
                              return next;
                            })
                          }
                        >
                          <ChevronRight
                            size={15}
                            style={{ transform: collapsed.has(e.path) ? undefined : 'rotate(90deg)' }}
                          />
                        </button>
                      </span>
                    ) : (
                      <span className={'format-pill ' + fmt.cls}>{fmt.label}</span>
                    )}
                    <span title={e.path}>{e.path}</span>
                  </span>
                </td>
                <td>{e.kind === 'directory' ? '—' : bytes(e.size)}</td>
                <td>{e.last_success ? time(e.last_success) : '—'}</td>
                <td>
                  <div className="status-cell">
                    <span className={'status ' + e.status}>
                      <span className="dot" />
                      {statuses[e.status] || e.status}
                    </span>
                    {e.status === 'cloud_only' && onRestore && (
                      <button className="icon-button" title="Orijinal konuma geri yükle" onClick={() => onRestore(e)}>
                        <ArrowDownToLine size={15} />
                      </button>
                    )}
                    {badge ? (
                      <span className={'error-badge ' + badge.category} title={badge.detail}>
                        {badge.label}
                      </span>
                    ) : e.error ? (
                      <small className="row-error">{e.error}</small>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty icon={Folder} text={empty} />
  );
}

function SettingsPage({
  initial,
  busy,
  onSave,
  onStart,
  onDiagnostics,
  onReconnect,
  onDisconnect,
  theme,
  setTheme,
  appVersion,
  updateState,
  onCheckUpdate,
  onInstallUpdate,
}: {
  initial: Settings | null;
  busy: boolean;
  onSave: (s: Settings) => Promise<void>;
  onStart: () => void;
  onDiagnostics: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  theme: string;
  setTheme: (s: string) => void;
  appVersion: string;
  updateState: UpdateState;
  onCheckUpdate: () => void;
  onInstallUpdate: () => void;
}) {
  const [s, setS] = useState(initial || defaultSettings);
  const [autoError, setAutoError] = useState('');

  if (!initial) {
    return (
      <section className="panel">
        <Empty icon={SlidersHorizontal} text="Yedekleme ayarlarını belirlemek için ilk kurulumu tamamla." />
        <div className="center-action">
          <button className="button primary" onClick={onStart}>
            Kurulumu başlat
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel settings-panel">
      <PanelTitle title="Ayarlar" sub="Sık kullanılan seçenekler" />
      <div className="settings-row">
        <div>
          <strong>Yedekleme hesabı</strong>
          <p>
            {s.user} → {s.user} PC · {s.mock ? 'Test modu' : 'Google Drive'}
          </p>
          <p>{s.root}</p>
        </div>
        <ShieldCheck size={20} />
      </div>

      <label className="settings-row">
        <div>
          <strong>Bilgisayar açılınca başlat</strong>
          <p>Yedekleme için uygulamayı ayrıca açman gerekmez.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="button"
            onClick={() => {
              void enable().catch((e) => setAutoError(String(e)));
            }}
          >
            Aç
          </button>
          <button
            className="button"
            onClick={() => {
              void disable().catch((e) => setAutoError(String(e)));
            }}
          >
            Kapat
          </button>
        </div>
      </label>
      {autoError && <p className="row-error">{autoError}</p>}

      <label className="settings-row">
        <div>
          <strong>Görünüm</strong>
          <p>Açık, koyu veya bilgisayarının teması.</p>
        </div>
        <select value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="system">Sistem</option>
          <option value="light">Açık</option>
          <option value="dark">Koyu</option>
        </select>
      </label>

      <div className="settings-row">
        <div>
          <strong>Yazılım güncellemesi · v{appVersion}</strong>
          <p>{updateDescription(updateState)}</p>
          {updateState.phase === 'downloading' && (
            <progress max={updateState.total || 1} value={updateState.downloaded || 0} />
          )}
        </div>
        {updateState.phase === 'available' ? (
          <button className="button primary" onClick={onInstallUpdate}>
            İndir ve kur
          </button>
        ) : (
          <button
            className="button"
            disabled={
              updateState.phase === 'checking' ||
              updateState.phase === 'downloading' ||
              updateState.phase === 'installing'
            }
            onClick={onCheckUpdate}
          >
            {updateState.phase === 'checking' ? 'Kontrol ediliyor…' : 'Güncellemeleri kontrol et'}
          </button>
        )}
      </div>

      {!s.mock && (
        <div className="settings-row">
          <div>
            <strong>Google Drive</strong>
            <p>Bağlantıda sorun varsa hesabı yeniden bağla veya bu bilgisayardaki kurulumu sıfırla.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="button" disabled={busy} onClick={onReconnect}>
              Yeniden bağlan
            </button>
            <button className="button danger" disabled={busy} onClick={onDisconnect}>
              Kurulumu sıfırla
            </button>
          </div>
        </div>
      )}

      <details className="advanced-settings">
        <summary>Gelişmiş ayarlar</summary>
        <label className="settings-row">
          <div>
            <strong>Dosya kontrol sıklığı</strong>
            <p>Normal kullanım için 10 dakika önerilir.</p>
          </div>
          <select value={s.scan_secs} onChange={(e) => setS({ ...s, scan_secs: +e.target.value })}>
            <option value={60}>1 dakika</option>
            <option value={600}>10 dakika</option>
            <option value={1800}>30 dakika</option>
          </select>
        </label>
        <label className="settings-row">
          <div>
            <strong>İnternet hızı sınırı</strong>
            <p>Boş bırak: sınırsız. Örnek: 10M</p>
          </div>
          <input
            value={s.bandwidth}
            onChange={(e) => setS({ ...s, bandwidth: e.target.value })}
            placeholder="Sınırsız"
          />
        </label>
        <label className="settings-row">
          <div>
            <strong>Yazılım proje klasörlerini atla</strong>
            <p>node_modules, .git, target ve .next</p>
          </div>
          <input
            type="checkbox"
            checked={s.exclude_dev}
            onChange={(e) => setS({ ...s, exclude_dev: e.target.checked })}
          />
        </label>
        <label className="settings-row">
          <div>
            <strong>Önceki sürümleri ayrıca sakla</strong>
            <p>Daha fazla bulut alanı kullanır; otomatik temizlik yapılmaz.</p>
          </div>
          <input
            type="checkbox"
            checked={s.versions}
            onChange={(e) => setS({ ...s, versions: e.target.checked })}
          />
        </label>
        <div className="settings-row">
          <div>
            <strong>Tanılama raporu</strong>
            <p>Hesap anahtarı ve dosya içeriği bulunmayan teknik rapor.</p>
          </div>
          <button className="button" onClick={onDiagnostics}>
            Dışa aktar
          </button>
        </div>
        <p className="footnote">Dosyalar değişirken 30 saniye beklenir. Otomatik yerel silme kapalıdır.</p>
      </details>

      <div className="settings-save">
        <span>Değişiklikler yalnızca bu bilgisayarı etkiler.</span>
        <button className="button primary" disabled={busy} onClick={() => void onSave(s)}>
          Kaydet
        </button>
      </div>
    </section>
  );
}

function updateDescription(state: UpdateState) {
  if (state.phase === 'available') return `${state.available?.version} sürümü hazır: ${state.available?.notes || ''}`;
  if (state.phase === 'downloading')
    return state.total
      ? `İndiriliyor · %${Math.min(100, Math.round(((state.downloaded || 0) / state.total) * 100))}`
      : 'Güvenli paket indiriliyor…';
  if (state.phase === 'installing') return 'Güncelleme kuruluyor; uygulama yeniden açılacak.';
  if (state.phase === 'checking') return 'Güvenli yayın kanalı kontrol ediliyor.';
  if (state.phase === 'latest') return 'En güncel sürümü kullanıyorsun.';
  if (state.phase === 'error') return state.message || 'Güncelleme kontrol edilemedi.';
  return 'İmzalı kararlı sürümleri otomatik kontrol eder.';
}

function Onboarding({ onClose, onDone }: { onClose: () => void; onDone: (s: Settings, a: boolean) => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [s, setS] = useState(defaultSettings);
  const [auto, setAuto] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const titles = ['Bu bilgisayarı kim kullanıyor?', 'Google Drive’ı bağla', 'Çalışma klasörünü seç', 'Hazırsın'];

  useEffect(() => {
    if (native) void command<string>('default_root').then((root) => setS((v) => ({ ...v, root }))).catch(() => {});
  }, []);

  const next = () => {
    setError('');
    if (step === 1 && !s.mock && !connected) {
      setError('Google Drive bağlantısını tamamla.');
      return;
    }
    if (step === 2 && !s.root) {
      setError('Yerel çalışma klasörünü seç.');
      return;
    }
    setStep(step + 1);
  };

  const selectFolder = async () => {
    try {
      if (!native) throw new Error('Klasör seçimi masaüstü uygulamasında çalışır.');
      const path = await open({ directory: true, multiple: false, title: 'Mutfak Ajans çalışma klasörü' });
      if (typeof path === 'string') setS({ ...s, root: path });
    } catch (e) {
      setError(String(e));
    }
  };

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      await command('connect_drive', { folder: s.folder_id });
      setConnected(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <section className="modal onboarding simple-onboarding" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <div className="modal-top">
          <div className="brand" style={{ padding: 0 }}>
            <img className="brand-logo onboarding-logo" src="/brand/mark.svg" alt="Mutfak Ajans" />
            <div className="brand-text">
              <span className="brand-name">mutfak</span>
              <span className="brand-product">SYNC</span>
            </div>
          </div>
          <button className="icon-button" aria-label="Kurulumu kapat" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="steps">
          {titles.map((_, i) => (
            <span className={i <= step ? 'done' : ''} key={i} />
          ))}
        </div>
        <small className="eyebrow">ADIM {step + 1} / 4</small>
        <h2 id="setup-title">{titles[step]}</h2>

        {step === 0 && (
          <>
            <p>Dosyalar Burak ve Naz için ayrı klasörlerde saklanır.</p>
            <div className="user-options">
              {(['Burak', 'Naz'] as const).map((user) => (
                <button
                  className={s.user === user ? 'selected' : ''}
                  key={user}
                  onClick={() => setS({ ...s, user })}
                >
                  <span className="avatar">{user[0]}</span>
                  <strong>{user}</strong>
                  <small>{user} PC klasörü</small>
                  {s.user === user && <Check size={18} />}
                </button>
              ))}
            </div>
            <div className="simple-note">
              <ShieldCheck size={18} />
              Yerel bir dosyayı silmen Drive’daki yedeği silmez.
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <p>Mutfak Ajans klasörünün Drive bağlantısını yapıştır, sonra Google hesabına bağlan.</p>
            {!s.mock && (
              <>
                <label className="field">
                  Drive klasör bağlantısı
                  <input
                    value={s.folder_id}
                    disabled={connected}
                    onChange={(e) => setS({ ...s, folder_id: e.target.value })}
                    placeholder="https://drive.google.com/drive/folders/…"
                  />
                </label>
                <button
                  className="button primary connect-button"
                  disabled={busy || connected || !s.folder_id}
                  onClick={() => void connect()}
                >
                  {busy ? <Loader2 size={18} className="spin" /> : <ExternalLink size={18} />}
                  {connected ? 'Google Drive bağlandı' : 'Google Drive’a bağlan'}
                </button>
                {busy && (
                  <button
                    className="button"
                    style={{ marginTop: '8px' }}
                    onClick={() => {
                      void command('cancel_drive');
                    }}
                  >
                    İptal et
                  </button>
                )}
                <p className="permission-note">
                  Google geniş Drive izni gösterir. Mutfak Sync kendi işlemlerini seçtiğin Mutfak Ajans klasörüyle sınırlar.
                </p>
              </>
            )}
            <details className="test-mode">
              <summary>Google’a bağlanmadan arayüzü dene</summary>
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={s.mock}
                  onChange={(e) => {
                    setS({ ...s, mock: e.target.checked });
                    setConnected(false);
                  }}
                />
                Test modunu kullan
              </label>
            </details>
          </>
        )}

        {step === 2 && (
          <>
            <p>Yedeklenecek yerel Mutfak Ajans klasörünü seç.</p>
            <label className="field">
              Çalışma klasörü
              <input
                value={s.root}
                readOnly={native}
                onChange={(e) => setS({ ...s, root: e.target.value })}
                placeholder="Henüz klasör seçilmedi"
              />
            </label>
            <button className="button folder-button" onClick={() => void selectFolder()}>
              <Folder size={18} /> Klasör seç
            </button>
            <label className="checkbox-line auto-start">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              Bilgisayar açılınca Mutfak Sync’i başlat
            </label>
            {/onedrive|dropbox|google.?drive|cloudstorage/i.test(s.root) && (
              <div className="alert">
                <AlertCircle size={18} />
                Bu klasör başka bir bulut uygulamasının içinde. Bağımsız bir klasör seç.
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <p>Kurulum tamamlanınca mevcut dosyalar otomatik taranacak.</p>
            <div className="ready-card">
              <CheckCheck size={28} />
              <div>
                <strong>{s.user} PC</strong>
                <span>{s.mock ? 'Test modu' : 'Google Drive / Mutfak Ajans'}</span>
                <small>{s.root}</small>
              </div>
            </div>
            <div className="simple-note">
              <ShieldCheck size={18} />
              Dosyalar değişirken beklenir; yalnızca tamamlanmış kopyalar yedeklendi sayılır.
            </div>
          </>
        )}

        {error && <div className="alert" role="alert">{error}</div>}

        <div className="modal-actions">
          {step > 0 ? (
            <button
              className="button"
              disabled={busy}
              onClick={() => {
                setError('');
                setStep(step - 1);
              }}
            >
              <ArrowLeft size={15} />
              Geri
            </button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <button className="button primary" disabled={busy} onClick={next}>
              Devam et <ChevronRight size={16} />
            </button>
          ) : (
            <button
              className="button primary large"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await onDone(s, auto);
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={16} />} Yedeklemeyi başlat
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

const hubRole = new URLSearchParams(location.search).get('hub');
const HubPortal = React.lazy(() => import('./hub/HubPortal').then((module) => ({ default: module.HubPortal })));

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {hubRole === 'live' ? (
      <React.Suspense fallback={null}>
        <HubPortal />
      </React.Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
