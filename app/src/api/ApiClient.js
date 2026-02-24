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
    static username = null;

    // ── Configuration ───────────────────────────────────

    static setBaseUrl(url) {
        this.BASE_URL = url.replace(/\/+$/, '');
    }

    static setTokens(access, refresh) {
        this.accessToken = access;
        this.refreshToken = refresh;
        try {
            localStorage.setItem('uno_access_token', access || '');
            localStorage.setItem('uno_refresh_token', refresh || '');
        } catch (_) { /* storage unavailable */ }
    }

    static clearTokens() {
        this.accessToken = null;
        this.refreshToken = null;
        this.username = null;
        try {
            localStorage.removeItem('uno_access_token');
            localStorage.removeItem('uno_refresh_token');
            localStorage.removeItem('uno_username');
        } catch (_) { /* storage unavailable */ }
    }

    /**
     * Restore tokens from localStorage (survives page refresh).
     * Returns true if tokens were found.
     */
    static restoreTokens() {
        try {
            const access = localStorage.getItem('uno_access_token');
            const refresh = localStorage.getItem('uno_refresh_token');
            const username = localStorage.getItem('uno_username');
            if (access) {
                this.accessToken = access;
                this.refreshToken = refresh;
                this.username = username;
                return true;
            }
        } catch (_) { /* storage unavailable */ }
        return false;
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
            const message = err.name === 'AbortError'
                ? 'Request timed out — check your connection'
                : (err.message || 'Network request failed');
            throw new GameApiError(0, 'NETWORK_ERROR', message);
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
     * Log in with email and password.
     * @returns {object} User profile data
     */
    static async login(email, password) {
        const data = await this.request('POST', '/api/auth/login', { email, password });
        this.setTokens(data.tokens.access_token, data.tokens.refresh_token);
        this._saveUsername(data.user.username);
        return data.user;
    }

    /**
     * Register a new account.
     * @returns {object} User profile data
     */
    static async register(email, password, username) {
        const data = await this.request('POST', '/api/auth/register', { email, password, username });
        this.setTokens(data.tokens.access_token, data.tokens.refresh_token);
        this._saveUsername(data.user.username);
        return data.user;
    }

    /**
     * Refresh the access token using the stored refresh token.
     */
    static async refreshAccessToken() {
        const response = await this._fetch('POST', '/api/auth/refresh', {
            refresh_token: this.refreshToken,
        });
        const data = await this._handleResponse(response);
        this.setTokens(data.access_token, data.refresh_token);
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

    static _saveUsername(name) {
        this.username = name;
        try { localStorage.setItem('uno_username', name || ''); } catch (_) { /* */ }
    }

    /**
     * Raw fetch call with headers.
     * @private
     */
    static REQUEST_TIMEOUT = 5_000; // 5 seconds

    static async _fetch(method, path, body = null) {
        const url = `${this.BASE_URL}${path}`;
        const headers = { 'Content-Type': 'application/json' };

        if (this.accessToken) {
            headers['Authorization'] = `Bearer ${this.accessToken}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

        const options = { method, headers, signal: controller.signal };
        if (body !== null && method !== 'GET') {
            options.body = JSON.stringify(body);
        }

        try {
            return await fetch(url, options);
        } finally {
            clearTimeout(timeoutId);
        }
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
