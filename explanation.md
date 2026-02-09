# Whatstrax Codebase Analysis

## 1. Project Structure & Summary

**Whatstrax** is a privacy research tool designed to demonstrate how user activity on messaging platforms (WhatsApp and Signal) can be inferred through network timing analysis (RTT - Round Trip Time).

The project is structured as a **monorepo** containing both the backend (Node.js/TypeScript) and frontend (React). It is containerized and designed to be deployed on **Google Cloud Run** using a sidecar architecture.

### Directory Breakdown

- **`/` (Root)**: Backend configuration and source code.
  - `package.json`: Backend dependencies and scripts.
  - `tsconfig.json`: TypeScript configuration (`NodeNext`, `ES2022`).
  - `deploy.sh`: Deployment script for Google Cloud Run.
  - `service.yaml`: Knative/Cloud Run service definition.
  - `Dockerfile`: Backend container image definition.
- **`/src`**: Backend source code.
  - `server.ts`: Main entry point. Sets up Express, Socket.IO, and orchestrates tracking.
  - `tracker.ts`: Core **WhatsApp** tracking logic using `@whiskeysockets/baileys`.
  - `signal-tracker.ts`: **Signal** tracking logic using `signal-cli-rest-api`.
  - `auth.ts`: Authentication setup (Passport Google OAuth).
- **`/client`**: Frontend application.
  - `package.json`: Frontend dependencies (React, TailwindCSS, Socket.IO client).
  - `Dockerfile`: Multi-stage build (Node build -> Nginx serving).
  - `nginx.conf`: Nginx configuration for serving the React app and proxying API requests to the backend.

### Key Configuration Files

- **`service.yaml`**: Defines the Cloud Run service with a **sidecar pattern** (Ingress + Backend) and a **GCS Fuse** volume for persistence.
- **`deploy.sh`**: Automates building images and deploying the service, injecting environment variables like the bucket name.
- **`.env.example`**: Documents required environment variables (`GOOGLE_CLIENT_ID`, `ALLOWED_EMAILS`, etc.).

---

## 2. Core Components & Data Flow

### Architecture: Cloud Run Sidecar

The application runs as a single Cloud Run service with **two containers** in the same pod:

1.  **Ingress (Nginx)**: Listens on port `8080`. Serves the React frontend and proxies `/api`, `/auth`, and `/socket.io` traffic to `localhost:3001`.
2.  **Backend (Node.js)**: Listens on port `3001`. Handles API requests, WebSocket connections, and runs the tracking logic.

### Data Flow

1.  **User Interaction**: User visits the frontend, authenticates via Google OAuth.
2.  **Tracking Command**: User adds a contact via Socket.IO event `add-contact`.
3.  **Backend Processing**:
    - `server.ts` initializes a tracker (`WhatsAppTracker` or `SignalTracker`).
    - **Tracker** sends regular "probes" (silent delete or reaction) to the target JID.
    - **Response Analysis**: The tracker measures the time taken for the probe to be acknowledged (RTT).
    - **State Determination**: Based on RTT (vs. moving average and thresholds), the device is classified as `Online`, `Standby`, or `Offline`.
4.  **Real-time Update**: Findings are pushed back to the frontend via Socket.IO (`tracker-update`).
5.  **Persistence**: Data is saved to `/data/history.json` and `/data/contacts.json`, which maps to a Google Cloud Storage bucket via GCS Fuse.

### Architecture Diagram

```mermaid
graph TD
    User((User))

    subgraph "Cloud Run Pod (Sidecar Pattern)"
        subgraph "Ingress Container (Nginx :8080)"
            Nginx[Nginx Proxy]
            React[React Static Assets]
        end

        subgraph "Backend Container (Node.js :3001)"
            Express[Express Server]
            SocketIO[Socket.IO]
            Trackers[Tracker Logic]
            Baileys[Baileys (WhatsApp)]
            SignalClient[Signal WebSocket Client]
            Passport[Passport Auth]
        end

        Nginx -->|Proxy /api & /socket.io| Express
        Nginx -->|Serve| React
    end

    subgraph "External Services"
        GoogleAuth[Google OAuth]
        SignalAPI[Signal CLI REST API]
        WhatsAppWeb[WhatsApp Web Servers]
        GCS[Google Cloud Storage]
    end

    User -->|HTTPS| Nginx
    Passport -->|Auth| GoogleAuth
    Baileys -->|WS| WhatsAppWeb
    SignalClient -->|WS| SignalAPI
    Express -->|Read/Write /data| GCS

    %% Data Flow
    SocketIO -.->|Updates| User
```

### Core Modules

