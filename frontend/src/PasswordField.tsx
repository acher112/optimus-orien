import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  containerStyle?: React.CSSProperties;
}

export default function PasswordField({
  className,
  style,
  containerStyle,
  disabled,
  ...props
}: PasswordFieldProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div
      className="password-field-container"
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        ...containerStyle,
      }}
    >
      <input
        type={showPassword ? 'text' : 'password'}
        className={className}
        disabled={disabled}
        style={{
          width: '100%',
          paddingRight: 40,
          ...style,
        }}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        className="password-toggle-btn"
        onClick={() => setShowPassword(prev => !prev)}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
        disabled={disabled}
        style={{
          position: 'absolute',
          right: 10,
          background: 'none',
          border: 'none',
          padding: '4px',
          cursor: 'pointer',
          color: '#8c96a7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = '#534ab3')}
        onMouseLeave={e => (e.currentTarget.style.color = '#8c96a7')}
      >
        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}
