const dns = require('dns');

dns.setDefaultResultOrder('ipv4first');

/**
 * Prefer a direct mongodb:// URI when SRV DNS fails (common on some Windows networks).
 */
function getMongoUri() {
  if (process.env.MONGO_URI_DIRECT) {
    return process.env.MONGO_URI_DIRECT;
  }

  const srv = process.env.MONGO_URI || '';
  if (!srv.startsWith('mongodb+srv://')) {
    return srv;
  }

  try {
    const withoutScheme = srv.replace('mongodb+srv://', '');
    const at = withoutScheme.indexOf('@');
    const slash = withoutScheme.indexOf('/', at);
    if (at < 0 || slash < 0) return srv;

    const creds = withoutScheme.slice(0, at);
    const dbAndQuery = withoutScheme.slice(slash + 1);
    const dbName = dbAndQuery.split('?')[0];

    const hosts = [
      'ac-if5nwof-shard-00-00.kytreht.mongodb.net:27017',
      'ac-if5nwof-shard-00-01.kytreht.mongodb.net:27017',
      'ac-if5nwof-shard-00-02.kytreht.mongodb.net:27017',
    ].join(',');

    return `mongodb://${creds}@${hosts}/${dbName}?ssl=true&replicaSet=atlas-2l74k6-shard-0&authSource=admin`;
  } catch {
    return srv;
  }
}

module.exports = { getMongoUri };
