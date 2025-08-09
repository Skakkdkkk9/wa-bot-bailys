import { createCommandHeader } from '../header.js'

export const { name, aliases, description, usage } = createCommandHeader({
  name: 'tagall',
  aliases: ['all', 'mentionall'],
  description: 'Tag semua anggota grup',
  usage: '.tagall'
})
export const category = 'group'

export async function execute(sock, msg, args, from, ctx) {
  try {
    const meta = await sock.groupMetadata(from).catch(() => null)
    if (!meta) {
      await sock.sendMessage(from, { text: 'Perintah ini hanya bisa digunakan di grup.' }, { quoted: msg })
      return
    }

    const text = args.length ? args.join(' ') : '📢 Tag semua member grup!'
    const mentions = meta.participants.map(p => p.id)

    const list = meta.participants.map((p, i) => `${i + 1}. @${p.id.split('@')[0]}`).join('\n')

    const caption = `*${meta.subject}*\n${text}\n\n${list}`

    await sock.sendMessage(from, {
      text: caption,
      mentions
    }, { quoted: msg })

  } catch (err) {
    ctx?.logger?.error?.('tagall error:', err)
    await sock.sendMessage(from, { text: 'Gagal melakukan tagall.' }, { quoted: msg })
  }
}
