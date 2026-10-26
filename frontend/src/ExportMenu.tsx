import React, { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown, FileSpreadsheet, FileText, FileCheck, RefreshCw, AlertCircle } from 'lucide-react';
import { getCookieCsrf, fetchCsrfToken } from './api';

export interface ExportColumn {
  key: string;
  label: string;
  type?: string;
}

export interface ExportMenuProps {
  title?: string;
  filename?: string;
  endpoint?: string;
  columns?: ExportColumn[];
  rows?: Array<Record<string, any>> | (() => Array<Record<string, any>>);
  meta?: Record<string, any>;
  notify?: (msg: string) => void;
  label?: string;
  size?: 'sm' | 'md';
  align?: 'left' | 'right';
  className?: string;
}

export default function ExportMenu({
  title = 'Data Export',
  filename = 'export',
  endpoint,
  columns = [],
  rows,
  meta,
  notify,
  label = 'Download',
  size = 'md',
  align = 'right',
  className = ''
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeFmt, setActiveFmt] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const handleExport = async (fmt: 'csv' | 'xlsx' | 'pdf') => {
    setLoading(true);
    setActiveFmt(fmt);
    setOpen(false);

    try {
      let response: Response;
      const cleanFmt = fmt.toLowerCase();

      if (endpoint) {
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
        const base = cleanEndpoint.startsWith('api/v1/') ? `/${cleanEndpoint}` : `/api/v1/${cleanEndpoint}`;
        const sep = base.includes('?') ? '&' : '?';
        const targetUrl = `${base}${sep}format=${cleanFmt}`;

        response = await fetch(targetUrl, {
          credentials: 'include',
          headers: {
            'Accept': cleanFmt === 'xlsx'
              ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              : cleanFmt === 'pdf'
                ? 'application/pdf'
                : 'text/csv'
          }
        });
      } else {
        // Use universal client-side export
        const rowData = typeof rows === 'function' ? rows() : (rows || []);
        let csrf = getCookieCsrf();
        if (!csrf) {
          csrf = await fetchCsrfToken(true);
        }

        response = await fetch('/api/v1/export/', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf ? { 'X-CSRFToken': csrf } : {})
          },
          body: JSON.stringify({
            title,
            filename,
            columns,
            rows: rowData,
            format: cleanFmt,
            meta: meta || {}
          })
        });
      }

      if (!response.ok) {
        let errMsg = `Export failed (${response.status})`;
        try {
          const errJson = await response.json();
          if (errJson.detail) errMsg = errJson.detail;
        } catch {
          const errText = await response.text();
          if (errText) errMsg = errText.slice(0, 150);
        }
        throw new Error(errMsg);
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('content-disposition');
      let downloadName = `${filename}.${cleanFmt}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match && match[1]) {
          downloadName = match[1].replace(/['"]/g, '').trim();
        }
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(url), 10000);

      notify?.(`Downloaded ${downloadName}`);
    } catch (err: any) {
      console.error('Export error:', err);
      notify?.(err.message || 'Export failed. Please try again.');
    } finally {
      setLoading(false);
      setActiveFmt(null);
    }
  };

  return (
    <div className={`export-menu-container ${className}`} ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className={`outline-btn export-trigger-btn ${size === 'sm' ? 'btn-sm' : ''}`}
        onClick={() => setOpen(prev => !prev)}
        disabled={loading}
        title="Download / Export data"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontWeight: 600,
          cursor: loading ? 'wait' : 'pointer'
        }}
      >
        {loading ? (
          <>
            <RefreshCw size={size === 'sm' ? 13 : 15} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
            <span>Exporting {activeFmt?.toUpperCase()}...</span>
          </>
        ) : (
          <>
            <Download size={size === 'sm' ? 14 : 16} />
            <span>{label}</span>
            <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </>
        )}
      </button>

      {open && (
        <div
          className="export-dropdown-popover"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            [align === 'right' ? 'right' : 'left']: 0,
            zIndex: 1050,
            minWidth: '220px',
            background: 'var(--panel-bg, #ffffff)',
            color: 'var(--text-color, #1e293b)',
            border: '1px solid var(--border-color, #e2e8f0)',
            borderRadius: '10px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            padding: '6px',
            animation: 'fadeIn 0.15s ease-out'
          }}
        >
          <div style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b' }}>
            Choose Format
          </div>

          <button
            type="button"
            className="export-option-btn"
            onClick={() => handleExport('csv')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 10px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '13px'
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg, #f1f5f9)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ color: '#059669', display: 'flex' }}><FileText size={16} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>CSV Spreadsheet</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>.csv (UTF-8 with BOM)</div>
            </div>
          </button>

          <button
            type="button"
            className="export-option-btn"
            onClick={() => handleExport('xlsx')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 10px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '13px'
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg, #f1f5f9)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ color: '#0284c7', display: 'flex' }}><FileSpreadsheet size={16} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>Excel Workbook</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>.xlsx (Styled & Auto-width)</div>
            </div>
          </button>

          <button
            type="button"
            className="export-option-btn"
            onClick={() => handleExport('pdf')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 10px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '13px'
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg, #f1f5f9)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ color: '#e11d48', display: 'flex' }}><FileCheck size={16} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>Printable Document</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>.pdf (Landscape A4)</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
