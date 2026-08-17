import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';

const AdminHubPage = () => {
    const { user, profile } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        if (profile && !profile.is_admin) {
            navigate('/dashboard');
        }
    }, [user, profile]);

    if (!profile?.is_admin) {
        return (
            <div style={{ minHeight: '100vh', background: '#f4f7fc' }}>
                <Header />
                <div style={{ textAlign: 'center', padding: '4rem' }}>
                    <p>Checking permissions...</p>
                </div>
                <Footer />
            </div>
        );
    }

    const tools = [
        {
            title: 'Manage Users',
            description: 'Assign roles, LGAs, departments, and admin status for every account.',
            icon: 'fa-users-cog',
            color: '#016b40',
            path: '/admin/users',
        },
        {
            title: 'Approval Thresholds',
            description: 'Set the budget ranges that determine which approval level a project routes through.',
            icon: 'fa-sliders-h',
            color: '#1976d2',
            path: '/admin/thresholds',
        },
    ];

    return (
        <div style={{ minHeight: '100vh', background: '#f4f7fc' }}>
            <div className="bg-pattern"></div>
            <Header />
            <main style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 5%' }}>
                <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '2rem', marginBottom: '0.3rem' }}>
                    <i className="fas fa-shield-alt" style={{ color: '#016b40', marginRight: '0.6rem' }}></i>
                    Admin
                </h1>
                <p style={{ color: '#4b6b68', marginBottom: '2rem' }}>
                    Platform administration tools — visible only to admin accounts.
                </p>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '1.2rem'
                }}>
                    {tools.map(tool => (
                        <div
                            key={tool.path}
                            onClick={() => navigate(tool.path)}
                            style={{
                                background: 'white',
                                borderRadius: 16,
                                border: '1px solid rgba(0,0,0,0.08)',
                                padding: '1.5rem',
                                cursor: 'pointer',
                                transition: 'box-shadow 0.2s, transform 0.2s',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.boxShadow = '0 8px 24px -8px rgba(0,0,0,0.15)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.boxShadow = 'none';
                                e.currentTarget.style.transform = 'none';
                            }}
                        >
                            <div style={{
                                width: 48, height: 48, borderRadius: 12,
                                background: tool.color, color: 'white',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 20, marginBottom: '1rem'
                            }}>
                                <i className={`fas ${tool.icon}`}></i>
                            </div>
                            <h3 style={{ marginBottom: '0.4rem', fontSize: '1.1rem' }}>{tool.title}</h3>
                            <p style={{ color: '#4b6b68', fontSize: '0.9rem', margin: 0 }}>{tool.description}</p>
                        </div>
                    ))}
                </div>
            </main>
            <Footer />
        </div>
    );
};

export default AdminHubPage;