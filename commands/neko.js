// commands/neko.js
// ------------------------------------------------------------
// Command .neko: kirim gambar neko (SFW). Opsional "gif" untuk animasi.
// Versi ini TIDAK menyertakan caption pada pesan media yang dikirim.
// ------------------------------------------------------------

import { createCommandHeader } from '../header.js'

/**
 * Header/meta command
 * - name: nama perintah
 * - aliases: daftar alias (kosong)
 * - description: deskripsi singkat
 * - usage: contoh penggunaan
 */
export const { name, aliases, description, usage } = createCommandHeader({
  name: 'neko',
  aliases: [],
  description: 'Kirim gambar neko (SFW). Tambahkan "gif" untuk animasi.',
  usage: '.neko [gif]'
})

/**
 * Kategori untuk pengelompokan di menu bantuan
 */
export const category = 'fun'

/**
 * Mengambil JSON dari sebuah endpoint dengan dukungan timeout.
 * Dipakai untuk memanggil API yang mengembalikan metadata URL gambar.
 *
 * @param {string} url - URL endpoint JSON
 * @param {{ timeoutMs?: number }} options - Opsi timeout (ms)
 * @returns {Promise<any>} - Objek hasil parse JSON
 */
async function fetchJson(url, { timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(id)
  }
}

/**
 * Mengambil media biner (gambar/GIF) dan mengembalikan buffer + content-type.
 * Ini penting untuk mendeteksi apakah file adalah GIF animasi.
 *
 * @param {string} url - URL file media
 * @param {{ timeoutMs?: number }} options - Opsi timeout (ms)
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
async function fetchMedia(url, { timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const contentType = res.headers.get('content-type') || ''
    const arr = await res.arrayBuffer()
    return { buffer: Buffer.from(arr), contentType }
  } finally {
    clearTimeout(id)
  }
}

/**
 * Menentukan apakah URL/Content-Type menunjukkan file GIF.
 *
 * @param {string} url - URL sumber media
 * @param {string} [contentType] - Header Content-Type (opsional)
 * @returns {boolean} - true jika GIF
 */
function isGif(url, contentType = '') {
  return /\.gif(\?|$)/i.test(String(url)) || /image\/gif/i.test(String(contentType))
}

/**
 * Eksekusi utama command `.neko` / `.neko gif`
 * Alur:
 * 1) Tampilkan status "mengetik".
 * 2) Tentukan apakah user minta GIF.
 * 3) Coba ambil dari nekos.best (punya peluang GIF), jika gagal jatuh ke waifu.pics.
 * 4) Unduh media dan deteksi GIF.
 * 5) Kirim ke chat TANPA caption (sesuai permintaan).
 * 6) Tangani error dengan pesan teks sederhana.
 *
 * @param {*} sock - instance koneksi (mis. Baileys)
 * @param {*} msg - pesan asal
 * @param {string[]} args - argumen setelah command
 * @param {string} from - JID chat tujuan
 * @param {*} ctx - konteks (logger, prefix, dll)
 */
export async function execute(sock, msg, args, from, ctx) {
  await sock.sendPresenceUpdate('composing', from)

  // Apakah user menulis ".neko gif"
  const wantGif = (args[0] || '').toLowerCase() === 'gif'

  // Endpoint sumber gambar
  const WAIFU_PICS = 'https://api.waifu.pics/sfw/neko'
  const NEKOS_BEST = 'https://nekos.best/api/v2/neko'

  try {
    let imageUrl = null

    // 1) Jika user minta GIF, coba dari nekos.best (kadang sedia GIF)
    if (wantGif) {
      const data = await fetchJson(NEKOS_BEST)
      const items = Array.isArray(data?.results) ? data.results : []
      const gifItem = items.find(it => typeof it.url === 'string' && /\.gif(\?|$)/i.test(it.url))
      const any = items[0]?.url
      imageUrl = gifItem?.url || any || null
    }

    // 2) Jika belum dapat URL, fallback ke waifu.pics (biasanya gambar statis)
    if (!imageUrl) {
      const data = await fetchJson(WAIFU_PICS)
      imageUrl = data?.url || null
    }

    // 3) Jika tetap tidak ada URL, sampaikan kegagalan sederhana (teks)
    if (!imageUrl) {
      await sock.sendMessage(from, { text: 'Maaf, gagal mengambil gambar neko. Coba lagi ya.' }, { quoted: msg })
      return
    }

    // 4) Unduh media & deteksi apakah benar-benar GIF
    const { buffer, contentType } = await fetchMedia(imageUrl)
    const animated = wantGif && isGif(imageUrl, contentType)

    // 5) Kirim media TANPA caption apa pun
    if (animated) {
      // Kirim sebagai video dengan gifPlayback agar tampil seperti GIF di WhatsApp
      await sock.sendMessage(from, { video: buffer, gifPlayback: true }, { quoted: msg })
    } else {
      // Kirim sebagai gambar statis
      await sock.sendMessage(from, { image: buffer }, { quoted: msg })
    }
  } catch (err) {
    // Logging internal + fallback pesan error sederhana (teks)
    ctx?.logger?.error?.('neko error:', err)
    await sock.sendMessage(from, { text: 'Terjadi kesalahan saat mengambil gambar. Coba lagi nanti.' }, { quoted: msg })
  } finally {
    // 6) Hentikan status mengetik
    await sock.sendPresenceUpdate('paused', from)
  }
}