- **`server.ts`**: The central coordinator. Manages the internal `trackers` Map, handles persistence I/O, and bridges Socket.IO events to tracker instances.
- **`tracker.ts` (WhatsApp)**: Uses `Baileys` to connect to WhatsApp Web API. Implements a probe loop that sends localized messages and interprets `messages.update` events to calculate RTT.
- **`signal-tracker.ts` (Signal)**: Connects to a `signal-cli-rest-api` instance via WebSocket. Uses a serialized probing mechanism (one probe at a time) to ensure accurate RTT measurement.

---

## 3. Dependencies & Roles

| Dependency                        | Role               | Justification                                                                    |
| :-------------------------------- | :----------------- | :------------------------------------------------------------------------------- |
| **`@whiskeysockets/baileys`**     | WhatsApp API       | Allows programmatically interacting with WhatsApp without an official API.       |
| **`express`**                     | Web Server         | Handles HTTP routes and middleware integration.                                  |
| **`socket.io`**                   | Real-time Comm     | Enables bi-directional communication for live RTT graphs and updates.            |
| **`passport` + `google-oauth20`** | Authentication     | Secure user login using Google accounts.                                         |
| **`express-session`**             | Session Mgmt       | Manages user sessions (with MemoryStore).                                        |
| **`nginx` (frontend)**            | Web Server / Proxy | Efficiently serves static React assets and handles routing within the container. |

---

## 4. Flaws, Gaps & Critical Logic

### 🔴 Critical Performance Bottleneck

- **Synchronous File I/O**: `server.ts` calls `saveHistory()` (which uses `fs.writeFileSync`) inside the `tracker.onUpdate` callback. This runs **every time a probe returns a result** (every ~2-3 seconds per user).
  - **Impact**: With multiple tracked users, this will block the event loop, causing high latency and potential crashes.
  - **Fix**: Implement debouncing or use a proper database (SQLite/PostgreSQL).

### 🔴 Concurrency & Persistence Risk

- **GCS Fuse Limitations**: The app relies on a GCS bucket mounted as a file system. GCS is **not a POSIX-compliant file system** and does not support atomic appends or file locking in the way standard databases do.
- **Scaling Constraint**: The `service.yaml` correctly sets `autoscaling.knative.dev/maxScale: "1"`.
  - **Risk**: If this limit is ever removed or increased, multiple instances will overwrite `history.json` and `contacts.json`, leading to immediate **data corruption**.

### 🟠 Memory Leak Potential

- **Unbounded Array Growth**: `server.ts` appends data to `historyCache`. While there is a check `if (historyCache[jid].length > 1000)`, the `historyCache` object governs _all_ sessions and is kept entirely in memory.
- **Signal Tracker**: The `SignalTracker` class doesn't seem to implement the same aggressive cleanup or limits on its internal metrics maps as strictly as it should for long-running processes.

### 🟡 Auth Security

- **Session Store**: Uses `MemoryStore` for sessions.
  - **Implication**: If the container restarts (which Cloud Run does frequently), **all users are logged out**. This is acceptable for a PoC but poor formatting for a production app.

---

## 5. Programming Patterns & Practices

- **Sidecar Pattern**: effectively separates concerns (serving static files vs. api logic) while keeping them logically coupled in deployment.
- **Singleton-ish State**: The `server.ts` file effectively acts as a singleton state manager for all trackers.
- **Event-Driven**: Heavily creates usage of `EventEmitter` patterns (Socket.IO, Baileys events, WebSocket).
- **Defensive Coding**: `signal-tracker.ts` implements "Serialized Probing" to prevent network congestion from skewing RTT results, a smart specific optimization for this use case.

---

## 6. Documentation Gaps

- **`signal-cli-rest-api` Dependency**: The code assumes `SIGNAL_API_URL` points to a valid instance, but there are no instructions or docker-compose setup in this repo to run that dependency. A user cloning this would not be able to run the Signal tracker without external knowledge.
- **Deployment Prerequisites**: The `deploy.sh` assumes a specific Google Cloud setup (Artifact Registry, Permissions) but doesn't list the required IAM roles (e.g., `roles/storage.objectAdmin`, `roles/run.admin`).

---

## Development & Debugging Log

| Change/Attempt Description    | Status                   | Failures Observed              | Actual Root Cause                                 | Fixes & Successful Attempts                                                                                           | Lessons Learned                                                                                                                                               |
| :---------------------------- | :----------------------- | :----------------------------- | :------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Initial Codebase Analysis** | `SUCCESS`                | N/A                            | N/A                                               | Mapped full architecture including the undocumented reliance on GCS Fuse and the critical single-instance constraint. | The `service.yaml` annotation `maxScale: "1"` is the linchpin of this entire architecture. Without it, the file-based persistence strategy fails immediately. |
| **Identified I/O Bottleneck** | `INVESTIGATION_COMPLETE` | `fs.writeFileSync` in hot path | Synchronous disk writes on every WebSocket event. | Flagged for future refactoring (debounce or DB migration).                                                            | File-system based persistence in Node.js is rarely a good idea for high-frequency write workloads, especially on network-attached storage like GCS Fuse.      |
