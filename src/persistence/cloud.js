// Optional Supabase connection. Without VITE_SUPABASE_URL and a publishable
// key, Elera runs fully on the device and the Supabase SDK is never loaded.

const env = import.meta.env || {};

export const cloudConfig = Object.freeze({
    url: env.VITE_SUPABASE_URL || '',
    key: env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '',
});

export function isCloudConfigured(config = cloudConfig) {
    return Boolean(config.url && config.key);
}

let clientPromise = null;

export function getSupabaseClient(config = cloudConfig) {
    if (!isCloudConfigured(config)) return Promise.resolve(null);
    if (!clientPromise) {
        clientPromise = import('@supabase/supabase-js').then(({ createClient }) => createClient(config.url, config.key, {
            auth: {
                flowType: 'pkce',
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
            },
        }));
    }
    return clientPromise;
}

export function toAccountUser(user) {
    if (!user) return null;
    const meta = user.user_metadata || {};
    const email = user.email || meta.email || '';
    return {
        id: user.id,
        email,
        name: meta.full_name || meta.name || email.split('@')[0] || 'Student',
        avatarUrl: meta.avatar_url || meta.picture || '',
    };
}

// Published circuits (the `shared_projects` table): anyone with the link id can
// read one through the get_shared_project function; only its owner can add it.
export function createSharedProjects(client) {
    return {
        /** Publishes a copy and resolves to its link id. */
        async publish(name, data) {
            const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
            const { error } = await client.from('shared_projects').insert({ id, name: String(name || 'Untitled circuit').slice(0, 200), data });
            if (error) throw error;
            return id;
        },
        /** Resolves to { name, data }, or null when no circuit has that id. */
        async open(id) {
            const { data, error } = await client.rpc('get_shared_project', { project_id: id });
            if (error) throw error;
            return data?.[0] || null;
        },
    };
}

const toMillis = value => (value ? Date.parse(value) : null);
const toIso = value => (value ? new Date(value).toISOString() : null);
const FETCH_CHUNK = 25;

// Remote side of ProjectLibrary sync, backed by the `projects` table in
// supabase/migrations. Row level security limits every query to the
// signed-in user's own rows.
export function createSupabaseProjectRemote(client, userId) {
    return {
        async listMeta() {
            const { data, error } = await client.from('projects').select('id,name,updated_at,deleted_at');
            if (error) throw error;
            return data.map(row => ({
                id: row.id,
                name: row.name,
                updatedAt: toMillis(row.updated_at),
                deletedAt: toMillis(row.deleted_at),
            }));
        },

        async fetch(ids) {
            const result = new Map();
            for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
                const { data, error } = await client
                    .from('projects')
                    .select('id,name,data,updated_at')
                    .in('id', ids.slice(i, i + FETCH_CHUNK));
                if (error) throw error;
                for (const row of data) {
                    result.set(row.id, { name: row.name, data: row.data, updatedAt: toMillis(row.updated_at) });
                }
            }
            return result;
        },

        async upsert(records) {
            const rows = records.map(record => ({
                owner_id: userId,
                id: record.id,
                name: record.name,
                data: record.deletedAt ? {} : record.data,
                updated_at: toIso(record.updatedAt),
                deleted_at: toIso(record.deletedAt),
            }));
            const { error } = await client.from('projects').upsert(rows, { onConflict: 'owner_id,id' });
            if (error) throw error;
        },
    };
}
