import React from 'react';
import { Link } from 'react-router-dom';

interface HomeLogoLinkProps {
    className?: string;
    imgClassName: string;
    label?: string;
}

const HomeLogoLink: React.FC<HomeLogoLinkProps> = ({ className, imgClassName, label = 'ExamAssess home' }) => (
    <Link to="/" className={className || 'logo-home-link'} aria-label={label} title={label}>
        <img src="/images/site-logo.png" alt="ExamAssess" className={imgClassName} />
    </Link>
);

export default HomeLogoLink;
