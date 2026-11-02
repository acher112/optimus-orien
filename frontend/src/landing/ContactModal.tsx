import React, { useState } from 'react';
import { X, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { request } from '../api';

interface ContactModalProps {
  isOpen: boolean;
  locale: 'en' | 'ur';
  onClose: () => void;
}

export default function ContactModal({
  isOpen,
  locale,
  onClose,
}: ContactModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    subject: '',
    message: '',
    website: '', // Honeypot field
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const isUr = locale === 'ur';

  const t = {
    title: isUr ? 'ہم سے رابطہ کریں' : 'Get in Touch',
    subtitle: isUr
      ? 'ہمیں اپنی ضروریات یا استفسارات کے بارے میں بتائیں، ہماری ٹیم 24 گھنٹوں میں رابطہ کرے گی۔'
      : 'Tell us about your institution or inquiry, and our team will get back to you within 24 hours.',
    name: isUr ? 'مکمل نام' : 'Full Name',
    email: isUr ? 'ای میل ایڈریس' : 'Email Address',
    phone: isUr ? 'ٹیلی فون نمبر' : 'Phone Number',
    company: isUr ? 'اسکول / ادارے کا نام' : 'School / Institution',
    subject: isUr ? 'مضمون' : 'Subject',
    message: isUr ? 'پیغام' : 'Message',
    submit: isUr ? 'پیغام بھیجیں' : 'Send Message',
    submitting: isUr ? 'بھیجا جا رہا ہے...' : 'Sending...',
    emailUsDirectly: isUr
      ? 'یا آپ براہ راست ای میل کر سکتے ہیں:'
      : 'Or email us directly at:',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const res: any = await request('public/contact/', {
        method: 'POST',
        body: JSON.stringify(formData),
      });

      if (res && res.message) {
        setSuccessMessage(res.message);
      } else {
        setSuccessMessage(
          isUr
            ? 'آپ کا پیغام کامیابی سے موصول ہو گیا ہے!'
            : 'Your message has been received successfully!'
        );
      }
      setFormData({
        name: '',
        email: '',
        phone: '',
        company: '',
        subject: '',
        message: '',
        website: '',
      });
    } catch (err: any) {
      const detail = err?.detail || err?.message || 'Something went wrong. Please try again.';
      setErrorMessage(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-modal-title"
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="contact-modal-title">{t.title}</h2>
          <button
            type="button"
            className="close-btn"
            onClick={onClose}
            aria-label="Close contact modal"
          >
            <X size={20} />
          </button>
        </div>

        <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
          {t.subtitle}
        </p>

        {successMessage ? (
          <div
            style={{
              padding: '1.5rem',
              backgroundColor: '#ecfdf5',
              borderRadius: '12px',
              border: '1px solid #a7f3d0',
              textAlign: 'center',
            }}
          >
            <CheckCircle size={36} color="#059669" style={{ margin: '0 auto 0.75rem auto' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#065f46', marginBottom: '0.5rem' }}>
              {isUr ? 'شکریہ!' : 'Thank you!'}
            </h3>
            <p style={{ color: '#047857', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              {successMessage}
            </p>
            <button
              type="button"
              className="btn-submit-contact"
              onClick={onClose}
            >
              {isUr ? 'بند کریں' : 'Close'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {errorMessage && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1rem',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '10px',
                  color: '#b91c1c',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                }}
              >
                <AlertCircle size={18} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Honeypot field (hidden to humans) */}
            <div style={{ display: 'none' }} aria-hidden="true">
              <label htmlFor="website-hp">Website</label>
              <input
                id="website-hp"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="contact-name">
                {t.name} *
              </label>
              <input
                id="contact-name"
                className="form-control"
                type="text"
                required
                maxLength={255}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="contact-email">
                  {t.email} *
                </label>
                <input
                  id="contact-email"
                  className="form-control"
                  type="email"
                  required
                  maxLength={255}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="contact-phone">
                  {t.phone}
                </label>
                <input
                  id="contact-phone"
                  className="form-control"
                  type="tel"
                  maxLength={50}
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="contact-company">
                {t.company}
              </label>
              <input
                id="contact-company"
                className="form-control"
                type="text"
                maxLength={255}
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="contact-subject">
                {t.subject}
              </label>
              <input
                id="contact-subject"
                className="form-control"
                type="text"
                maxLength={255}
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="contact-message">
                {t.message} *
              </label>
              <textarea
                id="contact-message"
                className="form-control"
                rows={4}
                required
                maxLength={5000}
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              />
            </div>

            <button
              type="submit"
              className="btn-submit-contact"
              disabled={isSubmitting}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              <Send size={16} />
              <span>{isSubmitting ? t.submitting : t.submit}</span>
            </button>

            <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.85rem', color: '#71717a' }}>
              <span>{t.emailUsDirectly} </span>
              <a
                href="mailto:optimusorien@gmail.com"
                style={{ color: 'var(--brand-purple-dark)', fontWeight: 600, textDecoration: 'none' }}
              >
                optimusorien@gmail.com
              </a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
