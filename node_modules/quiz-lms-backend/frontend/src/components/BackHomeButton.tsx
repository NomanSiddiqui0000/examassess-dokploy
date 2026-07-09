import React from 'react';
import { Link } from 'react-router-dom';

const BackHomeButton: React.FC = () => (
    <Link 
        to="/" 
        className="back-home-button" 
        aria-label="Back to home" 
        title="Back to home"
        style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-surface, #ffffff)',
            color: 'var(--color-text, #333333)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            transition: 'all 0.2s ease-in-out',
            zIndex: 10,
        }}
        onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            e.currentTarget.style.color = 'var(--color-primary, #0D2F69)';
        }}
        onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
            e.currentTarget.style.color = 'var(--color-text, #333333)';
        }}
    >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '20px', height: '20px' }}>
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
        </svg>
    </Link>
);

export default BackHomeButton;
