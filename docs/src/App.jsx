import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from './lib/supabase.js';
import { 
  getLocalDocs, 
  saveLocalDocs, 
  queueSync, 
  syncWithSupabase, 
  pushDocToSupabase, 
  deleteDocFromSupabase, 
  WELCOME_DOC_ID, 
  DEFAULT_WELCOME_CONTENT 
} from './lib/syncEngine.js';
import { NOTE_TEMPLATES, DEFAULT_TAGS } from './components/NoteTemplates.js';
import { AuthModal } from './components/AuthModal.jsx';
import { FormattingToolbar } from './components/FormattingToolbar.jsx';
import { FileManagerModal } from './components/FileManagerModal.jsx';
import { setSharedAuthCookie, getSharedAuthCookie, clearSharedAuthCookie } from './lib/sso.js';
import './index.css';

function formatInlineStyles(str) {
  return str
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/==([^=]+)==/g, '<mark style="background-color: #fef08a; color: #1e293b;">$1</mark>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function sanitizeHtml(html) {
  if (!html) return '<p><br></p>';
  return html
    // Strip script tags and content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Strip iframe, object, embed, form tags
    .replace(/<\/?(iframe|object|embed|applet|form|input|button)\b[^>]*>/gi, '')
    // Strip inline on* event handlers (e.g. onerror=, onload=, onclick=)
    .replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
    // Strip javascript: pseudo-protocols
    .replace(/href\s*=\s*(?:'javascript:[^']*'|"javascript:[^"]*"|javascript:[^\s>]+)/gi, 'href="#"')
    .replace(/src\s*=\s*(?:'javascript:[^']*'|"javascript:[^"]*"|javascript:[^\s>]+)/gi, 'src=""');
}

function parseMarkdownToHtml(text) {
  if (!text) return '<p><br></p>';
  if (/<(p|div|span|h[1-6]|ul|ol|li|br|strong|b|em|i|mark|u|blockquote|hr)\b[^>]*>/i.test(text)) {
    return sanitizeHtml(text);
  }

  const lines = text.split('\n');
  const htmlLines = [];
  let inList = false;

  for (let line of lines) {
    let processed = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    if (processed.startsWith('### ')) {
      if (inList) { htmlLines.push('</ul>'); inList = false; }
      htmlLines.push(`<h3>${formatInlineStyles(processed.slice(4))}</h3>`);
      continue;
    }
    if (processed.startsWith('## ')) {
      if (inList) { htmlLines.push('</ul>'); inList = false; }
      htmlLines.push(`<h2>${formatInlineStyles(processed.slice(3))}</h2>`);
      continue;
    }
    if (processed.startsWith('# ')) {
      if (inList) { htmlLines.push('</ul>'); inList = false; }
      htmlLines.push(`<h1>${formatInlineStyles(processed.slice(2))}</h1>`);
      continue;
    }

    if (processed.startsWith('- ') || processed.startsWith('* ')) {
      if (!inList) { htmlLines.push('<ul>'); inList = true; }
      htmlLines.push(`<li>${formatInlineStyles(processed.slice(2))}</li>`);
      continue;
    } else {
      if (inList) { htmlLines.push('</ul>'); inList = false; }
    }

    if (processed.startsWith('> ')) {
      htmlLines.push(`<blockquote>${formatInlineStyles(processed.slice(2))}</blockquote>`);
      continue;
    }

    if (processed.trim() === '---' || processed.trim() === '***') {
      htmlLines.push('<hr>');
      continue;
    }

    if (processed.trim() === '') {
      htmlLines.push('<p><br></p>');
    } else {
      htmlLines.push(`<p>${formatInlineStyles(processed)}</p>`);
    }
  }

  if (inList) htmlLines.push('</ul>');
  return sanitizeHtml(htmlLines.join(''));
}

const DEFAULT_DOC = {
  id: WELCOME_DOC_ID,
  title: 'Welcome to HabiTick Docs',
  content: DEFAULT_WELCOME_CONTENT,
  tag: 'General',
  is_pinned: true,
  is_archived: false,
  word_count: 95,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

export default function App() {
  const [session, setSession] = useState(null);
  const [docs, setDocs] = useState(() => {
    const cached = getLocalDocs();
    return cached.length > 0 ? cached : [DEFAULT_DOC];
  });
  const [currentDocId, setCurrentDocId] = useState(() => {
    const cached = getLocalDocs();
    return cached.length > 0 ? cached[0].id : DEFAULT_DOC.id;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('All');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [focusMode, setFocusMode] = useState(() => localStorage.getItem('ht_docs_focus_mode') === 'true');
  const [theme, setTheme] = useState(() => localStorage.getItem('ht_theme') || 'dark');
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem('ht_docs_font') || 'sans');
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('ht_docs_size') || 'medium');
  const [syncStatus, setSyncStatus] = useState(() => {
    if (!navigator.onLine) return 'offline_saved';
    return 'synced';
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [currentBlock, setCurrentBlock] = useState('p');
  const [isFileManagerOpen, setIsFileManagerOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [userProfile, setUserProfile] = useState(() => {
    try {
      const cached = localStorage.getItem('ht_user_profile');
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  });

  const editorRef = useRef(null);
  const syncTimeoutRef = useRef(null);
  const pendingDocRef = useRef(null);
  const lastSyncTimeRef = useRef(Date.now());
  const profileContainerRef = useRef(null);

  // Close profile dropdown when clicking outside or pressing Escape
  useEffect(() => {
    if (!showProfileMenu) return;

    const handlePointerDown = (e) => {
      if (profileContainerRef.current && !profileContainerRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showProfileMenu]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ht_theme', theme);
  }, [theme]);

  // Fetch user profile from Supabase profiles table
  const fetchUserProfile = useCallback(async (userId) => {
    if (!userId) {
      setUserProfile(null);
      localStorage.removeItem('ht_user_profile');
      return;
    }
    try {
      // 1. Try local caches for instant 0ms load
      const cached = localStorage.getItem(`ht_user_profile_${userId}`) || localStorage.getItem('ht_user_profile');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed && (parsed.username || parsed.avatar_url)) {
            setUserProfile(parsed);
          }
        } catch (e) {}
      }

      // 2. Query Supabase with select('*') and maybeSingle() so it never fails
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (data && !error) {
        setUserProfile(data);
        localStorage.setItem(`ht_user_profile_${userId}`, JSON.stringify(data));
        localStorage.setItem('ht_user_profile', JSON.stringify(data));
      } else if (error) {
        console.warn('Error fetching user profile:', error);
      }
    } catch (err) {
      console.warn('Error fetching user profile:', err);
    }
  }, []);

  const handleSignOut = async () => {
    clearSharedAuthCookie();
    setUserProfile(null);
    localStorage.removeItem('ht_user_profile');
    setShowProfileMenu(false);
    await supabase.auth.signOut();
  };

  // Supabase Auth listener & cross-domain SSO receiver
  useEffect(() => {
    let active = true;

    const initAuth = async () => {
      let activeSession = null;

      // 1. Check for cross-domain SSO tokens in hash or search query
      try {
        let at = null;
        let rt = null;

        if (window.location.hash) {
          const cleanHash = window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash;
          const hashParams = new URLSearchParams(cleanHash);
          at = hashParams.get('access_token');
          rt = hashParams.get('refresh_token');
        }

        if (!at || !rt) {
          const searchParams = new URLSearchParams(window.location.search);
          at = at || searchParams.get('access_token');
          rt = rt || searchParams.get('refresh_token');
        }

        if (at && rt) {
          // Fix potential space corruption of + in URL decoding
          const cleanAt = at.replace(/ /g, '+');
          const cleanRt = rt.replace(/ /g, '+');

          const { data, error } = await supabase.auth.setSession({
            access_token: cleanAt,
            refresh_token: cleanRt
          });

          if (!error && data?.session) {
            activeSession = data.session;
            setSharedAuthCookie(data.session);
          } else if (error) {
            console.warn('SSO token exchange note:', error.message);
          }

          if (!error && window.history.replaceState) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        }
      } catch (err) {
        console.warn('Cross-app SSO handoff warning:', err);
      }

      // 2. If not hydrated from hash, check existing local Supabase session
      if (!activeSession) {
        const { data } = await supabase.auth.getSession();
        activeSession = data?.session || null;
      }

      // 3. If still no active session, check shared cross-domain cookie (.habitick.app)
      if (!activeSession) {
        const sso = getSharedAuthCookie();
        if (sso?.access_token && sso?.refresh_token) {
          try {
            const { data, error } = await supabase.auth.setSession({
              access_token: sso.access_token,
              refresh_token: sso.refresh_token
            });
            if (!error && data?.session) {
              activeSession = data.session;
            } else if (error) {
              clearSharedAuthCookie();
            }
          } catch (cookieErr) {
            console.warn('Cross-app SSO cookie hydration warning:', cookieErr);
          }
        }
      }

      if (!active) return;
      setSession(activeSession ?? null);
      if (activeSession?.user?.id) {
        setSharedAuthCookie(activeSession);
        fetchUserProfile(activeSession.user.id);
        syncWithSupabase(activeSession.user.id, setSyncStatus).then(mergedDocs => {
          if (!active) return;
          if (mergedDocs && mergedDocs.length > 0) {
            setDocs(mergedDocs);
            if (!currentDocId || !mergedDocs.some(d => d.id === currentDocId)) {
              setCurrentDocId(mergedDocs[0].id);
            }
          }
        });
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setSession(session);
      if (session?.user?.id) {
        setSharedAuthCookie(session);
        fetchUserProfile(session.user.id);
        syncWithSupabase(session.user.id, setSyncStatus).then(mergedDocs => {
          if (active && mergedDocs && mergedDocs.length > 0) {
            setDocs(mergedDocs);
          }
        });
      } else {
        clearSharedAuthCookie();
        setUserProfile(null);
        localStorage.removeItem('ht_user_profile');
      }
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [fetchUserProfile]);

  // Flush pending unpushed note immediately (e.g. on blur, tab hide, or unload)
  const flushPendingPush = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
    if (pendingDocRef.current && session?.user?.id && navigator.onLine) {
      pushDocToSupabase(pendingDocRef.current, session.user.id, setSyncStatus);
      pendingDocRef.current = null;
    }
  }, [session?.user?.id]);

  // Online / Offline Network listeners and Tab Visibility Lifecycle
  useEffect(() => {
    const handleOnline = () => {
      if (session?.user?.id) {
        setSyncStatus('syncing');
        syncWithSupabase(session.user.id, setSyncStatus).then(mergedDocs => {
          if (mergedDocs && mergedDocs.length > 0) {
            setDocs(mergedDocs);
          }
        });
      } else {
        setSyncStatus('guest');
      }
    };

    const handleOffline = () => {
      setSyncStatus('offline_saved');
    };

    // When tab becomes hidden, immediately save any pending draft.
    // When returning after > 5 minutes, pull remote changes.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingPush();
      } else if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastSyncTimeRef.current;
        if (elapsed > 5 * 60 * 1000 && session?.user?.id && navigator.onLine) {
          lastSyncTimeRef.current = Date.now();
          syncWithSupabase(session.user.id, setSyncStatus).then(mergedDocs => {
            if (mergedDocs && mergedDocs.length > 0) {
              setDocs(mergedDocs);
            }
          });
        }
      }
    };

    const handleBeforeUnload = () => {
      flushPendingPush();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session?.user?.id, flushPendingPush]);

  // Keyboard Shortcuts (Cmd+K search, Cmd+O file manager)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('doc-search-bar')?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setIsFileManagerOpen(prev => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === '\\' || e.key.toLowerCase() === 'b')) {
        e.preventDefault();
        setSidebarOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus Mode: auto-reveal sidebar when moving mouse to the left screen margin
  useEffect(() => {
    if (!focusMode) return;
    const handleMouseMove = (e) => {
      if (!sidebarOpen && e.clientX <= 20 && window.innerWidth >= 768) {
        setSidebarOpen(true);
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [focusMode, sidebarOpen]);

  // Active document memo
  const currentDoc = useMemo(() => {
    return docs.find(d => d.id === currentDocId) || docs[0] || DEFAULT_DOC;
  }, [docs, currentDocId]);

  // Synchronize contentEditable with active doc without cursor jumping during typing
  useEffect(() => {
    if (editorRef.current && currentDoc) {
      const formattedHtml = parseMarkdownToHtml(currentDoc.content || '');
      if (editorRef.current.innerHTML !== formattedHtml) {
        editorRef.current.innerHTML = formattedHtml;
      }
    }
  }, [currentDocId]);

  const handleEditorInput = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    handleUpdateCurrentDoc({ content: html });
    // Focus Mode: auto-collapse sidebar when user begins typing
    if (focusMode && sidebarOpen && window.innerWidth >= 768) {
      setSidebarOpen(false);
    }
  };

  const handleExecCommand = (command, value = null) => {
    if (editorRef.current) editorRef.current.focus();
    document.execCommand(command, false, value);
    handleEditorInput();
  };

  const handleApplyTextColor = (color) => {
    if (editorRef.current) editorRef.current.focus();
    document.execCommand('foreColor', false, color);
    handleEditorInput();
  };

  const handleApplyHighlight = (color) => {
    if (editorRef.current) editorRef.current.focus();
    if (!color || color === 'transparent') {
      document.execCommand('removeFormat', false, null);
    } else {
      if (!document.execCommand('hiliteColor', false, color)) {
        document.execCommand('backColor', false, color);
      }
    }
    handleEditorInput();
  };

  const handleApplyFontSize = (sizePx) => {
    if (editorRef.current) editorRef.current.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    span.style.fontSize = sizePx;
    try {
      span.appendChild(range.extractContents());
      range.insertNode(span);
      sel.selectAllChildren(span);
    } catch (e) {
      document.execCommand('fontSize', false, '4');
    }
    handleEditorInput();
  };

  const handleApplyBlock = (tag) => {
    setCurrentBlock(tag);
    if (editorRef.current) editorRef.current.focus();
    document.execCommand('formatBlock', false, `<${tag}>`);
    handleEditorInput();
  };

  // Switch active document (flushing pending save of prior doc first)
  const handleSelectDoc = (id) => {
    if (id === currentDocId) return;
    flushPendingPush();
    setCurrentDocId(id);
  };

  // Update current document with instant 0ms local save and debounced single-doc sync
  const handleUpdateCurrentDoc = (updates) => {
    if (!currentDoc) return;
    const now = new Date().toISOString();
    const newContent = updates.content !== undefined ? updates.content : currentDoc.content;
    const cleanText = (newContent || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = cleanText ? cleanText.split(/\s+/).filter(Boolean).length : 0;

    const updatedDoc = {
      ...currentDoc,
      ...updates,
      word_count: wordCount,
      updated_at: now
    };

    // Keep ref for immediate flush on blur/unload
    pendingDocRef.current = updatedDoc;

    // 1. Instant local state update (0ms latency, zero data loss)
    setDocs(prev => {
      const next = prev.map(d => d.id === updatedDoc.id ? updatedDoc : d);
      saveLocalDocs(next);
      return next;
    });

    // 2. Queue for offline sync (persisted to localStorage)
    queueSync(updatedDoc, 'upsert');

    // 3. Debounced single-doc write to Supabase (1500ms debounce saves 90%+ API requests)
    if (!session?.user?.id) {
      setSyncStatus('guest');
    } else if (!navigator.onLine) {
      setSyncStatus('offline_saved');
    } else {
      setSyncStatus('saving');
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(async () => {
        await pushDocToSupabase(updatedDoc, session.user.id, setSyncStatus);
        if (pendingDocRef.current?.id === updatedDoc.id) {
          pendingDocRef.current = null;
        }
      }, 1500);
    }
  };

  // Create new note
  const handleCreateNote = (template = null, targetTag = null) => {
    flushPendingPush();

    const tagToUse = targetTag || (template ? template.tag : (selectedTag !== 'All' ? selectedTag : 'General'));

    const newDoc = {
      id: crypto.randomUUID(),
      user_id: session?.user?.id || null,
      title: template ? template.title : 'Untitled Note',
      content: template ? template.content : '',
      tag: tagToUse,
      is_pinned: false,
      is_archived: false,
      word_count: template ? template.content.trim().split(/\s+/).filter(Boolean).length : 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    setDocs(prev => {
      const next = [newDoc, ...prev];
      saveLocalDocs(next);
      return next;
    });
    setCurrentDocId(newDoc.id);
    queueSync(newDoc, 'upsert');

    if (!session?.user?.id) {
      setSyncStatus('guest');
    } else if (!navigator.onLine) {
      setSyncStatus('offline_saved');
    } else {
      setSyncStatus('saving');
      pushDocToSupabase(newDoc, session.user.id, setSyncStatus);
    }

    setShowTemplatesModal(false);
    setTimeout(() => {
      editorRef.current?.focus();
    }, 80);
  };

  // Update any document (e.g. folder tag, pin status, or title from File Manager)
  const handleUpdateDoc = (id, updates) => {
    setDocs(prev => {
      const next = prev.map(d => {
        if (d.id !== id) return d;
        const now = new Date().toISOString();
        const newContent = updates.content !== undefined ? updates.content : d.content;
        const cleanText = (newContent || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        const wordCount = cleanText ? cleanText.split(/\s+/).filter(Boolean).length : 0;
        const updated = {
          ...d,
          ...updates,
          word_count: wordCount,
          updated_at: now
        };
        if (pendingDocRef.current?.id === id) {
          pendingDocRef.current = updated;
        }
        queueSync(updated, 'upsert');
        if (session?.user?.id && navigator.onLine) {
          pushDocToSupabase(updated, session.user.id, setSyncStatus);
        }
        return updated;
      });
      saveLocalDocs(next);
      return next;
    });
  };

  // Delete note (direct row deletion, 0 unnecessary pulls)
  const handleDeleteNote = (id) => {
    if (pendingDocRef.current?.id === id) {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      pendingDocRef.current = null;
    }

    setDocs(prev => {
      const next = prev.filter(d => d.id !== id);
      const fallback = next.length > 0 ? next : [DEFAULT_DOC];
      saveLocalDocs(fallback);
      if (currentDocId === id) {
        setCurrentDocId(fallback[0].id);
      }
      return fallback;
    });

    if (session?.user?.id) {
      if (navigator.onLine) {
        deleteDocFromSupabase(id, session.user.id);
      } else {
        const toDelete = docs.find(d => d.id === id);
        if (toDelete) queueSync(toDelete, 'delete');
      }
    }
    setDeleteConfirmId(null);
  };

  // Formatting helper
  const handleInsertFormat = (prefix, suffix = '') => {
    const textarea = editorRef.current;
    if (!textarea || !currentDoc) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    const replacement = `${prefix}${selected || 'text'}${suffix}`;
    const newContent = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);

    handleUpdateCurrentDoc({ content: newContent });

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + (selected ? selected.length : 4));
    }, 20);
  };

  // Clean plain text without HTML tags for exports and reading stats
  const plainText = useMemo(() => {
    if (!currentDoc?.content) return '';
    return currentDoc.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }, [currentDoc?.content]);

  // Copy note content as clean text
  const handleCopyNote = () => {
    if (!currentDoc) return;
    navigator.clipboard.writeText(`${currentDoc.title}\n\n${plainText}`);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
    setShowExportMenu(false);
  };

  // Export note as clean text file
  const handleExportMarkdown = () => {
    if (!currentDoc) return;
    const element = document.createElement('a');
    const file = new Blob([`# ${currentDoc.title}\n\n${plainText}`], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${(currentDoc.title || 'note').toLowerCase().replace(/[^a-z0-9]/gi, '_')}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    setShowExportMenu(false);
  };

  // Print note to PDF
  const handlePrint = () => {
    setShowExportMenu(false);
    setTimeout(() => window.print(), 100);
  };

  // Theme switcher
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    if (session?.user?.id) {
      supabase.from('profiles').update({ theme: newTheme }).eq('id', session.user.id);
    }
  };

  // Filtered docs list
  const filteredDocs = useMemo(() => {
    return docs.filter(doc => {
      const matchesSearch = !searchQuery.trim() || 
        (doc.title && doc.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (doc.content && doc.content.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesTag = selectedTag === 'All' || doc.tag === selectedTag;
      return matchesSearch && matchesTag;
    });
  }, [docs, searchQuery, selectedTag]);

  const pinnedDocs = useMemo(() => filteredDocs.filter(d => d.is_pinned), [filteredDocs]);
  const unpinnedDocs = useMemo(() => filteredDocs.filter(d => !d.is_pinned), [filteredDocs]);

  // Reading stats
  const words = currentDoc?.word_count || (plainText ? plainText.split(/\s+/).filter(Boolean).length : 0);
  const chars = plainText.length;
  const readingTimeMin = Math.max(1, Math.ceil(words / 200));

  // Dynamic font class
  const fontClass = fontFamily === 'serif' ? 'font-serif' : fontFamily === 'mono' ? 'font-mono' : 'font-sans';
  const fontSizePx = fontSize === 'small' ? '15px' : fontSize === 'large' ? '18px' : '16.5px';
  const lineHeightVal = fontSize === 'large' ? '1.8' : '1.75';

  return (
    <div className="ht-docs-container" data-docs-app data-theme={theme} style={{ display: 'flex', flexDirection: 'row', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Mobile Drawer Backdrop */}
      {sidebarOpen && (
        <div 
          className="ht-sidebar-backdrop no-print" 
          onClick={() => setSidebarOpen(false)}
          title="Close sidebar"
        />
      )}

      {/* Desktop Left-Edge Hover Trigger (when collapsed) */}
      {!sidebarOpen && (
        <div 
          className="ht-sidebar-edge-trigger no-print" 
          onClick={() => setSidebarOpen(true)}
          onMouseEnter={() => {
            if (focusMode) setSidebarOpen(true);
          }}
          title="Expand sidebar (⌘B / ⌘\)"
        >
          <div className="ht-sidebar-edge-hint" />
        </div>
      )}

      {/* SIDEBAR */}
      <aside 
        className={`no-print ht-sidebar ${!sidebarOpen ? 'ht-sidebar-collapsed' : ''}`}
        aria-hidden={!sidebarOpen}
      >
        {/* Inner Fixed-Width Wrapper: ensures silky smooth slide in/out animations without content reflow */}
        <div className="ht-sidebar-inner">
          {/* Brand Header */}
          <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--ht-border-subtle)' }}>
            <div className="ht-stagger-item ht-stagger-1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <a 
                href={import.meta.env.VITE_HABITICK_APP_URL || (typeof window !== 'undefined' && window.location.search.includes('tab=docs') ? '/' : (typeof window !== 'undefined' && window.location.hostname.includes('habitick.app') ? 'https://habitick.app' : 'http://localhost:5173'))} 
                title="Return to HabiTick Tracker"
                style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '9px' }}
              >
              <img 
                src="/habitick-blue-logo.png" 
                alt="HabiTick Logo" 
                style={{ width: "28px", height: "28px", borderRadius: "7px", objectFit: "contain" }} 
              />
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '17px', color: 'var(--ht-text-primary)' }}>
                  HabiTick
                </span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Docs
                </span>
              </div>
            </a>
            <button
              onClick={() => setSidebarOpen(false)}
              title="Hide sidebar"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--ht-text-muted)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M9 3v18" />
              </svg>
            </button>
          </div>

          {/* Action Buttons & Finder */}
          <div className="ht-stagger-item ht-stagger-2">
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleCreateNote()}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '9px 12px',
                borderRadius: '10px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'background 0.15s'
              }}
            >
              <span>+</span> New Note
            </button>
            <button
              onClick={() => setShowTemplatesModal(true)}
              title="Starter note templates"
              style={{
                padding: '9px 12px',
                borderRadius: '10px',
                background: 'var(--ht-bg-card)',
                color: 'var(--ht-text-primary)',
                border: '1px solid var(--ht-border-card)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              🎓 Templates
            </button>
          </div>

          {/* macOS Finder / File Manager Button */}
          <button
            onClick={() => setIsFileManagerOpen(true)}
            title="Open macOS File Manager (⌘O)"
            style={{
              marginTop: '8px',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: '10px',
              background: 'var(--ht-bg-card)',
              border: '1px solid var(--ht-border-card)',
              color: 'var(--ht-text-primary)',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.4)';
              e.currentTarget.style.background = 'var(--ht-bg-card-subtle)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--ht-border-card)';
              e.currentTarget.style.background = 'var(--ht-bg-card)';
            }}
          >
            <span style={{ fontSize: '14px' }}>📁</span>
            <span>Finder / Files</span>
            <span style={{ 
              marginLeft: 'auto', 
              fontSize: '10px', 
              fontWeight: 700,
              padding: '2px 6px', 
              borderRadius: '5px', 
              background: 'var(--ht-bg-base)', 
              color: 'var(--ht-text-muted)',
              border: '1px solid var(--ht-border-subtle)'
            }}>
              ⌘O
            </span>
            </button>
          </div>
        </div>

        {/* Search & Tags */}
        <div className="ht-stagger-item ht-stagger-3" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ position: 'relative' }}>
            <input 
              id="doc-search-bar"
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search notes (Cmd+K)..."
              style={{
                width: '100%',
                padding: '8px 10px 8px 32px',
                borderRadius: '8px',
                background: 'var(--ht-bg-card)',
                border: '1px solid var(--ht-border-card)',
                color: 'var(--ht-text-primary)',
                fontSize: '12.5px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--ht-text-muted)' }}>
              🔍
            </span>
          </div>

          {/* Tag Filter Pills */}
          <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px' }}>
            {DEFAULT_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                style={{
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  whiteSpace: 'nowrap',
                  background: selectedTag === tag ? '#2563eb' : 'var(--ht-bg-card)',
                  color: selectedTag === tag ? '#fff' : 'var(--ht-text-muted)'
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Notes List */}
        <div className="ht-stagger-item ht-stagger-4" style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredDocs.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--ht-text-muted)', fontSize: '12.5px' }}>
              No notes found.<br />
              <button 
                onClick={() => handleCreateNote()}
                style={{ marginTop: '10px', background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, cursor: 'pointer', fontSize: '12.5px' }}
              >
                + Create Note
              </button>
            </div>
          ) : (
            <>
              {/* Pinned Section */}
              {pinnedDocs.length > 0 && (
                <div>
                  <div style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ht-text-muted)', padding: '4px 8px' }}>
                    📌 Pinned
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {pinnedDocs.map(doc => renderDocListItem(doc))}
                  </div>
                </div>
              )}

              {/* Unpinned Notes Section */}
              {unpinnedDocs.length > 0 && (
                <div>
                  <div style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ht-text-muted)', padding: '4px 8px' }}>
                    {selectedTag === 'All' ? 'Notes' : `${selectedTag} Notes`} ({unpinnedDocs.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {unpinnedDocs.map(doc => renderDocListItem(doc))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Sidebar Footer: Profile Card matching HabiTick Main */}
        <div 
          ref={profileContainerRef}
          className="ht-stagger-item ht-stagger-5" 
          style={{ 
            padding: '12px 14px', 
            borderTop: '1px solid var(--ht-border-subtle)', 
            position: 'relative',
            zIndex: showProfileMenu ? 101 : 1
          }}
        >
          {session?.user ? (
            <>
              {/* Invisible Click-off Backdrop */}
              {showProfileMenu && (
                <div
                  aria-hidden="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowProfileMenu(false);
                  }}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 99,
                    background: 'transparent',
                    cursor: 'default'
                  }}
                />
              )}

              {/* Profile Card Button */}
              <button 
                onClick={() => setShowProfileMenu(prev => !prev)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '10px', 
                  background: showProfileMenu ? 'var(--ht-bg-card-subtle)' : 'rgba(255, 255, 255, 0.02)', 
                  border: showProfileMenu ? '1px solid var(--ht-accent)' : '1px solid var(--ht-border-card)', 
                  borderRadius: '12px', 
                  padding: '9px 12px', 
                  cursor: 'pointer', 
                  width: '100%', 
                  transition: 'all 0.18s ease',
                  outline: 'none',
                  boxSizing: 'border-box',
                  position: 'relative',
                  zIndex: showProfileMenu ? 102 : 'auto',
                  boxShadow: showProfileMenu ? '0 0 0 2px var(--ht-accent-subtle)' : 'none'
                }}
                onMouseEnter={e => {
                  if (!showProfileMenu) {
                    e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.4)';
                    e.currentTarget.style.background = 'var(--ht-bg-card-subtle)';
                  }
                }}
                onMouseLeave={e => {
                  if (!showProfileMenu) {
                    e.currentTarget.style.borderColor = 'var(--ht-border-card)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                  }
                }}
              >
                {/* Avatar Photo or Initial */}
                {userProfile?.avatar_url || session?.user?.user_metadata?.avatar_url ? (
                  <img 
                    src={userProfile?.avatar_url || session?.user?.user_metadata?.avatar_url} 
                    alt="avatar" 
                    style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} 
                  />
                ) : (
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '12px', color: '#fff', flexShrink: 0 }}>
                    {(userProfile?.username || session?.user?.user_metadata?.username || session.user.email || '?')[0].toUpperCase()}
                  </div>
                )}

                {/* Username */}
                <span style={{ color: 'var(--ht-text-primary)', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
                  {userProfile?.username || session?.user?.user_metadata?.username || session?.user?.user_metadata?.full_name || session.user.email?.split('@')[0]}
                </span>

                {/* Gear Icon with subtle rotation when active */}
                <span style={{ 
                  fontSize: '14px', 
                  color: showProfileMenu ? 'var(--ht-accent)' : 'var(--ht-text-muted)', 
                  flexShrink: 0,
                  transform: showProfileMenu ? 'rotate(45deg)' : 'none',
                  transition: 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), color 0.18s ease'
                }}>
                  ⚙️
                </span>
              </button>

              {/* Profile Dropdown / Actions Popover */}
              {showProfileMenu && (
                <div
                  className="ht-profile-popover"
                  style={{
                    position: 'absolute',
                    bottom: '72px',
                    left: '12px',
                    right: '12px',
                    background: 'var(--ht-bg-sidebar)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    border: '1px solid var(--ht-border-card)',
                    borderRadius: '14px',
                    padding: '8px',
                    boxShadow: '0 16px 36px -4px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04)',
                    zIndex: 102,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  {/* Header info with mini avatar & email */}
                  <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--ht-border-subtle)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '9px' }}>
                    {userProfile?.avatar_url || session?.user?.user_metadata?.avatar_url ? (
                      <img 
                        src={userProfile?.avatar_url || session?.user?.user_metadata?.avatar_url} 
                        alt="avatar" 
                        style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} 
                      />
                    ) : (
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '11px', color: '#fff', flexShrink: 0 }}>
                        {(userProfile?.username || session?.user?.user_metadata?.username || session.user.email || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ht-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {userProfile?.username || session?.user?.user_metadata?.username || 'HabiTick User'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--ht-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {session.user.email}
                      </div>
                    </div>
                  </div>

                  {/* Link back to Habit Tracker */}
                  <a
                    href={import.meta.env.VITE_HABITICK_APP_URL || (typeof window !== 'undefined' && window.location.search.includes('tab=docs') ? '/' : (typeof window !== 'undefined' && window.location.hostname.includes('habitick.app') ? 'https://habitick.app' : 'http://localhost:5173'))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: 'var(--ht-accent, #3b82f6)',
                      fontSize: '12px',
                      fontWeight: 600,
                      textDecoration: 'none',
                      background: 'var(--ht-accent-subtle, rgba(37, 99, 235, 0.08))',
                      transition: 'background 0.15s ease, transform 0.15s ease'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(37, 99, 235, 0.16)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'var(--ht-accent-subtle, rgba(37, 99, 235, 0.08))';
                      e.currentTarget.style.transform = 'none';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 11 3 3L22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                      <span>Open Habit Tracker</span>
                    </div>
                    <span style={{ fontSize: '13px' }}>↗</span>
                  </a>

                  {/* Sign Out Button with modern SVG logout icon */}
                  <button
                    onClick={handleSignOut}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'transparent',
                      color: '#ef4444',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.15s ease, color 0.15s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    <span>Sign Out</span>
                  </button>
                </div>
              )}

              {/* Made with ❤︎ by JKey */}
              <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '10px', color: 'var(--ht-text-muted)', letterSpacing: '0.02em', userSelect: 'none', opacity: 0.7 }}>
                Made with ❤︎⁠ by {userProfile?.username || 'JKey'}
              </div>
            </>
          ) : (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '8px',
                background: 'var(--ht-accent-subtle)',
                color: '#2563eb',
                border: '1px solid rgba(37,99,235,0.2)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Sign In to Cloud Sync ☁️
            </button>
          )}
        </div>
        </div>
      </aside>

      {/* MAIN WRITING CANVAS */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
        {/* Top Navbar */}
        <header 
          className="no-print"
          style={{
            height: '52px',
            borderBottom: '1px solid var(--ht-border-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            background: 'var(--ht-bg-base)',
            zIndex: 10
          }}
        >
          {/* Left: Sidebar toggle, Finder button & Sync badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                title="Show sidebar (⌘B / ⌘\)"
                style={{
                  background: 'none',
                  border: '1px solid var(--ht-border-card)',
                  color: 'var(--ht-text-muted)',
                  cursor: 'pointer',
                  padding: '5px 7px',
                  borderRadius: '7px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = 'var(--ht-text-primary)';
                  e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.4)';
                  e.currentTarget.style.background = 'var(--ht-bg-card-subtle)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = 'var(--ht-text-muted)';
                  e.currentTarget.style.borderColor = 'var(--ht-border-card)';
                  e.currentTarget.style.background = 'none';
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M9 3v18" />
                </svg>
              </button>
            )}

            {/* Quick macOS Finder Launch Button in Top Header */}
            <button
              onClick={() => setIsFileManagerOpen(true)}
              title="Open macOS File Manager (⌘O)"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 10px',
                borderRadius: '8px',
                background: 'var(--ht-bg-card)',
                border: '1px solid var(--ht-border-card)',
                color: 'var(--ht-text-primary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.4)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--ht-border-card)'}
            >
              <span style={{ fontSize: '13px' }}>📁</span>
              <span>Files</span>
              <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '2px' }}>⌘O</span>
            </button>

            {/* Sync Status Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--ht-text-muted)' }}>
              {syncStatus === 'synced' && (
                <>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e' }} />
                  <span>Synced</span>
                </>
              )}
              {syncStatus === 'saving' && (
                <>
                  <span className="sync-pulse" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#3b82f6' }} />
                  <span>Saving...</span>
                </>
              )}
              {syncStatus === 'syncing' && (
                <>
                  <span className="sync-pulse" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#3b82f6' }} />
                  <span>Syncing...</span>
                </>
              )}
              {syncStatus === 'offline_saved' && (
                <>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#f59e0b' }} />
                  <span>Saved offline (will sync on WiFi)</span>
                </>
              )}
              {syncStatus === 'guest' && (
                <div
                  onClick={() => setIsAuthModalOpen(true)}
                  title="Click to sign in and sync notes across devices"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                >
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#a1a1aa' }} />
                  <span>Saved locally (Guest · click to sync)</span>
                </div>
              )}
              {syncStatus === 'table_missing' && (
                <div
                  title="The 'docs' table hasn't been created in Supabase SQL Editor yet. Run the SQL migration to enable cloud sync."
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f59e0b', cursor: 'help' }}
                >
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#f59e0b' }} />
                  <span>Saved locally (DB table pending in Supabase)</span>
                </div>
              )}
              {syncStatus === 'sync_error' && (
                <>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#ef4444' }} />
                  <span>Saved locally (sync retry pending)</span>
                </>
              )}
            </div>
          </div>

          {/* Right: Clean, Minimalist Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Focus Mode Toggle Button */}
            <button
              onClick={() => {
                const next = !focusMode;
                setFocusMode(next);
                localStorage.setItem('ht_docs_focus_mode', String(next));
                if (next && sidebarOpen && window.innerWidth >= 768) {
                  setSidebarOpen(false);
                }
              }}
              title={focusMode ? "Focus Mode active (Sidebar auto-collapses when typing · ⌘B / ⌘\\)" : "Enable Focus Mode (Auto-collapse sidebar while writing · ⌘B / ⌘\\)"}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 9px',
                borderRadius: '8px',
                background: focusMode ? 'rgba(37, 99, 235, 0.12)' : 'var(--ht-bg-card)',
                border: `1px solid ${focusMode ? 'rgba(37, 99, 235, 0.5)' : 'var(--ht-border-card)'}`,
                color: focusMode ? '#3b82f6' : 'var(--ht-text-muted)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <span style={{ fontSize: '12px' }}>🎯</span>
              <span style={{ display: 'inline-block' }}>{focusMode ? 'Focus On' : 'Focus'}</span>
            </button>

            {/* Typography Switcher */}
            <div style={{ display: 'flex', background: 'var(--ht-bg-card)', borderRadius: '8px', border: '1px solid var(--ht-border-card)', padding: '2px' }}>
              <button
                onClick={() => { setFontFamily('sans'); localStorage.setItem('ht_docs_font', 'sans'); }}
                title="Sans (Modern Inter)"
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: 'none',
                  background: fontFamily === 'sans' ? '#2563eb' : 'transparent',
                  color: fontFamily === 'sans' ? '#fff' : 'var(--ht-text-muted)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Sans
              </button>
              <button
                onClick={() => { setFontFamily('serif'); localStorage.setItem('ht_docs_font', 'serif'); }}
                title="Serif (Newsreader)"
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: 'none',
                  background: fontFamily === 'serif' ? '#2563eb' : 'transparent',
                  color: fontFamily === 'serif' ? '#fff' : 'var(--ht-text-muted)',
                  fontSize: '11px',
                  fontFamily: "'Newsreader', serif",
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Serif
              </button>
              <button
                onClick={() => { setFontFamily('mono'); localStorage.setItem('ht_docs_font', 'mono'); }}
                title="Mono (JetBrains Mono)"
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: 'none',
                  background: fontFamily === 'mono' ? '#2563eb' : 'transparent',
                  color: fontFamily === 'mono' ? '#fff' : 'var(--ht-text-muted)',
                  fontSize: '11px',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Mono
              </button>
            </div>

            {/* Font Size Toggle */}
            <button
              onClick={() => {
                const nextSize = fontSize === 'small' ? 'medium' : fontSize === 'medium' ? 'large' : 'small';
                setFontSize(nextSize);
                localStorage.setItem('ht_docs_size', nextSize);
              }}
              title={`Font size: ${fontSize}`}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                background: 'var(--ht-bg-card)',
                border: '1px solid var(--ht-border-card)',
                color: 'var(--ht-text-primary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Aa
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                background: 'var(--ht-bg-card)',
                border: '1px solid var(--ht-border-card)',
                color: 'var(--ht-text-primary)',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>

            {/* Share / Export Menu */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  background: 'var(--ht-bg-card)',
                  border: '1px solid var(--ht-border-card)',
                  color: 'var(--ht-text-primary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <span>Export</span>
                <span style={{ fontSize: '9px' }}>▼</span>
              </button>

              {showExportMenu && (
                <div 
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '36px',
                    width: '160px',
                    background: 'var(--ht-bg-card)',
                    border: '1px solid var(--ht-border-card)',
                    borderRadius: '10px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                    padding: '6px',
                    zIndex: 100,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}
                >
                  <button onClick={handleCopyNote} style={exportMenuItemStyle}>
                    📋 {copiedNotification ? 'Copied!' : 'Copy to Clipboard'}
                  </button>
                  <button onClick={handleExportMarkdown} style={exportMenuItemStyle}>
                    ⬇ Download Markdown
                  </button>
                  <button onClick={handlePrint} style={exportMenuItemStyle}>
                    🖨️ Print / PDF
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Granular Word/Docs Style Formatting Toolbar */}
        <FormattingToolbar
          onExecCommand={handleExecCommand}
          onApplyTextColor={handleApplyTextColor}
          onApplyHighlight={handleApplyHighlight}
          onApplyFontSize={handleApplyFontSize}
          onApplyBlock={handleApplyBlock}
          currentBlock={currentBlock}
        />

        {/* Writing Canvas Container */}
        <div 
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            justifyContent: 'center',
            padding: '32px 24px 80px',
            background: 'var(--ht-canvas-bg)'
          }}
          onClick={() => setShowExportMenu(false)}
        >
          <div 
            className="canvas-container"
            style={{
              width: '100%',
              maxWidth: '740px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            {/* Note Title Input */}
            <input
              type="text"
              value={currentDoc?.title || ''}
              onChange={e => handleUpdateCurrentDoc({ title: e.target.value })}
              placeholder="Untitled Note..."
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '32px',
                fontWeight: 800,
                color: 'var(--ht-text-primary)',
                fontFamily: "'Syne', -apple-system, sans-serif",
                letterSpacing: '-0.02em',
                padding: '4px 0'
              }}
            />

            {/* Note Metadata Bar (Tags, Pin, Word Count, Delete) */}
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--ht-border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Tag Pill Select */}
                <select
                  value={currentDoc?.tag || 'General'}
                  onChange={e => handleUpdateCurrentDoc({ tag: e.target.value })}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--ht-border-card)',
                    background: 'var(--ht-bg-card)',
                    color: 'var(--ht-text-primary)',
                    fontSize: '11px',
                    fontWeight: 600,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {DEFAULT_TAGS.filter(t => t !== 'All').map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>

                {/* Pin toggle */}
                <button
                  onClick={() => handleUpdateCurrentDoc({ is_pinned: !currentDoc?.is_pinned })}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--ht-border-card)',
                    background: currentDoc?.is_pinned ? 'rgba(37,99,235,0.15)' : 'transparent',
                    color: currentDoc?.is_pinned ? '#2563eb' : 'var(--ht-text-muted)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  📌 {currentDoc?.is_pinned ? 'Pinned' : 'Pin'}
                </button>

                {/* Subtitle reading stats */}
                <span style={{ fontSize: '11px', color: 'var(--ht-text-muted)', marginLeft: '4px' }}>
                  {words} words • {readingTimeMin} min read
                </span>
              </div>

              {/* Delete button */}
              <div>
                {deleteConfirmId === currentDoc?.id ? (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => handleDeleteNote(currentDoc.id)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#ef4444',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Confirm Delete
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: '1px solid var(--ht-border-card)',
                        background: 'transparent',
                        color: 'var(--ht-text-muted)',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirmId(currentDoc?.id)}
                    title="Delete note"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--ht-text-muted)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      padding: '4px'
                    }}
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>

            {/* Note Body ContentEditable Canvas */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
              data-placeholder="Start typing your notes, ideas, or study summary..."
              className={`note-editor ${fontClass}`}
              style={{
                width: '100%',
                minHeight: '75vh',
                fontSize: fontSizePx,
                lineHeight: lineHeightVal,
                color: 'var(--ht-text-primary)',
                paddingTop: '8px'
              }}
            />
          </div>
        </div>

        {/* Live Bottom Stats Bar */}
        <footer 
          className="no-print"
          style={{
            height: '32px',
            borderTop: '1px solid var(--ht-border-card)',
            background: 'var(--ht-bg-base)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            fontSize: '11px',
            color: 'var(--ht-text-muted)'
          }}
        >
          <div>
            <span>{words} words</span>
            <span style={{ margin: '0 8px' }}>•</span>
            <span>{chars} characters</span>
            <span style={{ margin: '0 8px' }}>•</span>
            <span>{readingTimeMin} min read</span>
          </div>
          <div>
            <span>Markdown supported (# Heading, - List, - [ ] Task)</span>
          </div>
        </footer>
      </main>

      {/* TEMPLATES MODAL */}
      {showTemplatesModal && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(5px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={() => setShowTemplatesModal(false)}
        >
          <div 
            style={{
              width: '100%',
              maxWidth: '600px',
              background: 'var(--ht-bg-card)',
              border: '1px solid var(--ht-border-card)',
              borderRadius: '20px',
              padding: '24px',
              maxHeight: '85vh',
              overflowY: 'auto'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--ht-text-primary)' }}>
                  Student & Writer Templates
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--ht-text-muted)' }}>
                  Pre-structured notes designed for high-yield recall and zero blank-page hesitation.
                </p>
              </div>
              <button
                onClick={() => setShowTemplatesModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--ht-text-muted)', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
              {NOTE_TEMPLATES.map(tmpl => (
                <div
                  key={tmpl.id}
                  onClick={() => handleCreateNote(tmpl)}
                  style={{
                    padding: '14px',
                    borderRadius: '12px',
                    background: 'var(--ht-bg-card-subtle)',
                    border: '1px solid var(--ht-border-card)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#2563eb';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--ht-border-card)';
                    e.currentTarget.style.transform = 'none';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '20px' }}>{tmpl.emoji}</span>
                    <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ht-text-primary)' }}>{tmpl.label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '10px', background: 'var(--ht-accent-subtle)', color: '#2563eb', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                      {tmpl.tag}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--ht-text-muted)', lineHeight: '1.4' }}>
                    {tmpl.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MACOS FINDER FILE MANAGER MODAL */}
      <FileManagerModal
        isOpen={isFileManagerOpen}
        onClose={() => setIsFileManagerOpen(false)}
        docs={docs}
        currentDocId={currentDocId}
        onSelectDoc={handleSelectDoc}
        onCreateDoc={(template, targetTag) => handleCreateNote(template, targetTag)}
        onDeleteDoc={handleDeleteNote}
        onUpdateDoc={handleUpdateDoc}
        theme={theme}
      />

      {/* AUTH MODAL */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={(newSession) => {
          setSession(newSession);
          if (newSession?.user?.id) {
            fetchUserProfile(newSession.user.id);
            syncWithSupabase(newSession.user.id, setSyncStatus).then(merged => {
              if (merged && merged.length > 0) setDocs(merged);
            });
          }
        }}
      />
    </div>
  );

  function renderDocListItem(doc) {
    const isSelected = currentDocId === doc.id;
    return (
      <div
        key={doc.id}
        onClick={() => {
          handleSelectDoc(doc.id);
          if (window.innerWidth < 768) {
            setSidebarOpen(false);
          }
        }}
        style={{
          padding: '9px 12px',
          borderRadius: '10px',
          cursor: 'pointer',
          background: isSelected ? 'var(--ht-accent-subtle)' : 'transparent',
          border: '1px solid',
          borderColor: isSelected ? 'rgba(37,99,235,0.25)' : 'transparent',
          transition: 'all 0.12s ease'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
          <span style={{
            fontWeight: isSelected ? 700 : 500,
            fontSize: '13px',
            color: isSelected ? '#2563eb' : 'var(--ht-text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {doc.title || 'Untitled'}
          </span>
          {doc.is_pinned && <span style={{ fontSize: '10px' }}>📌</span>}
        </div>
        <p style={{
          margin: '3px 0 0',
          fontSize: '11px',
          color: 'var(--ht-text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {doc.content ? doc.content.replace(/[#*>\-\[\]]/g, '').slice(0, 50) : 'Empty note...'}
        </p>
      </div>
    );
  }
}

const exportMenuItemStyle = {
  padding: '8px 10px',
  borderRadius: '6px',
  border: 'none',
  background: 'transparent',
  color: 'var(--ht-text-primary)',
  fontSize: '12px',
  fontWeight: 500,
  textAlign: 'left',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  transition: 'background 0.1s'
};
