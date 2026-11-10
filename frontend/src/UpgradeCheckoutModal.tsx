import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Check,
  Crown,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  X,
  Lock,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  Calendar,
  Users,
  Zap,
  Info
} from 'lucide-react';
import { request } from './api';

export interface UpgradeCheckoutModalProps {
  isOpen: boolean;
  planCode: 'standard' | 'premium';
  initialStudents?: number;
  initialCurrency?: 'USD' | 'PKR';
  schoolId?: number | null;
  schoolName?: string;
  onSuccess: (orderNumber: string, planCode: 'standard' | 'premium') => void;
  onClose: () => void;
}

export const UpgradeCheckoutModal: React.FC<UpgradeCheckoutModalProps> = ({
  isOpen,
  planCode,
  initialStudents = 200,
  initialCurrency = 'USD',
  schoolId,
  schoolName,
  onSuccess,
  onClose
}) => {
  const [step, setStep] = useState<'config' | 'payment' | 'authorizing' | 'success'>('config');
  const [currency, setCurrency] = useState<'USD' | 'PKR'>(initialCurrency);
  const [students, setStudents] = useState<number>(Math.max(1, initialStudents || 200));
  const [billingMonths, setBillingMonths] = useState<1 | 6 | 12>(6); // Default 6 months (5% discount)

  // Card form state
  const [cardholder, setCardholder] = useState('School Director');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successOrderNumber, setSuccessOrderNumber] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStep('config');
      setErrorMessage('');
      setStudents(Math.max(1, initialStudents || 200));
      setBillingMonths(6);
    }
  }, [isOpen, initialStudents, planCode]);

  if (!isOpen) return null;

  // Pricing configuration:
  // Standard: $3.60 USD / PKR 1,000 per student per month
  // Premium: $7.20 USD / PKR 2,000 per student per month
  const rateUSD = planCode === 'premium' ? 7.20 : 3.60;
  const ratePKR = planCode === 'premium' ? 2000 : 1000;
  const unitRate = currency === 'USD' ? rateUSD : ratePKR;

  // Discounts:
  // 1 month: 0%
  // 6 months: 5%
  // 12 months (1 year): 10%
  const discountPercent = billingMonths === 12 ? 10 : billingMonths === 6 ? 5 : 0;
  const subtotal = students * unitRate * billingMonths;
  const discountAmount = subtotal * (discountPercent / 100);
  const totalPayable = Math.max(0, subtotal - discountAmount);

  // Alternate currency calculation for reference
  const altCurrency = currency === 'USD' ? 'PKR' : 'USD';
  const altUnitRate = altCurrency === 'USD' ? rateUSD : ratePKR;
  const altSubtotal = students * altUnitRate * billingMonths;
  const altDiscount = altSubtotal * (discountPercent / 100);
  const altTotal = Math.max(0, altSubtotal - altDiscount);

  const planTitle = planCode === 'premium' ? 'Premium Plan' : 'Standard Plan';

  const fillDummyCard = () => {
    setCardholder('School Director');
    setCardNumber('4242 4242 4242 4242');
    setExpiry('12/28');
    setCvc('123');
    setErrorMessage('');
  };

  const handleProceedToPayment = () => {
    if (students < 1) {
      setErrorMessage('Please enter at least 1 student.');
      return;
    }
    setErrorMessage('');
    // Pre-fill dummy card for ultimate testing convenience
    if (!cardNumber) {
      fillDummyCard();
    }
    setStep('payment');
  };

  const handlePayAndActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!cardNumber || !expiry || !cvc || !cardholder) {
      setErrorMessage('Please enter card details to proceed.');
      return;
    }

    setStep('authorizing');

    try {
      // Simulate real-time secure payment processing gateway animation
      await new Promise(r => setTimeout(r, 650));

      const payload = {
        plan_code: planCode,
        billing_months: billingMonths,
        payment_method: 'card',
        auto_activate: true,
        currency: currency,
        student_count: students,
        custom_student_count: students,
        school_id: schoolId || undefined,
        payment_reference: `CARD-${cardNumber.replace(/\s+/g, '').slice(-4)}-${Date.now().toString().slice(-6)}`,
      };

      const res = await request<{
        message?: string;
        order?: {
          id: number;
          order_number: string;
          status: string;
          amount: string;
        };
      }>('subscription/orders/', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const orderNumber = res?.order?.order_number || `ORD-${Date.now().toString().slice(-6)}`;
      setSuccessOrderNumber(orderNumber);
      setStep('success');

      // Also trigger success callback
      setTimeout(() => {
        onSuccess(orderNumber, planCode);
      }, 1200);

    } catch (err: unknown) {
      setStep('payment');
      const msg = err instanceof Error ? err.message : 'Payment authorization failed.';
      setErrorMessage(msg);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        overflowY: 'auto'
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 20,
          width: '100%',
          maxWidth: 620,
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.3)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: planCode === 'premium'
              ? 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)'
              : 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                backgroundColor: planCode === 'premium' ? '#f59e0b' : '#3b82f6',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: planCode === 'premium' ? '0 4px 12px rgba(245, 158, 11, 0.35)' : '0 4px 12px rgba(59, 130, 246, 0.35)'
              }}
            >
              <Crown size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                  Upgrade to {planTitle}
                </h3>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 12,
                    backgroundColor: planCode === 'premium' ? '#fef3c7' : '#dbeafe',
                    color: planCode === 'premium' ? '#92400e' : '#1e40af',
                    textTransform: 'uppercase'
                  }}
                >
                  {planCode}
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                {planCode === 'premium' ? '$7.20 / student / mo (PKR 2,000)' : '$3.60 / student / mo (PKR 1,000)'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {errorMessage && (
            <div
              style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                padding: '12px 14px',
                borderRadius: 10,
                fontSize: 13,
                marginBottom: 18,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <Info size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: CONFIGURATION */}
          {step === 'config' && (
            <div>
              {/* Currency Toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>
                  Choose Currency:
                </span>
                <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: 8, padding: 3 }}>
                  <button
                    type="button"
                    onClick={() => setCurrency('USD')}
                    style={{
                      padding: '5px 14px',
                      borderRadius: 6,
                      border: 'none',
                      fontSize: 12,
                      fontWeight: 700,
                      backgroundColor: currency === 'USD' ? '#ffffff' : 'transparent',
                      color: currency === 'USD' ? '#2563eb' : '#64748b',
                      cursor: 'pointer',
                      boxShadow: currency === 'USD' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    USD ($)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrency('PKR')}
                    style={{
                      padding: '5px 14px',
                      borderRadius: 6,
                      border: 'none',
                      fontSize: 12,
                      fontWeight: 700,
                      backgroundColor: currency === 'PKR' ? '#ffffff' : 'transparent',
                      color: currency === 'PKR' ? '#2563eb' : '#64748b',
                      cursor: 'pointer',
                      boxShadow: currency === 'PKR' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    PKR (Rs)
                  </button>
                </div>
              </div>

              {/* 1. HOW MANY STUDENTS */}
              <div style={{ marginBottom: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                    How many students?
                  </label>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    Rate: {currency === 'USD' ? `$${rateUSD.toFixed(2)}` : `Rs ${ratePKR.toLocaleString()}`} / student / mo
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type="number"
                      min={1}
                      max={50000}
                      value={students}
                      onChange={(e) => setStudents(Math.max(1, parseInt(e.target.value) || 1))}
                      style={{
                        width: '100%',
                        padding: '12px 14px 12px 38px',
                        borderRadius: 10,
                        border: '1px solid #cbd5e1',
                        fontSize: 16,
                        fontWeight: 800,
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <Users size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  </div>
                </div>

                {/* Quick preset chips */}
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: '#64748b', alignSelf: 'center', marginRight: 4 }}>Quick presets:</span>
                  {[50, 100, 200, 500, 1000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setStudents(preset)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: `1px solid ${students === preset ? '#7c3aed' : '#e2e8f0'}`,
                        backgroundColor: students === preset ? '#f5f3ff' : '#ffffff',
                        color: students === preset ? '#6d28d9' : '#475569',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {preset} students
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. DURATION SELECTION */}
              <div style={{ marginBottom: 22 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>
                  Select Duration:
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {/* 1 Month */}
                  <div
                    onClick={() => setBillingMonths(1)}
                    style={{
                      border: `2px solid ${billingMonths === 1 ? '#7c3aed' : '#e2e8f0'}`,
                      borderRadius: 12,
                      padding: '14px 10px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      backgroundColor: billingMonths === 1 ? '#faf5ff' : '#ffffff',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>1 Month</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>Standard rate</div>
                    <span style={{ display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, backgroundColor: '#f1f5f9', color: '#64748b' }}>
                      0% discount
                    </span>
                  </div>

                  {/* 6 Months (5% discount) */}
                  <div
                    onClick={() => setBillingMonths(6)}
                    style={{
                      border: `2px solid ${billingMonths === 6 ? '#7c3aed' : '#e2e8f0'}`,
                      borderRadius: 12,
                      padding: '14px 10px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      backgroundColor: billingMonths === 6 ? '#faf5ff' : '#ffffff',
                      position: 'relative',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>6 Months</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>Half-Yearly</div>
                    <span style={{ display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4, backgroundColor: '#dcfce7', color: '#16a34a' }}>
                      5% discount
                    </span>
                  </div>

                  {/* 1 Year (10% discount) */}
                  <div
                    onClick={() => setBillingMonths(12)}
                    style={{
                      border: `2px solid ${billingMonths === 12 ? '#7c3aed' : '#e2e8f0'}`,
                      borderRadius: 12,
                      padding: '14px 10px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      backgroundColor: billingMonths === 12 ? '#faf5ff' : '#ffffff',
                      position: 'relative',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>1 Year</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>Annual Term</div>
                    <span style={{ display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4, backgroundColor: '#fef3c7', color: '#b45309' }}>
                      10% discount
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. AUTO-CALCULATED PRICE SUMMARY BOX */}
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 14,
                  padding: '16px 18px',
                  marginBottom: 22
                }}
              >
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Calculation:</span>
                  <span>
                    {students} students × {currency === 'USD' ? `$${unitRate.toFixed(2)}` : `Rs ${unitRate.toLocaleString()}`} × {billingMonths} mo
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#334155', marginBottom: 4 }}>
                  <span>Subtotal:</span>
                  <span>{currency === 'USD' ? `$${subtotal.toFixed(2)}` : `Rs ${Math.round(subtotal).toLocaleString()}`}</span>
                </div>

                {discountPercent > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#16a34a', fontWeight: 700, marginBottom: 4 }}>
                    <span>Duration Discount ({discountPercent}%):</span>
                    <span>-{currency === 'USD' ? `$${discountAmount.toFixed(2)}` : `Rs ${Math.round(discountAmount).toLocaleString()}`}</span>
                  </div>
                )}

                <div style={{ borderTop: '1px dashed #cbd5e1', margin: '8px 0', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Total Amount to Pay:</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: '#7c3aed', letterSpacing: '-0.02em' }}>
                      {currency === 'USD' ? `$${totalPayable.toFixed(2)}` : `Rs ${Math.round(totalPayable).toLocaleString()}`}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      ≈ {altCurrency === 'USD' ? `$${altTotal.toFixed(2)}` : `Rs ${Math.round(altTotal).toLocaleString()}`} {altCurrency}
                    </div>
                  </div>
                </div>
              </div>

              {/* Proceed Button */}
              <button
                type="button"
                onClick={handleProceedToPayment}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 12,
                  border: 'none',
                  backgroundColor: '#7c3aed',
                  color: '#ffffff',
                  fontSize: 15,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(124, 58, 237, 0.35)',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>Proceed to Pay</span>
                <ArrowRight size={17} />
              </button>
            </div>
          )}

          {/* STEP 2: PAYMENT CARD DETAILS */}
          {step === 'payment' && (
            <form onSubmit={handlePayAndActivate}>
              {/* Back & Order Summary */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <button
                  type="button"
                  onClick={() => setStep('config')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: 0
                  }}
                >
                  <ArrowLeft size={14} /> Back to details
                </button>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed' }}>
                  {planTitle} · {students} Students · {billingMonths} Mo
                </div>
              </div>

              {/* Amount Bar */}
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '12px 16px',
                  marginBottom: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Amount Due:</span>
                <strong style={{ fontSize: 20, color: '#0f172a', fontWeight: 900 }}>
                  {currency === 'USD' ? `$${totalPayable.toFixed(2)}` : `Rs ${Math.round(totalPayable).toLocaleString()}`} {currency}
                </strong>
              </div>

              {/* DUMMY TEST CARD BOX (As Requested) */}
              <div
                style={{
                  backgroundColor: '#f5f3ff',
                  border: '1px solid #ddd6fe',
                  borderRadius: 12,
                  padding: '12px 14px',
                  marginBottom: 18
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#6d28d9', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={14} /> Dummy Card for Testing:
                  </span>
                  <button
                    type="button"
                    onClick={fillDummyCard}
                    style={{
                      padding: '3px 10px',
                      borderRadius: 6,
                      backgroundColor: '#7c3aed',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    1-Click Fill Test Card
                  </button>
                </div>
                <div style={{ fontSize: 11, color: '#5b21b6', fontFamily: 'monospace', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span><strong>Card:</strong> 4242 4242 4242 4242</span>
                  <span><strong>Exp:</strong> 12/28</span>
                  <span><strong>CVC:</strong> 123</span>
                </div>
              </div>

              {/* Cardholder Name */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Cardholder Name
                </label>
                <input
                  type="text"
                  value={cardholder}
                  onChange={(e) => setCardholder(e.target.value)}
                  placeholder="e.g. School Director"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  required
                />
              </div>

              {/* Card Number */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Card Number
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="4242 4242 4242 4242"
                    maxLength={19}
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 38px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: 14,
                      fontFamily: 'monospace',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    required
                  />
                  <CreditCard size={18} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                </div>
              </div>

              {/* Expiry & CVC Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Expiry Date
                  </label>
                  <input
                    type="text"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    placeholder="MM/YY (e.g. 12/28)"
                    maxLength={5}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: 14,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    CVC / CVV
                  </label>
                  <input
                    type="text"
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value)}
                    placeholder="123"
                    maxLength={4}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: 14,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    required
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 12,
                  border: 'none',
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  fontSize: 15,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(5, 150, 105, 0.4)',
                  transition: 'all 0.15s ease'
                }}
              >
                <Lock size={16} />
                <span>Pay {currency === 'USD' ? `$${totalPayable.toFixed(2)}` : `Rs ${Math.round(totalPayable).toLocaleString()}`} &amp; Activate Plan</span>
              </button>

              <div style={{ marginTop: 12, textAlign: 'center', fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <ShieldCheck size={14} color="#059669" />
                <span>256-bit SSL encrypted institutional payment authorization</span>
              </div>
            </form>
          )}

          {/* STEP 3: AUTHORIZING ANIMATION */}
          {step === 'authorizing' && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <RefreshCw size={36} className="animate-spin" style={{ color: '#7c3aed', margin: '0 auto 16px' }} />
              <h4 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 6px', color: '#0f172a' }}>
                Authorizing Card Payment...
              </h4>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                Verifying dummy credentials and applying {planTitle} activation.
              </p>
            </div>
          )}

          {/* STEP 4: SUCCESS */}
          {step === 'success' && (
            <div style={{ textAlign: 'center', padding: '30px 20px' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: '#dcfce7',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px'
                }}
              >
                <CheckCircle2 size={32} />
              </div>
              <h4 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 6px', color: '#0f172a' }}>
                {planTitle} Activated Successfully!
              </h4>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
                Order #{successOrderNumber} confirmed for {students} students ({billingMonths} months).
              </p>
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#f8fafc',
                  borderRadius: 10,
                  fontSize: 12,
                  color: '#334155',
                  marginBottom: 20
                }}
              >
                All {planCode === 'premium' ? 'Premium & Standard' : 'Standard'} features have been unlocked in your sidebar.
              </div>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '10px 24px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: '#7c3aed',
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Done / Back to Workspace
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UpgradeCheckoutModal;
