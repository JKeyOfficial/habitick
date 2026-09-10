import { supabase } from './supabase.js';
import { encryptText, decryptText } from './crypto.js';

const DOCS_CACHE_KEY = 'ht_docs_cache';
const SYNC_QUEUE_KEY = 'ht_docs_sync_queue';
export const WELCOME_DOC_ID = 'd0c50000-0000-4000-a000-000000000001';

export const DEFAULT_WELCOME_CONTENT = `Your fast, lightweight, distraction-free notes companion.

### Why Anti-Google Docs & Anti-Notion?
Google Docs has 100+ menus you never touch. Notion has sluggish nested databases and complex block popups.

HabiTick Docs gives you pure writing speed:
- Offline First: Write in lectures or on the subway with zero WiFi. All edits save locally and auto-sync when you reconnect.
- Student Ready: Use the starter templates in the sidebar for Lecture Notes, Exam Revision sheets, Essay Outlines, and Study Sprints.
- Fast Formatting: Type # for headings, - for bullet points, and - [ ] for checklists.

Click "+ New Note" or choose a starter template from the sidebar to begin.`;

/**
 * Get all cached docs from localStorage (deduplicating any accidental copies)
 */
export function getLocalDocs() {
  try {
    const raw = localStorage.getItem(DOCS_CACHE_KEY);
    const docs = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(docs)) return [];

    const seenIds = new Set();
    let seenWelcome = false;
    const clean = [];

    for (const d of docs) {
      if (!d || !d.id) continue;
      const id = d.id === 'welcome-doc' ? WELCOME_DOC_ID : d.id;
      if (seenIds.has(id)) continue;

      if (d.title === 'Welcome to HabiTick Docs') {
        if (seenWelcome) continue;
        seenWelcome = true;
      }

      seenIds.add(id);
      clean.push({ ...d, id });
    }

    if (clean.length !== docs.length) {
      localStorage.setItem(DOCS_CACHE_KEY, JSON.stringify(clean));
    }
    return clean;
  } catch (e) {
    console.error('Error reading local docs cache:', e);
    return [];
  }
}

/**
 * Save docs to local cache
 */
export function saveLocalDocs(docs) {
  try {
    localStorage.setItem(DOCS_CACHE_KEY, JSON.stringify(docs));
  } catch (e) {
    console.error('Error saving local docs cache:', e);
  }
}

/**
 * Get pending sync queue
 */
export function getSyncQueue() {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    const queue = raw ? JSON.parse(raw) : {};
    if (queue['welcome-doc']) {
      delete queue['welcome-doc'];
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    }
    return queue;
  } catch (e) {
    return {};
  }
}

/**
 * Add an item to the sync queue
 */
export function queueSync(doc, action = 'upsert') {
  if (!doc || !doc.id) return;
  const docId = doc.id === 'welcome-doc' ? WELCOME_DOC_ID : doc.id;
  const queue = getSyncQueue();
  queue[docId] = {
    doc: { ...doc, id: docId },
    action,
    updated_at: doc.updated_at || new Date().toISOString()
  };
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Push a single document to Supabase without pulling the remote database.
 * Highly optimized for active typing sessions to save bandwidth and API quota.
 */
export async function pushDocToSupabase(doc, userId, onStatusChange) {
  if (!userId || !doc || !doc.id) return false;
  if (!navigator.onLine) {
    if (onStatusChange) onStatusChange('offline_saved');
    return false;
  }

  try {
    let docId = doc.id === 'welcome-doc' ? WELCOME_DOC_ID : doc.id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(docId)) {
      docId = WELCOME_DOC_ID;
    }

    const [encryptedTitle, encryptedContent] = await Promise.all([
      encryptText(doc.title || '', userId),
      encryptText(doc.content || '', userId)
    ]);

    const payload = {
      id: docId,
      user_id: userId,
      title: encryptedTitle,
      content: encryptedContent,
      tag: doc.tag || 'General',
      is_pinned: Boolean(doc.is_pinned),
      is_archived: Boolean(doc.is_archived),
      word_count: doc.word_count || 0,
      updated_at: doc.updated_at || new Date().toISOString()
    };

    const { error } = await supabase
      .from('docs')
      .upsert(payload, { onConflict: 'id' });

    if (error) throw error;

    // Remove from offline queue since it was successfully persisted
    const queue = getSyncQueue();
    if (queue[docId]) {
      delete queue[docId];
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    }

    if (onStatusChange) onStatusChange('synced');
    return true;
  } catch (err) {
    console.warn('pushDocToSupabase error:', err);
    if (onStatusChange) {
      if (!navigator.onLine) {
        onStatusChange('offline_saved');
      } else if (err?.code === 'PGRST205' || err?.message?.includes('Could not find the table')) {
        onStatusChange('table_missing');
      } else {
        onStatusChange('sync_error');
      }
    }
    return false;
  }
}

/**
 * Delete a single document directly from Supabase.
 */
export async function deleteDocFromSupabase(docId, userId) {
  if (!userId || !docId) return;
  if (!navigator.onLine) return;

  try {
    await supabase
      .from('docs')
      .delete()
      .eq('id', docId)
      .eq('user_id', userId);

    const queue = getSyncQueue();
    if (queue[docId]) {
      delete queue[docId];
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    }
  } catch (err) {
    console.warn('deleteDocFromSupabase error:', err);
  }
}

let isSyncInProgress = false;

/**
 * Flush all pending offline changes to Supabase and pull newest remote version
 */
