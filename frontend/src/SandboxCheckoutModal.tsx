import React, { useState } from 'react';
import { CreditCard, ShieldCheck, Lock, AlertCircle, CheckCircle, RefreshCw, X, Zap } from 'lucide-react';
import { fetchCsrfToken, getCookieCsrf } from './api';

export interface CheckoutOrderInfo {
  id: number;
  order_number: string;
  plan_name: string;
  plan_code: string;
  amount: string;
  currency: string;
  billing_months: number;
  student_count: number;
  school_name?: string;
}

interface SandboxCheckoutModalProps {
  order: CheckoutOrderInfo;
  onSuccess: (orderNumber: string) => void;
  onClose: () => void;
}

const FAKE_WEBHOOK_SECRET = 'test_fake_webhook_secret_key_optimus_orien';

async function computeHmacSha256(payloadStr: string, secretStr: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretStr);
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await window.crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(payloadStr));
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `sha256=${hashHex}`;
}

export const SandboxCheckoutModal: React.FC<SandboxCheckoutModalProps> = ({ order, onSuccess, onClose }) => {
  const [cardholder, setCardholder] = useState('School Director');
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [expiry, setExpiry] = useState('12/28');
  const [cvc, setCvc] = useState('123');
  const [step, setStep] = useState<'input' | 'authorizing' | 'success' | 'declined'>('input');
  const [authStageText, setAuthStageText] = useState('Authorizing card with sandbox vault...');
  const [errorMessage, setErrorMessage] = useState('');

  const fillTestCard = (type: 'visa' | 'mastercard' | 'decline') => {
    if (type === 'visa') {
      setCardNumber('4242 4242 4242 4242');
      setExpiry('12/28');
      setCvc('123');
      setCardholder('Amina Khan (Director)');
    } else if (type === 'mastercard') {
      setCardNumber('5555 5555 5555 4444');
      setExpiry('11/27');
      setCvc('456');
      setCardholder('Tariq Mahmood (Trustee)');
    } else {
      setCardNumber('4000 0000 0000 0002');
      setExpiry('08/26');
      setCvc('000');
      setCardholder('Test Declining Card');
    }
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!cardNumber || !expiry || !cvc || !cardholder) {
      setErrorMessage('Please fill in all card fields.');
      return;
    }

    // Check if test card is the simulated decline number
    const cleanNum = cardNumber.replace(/\s+/g, '');
    if (cleanNum === '4000000000000002') {
      setStep('authorizing');
      setAuthStageText('Contacting card network (3-D Secure)...');
      setTimeout(() => {
        setStep('declined');
        setErrorMessage('Transaction Declined: Your card issuer reported insufficient test authorization. (Simulated Sandbox Decline)');
      }, 1400);
      return;
    }

    setStep('authorizing');
    setAuthStageText('Encrypting card payload with 256-bit SSL...');

    try {
      await new Promise(r => setTimeout(r, 600));
      setAuthStageText('Verifying 3-D Secure cardholder authentication...');
      await new Promise(r => setTimeout(r, 600));
      setAuthStageText('Finalizing subscription and dispatching webhook...');

      // Prepare standard webhook payload
      const webhookPayload = {
        event_id: `evt_browser_sandbox_${Date.now()}`,
        event_type: 'order.paid',
        data: {
          order_number: order.order_number,
          amount: order.amount,
          currency: order.currency,
          student_count: order.student_count,
          plan_code: order.plan_code
        }
      };

      const payloadStr = JSON.stringify(webhookPayload);
      const signature = await computeHmacSha256(payloadStr, FAKE_WEBHOOK_SECRET);

      // Post signature-verified webhook to backend
      const res = await fetch('/api/v1/subscription/webhook/?provider=fake', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Provider-Signature': signature
        },
        body: payloadStr
      });

      if (!res.ok) {
        let errText = 'Webhook execution rejected.';
        try {
          const errData = await res.json();
          if (errData.detail) errText = errData.detail;
        } catch {}
        throw new Error(errText);
      }

      await new Promise(r => setTimeout(r, 500));
      setStep('success');
    } catch (err: any) {
      setStep('input');
      setErrorMessage(err.message || 'Payment processing failed in sandbox.');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          color: '#0f172a',
          maxWidth: 540,
          width: '100%',
          borderRadius: 20,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          border: '1px solid #e2e8f0'
        }}
      >
        {/* Top Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 24px',
          borderBottom: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: '#2563eb',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CreditCard size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.2 }}>Card Checkout</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Hosted Sandbox Simulation</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              backgroundColor: '#fef3c7',
              color: '#92400e',
              fontSize: 11,
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: 6,
              letterSpacing: '0.04em'
            }}>
              SANDBOX TEST
            </span>
            {step !== 'authorizing' && (
              <button
                onClick={onClose}
                style={{
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: 4
                }}
              >
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px' }}>
          {/* Order Summary Strip */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f1f5f9',
            padding: '14px 18px',
            borderRadius: 12,
            marginBottom: 20,
            border: '1px solid #e2e8f0'
          }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{order.plan_name}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {order.student_count} Students • {order.billing_months} Month{order.billing_months > 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>
                {order.currency === 'USD' ? '$' : 'Rs '}{order.amount}
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{order.currency} Total</div>
            </div>
          </div>

          {/* STEP: INPUT */}
          {step === 'input' && (
            <form onSubmit={handlePay}>
              {/* Quick Fill Toolbar */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>
                  Quick-Fill Test Cards:
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => fillTestCard('visa')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1px solid #93c5fd',
                      backgroundColor: '#eff6ff',
                      color: '#1d4ed8',
                      cursor: 'pointer'
                    }}
                  >
                    <Zap size={12} /> Visa (Success)
                  </button>
                  <button
                    type="button"
                    onClick={() => fillTestCard('mastercard')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1px solid #fed7aa',
                      backgroundColor: '#fff7ed',
                      color: '#c2410c',
                      cursor: 'pointer'
                    }}
                  >
                    <Zap size={12} /> Mastercard (Success)
                  </button>
                  <button
                    type="button"
                    onClick={() => fillTestCard('decline')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1px solid #fecaca',
                      backgroundColor: '#fef2f2',
                      color: '#b91c1c',
                      cursor: 'pointer'
                    }}
                  >
                    <AlertCircle size={12} /> Card Declined
                  </button>
                </div>
              </div>

              {/* Error Alert */}
              {errorMessage && (
                <div style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                  <AlertCircle size={16} />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Card Inputs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Cardholder Name
                  </label>
                  <input
                    type="text"
                    value={cardholder}
                    onChange={(e) => setCardholder(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: 14,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Card Number
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      placeholder="4242 4242 4242 4242"
                      required
                      style={{
                        width: '100%',
                        padding: '10px 12px 10px 38px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 15,
                        fontFamily: 'monospace',
                        boxSizing: 'border-box'
                      }}
                    />
                    <CreditCard size={18} color="#64748b" style={{ position: 'absolute', left: 12, top: 12 }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                      Expiry (MM/YY)
                    </label>
                    <input
                      type="text"
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      placeholder="12/28"
                      maxLength={5}
                      required
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 14,
                        boxSizing: 'border-box',
                        fontFamily: 'monospace'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                      CVC / CVV
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="password"
                        value={cvc}
                        onChange={(e) => setCvc(e.target.value)}
                        placeholder="123"
                        maxLength={4}
                        required
                        style={{
                          width: '100%',
                          padding: '10px 12px 10px 34px',
                          borderRadius: 8,
                          border: '1px solid #cbd5e1',
                          fontSize: 14,
                          boxSizing: 'border-box',
                          fontFamily: 'monospace'
                        }}
                      />
                      <Lock size={15} color="#64748b" style={{ position: 'absolute', left: 12, top: 13 }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Security Footnote */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: '#64748b',
                marginTop: 18,
                marginBottom: 20
              }}>
                <ShieldCheck size={16} color="#10b981" />
                <span>Encrypted 256-bit hosted checkout simulator. No real money charged.</span>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: 10,
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#475569',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 2,
                    padding: '12px',
                    borderRadius: 10,
                    border: 'none',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
                  }}
                >
                  Pay {order.currency === 'USD' ? '$' : 'Rs '}{order.amount}
                </button>
              </div>
            </form>
          )}

          {/* STEP: AUTHORIZING */}
          {step === 'authorizing' && (
            <div style={{ textAlign: 'center', padding: '36px 12px' }}>
              <RefreshCw size={44} color="#2563eb" className="animate-spin" style={{ margin: '0 auto 20px auto' }} />
              <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 8px 0' }}>Processing Card Payment</h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{authStageText}</p>
            </div>
          )}

          {/* STEP: SUCCESS */}
          {step === 'success' && (
            <div style={{ textAlign: 'center', padding: '24px 12px' }}>
              <div style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                backgroundColor: '#dcfce7',
                color: '#16a34a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto'
              }}>
                <CheckCircle size={36} />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 6px 0', color: '#166534' }}>
                Payment Authorized!
              </h3>
              <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.5, margin: '0 0 20px 0' }}>
                Your card payment of <strong>{order.currency === 'USD' ? '$' : 'Rs '}{order.amount}</strong> was authorized.
                Webhook received and your school has been upgraded to <strong>{order.plan_name}</strong>!
              </p>
              <button
                type="button"
                onClick={() => onSuccess(order.order_number)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 10,
                  border: 'none',
                  backgroundColor: '#16a34a',
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Return to School & View Receipt
              </button>
            </div>
          )}

          {/* STEP: DECLINED */}
          {step === 'declined' && (
            <div style={{ textAlign: 'center', padding: '24px 12px' }}>
              <div style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto'
              }}>
                <AlertCircle size={36} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 6px 0', color: '#991b1b' }}>
                Card Was Declined
              </h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px 0' }}>
                {errorMessage || 'Simulated card decline. Please try a valid test card number.'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setStep('input');
                  fillTestCard('visa');
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 10,
                  border: 'none',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Try With Test Visa Card
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
