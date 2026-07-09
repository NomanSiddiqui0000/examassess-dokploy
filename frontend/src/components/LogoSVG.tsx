import React from 'react';

interface LogoSVGProps {
    className?: string;
    light?: boolean;
}

const LogoSVG: React.FC<LogoSVGProps> = ({ className, light }) => {
    const accent = '#10b981';

    return (
        <svg
            className={className}
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            {/* Background circle */}
            <circle cx="20" cy="20" r="20" fill={light ? 'rgba(255,255,255,0.15)' : '#1e3a5f'} />

            {/* Graduation cap */}
            <path
                d="M20 10L8 16l12 6 12-6-12-6z"
                fill={accent}
            />
            <path
                d="M14 18.5v5c0 0 2 2.5 6 2.5s6-2.5 6-2.5v-5"
                stroke={light ? '#ffffff' : '#ffffff'}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
            <line
                x1="32"
                y1="16"
                x2="32"
                y2="22"
                stroke={light ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.6)'}
                strokeWidth="1.5"
                strokeLinecap="round"
            />
            <circle cx="32" cy="23" r="1.5" fill={light ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.6)'} />
        </svg>
    );
};

export default LogoSVG;
