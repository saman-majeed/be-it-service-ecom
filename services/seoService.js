const SiteSeo = require('../models/SiteSeo');
const Backlink = require('../models/Backlink');
const ParasiteCampaign = require('../models/ParasiteCampaign');
const Product = require('../models/Product');

function getBaseUrl(req, settings) {
  if (settings?.canonicalBaseUrl) {
    return settings.canonicalBaseUrl.replace(/\/$/, '');
  }
  if (process.env.SITE_URL) {
    return process.env.SITE_URL.replace(/\/$/, '');
  }
  if (req) {
    return `${req.protocol}://${req.get('host')}`;
  }
  return 'http://localhost:3000';
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function getSiteSettings() {
  return SiteSeo.getSettings();
}

function applyPageSeo(res, { title, description, keywords, canonical, ogType, jsonLd, noindex }) {
  if (title) res.locals.seoTitle = title;
  if (description) res.locals.seoDesc = description;
  if (keywords) res.locals.seoKeywords = keywords;
  if (canonical) res.locals.seoCanonical = canonical;
  if (ogType) res.locals.seoOgType = ogType;
  if (jsonLd) res.locals.seoJsonLd = jsonLd;
  if (noindex != null) res.locals.seoNoindex = noindex;
}

async function loadSeoGlobals(req, res, next) {
  try {
    const settings = await getSiteSettings();
    const baseUrl = getBaseUrl(req, settings);
    res.locals.siteSeo = settings;
    res.locals.seoBaseUrl = baseUrl;
    res.locals.seoTitle = settings.homeTitle || settings.defaultTitle;
    res.locals.seoDesc = settings.homeDescription || settings.defaultDescription;
    res.locals.seoKeywords = settings.defaultKeywords;
    res.locals.seoCanonical = `${baseUrl}${req.path === '/' ? '' : req.path}`;
    res.locals.seoOgType = 'website';
    res.locals.seoOgImage = settings.ogImage?.startsWith('http')
      ? settings.ogImage
      : `${baseUrl}${settings.ogImage || '/images/og-default.jpg'}`;
    res.locals.seoNoindex = !settings.allowIndexing;
    res.locals.seoJsonLd = settings.enableJsonLd
      ? [buildOrganizationJsonLd(settings, baseUrl), buildWebSiteJsonLd(settings, baseUrl)]
      : null;

    res.locals.footerBacklinks = await Backlink.find({
      status: 'active',
      showOnFooter: true,
    })
      .sort({ partnerName: 1 })
      .limit(12)
      .lean();
  } catch (err) {
    console.error('SEO middleware error:', err.message);
  }
  next();
}

function buildOrganizationJsonLd(settings, baseUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: settings.siteName,
    url: baseUrl,
    description: settings.defaultDescription,
  };
}

function buildWebSiteJsonLd(settings, baseUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: settings.siteName,
    url: baseUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${baseUrl}/?category={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

function buildProductJsonLd(product, baseUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.metaDescription || product.description,
    category: product.category,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'USD',
      price: product.price,
      availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: `${baseUrl}/product/${product._id}`,
    },
  };
}

async function buildSitemapXml(baseUrl) {
  const products = await Product.find().select('_id updatedAt').lean();
  const staticPaths = [
    { loc: '/', priority: '1.0', changefreq: 'daily' },
    { loc: '/resources', priority: '0.7', changefreq: 'weekly' },
    { loc: '/checkout', priority: '0.5', changefreq: 'monthly' },
    { loc: '/my-orders', priority: '0.4', changefreq: 'monthly' },
  ];

  const urls = [
    ...staticPaths.map((p) => ({
      loc: `${baseUrl}${p.loc}`,
      priority: p.priority,
      changefreq: p.changefreq,
    })),
    ...products.map((p) => ({
      loc: `${baseUrl}/product/${p._id}`,
      lastmod: (p.updatedAt || new Date()).toISOString().split('T')[0],
      priority: '0.8',
      changefreq: 'weekly',
    })),
  ];

  const body = urls
    .map(
      (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq || 'weekly'}</changefreq>
    <priority>${u.priority || '0.5'}</priority>
  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}

function buildRobotsTxt(baseUrl, allowIndexing) {
  if (!allowIndexing) {
    return `User-agent: *\nDisallow: /\n`;
  }
  return `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /checkout
Disallow: /payment

Sitemap: ${baseUrl}/sitemap.xml
`;
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || `link-${Date.now()}`;
}

function buildTrackedUrl(baseUrl, slug) {
  return `${baseUrl}/out/${slug}`;
}

function appendUtm(url, { source, medium, campaign }) {
  try {
    const u = new URL(url, 'http://placeholder.local');
    if (source) u.searchParams.set('utm_source', source);
    if (medium) u.searchParams.set('utm_medium', medium);
    if (campaign) u.searchParams.set('utm_campaign', campaign);
    const base = url.startsWith('http') ? '' : 'http://placeholder.local';
    if (base) return u.pathname + u.search;
    return u.toString();
  } catch {
    return url;
  }
}

module.exports = {
  getSiteSettings,
  getBaseUrl,
  applyPageSeo,
  loadSeoGlobals,
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
  buildProductJsonLd,
  buildSitemapXml,
  buildRobotsTxt,
  slugify,
  buildTrackedUrl,
  appendUtm,
  Backlink,
  ParasiteCampaign,
};
