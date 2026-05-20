const BROWSE_PATTERN =
  /show\s+(me\s+)?(your\s+)?(all\s+)?(the\s+)?(products?|services?|offerings?|items?|catalog(ue)?)|what\s+(do\s+you\s+)?(sell|offer|have)|list\s+(all\s+)?(products?|services?)|(your\s+)?(products?|services?)\s*\??$|browse|see\s+(the\s+)?(products?|services?|offer|catalog)|view\s+(products?|services?|catalog)/i;

const MORE_PATTERN =
  /show\s+(me\s+)?(more|others?|additional|extra)|^(more|see\s+more|load\s+more|show\s+more)$/i;

const PAGE_SIZE_FIRST = 50;
const PAGE_SIZE_MORE = 8;

function normalizeMessage(message) {
  return message
    .trim()
    .toLowerCase()
    .replace(/srvices/g, 'services')
    .replace(/servics/g, 'services')
    .replace(/servces/g, 'services')
    .replace(/prducts/g, 'products')
    .replace(/prodcuts/g, 'products');
}

function isProductBrowseIntent(message) {
  const m = normalizeMessage(message);
  if (BROWSE_PATTERN.test(m) || MORE_PATTERN.test(m)) return true;
  return /\b(show|list|see|view|display)\b/.test(m) && /\b(product|service|offer|catalog)\b/.test(m);
}

function isLoadMoreIntent(message) {
  return MORE_PATTERN.test(normalizeMessage(message));
}

/** Only filter by category when user explicitly asks for one (not "services" / "products" catalog) */
function getCategoryFilter(message) {
  const m = normalizeMessage(message);
  const wantsCatalog = /\b(products?|services?|catalog|offerings?|items?)\b/.test(m);

  if (wantsCatalog) return null;

  if (/\bsoftware\b/.test(m)) return 'Software';
  if (/\bhardware\b/.test(m)) return 'Hardware';
  if (/\bservice\b/.test(m) && !/\bservices\b/.test(m)) return 'Service';

  return null;
}

function getBrowseQuery(session, message) {
  const isMore = isLoadMoreIntent(message);

  if (!isMore) {
    session.chatBrowseSkip = 0;
    session.chatBrowseCategory = getCategoryFilter(message);
    return {
      filter: session.chatBrowseCategory,
      skip: 0,
      limit: PAGE_SIZE_FIRST,
      isMore: false,
    };
  }

  return {
    filter: session.chatBrowseCategory || null,
    skip: session.chatBrowseSkip || 0,
    limit: PAGE_SIZE_MORE,
    isMore: true,
  };
}

function recordBrowseBatch(session, skip, count) {
  session.chatBrowseSkip = skip + count;
}

function mapProductForChat(p) {
  return {
    id: p._id.toString(),
    name: p.name,
    category: (p.category || 'Service').toUpperCase(),
    price: Number(p.price),
    iconClass: p.iconClass || 'fa-solid fa-tag',
  };
}

function buildIntro({ filter, isMore, count, hasMore }) {
  const noun = filter ? `${filter.toLowerCase()} services` : 'services';
  if (isMore && count === 0) return null;
  if (isMore) return `Here are more ${noun} for you ✦`;
  return `Here are our ${noun} (${count} item${count === 1 ? '' : 's'}) ✦`;
}

module.exports = {
  isProductBrowseIntent,
  isLoadMoreIntent,
  getCategoryFilter,
  getBrowseQuery,
  recordBrowseBatch,
  mapProductForChat,
  buildIntro,
  normalizeMessage,
};
