import { useState, useMemo, useEffect, useRef } from 'react';

const DEFAULT_FOLDERS = [
  { id: 'all', name: 'All Notes', emoji: '📁', isSystem: true },
  { id: 'pinned', name: 'Pinned Notes', emoji: '📌', isSystem: true },
  { id: 'Lecture', name: 'Lecture Notes', emoji: '🎓' },
  { id: 'Study', name: 'Exam Revision', emoji: '📚' },
  { id: 'Essay', name: 'Essays & Papers', emoji: '📝' },
  { id: 'Ideas', name: 'Ideas & Projects', emoji: '💡' },
  { id: 'Daily', name: 'Daily Reflections', emoji: '🌱' },
  { id: 'General', name: 'General', emoji: '📂' },
];

export function FileManagerModal({
  isOpen,
  onClose,
  docs = [],
  currentDocId,
  onSelectDoc,
  onCreateDoc,
  onDeleteDoc,
  onUpdateDoc,
  theme = 'dark'
}) {
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('ht_finder_view') || 'grid'); // 'grid' | 'list'
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date'); // 'date' | 'name' | 'words'
  const [folders, setFolders] = useState(() => {
    try {
      const saved = localStorage.getItem('ht_custom_folders');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_FOLDERS;
  });
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderEmoji, setNewFolderEmoji] = useState('📁');
  const [movingDocId, setMovingDocId] = useState(null);

  const searchInputRef = useRef(null);

  // Save view mode preference
  useEffect(() => {
    localStorage.setItem('ht_finder_view', viewMode);
  }, [viewMode]);

  // Save custom folders
  useEffect(() => {
    localStorage.setItem('ht_custom_folders', JSON.stringify(folders));
  }, [folders]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Focus search when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 120);
    }
  }, [isOpen]);

  // Calculate item counts per folder
  const folderCounts = useMemo(() => {
    const counts = { all: docs.length, pinned: docs.filter(d => d.is_pinned).length };
    for (const d of docs) {
      const f = d.tag || 'General';
      counts[f] = (counts[f] || 0) + 1;
    }
    return counts;
  }, [docs]);

  // Filtered & Sorted documents
  const filteredDocs = useMemo(() => {
    let list = [...docs];

    // Filter by folder / view
    if (selectedFolder === 'pinned') {
      list = list.filter(d => d.is_pinned);
    } else if (selectedFolder !== 'all') {
      list = list.filter(d => (d.tag || 'General').toLowerCase() === selectedFolder.toLowerCase());
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(d => 
        (d.title && d.title.toLowerCase().includes(q)) ||
        (d.content && d.content.toLowerCase().includes(q)) ||
        (d.tag && d.tag.toLowerCase().includes(q))
      );
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === 'name') {
        return (a.title || '').localeCompare(b.title || '');
      }
      if (sortBy === 'words') {
        return (b.word_count || 0) - (a.word_count || 0);
      }
      // Default: date modified descending
      return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    });

    return list;
  }, [docs, selectedFolder, searchQuery, sortBy]);

  // Create custom folder
  const handleAddFolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    const exists = folders.some(f => f.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) return;

    const newF = {
      id: trimmed,
      name: trimmed,
      emoji: newFolderEmoji || '📁'
    };

    setFolders(prev => [...prev, newF]);
    setSelectedFolder(newF.id);
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  // Move document to folder
  const handleMoveDoc = (docId, targetFolder) => {
    if (onUpdateDoc) {
      onUpdateDoc(docId, { tag: targetFolder });
    }
    setMovingDocId(null);
  };

  if (!isOpen) return null;

  const currentFolderObj = folders.find(f => f.id === selectedFolder) || { name: selectedFolder, emoji: '📁' };

  return (
    <div 
      className="finder-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 7, 12, 0.75)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        animation: 'finderFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      <style>{`
        @keyframes finderFadeIn {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }

        .finder-window {
          background: var(--ht-bg-sidebar);
          border: 1px solid var(--ht-border-card);
          box-shadow: 0 28px 70px rgba(0, 0, 0, 0.65), 0 0 1px 1px rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          width: 94vw;
          max-width: 1040px;
          height: 680px;
          max-height: 88vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif;
        }

        .finder-sidebar-item {
          padding: 8px 12px;
          border-radius: 9px;
          font-size: 13px;
          font-weight: 500;
          color: var(--ht-text-primary);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          cursor: pointer;
          transition: all 0.12s ease;
          border: 1px solid transparent;
        }

        .finder-sidebar-item:hover {
          background: var(--ht-bg-card);
        }

        .finder-sidebar-item.active {
          background: #2563eb;
          color: #ffffff;
        }

        .finder-count-badge {
          font-size: 11px;
          font-weight: 600;
          padding: 1px 7px;
          border-radius: 999px;
          background: var(--ht-bg-card);
          color: var(--ht-text-muted);
          flex-shrink: 0;
          line-height: 1.3;
        }

        .finder-sidebar-item.active .finder-count-badge {
          background: rgba(255, 255, 255, 0.22);
          color: #ffffff;
        }

        .finder-doc-card {
          background: var(--ht-bg-card);
          border: 1px solid var(--ht-border-card);
          border-radius: 12px;
          padding: 14px;
          cursor: pointer;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          flex-direction: column;
          position: relative;
          user-select: none;
        }

        .finder-doc-card:hover {
          transform: translateY(-2px);
          border-color: rgba(37, 99, 235, 0.4);
          box-shadow: 0 8px 24px rgba(0,0,0,0.18);
        }

        .finder-doc-card.active {
          border-color: #2563eb;
          box-shadow: 0 0 0 1px #2563eb;
        }

        .finder-table-row {
          display: grid;
          grid-template-columns: 2.2fr 1.2fr 1fr 1.2fr 80px;
          align-items: center;
          padding: 10px 14px;
          font-size: 12.5px;
          border-bottom: 1px solid var(--ht-border-subtle);
          cursor: pointer;
          transition: background 0.1s ease;
        }

        .finder-table-row:hover {
          background: var(--ht-bg-card);
        }

        .finder-table-row.active {
          background: rgba(37, 99, 235, 0.12);
        }

        @media (max-width: 768px) {
          .finder-window {
            height: 94vh;
            border-radius: 20px 20px 0 0;
            margin-top: auto;
          }
          .finder-sidebar-panel {
            display: none !important;
          }
          .finder-table-row {
            grid-template-columns: 1fr 90px;
          }
        }
      `}</style>

      <div className="finder-window">
        {/* macOS Titlebar */}
        <div 
          style={{
            height: '52px',
            padding: '0 16px',
            background: 'var(--ht-bg-base)',
            borderBottom: '1px solid var(--ht-border-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '14px',
            flexShrink: 0
          }}
        >
          {/* Left: HabiTick Brand Mark (Replacing macOS dots) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: '150px' }}>
            <img 
              src="/habitick-blue-logo.png" 
              alt="HabiTick Logo" 
              style={{ width: "24px", height: "24px", borderRadius: "6px", objectFit: "contain" }} 
            />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '15.5px', color: 'var(--ht-text-primary)', letterSpacing: '-0.01em' }}>
                HabiTick
              </span>
              <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Files
              </span>
            </div>
          </div>

          {/* Center: Search & Path Breadcrumbs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, maxWidth: '520px' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search documents or tags (⌘F)..."
                style={{
                  width: '100%',
                  padding: '6px 12px 6px 32px',
                  borderRadius: '8px',
                  border: '1px solid var(--ht-border-card)',
                  background: 'var(--ht-bg-card)',
                  color: 'var(--ht-text-primary)',
                  fontSize: '12.5px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', opacity: 0.6 }}>
                🔍
              </span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--ht-text-muted)',
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Right: View Mode Toggle & New Note Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* View Switcher (Grid vs List) */}
            <div style={{ display: 'flex', background: 'var(--ht-bg-card)', borderRadius: '7px', padding: '2px', border: '1px solid var(--ht-border-card)' }}>
              <button
                onClick={() => setViewMode('grid')}
                title="Icon / Grid View"
                style={{
                  padding: '4px 8px',
                  borderRadius: '5px',
                  border: 'none',
                  background: viewMode === 'grid' ? '#2563eb' : 'transparent',
                  color: viewMode === 'grid' ? '#fff' : 'var(--ht-text-muted)',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                ⊞
              </button>
              <button
                onClick={() => setViewMode('list')}
                title="List / Column View"
                style={{
                  padding: '4px 8px',
                  borderRadius: '5px',
                  border: 'none',
                  background: viewMode === 'list' ? '#2563eb' : 'transparent',
                  color: viewMode === 'list' ? '#fff' : 'var(--ht-text-muted)',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                ☰
              </button>
            </div>

            {/* Quick Create Note */}
            <button
              onClick={() => {
                const targetTag = (selectedFolder !== 'all' && selectedFolder !== 'pinned') ? selectedFolder : 'General';
                onCreateDoc(null, targetTag);
                onClose();
              }}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: 'none',
                background: '#2563eb',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>+</span> New Note
            </button>

            {/* Divider */}
            <div style={{ width: '1px', height: '18px', background: 'var(--ht-border-card)', margin: '0 2px' }} />

            {/* Signature HabiTick X Close Button */}
            <button
              onClick={onClose}
              title="Close (Esc)"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'var(--ht-bg-card)',
                border: '1px solid var(--ht-border-card)',
                color: 'var(--ht-text-muted)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
                padding: 0
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                e.currentTarget.style.color = '#ef4444';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'var(--ht-bg-card)';
                e.currentTarget.style.borderColor = 'var(--ht-border-card)';
                e.currentTarget.style.color = 'var(--ht-text-muted)';
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Finder Body: Left Sidebar + Main Canvas */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* macOS Left Sidebar */}
          <aside 
            className="finder-sidebar-panel"
            style={{
              width: '230px',
              borderRight: '1px solid var(--ht-border-card)',
              background: 'var(--ht-bg-base)',
              display: 'flex',
              flexDirection: 'column',
              padding: '12px 10px',
              overflowY: 'auto',
              flexShrink: 0
            }}
          >
            {/* Section: Favorites */}
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ht-text-muted)', padding: '6px 8px' }}>
              Favorites
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '16px' }}>
              <div
                className={`finder-sidebar-item ${selectedFolder === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedFolder('all')}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span>📁</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>All Notes</span>
                </span>
                <span className="finder-count-badge">{folderCounts.all || 0}</span>
              </div>
              <div
                className={`finder-sidebar-item ${selectedFolder === 'pinned' ? 'active' : ''}`}
                onClick={() => setSelectedFolder('pinned')}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span>📌</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Pinned Notes</span>
                </span>
                <span className="finder-count-badge">{folderCounts.pinned || 0}</span>
              </div>
            </div>

            {/* Section: Folders / Subjects */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ht-text-muted)' }}>
                Folders
              </span>
              <button
                onClick={() => setIsCreatingFolder(true)}
                title="Create New Folder"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  padding: '0 4px'
                }}
              >
                +
              </button>
            </div>

            {/* Inline New Folder Input */}
            {isCreatingFolder && (
              <div style={{ padding: '6px 8px', marginBottom: '6px' }}>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    placeholder="Folder name..."
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddFolder();
                      if (e.key === 'Escape') setIsCreatingFolder(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '5px 8px',
                      borderRadius: '6px',
                      border: '1px solid #2563eb',
                      background: 'var(--ht-bg-card)',
                      color: 'var(--ht-text-primary)',
                      fontSize: '12px',
                      outline: 'none'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setIsCreatingFolder(false)}
                    style={{ padding: '3px 8px', borderRadius: '4px', border: 'none', background: 'transparent', color: 'var(--ht-text-muted)', fontSize: '11px', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddFolder}
                    style={{ padding: '3px 8px', borderRadius: '4px', border: 'none', background: '#2563eb', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Create
                  </button>
                </div>
              </div>
            )}

            {/* Folders List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', overflowY: 'auto' }}>
              {folders.filter(f => !f.isSystem).map(f => {
                const isSel = selectedFolder.toLowerCase() === f.id.toLowerCase();
                const count = folderCounts[f.id] || 0;
                return (
                  <div
                    key={f.id}
                    className={`finder-sidebar-item ${isSel ? 'active' : ''}`}
                    onClick={() => setSelectedFolder(f.id)}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ flexShrink: 0 }}>{f.emoji || '📁'}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                    </span>
                    <span className="finder-count-badge">{count}</span>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Main Document Grid / Details List */}
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--ht-canvas-bg)' }}>
            {/* Folder Header & Sorting Controls */}
            <div 
              style={{
                padding: '12px 20px',
                borderBottom: '1px solid var(--ht-border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>{currentFolderObj.emoji || '📁'}</span>
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ht-text-primary)' }}>
                  {currentFolderObj.name}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--ht-text-muted)' }}>
                  ({filteredDocs.length} {filteredDocs.length === 1 ? 'item' : 'items'})
                </span>
              </div>

              {/* Sort By Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--ht-text-muted)' }}>Sort by:</span>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--ht-border-card)',
                    background: 'var(--ht-bg-card)',
                    color: 'var(--ht-text-primary)',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="date">Date Modified</option>
                  <option value="name">Name (A-Z)</option>
                  <option value="words">Word Count</option>
                </select>
              </div>
            </div>

            {/* Documents Container */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {filteredDocs.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ht-text-muted)', gap: '10px' }}>
                  <div style={{ fontSize: '36px', opacity: 0.6 }}>📂</div>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>No documents in this folder</div>
                  <button
                    onClick={() => {
                      const targetTag = (selectedFolder !== 'all' && selectedFolder !== 'pinned') ? selectedFolder : 'General';
                      onCreateDoc(null, targetTag);
                      onClose();
                    }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      background: '#2563eb',
                      color: '#fff',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    + Create First Note Here
                  </button>
                </div>
              ) : viewMode === 'grid' ? (
                /* ── macOS GRID VIEW ── */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '14px' }}>
                  {filteredDocs.map(doc => {
                    const isSelected = currentDocId === doc.id;
                    const dateFormatted = new Date(doc.updated_at || Date.now()).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric'
                    });
                    const snippet = (doc.content || '')
                      .replace(/<[^>]*>/g, ' ')
                      .replace(/\s+/g, ' ')
                      .trim()
                      .slice(0, 80);

                    return (
                      <div
                        key={doc.id}
                        className={`finder-doc-card ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          onSelectDoc(doc.id);
                          onClose();
                        }}
                      >
                        {/* Header: Doc Icon & Options */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <div style={{
                            width: '32px',
                            height: '38px',
                            borderRadius: '5px',
                            background: 'rgba(37, 99, 235, 0.12)',
                            border: '1px solid rgba(37, 99, 235, 0.25)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '16px'
                          }}>
                            📄
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {doc.is_pinned && <span style={{ fontSize: '11px' }} title="Pinned">📌</span>}
                            {/* Options Button */}
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setMovingDocId(movingDocId === doc.id ? null : doc.id);
                              }}
                              title="Organize / Move"
                              style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '5px',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--ht-text-muted)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                fontSize: '13px',
                                padding: 0
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = 'var(--ht-border-subtle)';
                                e.currentTarget.style.color = 'var(--ht-text-primary)';
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'var(--ht-text-muted)';
                              }}
                            >
                              •••
                            </button>
                          </div>
                        </div>

                        {/* Action Popover: Move, Pin, Delete */}
                        {movingDocId === doc.id && (
                          <div 
                            onClick={e => e.stopPropagation()}
                            style={{
                              position: 'absolute',
                              top: '40px',
                              right: '10px',
                              background: 'var(--ht-bg-sidebar)',
                              border: '1px solid var(--ht-border-card)',
                              borderRadius: '8px',
                              padding: '6px',
                              boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
                              zIndex: 100,
                              minWidth: '160px'
                            }}
                          >
                            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ht-text-muted)', marginBottom: '4px', paddingLeft: '4px' }}>
                              MOVE TO FOLDER:
                            </div>
                            {folders.filter(f => !f.isSystem).map(f => (
                              <button
                                key={f.id}
                                onClick={() => handleMoveDoc(doc.id, f.id)}
                                style={{
                                  width: '100%',
                                  padding: '5px 8px',
                                  borderRadius: '5px',
                                  border: 'none',
                                  background: (doc.tag || 'General').toLowerCase() === f.id.toLowerCase() ? '#2563eb' : 'transparent',
                                  color: (doc.tag || 'General').toLowerCase() === f.id.toLowerCase() ? '#fff' : 'var(--ht-text-primary)',
                                  fontSize: '11.5px',
                                  textAlign: 'left',
                                  cursor: 'pointer'
                                }}
                              >
                                {f.emoji || '📁'} {f.name}
                              </button>
                            ))}
                            <div style={{ height: '1px', background: 'var(--ht-border-subtle)', margin: '4px 0' }} />
                            <button
                              onClick={() => {
                                onUpdateDoc(doc.id, { is_pinned: !doc.is_pinned });
                                setMovingDocId(null);
                              }}
                              style={{
                                width: '100%',
                                padding: '5px 8px',
                                borderRadius: '5px',
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--ht-text-primary)',
                                fontSize: '11.5px',
                                textAlign: 'left',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              <span>{doc.is_pinned ? '📍' : '📌'}</span>
                              <span>{doc.is_pinned ? 'Unpin note' : 'Pin note'}</span>
                            </button>
                            <button
                              onClick={() => {
                                onDeleteDoc(doc.id);
                                setMovingDocId(null);
                              }}
                              style={{
                                width: '100%',
                                padding: '5px 8px',
                                borderRadius: '5px',
                                border: 'none',
                                background: 'transparent',
                                color: '#ef4444',
                                fontSize: '11.5px',
                                textAlign: 'left',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              <span>🗑️</span>
                              <span>Delete note</span>
                            </button>
                          </div>
                        )}

                        {/* Title */}
                        <div style={{
                          fontWeight: 700,
                          fontSize: '13.5px',
                          color: 'var(--ht-text-primary)',
                          marginBottom: '4px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {doc.title || 'Untitled Note'}
                        </div>

                        {/* Text Snippet Preview */}
                        <p style={{
                          fontSize: '11.5px',
                          color: 'var(--ht-text-muted)',
                          lineHeight: '1.45',
                          margin: '0 0 12px',
                          flex: 1,
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical'
                        }}>
                          {snippet || 'Empty document...'}
                        </p>

                        {/* Footer Metadata: Tag pill + Words + Date */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--ht-text-muted)', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid var(--ht-border-subtle)' }}>
                          <span style={{
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: 'var(--ht-bg-card-subtle)',
                            color: 'var(--ht-text-secondary)',
                            fontWeight: 600,
                            fontSize: '10px'
                          }}>
                            {doc.tag || 'General'}
                          </span>
                          <span>{doc.word_count || 0}w • {dateFormatted}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* ── macOS LIST / TABLE VIEW ── */
                <div style={{ borderRadius: '10px', border: '1px solid var(--ht-border-card)', background: 'var(--ht-bg-sidebar)', overflow: 'hidden' }}>
                  {/* Table Header */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '2.2fr 1.2fr 1fr 1.2fr 80px',
                    padding: '8px 14px',
                    background: 'var(--ht-bg-base)',
                    borderBottom: '1px solid var(--ht-border-card)',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--ht-text-muted)',
                    letterSpacing: '0.05em'
                  }}>
                    <span>Name</span>
                    <span>Folder</span>
                    <span>Words</span>
                    <span>Date Modified</span>
                    <span>Actions</span>
                  </div>

                  {/* Rows */}
                  {filteredDocs.map(doc => {
                    const isSelected = currentDocId === doc.id;
                    const dateFormatted = new Date(doc.updated_at || Date.now()).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    });

                    return (
                      <div
                        key={doc.id}
                        className={`finder-table-row ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          onSelectDoc(doc.id);
                          onClose();
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: 'var(--ht-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span>📄</span>
                          {doc.is_pinned && <span style={{ fontSize: '10px' }}>📌</span>}
                          {doc.title || 'Untitled Note'}
                        </span>
                        <span>
                          <span style={{ padding: '2px 7px', borderRadius: '4px', background: 'var(--ht-bg-card-subtle)', color: 'var(--ht-text-secondary)', fontSize: '11px', fontWeight: 600 }}>
                            {doc.tag || 'General'}
                          </span>
                        </span>
                        <span style={{ color: 'var(--ht-text-muted)' }}>{doc.word_count || 0}</span>
                        <span style={{ color: 'var(--ht-text-muted)' }}>{dateFormatted}</span>
                        <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => onUpdateDoc(doc.id, { is_pinned: !doc.is_pinned })}
                            title={doc.is_pinned ? 'Unpin' : 'Pin'}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', padding: '2px 4px' }}
                          >
                            {doc.is_pinned ? '📌' : '📍'}
                          </button>
                          <button
                            onClick={() => onDeleteDoc(doc.id)}
                            title="Delete note"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', padding: '2px 4px' }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* HabiTick Bottom Status Bar */}
            <div 
              style={{
                height: '28px',
                padding: '0 16px',
                background: 'var(--ht-bg-base)',
                borderTop: '1px solid var(--ht-border-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11px',
                color: 'var(--ht-text-muted)',
                flexShrink: 0
              }}
            >
              <span>{filteredDocs.length} {filteredDocs.length === 1 ? 'item' : 'items'} • {filteredDocs.reduce((acc, d) => acc + (d.word_count || 0), 0)} total words</span>
              <span>HabiTick Cloud › Docs › {currentFolderObj.name}</span>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