export async function syncWithSupabase(userId, onStatusChange) {
  if (!userId) {
    if (onStatusChange) onStatusChange('guest');
    return getLocalDocs();
  }

  if (!navigator.onLine) {
    if (onStatusChange) onStatusChange('offline_saved');
    return getLocalDocs();
  }

  // Mutex lock: Prevent overlapping concurrent syncs from creating duplicate rows
  if (isSyncInProgress) {
    return getLocalDocs();
  }
  isSyncInProgress = true;

  if (onStatusChange) onStatusChange('syncing');

  try {
    const queue = getSyncQueue();
    const queueKeys = Object.keys(queue);

    // 1. Push pending offline changes first
    if (queueKeys.length > 0) {
      for (const id of queueKeys) {
        const item = queue[id];
        try {
          if (item.action === 'delete') {
            await supabase.from('docs').delete().eq('id', id).eq('user_id', userId);
          } else if (item.action === 'upsert' && item.doc) {
            let docId = item.doc.id === 'welcome-doc' ? WELCOME_DOC_ID : item.doc.id;
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(docId)) {
              docId = WELCOME_DOC_ID;
              item.doc.id = docId;
            }
            const [encryptedTitle, encryptedContent] = await Promise.all([
              encryptText(item.doc.title || '', userId),
              encryptText(item.doc.content || '', userId)
            ]);
            const payload = {
              id: docId,
              user_id: userId,
              title: encryptedTitle,
              content: encryptedContent,
              tag: item.doc.tag || 'General',
              is_pinned: Boolean(item.doc.is_pinned),
              is_archived: Boolean(item.doc.is_archived),
              word_count: item.doc.word_count || 0,
              updated_at: item.doc.updated_at || new Date().toISOString()
            };
            const { error: upsertErr } = await supabase.from('docs').upsert(payload, { onConflict: 'id' });
            if (upsertErr) throw upsertErr;
          }
          delete queue[id];
        } catch (pushErr) {
          console.warn(`Failed to push queued doc ${id}:`, pushErr);
          throw pushErr;
        }
      }
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    }

    // 2. Pull remote docs & decrypt them client-side
    const { data: rawRemoteDocs, error } = await supabase
      .from('docs')
      .select('*')
      .eq('user_id', userId)
      .order('is_pinned', { ascending: false })
      .order('updated_at', { ascending: false });

    if (error) throw error;

    // Decrypt all remote documents client-side
    const decryptedRemoteDocs = await Promise.all((rawRemoteDocs || []).map(async (doc) => {
      const [title, content] = await Promise.all([
        decryptText(doc.title || '', userId),
        decryptText(doc.content || '', userId)
      ]);
      return { ...doc, title, content };
    }));

    // Deduplicate any duplicate Welcome docs in Supabase from prior glitch
    const remoteDocs = [];
    const duplicateIdsToDelete = [];
    let hasWelcome = false;

    for (const doc of decryptedRemoteDocs) {
      if (doc.title === 'Welcome to HabiTick Docs') {
        if (hasWelcome) {
          duplicateIdsToDelete.push(doc.id);
          continue;
        }
        hasWelcome = true;
      }
      remoteDocs.push(doc);
    }

    // Purge duplicate rows from Supabase in background
    if (duplicateIdsToDelete.length > 0) {
      console.log(`Purging ${duplicateIdsToDelete.length} duplicate docs from Supabase...`);
      supabase.from('docs').delete().in('id', duplicateIdsToDelete).then(({ error: delErr }) => {
        if (!delErr) console.log('Duplicate docs cleaned up successfully from Supabase.');
      });
    }

    // 3. Resolve conflicts (Remote is source of truth, merged with any pending offline edits)
    const localDocs = getLocalDocs();
    const localMap = new Map(localDocs.map(d => [d.id, d]));
    const finalDocsMap = new Map();

    for (const remote of remoteDocs) {
      const local = localMap.get(remote.id);
      if (!local) {
        finalDocsMap.set(remote.id, remote);
      } else {
        const remoteTime = new Date(remote.updated_at || 0).getTime();
        const localTime = new Date(local.updated_at || 0).getTime();

        if (localTime > remoteTime && queue[local.id]) {
          finalDocsMap.set(local.id, local);
        } else {
          finalDocsMap.set(remote.id, remote);
        }
      }
      localMap.delete(remote.id);
    }

    // Only include offline local docs that are explicitly queued to push
    for (const [id, local] of localMap.entries()) {
      if (queue[id] && queue[id].action === 'upsert') {
        finalDocsMap.set(id, local);
      }
    }

    let merged = Array.from(finalDocsMap.values());

    // If user has zero documents anywhere, initialize one clean welcome note
    if (merged.length === 0) {
      merged = [
        {
          id: WELCOME_DOC_ID,
          user_id: userId,
          title: 'Welcome to HabiTick Docs',
          content: DEFAULT_WELCOME_CONTENT,
          tag: 'General',
          is_pinned: true,
          is_archived: false,
          word_count: 95,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];
      queueSync(merged[0], 'upsert');
    }

    // Sort: pinned first, then updated_at descending
    merged.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    });

    saveLocalDocs(merged);
    if (onStatusChange) onStatusChange('synced');
    return merged;
  } catch (err) {
    console.warn('Sync engine error, falling back to local storage:', err);
    if (onStatusChange) {
      if (!navigator.onLine) {
        onStatusChange('offline_saved');
      } else if (err?.code === 'PGRST205' || err?.message?.includes('Could not find the table')) {
        onStatusChange('table_missing');
      } else {
        onStatusChange('sync_error');
      }
    }
    return getLocalDocs();
  } finally {
    isSyncInProgress = false;
  }
}
