import { createSupabaseProjectRemote, getSupabaseClient, isCloudConfigured, toAccountUser } from './cloud.js';
import { projectLibrary } from './project-library.js';

const LEGACY_MOCK_USER_STORAGE_KEY = 'elera_mock_user';

// Signed-in user (Google via Supabase Auth) plus the project library it syncs.
// Emits 'change' whenever the user or sync status changes.
export class AccountService extends EventTarget {
    constructor({ library = projectLibrary, getClient = getSupabaseClient, cloudConfigured = isCloudConfigured() } = {}) {
        super();
        this.library = library;
        this.getClient = getClient;
        this.cloudConfigured = cloudConfigured;
        this.user = null;
        this.authError = '';
        this._client = null;
        this._initPromise = null;
        library.addEventListener('status', () => this.#emit());
    }

    get syncStatus() {
        return this.library.status;
    }

    init() {
        if (!this._initPromise) this._initPromise = this.#init();
        return this._initPromise;
    }

    async #init() {
        try {
            globalThis.localStorage?.removeItem(LEGACY_MOCK_USER_STORAGE_KEY);
        } catch {
            // Old mock sign-in data is harmless if it cannot be removed.
        }
        this.#readAuthErrorFromUrl();
        await this.library.ready();
        if (!this.cloudConfigured) return;
        try {
            this._client = await this.getClient();
        } catch (error) {
            console.warn('[Elera] Cloud sign-in is unavailable:', error);
            this.authError = 'Cloud sign-in could not load. Your projects are still saved on this device.';
            this.#emit();
            return;
        }
        if (!this._client) return;
        // Supabase warns against awaiting its own calls inside this callback,
        // so session handling runs on the next tick.
        this._client.auth.onAuthStateChange((_event, session) => {
            setTimeout(() => this.#applySession(session), 0);
        });
        const { data } = await this._client.auth.getSession();
        await this.#applySession(data?.session || null);
        globalThis.addEventListener?.('online', () => this.library.sync());
        globalThis.document?.addEventListener('visibilitychange', () => {
            if (globalThis.document.visibilityState === 'visible') this.library.sync();
        });
    }

    #readAuthErrorFromUrl() {
        const location = globalThis.location;
        if (!location) return;
        const params = new URLSearchParams(location.search);
        const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
        const description = params.get('error_description') || hash.get('error_description');
        if (!description) return;
        this.authError = `Google sign-in did not finish: ${description}`;
        globalThis.history?.replaceState(null, '', location.pathname);
    }

    async #applySession(session) {
        const user = toAccountUser(session?.user);
        if (user?.id === this.user?.id) {
            if (user) this.user = user;
            this.#emit();
            return;
        }
        if (this.user && !user) {
            this.user = null;
            await this.library.signOut({ sync: false });
        }
        if (user) {
            this.user = user;
            this.authError = '';
            this.#emit();
            await this.library.setAccount(user.id, createSupabaseProjectRemote(this._client, user.id));
        }
        this.#emit();
    }

    async signInWithGoogle() {
        await this.init();
        if (!this._client) return;
        this.authError = '';
        const location = globalThis.location;
        const { error } = await this._client.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${location.origin}${location.pathname}` },
        });
        if (error) {
            this.authError = `Google sign-in could not start: ${error.message}`;
            this.#emit();
        }
    }

    async signOut() {
        if (!this._client || !this.user) return;
        await this.library.signOut();
        this.user = null;
        this.#emit();
        await this._client.auth.signOut();
    }

    syncNow() {
        return this.library.sync();
    }

    #emit() {
        this.dispatchEvent(new CustomEvent('change'));
    }
}

export const accountService = new AccountService();
