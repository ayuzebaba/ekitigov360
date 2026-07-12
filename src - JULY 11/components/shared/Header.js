import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import '../../styles/Header.css';

// Roles authorized to act on approvals — must match approvalService.js
const APPROVAL_ROLES = ['lg_legislative', 'executive_chairman', 'mda_oversight', 'governor'];

const ROLE_LABELS = {
    citizen: 'Citizen',
    department_staff: 'Department Staff',
    lg_legislative: 'LG Legislative',
    executive_chairman: 'Executive Chairman',
    mda_oversight: 'MDA Oversight',
    governor: 'Governor',
    judiciary: 'Judiciary',
    hoa: 'House of Assembly',
};

const Header = () => {
    const { user, profile, signOut } = useAuth();
    const navigate = useNavigate();

    const canSeeApprovals = APPROVAL_ROLES.includes(profile?.role);
    const roleLabel = ROLE_LABELS[profile?.role] || 'Official';

    const handleLogout = async () => {
        await signOut();
        navigate('/login');
    };

    return (
        <>
            <div className="header-banner">
                Ekiti Digital Governance Platform
            </div>
            <header className="header">
                <div className="header-container">
                    <div className="header-left">
                        <Link to="/dashboard" className="header-logo">
                            <span className="logo-icon">🏛️</span>
                            <span className="logo-text">DiGoP</span>
                        </Link>
                    </div>

                    <nav className="header-nav">
                        <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                            <i className="fas fa-home"></i> Home
                        </NavLink>
                        <NavLink to="/projects" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                            <i className="fas fa-project-diagram"></i> Projects
                        </NavLink>
                        <NavLink to="/departments" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                            <i className="fas fa-building"></i> Departments
                        </NavLink>
                        <NavLink to="/sentiment" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                            <i className="fas fa-chart-line"></i> Sentiment
                        </NavLink>
                        <NavLink to="/video-call" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                            <i className="fas fa-video"></i> Video
                        </NavLink>
                        {canSeeApprovals && (
                            <NavLink to="/approvals" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                                <i className="fas fa-check-circle"></i> Approvals
                            </NavLink>
                        )}
                        <NavLink to="/reports" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                            <i className="fas fa-chart-bar"></i> Reports
                        </NavLink>
                    </nav>

                    <div className="header-right">
                        {user && (
                            <div className="user-menu">
                                <span className="user-name">
                                    <i className="fas fa-user-circle"></i>
                                    {roleLabel}
                                </span>
                                <button onClick={handleLogout} className="logout-btn">
                                    <i className="fas fa-sign-out-alt"></i> EXIT
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>
        </>
    );
};

export default Header;