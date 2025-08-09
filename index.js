// index.js
import baileys from '@whiskeysockets/baileys'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import fs from 'fs'
import path from 'path'
import url from 'url'

// Ambil API dari default import (Baileys adalah CommonJS)
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} = baileys

// =========================
// KONFIGURASI DASAR
// =========================
const BOT_NAME = 'Kurumi | Bot'  // nama bot ditampilkan di device info
const PREFIX = '.'               // prefix perintah, contoh: .menu
const SESSION_DIR = './session'  // folder simpan sesi login
const COMMANDS_DIR = './commands'// folder command modular
const DEV_SELF = true            // izinkan memproses pesan dari nomor bot sendiri saat testing

// =========================
// LOGGER
// =========================
const logger = pino({ level: 'debug' })
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true })

/**
 * Mengubah path lokal menjadi file:// URL agar dynamic import stabil di Windows/Linux.
 * Dipakai ketika load modul command secara dinamis.
 */
function toFileUrl(p) {
  const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p)
  return url.pathToFileURL(abs)
}

/**
 * Meload semua command dari folder ./commands (sekali saat start).
 * - Syarat setiap file: export const name = '...'; export async function execute(...)
 * - Optional: aliases, description, usage, category
 * - Return: Map<keyLower, commandModule>
 */
async function loadCommands() {
  const map = new Map()
  try {
    if (!fs.existsSync(COMMANDS_DIR)) {
      logger.warn(`Folder ${COMMANDS_DIR} tidak ditemukan.`)
      return map
    }

    const files = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith('.js'))
    for (const f of files) {
      const fileUrl = toFileUrl(path.join(COMMANDS_DIR, f)).href
      const mod = await import(fileUrl).catch(err => {
        logger.error(`Gagal import ${f}:`, err)
        return null
      })
      if (!mod?.name || typeof mod.execute !== 'function') {
        logger.warn(`Lewati ${f}: butuh export { name, execute }`)
        continue
      }

      const cmdObj = {
        name: String(mod.name).toLowerCase(),
        aliases: Array.isArray(mod.aliases) ? mod.aliases.map(a => String(a).toLowerCase()) : [],
        description: mod.description || '',
        usage: mod.usage || `${PREFIX}${mod.name}`,
        category: mod.category || 'umum',
        execute: mod.execute
      }

      // simpan by name & alias
      map.set(cmdObj.name, cmdObj)
      for (const a of cmdObj.aliases) if (!map.has(a)) map.set(a, cmdObj)

      logger.debug(`Command terload: ${cmdObj.name}${cmdObj.aliases.length ? ` (alias: ${cmdObj.aliases.join(', ')})` : ''}`)
    }

    logger.info(`Total command unik: ${new Set([...map.values()]).size}`)
    return map
  } catch (e) {
    logger.error('Gagal load commands:', e)
    return map
  }
}

/**
 * Mengambil teks dari berbagai tipe isi pesan (chat, caption, button/list reply).
 * Mengembalikan string kosong jika tidak ada teks.
 */
function getTextFromMessage(msg) {
  const m = msg?.message
  if (!m) return ''
  if (m.conversation) return m.conversation
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text
  if (m.imageMessage?.caption) return m.imageMessage.caption
  if (m.videoMessage?.caption) return m.videoMessage.caption
  if (m.buttonsResponseMessage?.selectedButtonId) return m.buttonsResponseMessage.selectedButtonId
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId) return m.listResponseMessage.singleSelectReply.selectedRowId
  return ''
}

/**
 * Menjalankan socket WhatsApp:
 * - Setup auth & versi WA Web
 * - Tampilkan QR di terminal
 * - Pasang router pesan (prefix → command)
 * - Auto-reconnect jika koneksi putus (kecuali logout)
 */
async function startBot() {
  console.log('>> Booting Kurumi | Bot ...')

  // siapkan kredensial multi-file (sesi disimpan ke folder SESSION_DIR)
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)

  // ambil versi WA Web yang kompatibel
  const { version, isLatest } = await fetchLatestBaileysVersion()
  logger.info(`Using WA Web v${version.join('.')} (latest: ${isLatest})`)

  // buat koneksi socket
  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: true,               // tampilkan QR otomatis di terminal
    auth: state,
    browser: [BOT_NAME, 'Desktop', '2.0.0']
  })

  // load command sekali saat start
  const commandMap = await loadCommands()

  // tampilkan QR & status koneksi
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      logger.info('QR tersedia. Scan via WhatsApp > Linked devices.')
      // render versi kecil juga (beberapa terminal lebih jelas)
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
      logger.info('✅ Terhubung ke WhatsApp!')
    } else if (connection === 'close') {
      const code = (lastDisconnect?.error)?.output?.statusCode
      const shouldReconnect = code !== DisconnectReason.loggedOut
      logger.warn(`Koneksi tertutup. code=${code} reconnect=${shouldReconnect}`)
      if (shouldReconnect) startBot()
      else logger.error('Sesi logout. Hapus folder "session/" lalu jalankan ulang.')
    }
  })

  // simpan kredensial saat ada perubahan
  sock.ev.on('creds.update', saveCreds)

  /**
   * Router pesan:
   * - Terima pesan baru
   * - (opsional) izinkan self message saat DEV_SELF
   * - Cek prefix & parse command + args
   * - Jalankan execute() jika ketemu
   */
  sock.ev.on('messages.upsert', async ({ type, messages }) => {
    try {
      if (type !== 'notify') return
      const msg = messages?.[0]
      if (!msg?.message) return

      // filter pesan dari nomor bot sendiri (aktifkan saat DEV_SELF=true untuk testing)
      if (msg.key.fromMe && !DEV_SELF) return

      const from = msg.key.remoteJid
      const text = getTextFromMessage(msg).trim()

      logger.debug('Pesan masuk:', { from, fromMe: msg.key.fromMe, text })

      if (!text || !text.startsWith(PREFIX)) return

      const parts = text.slice(PREFIX.length).trim().split(/\s+/)
      const cmdKey = (parts.shift() || '').toLowerCase()
      const args = parts

      const cmd = commandMap.get(cmdKey)
      logger.debug('Command match:', cmdKey, !!cmd)
      if (!cmd) return

      // siapkan konteks tambahan untuk command
      const ctx = {
        prefix: PREFIX,
        commands: new Set([...commandMap.values()]),
        logger
      }

      await cmd.execute(sock, msg, args, from, ctx)
    } catch (err) {
      logger.error('Router error:', err)
    }
  })
}

// tangkap error global agar tidak “senyap”
process.on('unhandledRejection', (reason) => console.error('UNHANDLED REJECTION:', reason))
process.on('uncaughtException', (err) => console.error('UNCAUGHT EXCEPTION:', err))

// mulai bot
startBot().catch((e) => {
  console.error('Gagal start bot:', e)
  process.exit(1)
})
