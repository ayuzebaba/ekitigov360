import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import '../../styles/Header.css';

const Header = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, signOut } = useAuth();
    const [profileName, setProfileName] = useState(null);
    const [profileRole, setProfileRole] = useState('');

    // Fetch real name from profiles table
    useEffect(() => {
        const fetchProfile = async () => {
            if (user?.id) {
                const { data } = await supabase
                    .from('profiles')
                    .select('full_name, role')
                    .eq('id', user.id)
                    .single();
                if (data?.full_name) setProfileName(data.full_name);
                if (data?.role) setProfileRole(data.role);
            }
        };
        fetchProfile();
    }, [user]);

    const handleLogout = async () => {
        await signOut();
        navigate('/');
    };

    const getInitials = () => {
        if (profileName === null) return '';
        const name = profileName || user?.user_metadata?.full_name;
        if (name) {
            const names = name.split(' ');
            if (names.length >= 2) {
                return (names[0][0] + names[1][0]).toUpperCase();
            }
            return name.substring(0, 2).toUpperCase();
        }
        return 'U';
    };

    const getUserDisplayName = () => {
        if (profileName === null) return '';
        return profileName || user?.user_metadata?.full_name || 'Official';
    };

    const isActive = (path) => {
        return location.pathname === path;
    };

    return (
        <nav className="navbar">
            <div className="nav-container">
                <div className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
                    <div className="logo-icon">
                        <i className="fas fa-crown"></i>
                    </div>
                    <div className="logo-text">
                        <h1>EKITIGOV360</h1>
                        <p>COMMAND CENTER</p>
                    </div>
                </div>

                <div className="nav-links">
                    <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); navigate('/'); }}
                        className={isActive('/') ? 'active' : ''}
                    >
                        Home
                    </a>
                    <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); navigate('/dashboard'); }}
                        className={isActive('/dashboard') ? 'active' : ''}
                    >
                        Dashboard
                    </a>
                    <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); navigate('/projects'); }}
                        className={isActive('/projects') ? 'active' : ''}
                    >
                        Projects
                    </a>
                    <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); navigate('/network'); }}
                        className={isActive('/network') ? 'active' : ''}
                    >
                        Network
                    </a>

                    <a href="#"
                        onClick={(e) => { e.preventDefault(); navigate('/sentiment'); }}
                        className={isActive('/sentiment') ? 'active' : ''}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                        <i className="fas fa-chart-line"></i> Sentiment
                    </a>

                    <a href="#"
                        onClick={(e) => { e.preventDefault(); navigate('/benchmarking'); }}
                        className={isActive('/benchmarking') ? 'active' : ''}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                        <i className="fas fa-hands-helping"></i> Support
                    </a>

                    <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); navigate('/video-call'); }}
                        className={isActive('/video-call') ? 'active' : ''}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                        <i className="fas fa-video"></i> Video
                    </a>

                    {user ? (
                        <div className="user-menu">
                            <div className="user-avatar">
                                {getInitials()}
                            </div>
                            {/*<span className="user-name">
                                {getUserDisplayName()}
                            </span>*/}
                            <button className="logout-btn" onClick={handleLogout}>
                                <i className="fas fa-sign-out-alt"></i> EXIT
                            </button>
                        </div>
                    ) : (
                        <button
                            className="gov-badge"
                            onClick={() => navigate('/login')}
                        >
                            <i className="fas fa-shield-alt"></i> LOGIN
                        </button>
                    )}
                </div>
            </div>
        </nav>
    );
};

export default Header;