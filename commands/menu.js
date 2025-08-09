import fs from 'fs'
import { createCommandHeader } from '../header.js'

export const { name, aliases, description, usage } = createCommandHeader({
  name: 'menu',
  aliases: ['help', 'h'],
  description: 'Tampilkan menu sebagai video + caption',
  usage: '.menu'
})
export const category = 'main'

const LOCAL_VIDEO = './assets/menu.mp4' // letakkan video di sini

function greet() {
  const h = new Date().getHours()
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'
}
function uptimeText(s) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const d = Math.floor(s % 60)
  return [h ? `${h}j` : null, m ? `${m}m` : null, `${d}d`].filter(Boolean).join(' ')
}

export async function execute(sock, msg, args, from, ctx) {
  await sock.sendPresenceUpdate('composing', from)

  const at = msg.key.participant || from
  const tag = `@${(at.split('@')[0] || '').trim()}`
  const totalFitur = new Set(Array.from(ctx.commands).map(c => c.name)).size

  const has = (cmd) => Array.from(ctx.commands).some(c => c.name?.toLowerCase() === cmd)

  const mainMenu = [
    '╭─〔 📜 MAIN MENU 〕',
    '│👑 .brat',
    '│🎨 .stiker',
    '│🖼️ .gambar',
    '│🐾 .neko',
    '│🎞️ .neko gif',
    '╰────────────────'
  ].join('\n')

  const groupItems = [
    has('tagall') && '│📣 .tagall'
    // tambahkan item lain di sini jika nanti kamu buat: .antilink, .welcome, dll.
  ].filter(Boolean)

  const groupMenu = groupItems.length
    ? ['\n╭─〔 👥 GROUP MENU 〕', ...groupItems, '╰────────────────'].join('\n')
    : '' // sembunyikan jika belum ada command grup

  const caption = `
${greet()} ${tag} 👋
*Kurumi | Bot*

╭─〔 🤖 BOT INFO 〕
│🏷️ Nama Bot  : Kurumi | Bot
│🌐 Mode      : Public
│🛠️ Versi     : 2.0.0
│👨‍💻 Developer: Arya Official
│⌛ Runtime   : ${uptimeText(process.uptime())}
│📊 Total Fitur: ${totalFitur}
╰────────────────

${mainMenu}${groupMenu}

💡 Tip: Kirim gambar + caption *.stiker* untuk langsung jadi stiker.
`.trim()

  try {
    let vid = null
    if (fs.existsSync(LOCAL_VIDEO)) vid = fs.readFileSync(LOCAL_VIDEO)

    if (vid) {
      await sock.sendMessage(from, { video: vid, caption, mentions: [at] }, { quoted: msg })
    } else {
      await sock.sendMessage(from, { text: caption, mentions: [at] }, { quoted: msg })
    }
  } catch (err) {
    ctx?.logger?.error?.('menu video error:', err)
    await sock.sendMessage(from, { text: caption, mentions: [at] }, { quoted: msg })
  } finally {
    await sock.sendPresenceUpdate('paused', from)
  }
}
