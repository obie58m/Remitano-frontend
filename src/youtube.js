/** YouTube thumbnail CDN (hqdefault ≈ 480×360). */
export function youtubeThumbnailUrl(videoId) {
  if (!videoId) return null
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`
}
