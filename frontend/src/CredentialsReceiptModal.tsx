import React from 'react';
import { Printer, X, Copy, Check, ShieldCheck, AlertTriangle } from 'lucide-react';

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
    navigator.clipboard.writeText(`Username: ${receipt.username}\nTemporary Password: ${receipt.temporary_password}\nLogin: ${window.location.origin}${receipt.login_url}`);
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
      padding: '20px'
    }}>
      <style>
        {`
          @media print {
            body * {
              visibility: hidden;
            }
            .printable-receipt-card, .printable-receipt-card * {
              visibility: visible;
            }
            .printable-receipt-card {
              position: absolute;
              left: 0;
              top: 0;
              width: 100% !important;
              max-width: 100% !important;
              box-shadow: none !important;
              border: none !important;
              padding: 24px !important;
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
          borderRadius: 16,
          width: '100%',
          maxWidth: 620,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header Bar */}
        <div style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
          color: '#ffffff',
          padding: '24px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <ShieldCheck size={20} color="#a5b4fc" />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#c7d2fe' }}>
                Optimus Orien · Security Credentials Receipt
              </span>
            </div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#ffffff' }}>
              {receipt.school_name}
            </h2>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              Campus Code: <b>{receipt.campus_code}</b> · Academic Year: <b>{receipt.academic_year}</b>
            </div>
          </div>
          <button
            className="no-print"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: 8,
              padding: 8,
              cursor: 'pointer',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Confidential Banner */}
        <div style={{
          background: '#fef3c7',
          color: '#92400e',
          padding: '10px 28px',
          fontSize: 12,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid #fde68a'
        }}>
          <AlertTriangle size={16} />
          <span>CONFIDENTIAL · Give to the student or parent. Contains single-use temporary credentials.</span>
        </div>

        {/* Receipt Content */}
        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Student Meta Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 16,
            background: '#f8fafc',
            padding: 16,
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            fontSize: 13
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Student Name</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{receipt.student_name}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Admission ID</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{receipt.admission_number}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Enrolled Class</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginTop: 2 }}>{receipt.class_name}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Class Teacher</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginTop: 2 }}>{receipt.class_teacher_name}</div>
            </div>
          </div>

          {/* Credentials Box */}
          <div style={{
            background: '#f1f5f9',
            border: '2px dashed #94a3b8',
            borderRadius: 12,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                System-Generated Login Credentials
              </span>
              <button
                className="no-print"
                onClick={handleCopy}
                style={{
                  background: copied ? '#10b981' : '#6366f1',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy Credentials'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>USERNAME</div>
                <div style={{ fontSize: 16, fontFamily: 'monospace', fontWeight: 800, color: '#1e293b', marginTop: 4 }}>
                  {receipt.username}
                </div>
              </div>
              <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>TEMPORARY PASSWORD</div>
                <div style={{ fontSize: 16, fontFamily: 'monospace', fontWeight: 800, color: '#b91c1c', marginTop: 4 }}>
                  {receipt.temporary_password}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontWeight: 700, color: '#dc2626' }}>Notice:</span>
              <span>{receipt.warning}</span>
            </div>
          </div>

          {/* Instructions */}
          <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
            <b>Instructions:</b> {receipt.instructions} The student will be prompted to create their personal password immediately upon first sign-in.
          </div>

          {/* Issue Footer */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 11,
            color: '#94a3b8',
            borderTop: '1px solid #f1f5f9',
            paddingTop: 12
          }}>
            <div>Issued by: <b>{receipt.issued_by}</b></div>
            <div>Date: <b>{receipt.issued_date}</b></div>
          </div>
        </div>

        {/* Action Buttons */}
        <div
          className="no-print"
          style={{
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            padding: '16px 28px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12
          }}
        >
          <button
            type="button"
            onClick={handlePrint}
            style={{
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <Printer size={16} /> Print / Save PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#e2e8f0',
              color: '#334155',
              border: 'none',
              borderRadius: 8,
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
