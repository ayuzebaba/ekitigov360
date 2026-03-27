import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';
import '../styles/DashboardPage.css';

const DashboardPage = () => {
    const { user, signOut } = useAuth();
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);
    const [stats, setStats] = useState({
        totalProjects: 0,
        ongoingProjects: 0,
        completedProjects: 0,
        stalledProjects: 0,
        totalBudget: 0,
        pendingRequests: 0,
        incomingCalls: 0
    });
    const [recentProjects, setRecentProjects] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // ✅ Dev bypass — remove condition before production
        const devBypass = sessionStorage.getItem('devBypass') === 'true';

        if (!user && !devBypass) {
            navigate('/login');
            return;
        }

        // Only fetch real data if there's a real user
        if (user) {
            fetchUserData();
            fetchIncomingCalls(); // Add this line
        } else {
            // Dev mode — just stop loading, show empty dashboard
            setLoading(false);
        }

        // Set up realtime subscription for calls
        const callsSubscription = supabase
            .channel('calls-channel')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'calls', filter: `recipient_id=eq.${user?.id}` },
                (payload) => {
                    // New incoming call
                    const newCall = {
                        id: `call-${payload.new.id}`,
                        type: 'call',
                        message: `📹 Incoming video call from ${payload.new.caller_name || 'An official'}`,
                        roomId: payload.new.room_id,
                        callId: payload.new.id,
                        time: 'Just now',
                        actions: true
                    };
                    setNotifications(prev => [newCall, ...prev]);
                    setStats(prev => ({ ...prev, incomingCalls: prev.incomingCalls + 1 }));
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(callsSubscription);
        };
    }, [user]);

    const fetchIncomingCalls = async () => {
        try {
            const { data: calls, error } = await supabase
                .from('calls')
                .select('*')
                .eq('recipient_id', user?.id)
                .eq('status', 'ringing')
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Add to notifications
            const callNotifications = (calls || []).map(call => ({
                id: `call-${call.id}`,
                type: 'call',
                message: `📹 Incoming video call from ${call.caller_name || 'An official'}`,
                roomId: call.room_id,
                callId: call.id,
                time: 'Just now',
                actions: true
            }));

            setNotifications(prev => [...callNotifications, ...prev]);
            setStats(prev => ({ ...prev, incomingCalls: calls?.length || 0 }));
        } catch (error) {
            console.error('Error fetching calls:', error);
        }
    };

    const declineCall = async (callId) => {
        try {
            const { error } = await supabase
                .from('calls')
                .update({ status: 'declined' })
                .eq('id', callId);

            if (error) throw error;

            // Remove from notifications
            setNotifications(prev => prev.filter(n => n.callId !== callId));
            setStats(prev => ({ ...prev, incomingCalls: prev.incomingCalls - 1 }));
        } catch (error) {
            console.error('Error declining call:', error);
        }
    };

    const fetchUserData = async () => {
        // ✅ Guard — don't run if no user (dev bypass mode)
        if (!user) return;

        setLoading(true);
        try {
            // Fetch user profile
            const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            setProfile(profileData);

            // Fetch project stats based on role
            let query = supabase.from('projects').select('*');

            if (profileData?.role === 'chairman') {
                query = query.eq('lga_id', user.id);
            } else if (profileData?.role === 'commissioner') {
                query = query.eq('mda_id', user.id);
            }

            const { data: projects } = await query;

            if (projects) {
                setStats({
                    totalProjects: projects.length,
                    ongoingProjects: projects.filter(p => p.status === 'ongoing').length,
                    completedProjects: projects.filter(p => p.status === 'completed').length,
                    stalledProjects: projects.filter(p => p.status === 'stalled').length,
                    totalBudget: projects.reduce((sum, p) => sum + (p.budget_amount || 0), 0),
                    pendingRequests: 0,
                    incomingCalls: 0
                });

                // Get 5 most recent projects
                setRecentProjects(projects.slice(0, 5));
            }

            // Fetch pending connection requests
            const { data: requests } = await supabase
                .from('connections')
                .select('*')
                .eq('receiver_id', user.id)
                .eq('status', 'pending');

            setStats(prev => ({
                ...prev,
                pendingRequests: requests?.length || 0
            }));

            // Create notifications
            const notifs = [];
            if (requests?.length > 0) {
                notifs.push({
                    id: 1,
                    type: 'connection',
                    message: `You have ${requests.length} pending connection request${requests.length > 1 ? 's' : ''}`,
                    time: 'Just now'
                });
            }

            const stalled = projects?.filter(p => p.status === 'stalled');
            if (stalled?.length > 0) {
                notifs.push({
                    id: 2,
                    type: 'alert',
                    message: `${stalled.length} project${stalled.length > 1 ? 's are' : ' is'} stalled and needs attention`,
                    time: 'Today'
                });
            }

            setNotifications(notifs);

        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        // ✅ Clear dev bypass on logout
        sessionStorage.removeItem('devBypass');
        await signOut();
        navigate('/');
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };

    const getRoleLabel = (role) => {
        const roles = {
            governor: 'Governor',
            chairman: 'Local Government Chairman',
            commissioner: 'Commissioner',
            official: 'Government Official'
        };
        return roles[role] || role;
    };

    if (loading) {
        return (
            <div className="dashboard-loading">
                <i className="fas fa-spinner fa-spin"></i>
                <p>Loading your dashboard...</p>
            </div>
        );
    }

    return (
        <div className="dashboard-page">
            <div className="bg-pattern"></div>
            <div className="gradient-orb"></div>
            <div className="gradient-orb-2"></div>

            {/* Shared Header */}
            <Header />

            {/* Main Dashboard Content */}
            <main className="dashboard-main">
                <div className="container">

                    {/* Welcome Section */}
                    <div className="welcome-section">
                        <div>
                            <h1 className="welcome-title">
                                Welcome back, <span className="highlight">
                                    {profile?.full_name?.split(' ')[0] || 'Official'}
                                </span>
                            </h1>
                            <p className="welcome-subtitle">
                                {getRoleLabel(profile?.role)} • {profile?.lga || profile?.department || 'Ekiti State'}
                            </p>
                        </div>
                        <div className="date-badge">
                            <i className="far fa-calendar-alt"></i>
                            {new Date().toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            })}
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="stats-grid-dashboard">
                        <div className="stat-card-dashboard">
                            <div className="stat-icon blue">
                                <i className="fas fa-tasks"></i>
                            </div>
                            <div className="stat-content">
                                <span className="stat-value">{stats.totalProjects}</span>
                                <span className="stat-label-dashboard">Total Projects</span>
                            </div>
                        </div>

                        <div className="stat-card-dashboard">
                            <div className="stat-icon green">
                                <i className="fas fa-play-circle"></i>
                            </div>
                            <div className="stat-content">
                                <span className="stat-value">{stats.ongoingProjects}</span>
                                <span className="stat-label-dashboard">Ongoing</span>
                            </div>
                        </div>

                        <div className="stat-card-dashboard">
                            <div className="stat-icon gold">
                                <i className="fas fa-check-circle"></i>
                            </div>
                            <div className="stat-content">
                                <span className="stat-value">{stats.completedProjects}</span>
                                <span className="stat-label-dashboard">Completed</span>
                            </div>
                        </div>

                        <div className="stat-card-dashboard">
                            <div className="stat-icon red">
                                <i className="fas fa-exclamation-triangle"></i>
                            </div>
                            <div className="stat-content">
                                <span className="stat-value">{stats.stalledProjects}</span>
                                <span className="stat-label-dashboard">Stalled</span>
                            </div>
                        </div>

                        <div className="stat-card-dashboard large">
                            <div className="stat-icon purple">
                                <i className="fas fa-coins"></i>
                            </div>
                            <div className="stat-content">
                                <span className="stat-value">{formatCurrency(stats.totalBudget)}</span>
                                <span className="stat-label-dashboard">Total Budget</span>
                            </div>
                        </div>
                    </div>

                    {/* Two Column Layout */}
                    <div className="dashboard-grid">

                        {/* LEFT COLUMN - Quick Actions + Notifications */}
                        <div className="dashboard-card notifications">

                            {/* Quick Actions */}
                            <div className="quick-actions">
                                <h4><i className="fas fa-bolt"></i> Quick Actions</h4>
                                <div className="actions-grid">
                                    <button
                                        className="action-btn"
                                        onClick={() => navigate('/projects/new')}
                                    >
                                        <i className="fas fa-plus-circle"></i>
                                        <span>New Project</span>
                                    </button>
                                    <button
                                        className="action-btn"
                                        onClick={() => navigate('/network')}
                                    >
                                        <i className="fas fa-user-plus"></i>
                                        <span>Connect</span>
                                    </button>
                                    <button className="action-btn">
                                        <i className="fas fa-file-alt"></i>
                                        <span>Generate Report</span>
                                    </button>
                                    <button
                                        className="action-btn"
                                        onClick={() => navigate('/video-call')}
                                    >
                                        <i className="fas fa-video"></i>
                                        <span>Video Call</span>
                                    </button>
                                </div>
                            </div>

                            {/* Notifications */}
                            <div style={{ marginTop: '2rem' }}>
                                <div className="card-header">
                                    <h3><i className="fas fa-bell"></i> Notifications</h3>
                                    {stats.pendingRequests + stats.incomingCalls > 0 && (
                                        <span className="notification-badge">{stats.pendingRequests + stats.incomingCalls}</span>
                                    )}
                                </div>

                                {notifications.length === 0 ? (
                                    <div className="empty-state">
                                        <i className="fas fa-check-circle"></i>
                                        <p>All clear! No notifications</p>
                                    </div>
                                ) : (
                                    <div className="notifications-list">
                                        {notifications.map(notif => (
                                            <div key={notif.id} className={`notification-item ${notif.type}`}>
                                                <div className="notification-icon">
                                                    <i className={`fas fa-${notif.type === 'connection' ? 'user-plus' : notif.type === 'call' ? 'video' : 'exclamation-circle'}`}></i>
                                                </div>
                                                <div className="notification-content">
                                                    <p>{notif.message}</p>
                                                    {notif.roomId && (
                                                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                                            <button
                                                                className="btn-primary"
                                                                style={{ padding: '4px 12px', fontSize: '12px' }}
                                                                onClick={() => navigate(`/video-call?room=${notif.roomId}`)}
                                                            >
                                                                Accept Call
                                                            </button>
                                                            <button
                                                                className="btn-outline"
                                                                style={{ padding: '4px 12px', fontSize: '12px', borderColor: '#c62828', color: '#c62828' }}
                                                                onClick={() => declineCall(notif.callId)}
                                                            >
                                                                Decline
                                                            </button>
                                                        </div>
                                                    )}
                                                    <span className="notification-time">{notif.time}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* RIGHT COLUMN - Recent Projects */}
                        <div className="dashboard-card recent-projects">
                            <div className="card-header">
                                <h3><i className="fas fa-history"></i> Recent Projects</h3>
                                <button
                                    onClick={() => navigate('/projects')}
                                    className="view-all"
                                >
                                    View All <i className="fas fa-arrow-right"></i>
                                </button>
                            </div>

                            {recentProjects.length === 0 ? (
                                <div className="empty-state">
                                    <i className="fas fa-folder-open"></i>
                                    <p>No projects yet</p>
                                </div>
                            ) : (
                                <div className="projects-list">
                                    {recentProjects.map((project, index) => (
                                        <div
                                            key={index}
                                            className="project-item"
                                            onClick={() => navigate(`/projects/${project.id}`)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <div className="project-info">
                                                <h4>{project.title}</h4>
                                                <p className="project-meta">
                                                    <span><i className="fas fa-map-marker-alt"></i> {project.lga || 'N/A'}</span>
                                                    <span><i className="fas fa-tag"></i> {project.status}</span>
                                                </p>
                                            </div>
                                            <div className="project-budget">
                                                {formatCurrency(project.budget_amount || 0)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* Shared Footer */}
            <Footer />
        </div>
    );
};

export default DashboardPage;