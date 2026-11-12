import React from 'react';
import { Printer, X, Copy, Check, KeyRound } from 'lucide-react';

export interface CredentialsReceiptData {
  school_name: string;
  campus_code: string;
  student_id: number;
  admission_number: string;
  student_name: string;
  class_name: string;
  section: string;
  class_teacher_name: string;
  academic_year: string;
  username: string;
  temporary_password: string;
  login_url: string;
  issued_date: string;
  issued_by: string;
  instructions: string;
  warning: string;
}

interface Props {
  receipt: CredentialsReceiptData;
  onClose: () => void;
}

export const CredentialsReceiptModal: React.FC<Props> = ({ receipt, onClose }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(`Username: ${receipt.username}\nPassword: ${receipt.temporary_password}\nLogin: ${window.location.origin}${receipt.login_url || '/app'}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px',
      overflowY: 'auto'
    }}>
      <style>
        {`
          @media print {
            body * {
              visibility: hidden !important;
            }
            .printable-receipt-card, .printable-receipt-card * {
              visibility: visible !important;
            }
            .printable-receipt-card {
              position: fixed !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              max-width: 480px !important;
              box-shadow: none !important;
              border: 1.5px solid #0f172a !important;
              border-radius: 8px !important;
              margin: 20px auto !important;
            }
            .no-print {
              display: none !important;
            }
          }
        `}
      </style>

      <div
        className="printable-receipt-card"
        style={{
          background: '#ffffff',
          borderRadius: 14,
          width: '100%',
          maxWidth: 520,
          boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'min(92vh, 520px)'
        }}
      >
        {/* Header Bar */}
        <div style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
          color: '#ffffff',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.3px' }}>
              {receipt.school_name || 'Optimus Orien'}
            </h2>
            <div style={{ fontSize: 11, color: '#c7d2fe', marginTop: 2, fontWeight: 500 }}>
              Student Login Credentials · {receipt.campus_code ? `Campus: ${receipt.campus_code}` : 'Campus'}{receipt.academic_year ? ` · ${receipt.academic_year}` : ''}
            </div>
          </div>
          <button
            type="button"
            className="no-print"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              borderRadius: 6,
              padding: 6,
              cursor: 'pointer',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body - scrollable if screen is very short */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', flex: 1 }}>
          {/* Student Info Strip */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr 1fr',
            gap: 10,
            background: '#f8fafc',
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            fontSize: 12
          }}>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block' }}>Student Name</span>
              <strong style={{ fontSize: 13, color: '#0f172a' }}>{receipt.student_name}</strong>
            </div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block' }}>Admission ID</span>
              <strong style={{ fontSize: 13, color: '#0f172a' }}>{receipt.admission_number}</strong>
            </div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block' }}>Class</span>
              <strong style={{ fontSize: 13, color: '#0f172a' }}>{receipt.class_name || '—'}</strong>
            </div>
          </div>

          {/* Credentials Box */}
          <div style={{
            background: '#f8fafc',
            border: '1.5px dashed #94a3b8',
            borderRadius: 10,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <KeyRound size={15} color="#4f46e5" />
                <span style={{ fontSize: 11, fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Login Credentials
                </span>
              </div>
              <button
                type="button"
                className="no-print"
                onClick={handleCopy}
                style={{
                  background: copied ? '#10b981' : '#6366f1',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5
                }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>USERNAME</div>
                <div style={{ fontSize: 14, fontFamily: 'monospace', fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                  {receipt.username}
                </div>
              </div>
              <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>PASSWORD</div>
                <div style={{ fontSize: 14, fontFamily: 'monospace', fontWeight: 800, color: '#dc2626', marginTop: 2 }}>
                  {receipt.temporary_password}
                </div>
              </div>
            </div>
          </div>

          {/* Simple Note & Date */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#64748b', paddingTop: 2 }}>
            <span>Official login password. Keep safe. Contact school administration if reset is needed.</span>
            <span>Date: <b>{receipt.issued_date || new Date().toISOString().split('T')[0]}</b></span>
          </div>
        </div>

        {/* Action Buttons - Always visible */}
        <div
          className="no-print"
          style={{
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#ffffff',
              color: '#475569',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            style={{
              background: '#6366f1',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 2px 6px rgba(99, 102, 241, 0.3)'
            }}
          >
            <Printer size={16} /> Print Credentials Slip
          </button>
        </div>
      </div>
    </div>
  );
};
