import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export type AvailableUpdate = {
  version: string
  notes: string
  date?: string
}

let pendingUpdate: Update | null = null

export async function checkForAppUpdate(): Promise<AvailableUpdate | null> {
  if (pendingUpdate) {
    await pendingUpdate.close()
    pendingUpdate = null
  }
  const update = await check({ timeout: 20_000 })
  if (!update) return null
  pendingUpdate = update
  return {
    version: update.version,
    notes: update.body?.trim() || 'Güvenlik, kararlılık ve kullanım iyileştirmeleri.',
    date: update.date,
  }
}

export async function installAppUpdate(
  prepare: () => Promise<boolean>,
  recover: () => Promise<void>,
  onProgress: (downloaded: number, total?: number) => void,
) {
  if (!pendingUpdate) throw new Error('Kurulacak güncelleme bulunamadı.')
  let downloaded = 0
  let total: number | undefined
  await pendingUpdate.download((event: DownloadEvent) => {
    if (event.event === 'Started') total = event.data.contentLength
    if (event.event === 'Progress') downloaded += event.data.chunkLength
    onProgress(downloaded, total)
  }, { timeout: 10 * 60_000 })
  const wasAlreadyPaused = await prepare()
  try {
    await pendingUpdate.install({ restartAfterInstall: true })
    await relaunch()
  } catch (error) {
    if (!wasAlreadyPaused) await recover().catch(() => undefined)
    throw error
  }
}
