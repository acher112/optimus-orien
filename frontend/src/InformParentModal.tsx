import React, { useState } from 'react';
import { Phone, Send, X, AlertCircle, CheckCircle2, User } from 'lucide-react';
import { request } from './api';

interface Props {
  student: {
    id: number;
    full_name: string;
    admission_number: string;
    class_name?: string;
    guardian_phone?: string;
  };
  defaultCategory?: 'attendance' | 'academic' | 'general';
  defaultReason?: string;
  onClose: () => void;
  notify?: (msg: string) => void;
}

export const InformParentModal: React.FC<Props> = ({
  student,
  defaultCategory = 'academic',
  defaultReason = 'Academic support recommendation',
  onClose,
  notify
}) => {
  const [category, setCategory] = useState<'attendance' | 'academic' | 'general'>(defaultCategory);
  const [reason, setReason] = useState(defaultReason);
  const [customMessage, setCustomMessage] = useState(
    `Dear Parent/Guardian, this is an update regarding ${student.full_name}. We noticed additional practice or attention would be beneficial in their recent progress. Please review their study habits and connect with the teacher for guidance.`
  );
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    has_linked_guardian: boolean;
    guardian_phone?: string;
    detail: string;
  } | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setResult(null);

    try {
      const res: any = await request(`students/${student.id}/inform-parent/`, {
        method: 'POST',
        body: JSON.stringify({
          category,
          reason,
          message: customMessage
        })
      });

      setResult(res);
      if (res.has_linked_guardian) {
        if (notify) notify(res.detail || 'Parent notification sent successfully.');
      }
    } catch (err: any) {
      setResult({
        ok: false,
        has_linked_guardian: false,
        detail: err?.message || 'Could not send parent notification.'
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: 20
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: 16,
        width: '100%',
        maxWidth: 540,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        border: '1px solid #e2e8f0'
      }}>
        {/* Header */}
        <div style={{
          background: '#f8fafc',
          padding: '18px 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
              Inform Parent / Guardian
            </h3>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {student.full_name} ({student.admission_number}) {student.class_name ? `· ${student.class_name}` : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
              padding: 4
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content / Result */}
        <div style={{ padding: '20px 24px' }}>
          {result ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {result.has_linked_guardian ? (
                <div style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  padding: 16,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12
                }}>
                  <CheckCircle2 size={24} color="#16a34a" />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#166534' }}>Notification Dispatched</div>
                    <div style={{ fontSize: 13, color: '#15803d', marginTop: 4 }}>{result.detail}</div>
                  </div>
                </div>
              ) : (
                <div style={{
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  padding: 16,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12
                }}>
                  <Phone size={24} color="#d97706" />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#92400e' }}>No Linked Parent Account</div>
                    <div style={{ fontSize: 13, color: '#b45309', marginTop: 4 }}>
                      {result.detail}
                    </div>
                    {result.guardian_phone && (
                      <div style={{
                        marginTop: 10,
                        background: '#ffffff',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid #fcd34d',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#78350f'
                      }}>
                        <Phone size={16} /> {result.guardian_phone}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    background: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 18px',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                  Category
                </label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 13
                  }}
                >
                  <option value="academic">Academic Support (Grades / Tests)</option>
                  <option value="attendance">Attendance Support</option>
                  <option value="general">General Support</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                  Reason / Subject
                </label>
                <input
                  type="text"
                  required
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Mathematics test score below 60%"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 13,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                  Supportive Message Preview
                </label>
                <textarea
                  rows={4}
                  required
                  value={customMessage}
                  onChange={e => setCustomMessage(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 13,
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                    lineHeight: 1.4
                  }}
                />
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  Ensure language is constructive, non-punitive, and focused on student growth.
                </div>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 12,
                marginTop: 8,
                borderTop: '1px solid #f1f5f9',
                paddingTop: 16
              }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    background: '#e2e8f0',
                    color: '#334155',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 16px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  style={{
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 18px',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: sending ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <Send size={15} /> {sending ? 'Sending…' : 'Send Notification'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
