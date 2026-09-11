import { useState, useRef, useEffect } from 'react';

const TEXT_COLORS = [
  { label: 'Blue', value: '#2563eb', color: '#2563eb' },
  { label: 'Cyan', value: '#0891b2', color: '#0891b2' },
  { label: 'Green', value: '#16a34a', color: '#16a34a' },
  { label: 'Purple', value: '#9333ea', color: '#9333ea' },
  { label: 'Orange', value: '#ea580c', color: '#ea580c' },
  { label: 'Amber', value: '#d97706', color: '#d97706' },
  { label: 'Red', value: '#dc2626', color: '#dc2626' },
  { label: 'Pink', value: '#e11d48', color: '#e11d48' },
  { label: 'Slate', value: '#475569', color: '#475569' },
  { label: 'Muted Gray', value: '#71717a', color: '#71717a' },
  { label: 'Solid Black', value: '#0f172a', color: '#0f172a', border: '1px solid rgba(255,255,255,0.25)' },
  { label: 'Solid White', value: '#ffffff', color: '#ffffff', textColor: '#0f172a', border: '1px solid rgba(0,0,0,0.25)' },
];

const HIGHLIGHT_COLORS = [
  { label: 'None', value: 'transparent', color: 'transparent', border: '#71717a' },
  { label: 'Yellow', value: '#fef08a', color: '#fef08a', textColor: '#1e293b' },
  { label: 'Green', value: '#bbf7d0', color: '#bbf7d0', textColor: '#1e293b' },
  { label: 'Blue', value: '#bfdbfe', color: '#bfdbfe', textColor: '#1e293b' },
  { label: 'Purple', value: '#e9d5ff', color: '#e9d5ff', textColor: '#1e293b' },
  { label: 'Orange', value: '#fed7aa', color: '#fed7aa', textColor: '#1e293b' },
  { label: 'Pink', value: '#fbcfe8', color: '#fbcfe8', textColor: '#1e293b' },
];

const FONT_SIZES = [
  { label: '14px', value: '14px' },
  { label: '16px (Normal)', value: '16px' },
  { label: '18px (Large)', value: '18px' },
  { label: '22px (Heading 2)', value: '22px' },
  { label: '28px (Heading 1)', value: '28px' },
];

