# League Nexus

League Nexus is a unified interactive hub for fantasy-football commissioners and managers to auto-ingest and compare standings, matchups, transactions, drafts, and team analytics across multiple leagues in real time. It offers a freemium model?ad-supported for free users and advanced analytics for premium subscribers?integrating seamlessly with league APIs (e.g., Sleeper).

---

## Table of Contents

1. [Overview](#overview)  
2. [Features](#features)  
3. [Architecture](#architecture)  
4. [Components](#components)  
5. [Dependencies](#dependencies)  
6. [Installation](#installation)  
7. [Configuration](#configuration)  
8. [Usage](#usage)  
9. [Contributing](#contributing)  
10. [License](#license)  

---

## Overview

League Nexus ingests data via public league APIs or webhooks, normalizes and stores it, and exposes real-time dashboards and notifications through a modern microservices stack. Managers and commissioners can:

- View up-to-the-second standings, matchups, transactions, and draft boards  
- Compare cross-conference analytics and premium metrics  
- Receive customizable push notifications on trades, injuries, playoff clinches  
- Manage roles (commissioner vs. manager), billing, and feature flags  

---

## Features

- **Automatic Ingestion & Normalization**: Polls/subscribes to league APIs (Sleeper) and persists to PostgreSQL  
- **Interactive Dashboards**: Standings, matchups, leaderboards, draft boards, transaction history with filters  
- **Cross-Conference Analytics**: Trade ROI, player impact forecasts, advanced premium metrics  
- **Real-Time Notifications**: Push via Firebase Cloud Messaging based on user-defined triggers  
- **Role-Based Access Control**: Granular permissions for commissioners vs. managers  
- **Freemium Billing**: Ad support for free tier; Stripe-powered subscriptions for premium features  
- **Admin Console**: Health metrics, rate-limit management, user support tools  
- **Internationalization & Theming**  
- **CI/CD**: Automated linting, testing, Docker builds, and Kubernetes deployments  

---

## Architecture

- **API Gateway** (Express) ? routes traffic to microservices  
- **Microservices** (Node.js/Express)  
  - Ingestion  
  - Normalization  
  - Analytics  
  - Notifications  
  - Billing  
  - User Management  
- **Datastore**: PostgreSQL (primary), Redis (caching & rate limiting)  
- **Authentication**: Auth0 (OAuth2 / JWT)  
- **Payments**: Stripe webhooks  
- **Push Notifications**: Firebase Cloud Messaging  
- **Containerization**: Docker & Kubernetes  
- **CI/CD**: GitHub Actions  
- **Observability**: ELK Stack (logging), Prometheus/Grafana (metrics), Sentry (error tracking)  

---

## Components

| Component Name        | File                 | Purpose                                                                                 |
|-----------------------|----------------------|-----------------------------------------------------------------------------------------|
| server                | server.js            | Main Express server entrypoint; sets up middleware, routes, DB connection               |
| sleeperclient         | sleeperclient.js     | Wrapper for Sleeper Public API; polling & webhook subscription                          |
| dataingestion         | dataingestion.js     | Normalizes & persists incoming league data into PostgreSQL                              |
| notificationservice   | notificationservice.js | Detects key events and dispatches push notifications via FCM                           |
| analyticsservice      | analyticsservice.js  | Computes aggregated & premium metrics, schedules analytics jobs                         |
| billingservice        | billingservice.js    | Handles Stripe events, subscription creation/cancellation, and plan management          |
| cacheservice          | cacheservice.js      | Redis cache wrapper: set/get/delete with TTL                                            |
| user                  | user.js              | Sequelize model for users (roles, preferences)                                          |
| league                | league.js            | Sequelize model for league metadata & configuration                                      |
| authmiddleware        | authmiddleware.js    | JWT validation & authorization middleware                                               |
| errorhandler          | errorhandler.js      | Global Express error handler                                                            |
| apiclient             | apiclient.js         | Front-end HTTP client (Axios) for backend calls                                         |
| api                   | api.js               | Front-end wrapper: fetchStandings, matchups, transactions, drafts, analytics             |
| matchup               | matchup.js           | Front-end component: render & filter matchups                                           |
| transaction           | transaction.js       | Front-end component: render & filter transactions                                       |
| draft                 | draft.js             | Front-end component: render draft board, update picks                                   |
| main                  | main.js              | Front-end entrypoint: init app, connect services, mount                                |
| store                 | store.js             | Vuex store: state management, actions, mutations                                        |
| router                | router.js            | vue-router: route definitions & guards                                                  |
| node                  | node.js              | Environment & version checker for Node.js                                              |
| vue                   | vue.js               | Vue app bootstrap & global component registration                                       |
| Configuration Files   | `.ini`                | database.ini, server.ini, auth.ini, payment.ini, credentials.ini                        |

---

## Dependencies

- **Runtime**  
  - Node.js v14+  
  - PostgreSQL v12+  
  - Redis v5+  
- **Services & Tools**  
  - Docker & Docker Compose  
  - Kubernetes (kubectl, helm)  
  - Auth0 account  
  - Stripe account  
  - Firebase project (Cloud Messaging)  
- **Dev & CI/CD**  
  - GitHub Actions  
  - ESLint, Prettier  
  - Jest / Mocha (unit & integration tests)  
  - ELK Stack, Prometheus, Grafana, Sentry  

---

## Installation

1. Clone the repository  
   ```bash
   git clone https://github.com/your-org/league_nexus.git
   cd league_nexus
   ```
2. Install server-side dependencies  
   ```bash
   npm install
   ```
3. Install client dependencies  
   ```bash
   cd client
   npm install
   cd ..
   ```
4. Copy & edit configuration files  
   ```bash
   cp config/database.ini.example config/database.ini
   cp config/server.ini.example   config/server.ini
   cp config/auth.ini.example     config/auth.ini
   cp config/payment.ini.example  config/payment.ini
   cp config/credentials.ini.example config/credentials.ini
   # Fill in your DB credentials, Auth0 details, Stripe keys, Firebase creds, etc.
   ```
5. (Optional) Launch with Docker Compose  
   ```bash
   docker-compose up -d
   ```
6. Start development servers  
   ```bash
   # API / microservices
   npm run dev:server
   
   # In a separate shell, front-end
   cd client
   npm run serve
   ```

---

## Usage

### 1. Sign Up & Link League Accounts

- Register/login via Auth0  
- Navigate to **Settings ? League Accounts**  
- Link your Sleeper or other supported league IDs  

### 2. View Dashboards

- **Standings**: `/standings`  
- **Matchups**: `/matchups`  
- **Transactions**: `/transactions`  
- **Draft Board**: `/drafts`  
- **Analytics**: `/analytics`  

### 3. Receive Notifications

- Configure in **Notifications ? Preferences**  
- Events: trades, injuries, playoff clinches  
- Delivered via Firebase push to your device  

### 4. Manage Billing

- Free tier is ad-supported  
- Subscribe to **Premium** via Stripe checkout  
- Manage plans/cancellations under **Account ? Billing**  

### 5. API Endpoints (Example)

```bash
# Fetch standings for league 123
curl -H "Authorization: Bearer $JWT_TOKEN" \
     https://api.leaguenexus.com/leagues/123/standings

# Create a new user (admin only)
curl -X POST -H "Content-Type: application/json" \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"email":"user@example.com","role":"manager"}' \
     https://api.leaguenexus.com/users
```

---

## Contributing

1. Fork the repo & create a feature branch  
2. Follow the existing coding style & run tests  
3. Submit a Pull Request with a clear description  
4. Ensure all CI checks (lint, test, build) pass  

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for more details.

---

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.

---

## Contact & Resources

- Documentation: https://docs.google.com/document/d/1jzXTV_e0uRIzFb54LAoYFx4nEYV2_kAo7-TMfzlsbvw/  
- Issues & Feedback: https://github.com/your-org/league_nexus/issues  
- Team: dev@your-org.com  

Enjoy building and managing your fantasy football universe with League Nexus!