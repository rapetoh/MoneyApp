import type { MetadataRoute } from 'next'

const SITE = 'https://itsmurmur.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date('2026-09-20')
  return [
    { url: SITE, lastModified: updated, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/privacy`, lastModified: updated, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE}/terms`, lastModified: updated, changeFrequency: 'monthly', priority: 0.5 },
  ]
}
