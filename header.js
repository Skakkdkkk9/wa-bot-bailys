export function createCommandHeader({ name, aliases = [], description = '', usage = '' }) {
  if (!name || typeof name !== 'string') {
    throw new Error('createCommandHeader: "name" wajib berupa string.')
  }

  const aliasArr = Array.isArray(aliases) ? aliases : [aliases]
  const aliasClean = [...new Set(
    aliasArr
      .filter(a => typeof a === 'string')
      .map(a => a.trim())
      .filter(Boolean)
      .map(a => a.toLowerCase())
  )].filter(a => a !== name.toLowerCase())

  const desc = typeof description === 'string' ? description.trim() : ''
  const use = typeof usage === 'string' ? usage.trim() : `.${name}`

  return {
    name: name.toLowerCase(),
    aliases: aliasClean,
    description: desc,
    usage: use
  }
}