export function FormattingToolbar({
  onExecCommand,
  onApplyTextColor,
  onApplyHighlight,
  onApplyFontSize,
  onApplyBlock,
  currentBlock = 'p',
  currentFontSize = '16px',
  activeStyles = {}
}) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [selectedColor, setSelectedColor] = useState('default');
  const [selectedHighlight, setSelectedHighlight] = useState('#fef08a');

  const colorDropdownRef = useRef(null);
  const highlightDropdownRef = useRef(null);
  const sizeDropdownRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (colorDropdownRef.current && !colorDropdownRef.current.contains(e.target)) {
        setShowColorPicker(false);
      }
      if (highlightDropdownRef.current && !highlightDropdownRef.current.contains(e.target)) {
        setShowHighlightPicker(false);
      }
      if (sizeDropdownRef.current && !sizeDropdownRef.current.contains(e.target)) {
        setShowSizePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAction = (callback) => (e) => {
    // Crucial: prevent mousedown from stealing focus from editor selection!
    e.preventDefault();
    callback();
  };

  return (
    <div
      className="no-print formatting-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '6px 14px',
        background: 'var(--ht-bg-base)',
        borderBottom: '1px solid var(--ht-border-card)',
        position: 'sticky',
        top: 0,
        zIndex: 9,
        flexWrap: 'wrap',
        userSelect: 'none'
      }}
    >
      {/* 1. Hierarchy / Block Type (Normal, H1, H2, H3, Quote) */}
      <select
        value={currentBlock}
        onChange={(e) => onApplyBlock(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          padding: '4px 8px',
          borderRadius: '6px',
          border: '1px solid var(--ht-border-card)',
          background: 'var(--ht-bg-card)',
          color: 'var(--ht-text-primary)',
          fontSize: '12px',
          fontWeight: 600,
          outline: 'none',
          cursor: 'pointer'
        }}
        title="Text Style"
      >
        <option value="p">Normal text</option>
        <option value="h1">Title (Heading 1)</option>
        <option value="h2">Section (Heading 2)</option>
        <option value="h3">Subheading (Heading 3)</option>
        <option value="blockquote">Quote block</option>
      </select>

      {/* 2. Granular Text Size */}
      <div style={{ position: 'relative' }} ref={sizeDropdownRef}>
        <button
          type="button"
          onMouseDown={handleAction(() => {
            setShowSizePicker(!showSizePicker);
            setShowColorPicker(false);
            setShowHighlightPicker(false);
          })}
          title="Font Size"
          style={{
            padding: '4px 8px',
            borderRadius: '6px',
            border: '1px solid var(--ht-border-card)',
            background: showSizePicker ? 'var(--ht-accent-subtle)' : 'var(--ht-bg-card)',
            color: 'var(--ht-text-primary)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <span>Aa</span>
          <span style={{ fontSize: '9px', opacity: 0.7 }}>▾</span>
        </button>

        {showSizePicker && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              background: 'var(--ht-bg-card)',
              border: '1px solid var(--ht-border-card)',
              borderRadius: '8px',
              padding: '4px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              zIndex: 100,
              minWidth: '130px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px'
            }}
          >
            {FONT_SIZES.map(s => (
              <button
                key={s.value}
                type="button"
                onMouseDown={handleAction(() => {
                  onApplyFontSize(s.value);
                  setShowSizePicker(false);
                })}
                style={{
                  padding: '6px 10px',
                  borderRadius: '5px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--ht-text-primary)',
                  fontSize: s.value === '28px' ? '15px' : s.value === '22px' ? '14px' : '12px',
                  fontWeight: s.value.includes('Heading') ? 700 : 500,
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--ht-accent-subtle)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ width: '1px', height: '18px', background: 'var(--ht-border-card)', margin: '0 4px' }} />

      {/* 3. Basic Formatting (Bold, Italic, Underline, Strikethrough) */}
      <button
        type="button"
        onMouseDown={handleAction(() => onExecCommand('bold'))}
        title="Bold (Ctrl+B)"
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '6px',
          border: 'none',
          background: activeStyles.bold ? 'var(--ht-accent-subtle)' : 'transparent',
          color: activeStyles.bold ? '#2563eb' : 'var(--ht-text-primary)',
          fontSize: '13px',
          fontWeight: 800,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        B
      </button>

      <button
        type="button"
        onMouseDown={handleAction(() => onExecCommand('italic'))}
        title="Italic (Ctrl+I)"
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '6px',
          border: 'none',
          background: activeStyles.italic ? 'var(--ht-accent-subtle)' : 'transparent',
          color: activeStyles.italic ? '#2563eb' : 'var(--ht-text-primary)',
          fontSize: '13px',
          fontStyle: 'italic',
          fontFamily: 'serif',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        I
      </button>

      <button
        type="button"
        onMouseDown={handleAction(() => onExecCommand('underline'))}
        title="Underline (Ctrl+U)"
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '6px',
          border: 'none',
          background: activeStyles.underline ? 'var(--ht-accent-subtle)' : 'transparent',
          color: activeStyles.underline ? '#2563eb' : 'var(--ht-text-primary)',
          fontSize: '13px',
          textDecoration: 'underline',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        U
      </button>

      <button
        type="button"
        onMouseDown={handleAction(() => onExecCommand('strikeThrough'))}
        title="Strikethrough"
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '6px',
          border: 'none',
          background: 'transparent',
          color: 'var(--ht-text-muted)',
          fontSize: '12px',
          textDecoration: 'line-through',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        S
      </button>

      <div style={{ width: '1px', height: '18px', background: 'var(--ht-border-card)', margin: '0 4px' }} />

      {/* 4. Text Color Picker */}
      <div style={{ position: 'relative' }} ref={colorDropdownRef}>
        <button
          type="button"
          onMouseDown={handleAction(() => {
            setShowColorPicker(!showColorPicker);
            setShowHighlightPicker(false);
            setShowSizePicker(false);
          })}
          title="Text Color"
          style={{
            padding: '3px 6px',
            borderRadius: '6px',
            border: '1px solid var(--ht-border-card)',
            background: showColorPicker ? 'var(--ht-accent-subtle)' : 'transparent',
            color: 'var(--ht-text-primary)',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1px',
            minWidth: '28px',
            height: '28px'
          }}
        >
          <span style={{ lineHeight: 1 }}>A</span>
          <span
            style={{
              width: '14px',
              height: '3px',
              borderRadius: '1px',
              background: selectedColor === 'default' ? 'var(--ht-text-primary)' : selectedColor
            }}
          />
        </button>

        {showColorPicker && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              background: 'var(--ht-bg-card)',
              border: '1px solid var(--ht-border-card)',
              borderRadius: '10px',
              padding: '10px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
              zIndex: 100,
              minWidth: '185px'
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ht-text-muted)', marginBottom: '8px', paddingLeft: '2px' }}>
              Text Color
            </div>

            {/* Prominent Default / Theme Auto Option */}
            <button
              type="button"
              title="Default Theme Color (White in Dark Mode, Black in Light Mode)"
              onMouseDown={handleAction(() => {
                setSelectedColor('default');
                onApplyTextColor('default');
                setShowColorPicker(false);
              })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '6px 8px',
                borderRadius: '6px',
                border: selectedColor === 'default' ? '1px solid var(--ht-accent)' : '1px solid var(--ht-border-card)',
                background: selectedColor === 'default' ? 'var(--ht-accent-subtle)' : 'var(--ht-bg-card-subtle, rgba(255,255,255,0.04))',
                cursor: 'pointer',
                textAlign: 'left',
                marginBottom: '10px',
                transition: 'background 0.15s ease, border-color 0.15s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--ht-accent)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = selectedColor === 'default' ? 'var(--ht-accent)' : 'var(--ht-border-card)'}
            >
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #ffffff 50%, #0f172a 50%)',
                  border: '1px solid var(--ht-border-card)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                  flexShrink: 0
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ht-text-primary)', lineHeight: 1.2 }}>
                  Default (Auto)
                </span>
                <span style={{ fontSize: '10px', color: 'var(--ht-text-muted)', lineHeight: 1.2 }}>
                  White / Black by theme
                </span>
              </div>
              {selectedColor === 'default' && (
                <span style={{ fontSize: '12px', color: 'var(--ht-accent)', fontWeight: 700 }}>✓</span>
              )}
            </button>

            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--ht-text-muted)', marginBottom: '6px', paddingLeft: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Color Palette
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
              {TEXT_COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onMouseDown={handleAction(() => {
                    setSelectedColor(c.value);
                    onApplyTextColor(c.value);
                    setShowColorPicker(false);
                  })}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    border: c.border || (selectedColor === c.value ? '2px solid var(--ht-accent)' : '1px solid var(--ht-border-card)'),
                    background: c.color,
                    color: c.textColor || '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 700,
                    transition: 'transform 0.1s ease',
                    boxShadow: selectedColor === c.value ? '0 0 0 1px var(--ht-accent)' : 'none'
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {selectedColor === c.value ? '✓' : ''}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 5. Highlighter / Marker Picker */}
      <div style={{ position: 'relative' }} ref={highlightDropdownRef}>
        <button
          type="button"
          onMouseDown={handleAction(() => {
            setShowHighlightPicker(!showHighlightPicker);
            setShowColorPicker(false);
            setShowSizePicker(false);
          })}
          title="Highlight Color (Marker)"
          style={{
            padding: '3px 6px',
            borderRadius: '6px',
            border: '1px solid var(--ht-border-card)',
            background: showHighlightPicker ? 'var(--ht-accent-subtle)' : 'transparent',
            color: 'var(--ht-text-primary)',
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1px',
            minWidth: '28px',
            height: '28px'
          }}
        >
          <span style={{ fontSize: '11px' }}>🖍️</span>
          <span style={{ width: '14px', height: '3px', borderRadius: '1px', background: selectedHighlight }} />
        </button>

        {showHighlightPicker && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              background: 'var(--ht-bg-card)',
              border: '1px solid var(--ht-border-card)',
              borderRadius: '10px',
              padding: '8px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
              zIndex: 100,
              minWidth: '160px'
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ht-text-muted)', marginBottom: '6px', paddingLeft: '4px' }}>
              Highlighter Marker
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
              {HIGHLIGHT_COLORS.map(h => (
                <button
                  key={h.label}
                  type="button"
                  title={h.label}
                  onMouseDown={handleAction(() => {
                    setSelectedHighlight(h.value === 'transparent' ? 'transparent' : h.value);
                    onApplyHighlight(h.value);
                    setShowHighlightPicker(false);
                  })}
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '6px',
                    border: h.border ? `1px solid ${h.border}` : '1px solid rgba(0,0,0,0.1)',
                    background: h.value,
                    color: h.value === 'transparent' ? 'var(--ht-text-muted)' : h.textColor || '#1e293b',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    fontWeight: 800,
                    transition: 'transform 0.1s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {h.value === 'transparent' ? '✕' : 'Ab'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ width: '1px', height: '18px', background: 'var(--ht-border-card)', margin: '0 4px' }} />

      {/* 6. Lists */}
      <button
        type="button"
        onMouseDown={handleAction(() => onExecCommand('insertUnorderedList'))}
        title="Bullet List"
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '6px',
          border: 'none',
          background: 'transparent',
          color: 'var(--ht-text-muted)',
          fontSize: '13px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        •≡
      </button>

      <button
        type="button"
        onMouseDown={handleAction(() => onExecCommand('insertOrderedList'))}
        title="Numbered List"
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '6px',
          border: 'none',
          background: 'transparent',
          color: 'var(--ht-text-muted)',
          fontSize: '12px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        1.≡
      </button>

      <div style={{ width: '1px', height: '18px', background: 'var(--ht-border-card)', margin: '0 4px' }} />

      {/* 7. Clear Formatting */}
      <button
        type="button"
        onMouseDown={handleAction(() => {
          onExecCommand('removeFormat');
          onApplyHighlight('transparent');
        })}
        title="Clear Formatting"
        style={{
          padding: '4px 6px',
          borderRadius: '6px',
          border: 'none',
          background: 'transparent',
          color: 'var(--ht-text-muted)',
          fontSize: '11px',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '2px'
        }}
      >
        <span>T̸</span>
      </button>
    </div>
  );
}
