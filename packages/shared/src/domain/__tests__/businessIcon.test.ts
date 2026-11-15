import { describe, it, expect } from 'vitest'
import {
  BUSINESS_ICONS,
  businessIcon,
  defaultBusinessIcon,
  isBusinessIconKey,
  isBusinessLogo,
} from '../businessIcon'

describe('BUSINESS_ICONS', () => {
  it('is exactly the twelve keys migration 045 accepts', () => {
    expect([...BUSINESS_ICONS]).toEqual([
      'storefront',
      'leaf',
      'book',
      'camera',
      'briefcase',
      'car',
      'restaurant',
      'color-palette',
      'construct',
      'paw',
      'cart',
      'cut',
    ])
  })

  it('guards stored values', () => {
    expect(isBusinessIconKey('leaf')).toBe(true)
    expect(isBusinessIconKey('Leaf')).toBe(false)
    expect(isBusinessIconKey('leaf-outline')).toBe(false)
    expect(isBusinessIconKey(null)).toBe(false)
    expect(isBusinessIconKey(undefined)).toBe(false)
  })
})

describe('defaultBusinessIcon', () => {
  const cases: Array<[string, string]> = [
    // leaf
    ['Farm', 'leaf'],
    ['Hill Farm', 'leaf'],
    ['Community garden', 'leaf'],
    ['Ranch', 'leaf'],
    ['The Orchard', 'leaf'],
    ['Plant nursery', 'leaf'],
    ['Flower stand', 'leaf'],
    // storefront
    ['Antique booth', 'storefront'],
    ['Shop', 'storefront'],
    ['Corner store', 'storefront'],
    ['Antiques', 'storefront'],
    ['Saturday market', 'storefront'],
    ['Boutique', 'storefront'],
    ['Vintage finds', 'storefront'],
    // book
    ['Book', 'book'],
    ['Books', 'book'],
    ['Author income', 'book'],
    ['Writing', 'book'],
    ['Small press', 'book'],
    // camera
    ['Photo', 'camera'],
    ['Wedding photography', 'camera'],
    ['Studio', 'camera'],
    // car
    ['Uber', 'car'],
    ['Lyft', 'car'],
    ['Ride', 'car'],
    ['Rideshare', 'car'],
    ['Driving', 'car'],
    ['Delivery', 'car'],
    ['Courier', 'car'],
    // restaurant
    ['Bake sale', 'restaurant'],
    ['Bakery', 'restaurant'],
    ['Food truck', 'restaurant'],
    ['Catering', 'restaurant'],
    ['Cafe', 'restaurant'],
    ['Ghost kitchen', 'restaurant'],
    ['Private chef', 'restaurant'],
    // color-palette
    ['Design', 'color-palette'],
    ['Art', 'color-palette'],
    ['Paint', 'color-palette'],
    ['Craft', 'color-palette'],
    ['Crafts', 'color-palette'],
    // construct
    ['Repair', 'construct'],
    ['Construction', 'construct'],
    ['Handyman', 'construct'],
    ['Contractor', 'construct'],
    ['Build', 'construct'],
    // paw
    ['Pet sitting', 'paw'],
    ['Dog walking', 'paw'],
    ['Dogs', 'paw'],
    ['Groom', 'paw'],
    ['Grooming', 'paw'],
    // cut
    ['Salon', 'cut'],
    ['Barber', 'cut'],
    ['Hair', 'cut'],
    ['Nails', 'cut'],
    // cart
    ['Etsy', 'cart'],
    ['eBay', 'cart'],
    ['Resale', 'cart'],
    ['Online', 'cart'],
    ['Reseller', 'cart'],
    // briefcase
    ['Consulting', 'briefcase'],
    ['Side gig', 'briefcase'],
    ['', 'briefcase'],
  ]
  it.each(cases)('%s -> %s', (name, icon) => {
    expect(defaultBusinessIcon(name)).toBe(icon)
  })

  it('ignores case', () => {
    expect(defaultBusinessIcon('FARM')).toBe('leaf')
    expect(defaultBusinessIcon('eTsY')).toBe('cart')
  })

  it('matches whole words only', () => {
    expect(defaultBusinessIcon('Farmhouse')).toBe('briefcase')
    expect(defaultBusinessIcon('Bookkeeping')).toBe('briefcase')
    expect(defaultBusinessIcon('Partnership')).toBe('briefcase') // "art" inside
    expect(defaultBusinessIcon('Carpool')).toBe('briefcase')
  })

  it('splits on punctuation and folds accents', () => {
    expect(defaultBusinessIcon('etsy-shop')).toBe('cart')
    expect(defaultBusinessIcon("Machelle's farm")).toBe('leaf')
    expect(defaultBusinessIcon('Café')).toBe('restaurant')
  })

  it('lets the first matching word decide', () => {
    expect(defaultBusinessIcon('Art studio')).toBe('color-palette')
    expect(defaultBusinessIcon('Etsy shop')).toBe('cart')
    expect(defaultBusinessIcon('Book store')).toBe('book')
    expect(defaultBusinessIcon('Hair studio')).toBe('cut')
    expect(defaultBusinessIcon('Garden design')).toBe('leaf')
  })
})

describe('businessIcon', () => {
  it('uses the stored icon when it is a known key', () => {
    expect(businessIcon({ name: 'Farm', icon: 'cart' })).toBe('cart')
  })

  it('falls back to the name when there is no icon or an unknown one', () => {
    expect(businessIcon({ name: 'Farm' })).toBe('leaf')
    expect(businessIcon({ name: 'Farm', icon: null })).toBe('leaf')
    expect(businessIcon({ name: 'Farm', icon: 'tractor' })).toBe('leaf')
  })
})

describe('isBusinessLogo', () => {
  it('accepts the three image data URLs the server stores', () => {
    expect(isBusinessLogo('data:image/jpeg;base64,AAAA')).toBe(true)
    expect(isBusinessLogo('data:image/png;base64,AAAA')).toBe(true)
    expect(isBusinessLogo('data:image/webp;base64,AAAA')).toBe(true)
  })

  it('refuses anything else', () => {
    expect(isBusinessLogo(null)).toBe(false)
    expect(isBusinessLogo(undefined)).toBe(false)
    expect(isBusinessLogo('')).toBe(false)
    expect(isBusinessLogo('https://example.com/logo.png')).toBe(false)
    expect(isBusinessLogo('data:image/gif;base64,AAAA')).toBe(false)
    expect(isBusinessLogo('data:image/jpeg;base64,' + 'A'.repeat(200000))).toBe(false)
  })
})
