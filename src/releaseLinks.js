export function releaseUrl(metadata) {
  if (!metadata.url) return null

  return `${metadata.url}/${metadata.commit ? `commit/${metadata.commit}` : `releases/tag/v${metadata.version}`}`
}
