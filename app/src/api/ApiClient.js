/**
 * GameApiError — typed error for API failures.
 * Carries HTTP status, app error code, and a display-friendly message.
 */
export class GameApiError extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = 'GameApiError';
        this.status = status;
        this.code = code;
    }
}

/**
 * ApiClient — low-level HTTP client for the UNO backend.
 *
 * Handles:
 *  - Base URL configuration
 *  - JWT token storage and auto-attach
 *  - Auto-refresh on 401 (single retry)
 *  - JSON request/response
 *  - Typed error throwing
 *
 * Usage (from login page):
 *   ApiClient.setBaseUrl('https://api.example.com');
 *   await ApiClient.loginWithGoogle(idToken);
 *
 * Usage (from game):
 *   const data = await ApiClient.post('/api/games');
 */
export class ApiClient {
    static BASE_URL = '';
    static accessToken = null;
    static refreshToken = null;

    // ── Configuration ───────────────────────────────────

    static setBaseUrl(url) {
        this.BASE_URL = url.replace(/\/+$/, '');
    }

    static setTokens(access, refresh) {
        this.accessToken = access;
        this.refreshToken = refresh;
    }

    static clearTokens() {
        this.accessToken = null;
        this.refreshToken = null;
    }

    static isAuthenticated() {
        return !!this.accessToken;
    }

    // ── Core Request ────────────────────────────────────

    /**
     * Make an authenticated HTTP request.
     * Automatically retries once on 401 by refreshing the access token.
     *
     * @param {string} method - HTTP method
     * @param {string} path - URL path (e.g. '/api/games')
     * @param {object|null} body - Request body (will be JSON-serialized)
     * @returns {Promise<any>} Parsed JSON response
     * @throws {GameApiError} On HTTP error or network failure
     */
    static async request(method, path, body = null) {
        try {
            const response = await this._fetch(method, path, body);

            // 401 — try refreshing token once
            if (response.status === 401 && this.refreshToken) {
                const refreshed = await this._tryRefresh();
                if (refreshed) {
                    const retryResponse = await this._fetch(method, path, body);
                    return this._handleResponse(retryResponse);
                }
            }

            return this._handleResponse(response);
        } catch (err) {
            if (err instanceof GameApiError) throw err;
            throw new GameApiError(0, 'NETWORK_ERROR', err.message || 'Network request failed');
        }
    }

    static get(path) {
        return this.request('GET', path);
    }

    static post(path, body = null) {
        return this.request('POST', path, body);
    }

    // ── Auth Endpoints (for login page) ─────────────────

    /**
     * Exchange a Google OAuth ID token for app session tokens.
     * Creates account on first login.
     */
    static async loginWithGoogle(idToken) {
        const response = await this._fetch('POST', '/api/auth/google', { idToken });
        const data = await this._handleResponse(response);
        this.setTokens(data.accessToken, data.refreshToken);
        return data.user;
    }

    /**
     * Refresh the access token using the stored refresh token.
     */
    static async refreshAccessToken() {
        const response = await this._fetch('POST', '/api/auth/refresh', {
            refreshToken: this.refreshToken,
        });
        const data = await this._handleResponse(response);
        this.setTokens(data.accessToken, data.refreshToken);
        return data;
    }

    /**
     * Log out and clear tokens.
     */
    static async logout() {
        try {
            await this._fetch('POST', '/api/auth/logout');
        } catch (_) {
            // Best-effort — clear tokens regardless
        }
        this.clearTokens();
    }

    // ── Private Helpers ─────────────────────────────────

    /**
     * Raw fetch call with headers.
     * @private
     */
    static async _fetch(method, path, body = null) {
        const url = `${this.BASE_URL}${path}`;
        const headers = { 'Content-Type': 'application/json' };

        if (this.accessToken) {
            headers['Authorization'] = `Bearer ${this.accessToken}`;
        }

        const options = { method, headers };
        if (body !== null && method !== 'GET') {
            options.body = JSON.stringify(body);
        }

        return fetch(url, options);
    }

    /**
     * Parse response and throw on error status.
     * @private
     */
    static async _handleResponse(response) {
        // 204 No Content
        if (response.status === 204) return null;

        let data;
        try {
            data = await response.json();
        } catch (_) {
            if (!response.ok) {
                throw new GameApiError(response.status, 'PARSE_ERROR', 'Invalid server response');
            }
            return null;
        }

        if (!response.ok) {
            throw new GameApiError(
                response.status,
                data?.code || 'UNKNOWN',
                data?.error || `Request failed with status ${response.status}`
            );
        }

        return data;
    }

    /**
     * Attempt to refresh the access token. Returns true on success.
     * @private
     */
    static async _tryRefresh() {
        try {
            await this.refreshAccessToken();
            return true;
        } catch (_) {
            this.clearTokens();
            return false;
        }
    }
}
