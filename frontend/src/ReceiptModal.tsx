import React from 'react';
import { X, Printer, CheckCircle, Building2, Calendar, FileText } from 'lucide-react';

export interface ReceiptData {
  receipt_number: string;
  order_number: string;
  school_name: string;
  school_code: string;
  plan_name: string;
  plan_code: string;
  billing_months: number;
  student_count: number;
  unit_price: string;
  discount_percentage: string;
  amount: string;
  currency: string;
  status: string;
  provider: string;
  provider_reference?: string;
  payment_reference?: string;
  paid_at?: string | null;
  created_at: string;
  platform_merchant?: {
    name: string;
    support_email: string;
    tax_note: string;
  };
}

interface ReceiptModalProps {
  receipt: ReceiptData | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, onClose }) => {
  if (!receipt) return null;

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (isoStr?: string | null) => {
    if (!isoStr) return 'N/A';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16
      }}
    >
      <div
        className="receipt-modal-content"
        style={{
          backgroundColor: '#ffffff',
          color: '#0f172a',
          maxWidth: 600,
          width: '100%',
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={20} color="#2563eb" />
            <span style={{ fontWeight: 700, fontSize: 16 }}>Official Subscription Invoice & Receipt</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handlePrint}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#334155',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Printer size={15} />
              Print
            </button>
            <button
              onClick={onClose}
              style={{
                padding: 6,
                borderRadius: 8,
                border: 'none',
                backgroundColor: 'transparent',
                color: '#64748b',
                cursor: 'pointer'
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Printable Body */}
        <div style={{ padding: '24px 28px', maxHeight: '78vh', overflowY: 'auto' }}>
          {/* Top Stamp */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px 0', color: '#1e3a8a' }}>
                OPTIMUS ORIEN
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                Enterprise School Intelligence & Performance SaaS
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                backgroundColor: receipt.status === 'paid' ? '#dcfce7' : '#fef3c7',
                color: receipt.status === 'paid' ? '#166534' : '#92400e',
                fontWeight: 700,
                fontSize: 12,
                padding: '4px 10px',
                borderRadius: 14,
                textTransform: 'uppercase'
              }}>
                <CheckCircle size={14} />
                {receipt.status}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                {receipt.receipt_number}
              </div>
            </div>
          </div>

          {/* Details Table */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
            backgroundColor: '#f8fafc',
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
            border: '1px solid #e2e8f0',
            fontSize: 13
          }}>
            <div>
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Billed To</div>
              <div style={{ fontWeight: 700, marginTop: 2 }}>{receipt.school_name}</div>
              <div style={{ color: '#64748b' }}>Code: {receipt.school_code}</div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Invoice Details</div>
              <div style={{ marginTop: 2 }}>Order: <strong>{receipt.order_number}</strong></div>
              <div style={{ color: '#64748b' }}>Date: {formatDate(receipt.paid_at || receipt.created_at)}</div>
            </div>
          </div>

          {/* Line Items */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#475569', fontSize: 12 }}>
                <th style={{ padding: '8px 4px' }}>Description</th>
                <th style={{ padding: '8px 4px', textAlign: 'center' }}>Students</th>
                <th style={{ padding: '8px 4px', textAlign: 'center' }}>Months</th>
                <th style={{ padding: '8px 4px', textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px 4px' }}>
                  <div style={{ fontWeight: 700 }}>{receipt.plan_name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Rate: {receipt.unit_price} {receipt.currency}/student/mo</div>
                </td>
                <td style={{ padding: '12px 4px', textAlign: 'center' }}>{receipt.student_count}</td>
                <td style={{ padding: '12px 4px', textAlign: 'center' }}>{receipt.billing_months}</td>
                <td style={{ padding: '12px 4px', textAlign: 'right', fontWeight: 700 }}>
                  {receipt.amount} {receipt.currency}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Breakdown & Total */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
            <div style={{ width: 240, fontSize: 13 }}>
              {Number(receipt.discount_percentage) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: '#16a34a' }}>
                  <span>Yearly Discount:</span>
                  <span>{receipt.discount_percentage}% applied</span>
                </div>
              )}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: 8,
                borderTop: '2px solid #e2e8f0',
                fontWeight: 800,
                fontSize: 16,
                color: '#0f172a'
              }}>
                <span>Total Paid:</span>
                <span>{receipt.amount} {receipt.currency}</span>
              </div>
            </div>
          </div>

          {/* Provider / Transaction Footnote */}
          <div style={{
            fontSize: 11,
            color: '#64748b',
            borderTop: '1px solid #e2e8f0',
            paddingTop: 16,
            lineHeight: 1.5
          }}>
            <div>Payment Provider: <strong>{receipt.provider.toUpperCase()}</strong></div>
            {receipt.provider_reference && <div>Transaction Ref: <code>{receipt.provider_reference}</code></div>}
            <div style={{ marginTop: 6, fontStyle: 'italic' }}>
              {receipt.platform_merchant?.tax_note || 'Merchant of Record handles all applicable global sales tax/VAT.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
