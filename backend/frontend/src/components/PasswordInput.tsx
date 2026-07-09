import React, { forwardRef, useId, useState } from 'react';

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
    leadingIcon?: React.ReactNode;
    wrapperClassName?: string;
};

const EyeIcon = ({ hidden }: { hidden: boolean }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {hidden ? (
            <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
            </>
        ) : (
            <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
            </>
        )}
    </svg>
);

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
    ({ className = 'form-input', leadingIcon, wrapperClassName = '', id, ...props }, ref) => {
        const [visible, setVisible] = useState(false);
        const generatedId = useId();
        const inputId = id || generatedId;

        return (
            <div className={`password-input-shell ${leadingIcon ? 'has-leading-icon' : ''} ${wrapperClassName}`.trim()}>
                {leadingIcon && <span className="password-input-leading-icon">{leadingIcon}</span>}
                <input
                    {...props}
                    id={inputId}
                    ref={ref}
                    type={visible ? 'text' : 'password'}
                    className={`${className} password-input-control`.trim()}
                />
                <button
                    type="button"
                    className="password-input-toggle"
                    onClick={() => setVisible((current) => !current)}
                    aria-label={visible ? 'Hide password' : 'Show password'}
                    aria-controls={inputId}
                    title={visible ? 'Hide password' : 'Show password'}
                >
                    <EyeIcon hidden={visible} />
                </button>
            </div>
        );
    }
);

PasswordInput.displayName = 'PasswordInput';

export default PasswordInput;
