// file: brat.js
// Kebutuhan: Node 18+ (agar ada fetch global) dan paket "sharp"
// Instal: npm i sharp
import sharp from 'sharp'
import { createCommandHeader } from '../header.js'

/**
 * Header/metadata command
 * - name: nama command
 * - aliases: alias yang didukung
 * - description: deskripsi singkat
 * - usage: contoh penggunaan
 */
export const { name, aliases, description, usage } = createCommandHeader({
  name: 'brat',
  aliases: [],
  description: 'Buat stiker teks background putih',
  usage: '.brat <teks>'
})

/**
 * Kategori command untuk pengelompokan help menu
 */
export const category = 'fun'

/**
 * Mengunduh konten biner dari URL sebagai Buffer, dengan dukungan timeout.
 * @param {string} url - URL sumber gambar.
 * @param {{ timeoutMs?: number }} options - Opsi timeout.
 * @returns {Promise<Buffer>} - Buffer mentah hasil unduhan.
 */
async function fetchImageBuffer(url, { timeoutMs = 20000 } = {}) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const arr = await res.arrayBuffer()
    return Buffer.from(arr)
  } finally {
    clearTimeout(id)
  }
}

/**
 * Mengonversi Buffer gambar (PNG/JPG/SVG dsb) ke WebP 512x512
 * - WhatsApp stiker statis wajib WebP ukuran 512x512.
 * - Kita gunakan "contain" agar teks tidak terpotong, dengan background putih.
 * - Quality diatur 80 agar ukuran tidak terlalu besar namun tetap tajam.
 * @param {Buffer} input - Buffer gambar sumber (PNG dari dummyimage).
 * @returns {Promise<Buffer>} - Buffer WebP siap kirim.
 */
async function toStickerWebp(input) {
  // Pastikan canvas 512x512 putih, teks tetap proporsional (contain).
  return sharp(input)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .webp({
      quality: 80,        // kompromi kualitas vs ukuran
      effort: 4,          // kecepatan kompresi menengah
      nearLossless: false // tidak perlu near-lossless untuk teks
    })
    .toBuffer()
}

/**
 * Eksekusi utama command .brat
 * - Validasi input teks.
 * - Buat gambar teks background putih via dummyimage.
 * - Konversi ke WebP 512x512.
 * - Kirim sebagai stiker.
 * @param {*} sock - instance socket (mis. Baileys).
 * @param {*} msg  - pesan asli yang memicu command.
 * @param {string[]} args - argumen teks setelah command.
 * @param {string} from - JID/target chat.
 * @param {*} ctx  - konteks util (logger, prefix, dll).
 */
export async function execute(sock, msg, args, from, ctx) {
  await sock.sendPresenceUpdate('composing', from)

  const text = args.join(' ').trim()
  if (!text) {
    await sock.sendMessage(
      from,
      { text: `❌ Masukkan teks.\nContoh: *${ctx.prefix}brat malas*` },
      { quoted: msg }
    )
    await sock.sendPresenceUpdate('paused', from)
    return
  }

  try {
    // 1) Bangun URL dummyimage: 512x512, bg putih (ffffff), teks hitam (000), format PNG
    //    Note: dummyimage menerima parameter teks dengan &text= yang sudah di-encode.
    const apiUrl = `https://dummyimage.com/512x512/ffffff/000.png&text=${encodeURIComponent(text)}`

    // 2) Unduh sebagai Buffer (PNG)
    const pngBuffer = await fetchImageBuffer(apiUrl, { timeoutMs: 20000 })

    // 3) Konversi ke WebP 512x512 agar valid sebagai stiker WhatsApp
    const webpBuffer = await toStickerWebp(pngBuffer)

    // 4) Kirim sebagai stiker
    //    Baileys akan mendeteksi tipe dari buffer, tapi kita pastikan ini WebP.
    await sock.sendMessage(
      from,
      { sticker: webpBuffer }, // Tidak perlu set mimetype manual jika buffer valid WebP
      { quoted: msg }
    )
  } catch (err) {
    // Logging error yang ramah
    try {
      ctx?.logger?.error?.('brat error:', err)
    } catch {}
    await sock.sendMessage(
      from,
      { text: '⚠️ Gagal membuat stiker. Coba lagi nanti.' },
      { quoted: msg }
    )
  } finally {
    // Selalu hentikan typing
    await sock.sendPresenceUpdate('paused', from)
  }
}
