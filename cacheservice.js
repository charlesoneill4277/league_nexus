const CacheService = (function() {
  class CacheService {
    constructor() {
      this.store = new Map();
    }

    setCache(key, value, ttl = 0) {
      if (key === undefined || key === null) throw new Error('Cache key must be provided');
      this.deleteCache(key);
      const entry = { value, timer: null };
      if (ttl > 0) {
        const ttlMs = ttl * 1000;
        entry.timer = setTimeout(() => {
          this.deleteCache(key);
        }, ttlMs);
      }
      this.store.set(key, entry);
      return true;
    }

    getCache(key) {
      if (key === undefined || key === null) return null;
      const entry = this.store.get(key);
      return entry ? entry.value : null;
    }

    deleteCache(key) {
      if (key === undefined || key === null) return false;
      const entry = this.store.get(key);
      if (!entry) return false;
      if (entry.timer) clearTimeout(entry.timer);
      this.store.delete(key);
      return true;
    }

    clearCache() {
      const count = this.store.size;
      for (const entry of this.store.values()) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      this.store.clear();
      return count;
    }
  }

  let instance = null;
  return {
    getInstance: function() {
      if (!instance) instance = new CacheService();
      return instance;
    }
  };
})();

module.exports = CacheService.getInstance();