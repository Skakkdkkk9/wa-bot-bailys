import { createCommandHeader } from '../header.js'
import baileys from '@whiskeysockets/baileys'
import sharp from 'sharp'

// Ambil helper dari default import
const { downloadMediaMessage } = baileys

export const { name, aliases, description, usage } = createCommandHeader({
  name: 'stiker',
  aliases: ['sticker', 's'],
  description: 'Ubah gambar jadi stiker (reply atau kirim gambar + .stiker)',
  usage: '.stiker'
})
export const category = 'media'

// Mengunduh media via Baileys jadi Buffer
async function downloadAsBuffer(sock, messageLike) {
  return await downloadMediaMessage(messageLike, 'buffer', {}, { logger: sock?.logger })
}

// Ambil Buffer gambar dari pesan (caption .stiker atau reply gambar)
async function getImageBufferFromMessage(sock, msg) {
  if (msg.message?.imageMessage) {
    return await downloadAsBuffer(sock, msg)
  }
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
  if (quoted?.imageMessage) {
    const fake = { message: { imageMessage: quoted.imageMessage } }
    return await downloadAsBuffer(sock, fake)
  }
  return null
}

// Konversi gambar ke WEBP 512x512
async function toWebpSticker(inputBuffer) {
  return await sharp(inputBuffer)
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer()
}

export async function execute(sock, msg, args, from, ctx) {
  await sock.sendPresenceUpdate('composing', from)
  try {
    const img = await getImageBufferFromMessage(sock, msg)
    if (!img) {
      await sock.sendMessage(
        from,
        { text: `Kirim gambar dengan caption *${ctx.prefix}stiker* atau reply gambar lalu ketik *${ctx.prefix}stiker*.` },
        { quoted: msg }
      )
      return
    }
    const webp = await toWebpSticker(img)
    await sock.sendMessage(from, { sticker: webp }, { quoted: msg })
  } catch (err) {
    ctx?.logger?.error?.('stiker error:', err)
    await sock.sendMessage(from, { text: 'Gagal bikin stiker. Coba gambar lain ya.' }, { quoted: msg })
  } finally {
    await sock.sendPresenceUpdate('paused', from)
  }
}
