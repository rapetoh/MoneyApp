import type { MetadataRoute } from 'next'

/**
 * The dashboard is private and the API is not content; everything else is
 * the marketing site and should be crawled, by search engines and by the
 * AI answer engines that now sit in front of them.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/dashboard/', '/api/', '/auth/'] }],
    sitemap: 'https://itsmurmur.com/sitemap.xml',
    host: 'https://itsmurmur.com',
  }
}
