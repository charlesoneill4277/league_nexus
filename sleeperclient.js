const axios = require('axios');
const isEqual = require('lodash.isequal');

class SleeperClient {
  constructor(apiKey = null) {
    this.baseURL = 'https://api.sleeper.app/v1';
    this.axios = axios.create({
      baseURL: this.baseURL
    });
    if (apiKey) {
      this.axios.defaults.headers.common.Authorization = `Bearer ${apiKey}`;
    }
    this.subscriptions = new Map();
  }

  initClient(apiKey) {
    if (apiKey) {
      this.axios.defaults.headers.common.Authorization = `Bearer ${apiKey}`;
    } else {
      delete this.axios.defaults.headers.common.Authorization;
    }
  }

  async fetchLeagueData(leagueId) {
    try {
      const [leagueRes, rostersRes, usersRes, draftsRes, matchupsRes] = await Promise.all([
        this.axios.get(`/league/${leagueId}`),
        this.axios.get(`/league/${leagueId}/rosters`),
        this.axios.get(`/league/${leagueId}/users`),
        this.axios.get(`/league/${leagueId}/drafts`),
        this.axios.get(`/league/${leagueId}/matchups`)
      ]);
      return {
        league: leagueRes.data,
        rosters: rostersRes.data,
        users: usersRes.data,
        drafts: draftsRes.data,
        matchups: matchupsRes.data
      };
    } catch (error) {
      throw new Error(`Error fetching league data (${leagueId}): ${error.message}`);
    }
  }

  subscribeWebhook(leagueId, callback, intervalMs = 60000) {
    if (this.subscriptions.has(leagueId)) {
      throw new Error(`Subscription already exists for league ${leagueId}`);
    }

    let previousData = null;
    let isPolling = false;
    let isSubscribed = true;

    const poll = async () => {
      if (!isSubscribed || isPolling) return;
      isPolling = true;
      try {
        const currentData = await this.fetchLeagueData(leagueId);
        if (previousData && !isEqual(currentData, previousData)) {
          callback(currentData, previousData);
        }
        previousData = currentData;
      } catch (error) {
        console.error(`Polling error for league ${leagueId}:`, error);
      } finally {
        isPolling = false;
      }
      if (isSubscribed) {
        setTimeout(poll, intervalMs);
      }
    };

    poll();

    const subscription = {
      unsubscribe: () => {
        isSubscribed = false;
        this.subscriptions.delete(leagueId);
      }
    };
    this.subscriptions.set(leagueId, subscription);
    return subscription;
  }

  async getUserTeams(userId) {
    try {
      const res = await this.axios.get(`/users/${userId}/teams`);
      return res.data;
    } catch (error) {
      throw new Error(`Error fetching teams for user ${userId}: ${error.message}`);
    }
  }
}

module.exports = SleeperClient;