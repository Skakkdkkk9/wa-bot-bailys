// commands/gambar.js
// ------------------------------------------------------------
// Command .gambar: buat gambar dari teks menggunakan Pollinations AI.
// Versi ini TIDAK menyertakan caption pada media yang dikirim.
// ------------------------------------------------------------

import { createCommandHeader } from '../header.js'

/**
 * Header/meta command
 */
export const { name, aliases, description, usage } = createCommandHeader({
  name: 'gambar',
  aliases: ['img', 'image', 'gbr'],
  description: 'Buat gambar dari teks dengan AI (Pollinations)',
  usage: '.gambar <teks>'
})

/**
 * Kategori untuk menu help
 */
export const category = 'fun'

/**
 * Mengunduh gambar sebagai Buffer.
 * @param {string} url - URL gambar.
 * @param {{ timeoutMs?: number }} options - Opsi timeout.
 * @returns {Promise<Buffer>}
 */
async function fetchImageBuffer(url, { timeoutMs = 30000 } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const arr = await res.arrayBuffer()
    return Buffer.from(arr)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Membuat URL Pollinations AI dari prompt teks.
 * @param {string} prompt - teks deskripsi gambar.
 * @param {{ w?: number, h?: number }} options - ukuran gambar.
 * @returns {string} - URL API Pollinations AI.
 */
function buildPollinationsUrl(prompt, { w = 768, h = 768 } = {}) {
  const q = encodeURIComponent(prompt)
  return `https://image.pollinations.ai/prompt/${q}?nologo=true&width=${w}&height=${h}`
}

/**
 * Eksekusi command `.gambar`
 * @param {*} sock - koneksi (mis. Baileys)
 * @param {*} msg - pesan sumber
 * @param {string[]} args - argumen setelah command
 * @param {string} from - JID chat
 * @param {*} ctx - konteks util
 */
export async function execute(sock, msg, args, from, ctx) {
  await sock.sendPresenceUpdate('composing', from)

  const raw = args.join(' ').trim()
  if (!raw) {
    await sock.sendMessage(
      from,
      { text: `❌ Masukkan teks.\nContoh: *${ctx.prefix}gambar ayam lucu*` },
      { quoted: msg }
    )
    await sock.sendPresenceUpdate('paused', from)
    return
  }

  try {
    // 1) Bangun URL Pollinations AI
    const url = buildPollinationsUrl(raw, { w: 768, h: 768 })

    // 2) Unduh gambar
    const img = await fetchImageBuffer(url, { timeoutMs: 45000 })

    // 3) Kirim gambar TANPA caption
    await sock.sendMessage(from, { image: img }, { quoted: msg })
  } catch (err) {
    ctx?.logger?.error?.('gambar error:', err)
    await sock.sendMessage(
      from,
      { text: '⚠️ Gagal membuat gambar. Coba lagi dengan teks berbeda.' },
      { quoted: msg }
    )
  } finally {
    await sock.sendPresenceUpdate('paused', from)
  }
}
