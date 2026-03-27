import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import '../styles/NetworkPage.css';

const NetworkPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [officials, setOfficials] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [connections, setConnections] = useState([]);
    const [activeTab, setActiveTab] = useState('discover');
    const [sendingRequest, setSendingRequest] = useState({});
    const [processingRequest, setProcessingRequest] = useState({});

    useEffect(() => {
        if (user?.id) {
            fetchOfficials();
            fetchConnections();
        }
    }, [user?.id]);

    const fetchOfficials = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .neq('id', user?.id)
                .order('full_name')
                .limit(100);

            if (!error) {
                const officialsWithStatus = await Promise.all(
                    (data || []).map(async (official) => {
                        const { data: existingConnection } = await supabase
                            .from('connections')
                            .select('id, status, sender_id, receiver_id')
                            .or(`and(sender_id.eq.${user?.id},receiver_id.eq.${official.id}),and(sender_id.eq.${official.id},receiver_id.eq.${user?.id})`)
                            .maybeSingle();

                        return {
                            ...official,
                            connectionStatus: existingConnection?.status || 'none',
                            connectionId: existingConnection?.id || null
                        };
                    })
                );
                setOfficials(officialsWithStatus);
            }
        } catch (error) {
            console.error('Error fetching officials:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchConnections = async () => {
        try {
            if (!user?.id) return;

            const { data: connectionsData, error } = await supabase
                .from('connections')
                .select('*')
                .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

            if (error) throw error;

            let enriched = connectionsData || [];

            if (enriched.length > 0) {
                const allIds = [...new Set([
                    ...enriched.map(c => c.sender_id),
                    ...enriched.map(c => c.receiver_id)
                ])];

                const { data: profilesData } = await supabase
                    .from('profiles')
                    .select('*')
                    .in('id', allIds);

                if (profilesData) {
                    const map = {};
                    profilesData.forEach(p => { map[p.id] = p; });
                    enriched = enriched.map(conn => ({
                        ...conn,
                        sender: map[conn.sender_id],
                        receiver: map[conn.receiver_id]
                    }));
                }
            }

            setConnections(enriched);
        } catch (error) {
            console.error('Error fetching connections:', error);
        }
    };

    const handleConnect = async (officialId) => {
        if (!user?.id) return;
        setSendingRequest(prev => ({ ...prev, [officialId]: true }));
        try {
            const { data, error } = await supabase
                .from('connections')
                .insert([{
                    sender_id: user.id,
                    receiver_id: officialId,
                    status: 'pending',
                    message: 'I would like to connect with you on EkitiGov360.'
                }])
                .select()
                .single();

            if (error) {
                if (error.code === '23505') alert('Connection request already sent!');
                else throw error;
            } else {
                setOfficials(prev => prev.map(o =>
                    o.id === officialId ? { ...o, connectionStatus: 'pending', connectionId: data.id } : o
                ));
                setConnections(prev => [...prev, data]);
                await fetchConnections();
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error sending connection request');
        } finally {
            setSendingRequest(prev => ({ ...prev, [officialId]: false }));
        }
    };

    const handleAcceptConnection = async (senderId) => {
        const pending = connections.find(c =>
            c.sender_id === senderId && c.receiver_id === user?.id && c.status === 'pending'
        );
        if (!pending) return;

        setProcessingRequest(prev => ({ ...prev, [senderId]: 'accepting' }));
        try {
            const { error } = await supabase
                .from('connections')
                .update({ status: 'accepted', updated_at: new Date().toISOString() })
                .eq('id', pending.id);

            if (error) throw error;

            setConnections(prev => prev.map(c =>
                c.id === pending.id ? { ...c, status: 'accepted' } : c
            ));
            setOfficials(prev => prev.map(o =>
                o.id === senderId ? { ...o, connectionStatus: 'accepted' } : o
            ));
            await fetchConnections();
            await fetchOfficials();
        } catch (error) {
            console.error('Error:', error);
            alert('Error accepting connection');
        } finally {
            setProcessingRequest(prev => ({ ...prev, [senderId]: null }));
        }
    };

    const handleRejectConnection = async (senderId) => {
        const pending = connections.find(c =>
            c.sender_id === senderId && c.receiver_id === user?.id && c.status === 'pending'
        );
        if (!pending) return;

        setProcessingRequest(prev => ({ ...prev, [senderId]: 'rejecting' }));
        try {
            const { error } = await supabase
                .from('connections')
                .update({ status: 'rejected', updated_at: new Date().toISOString() })
                .eq('id', pending.id);

            if (error) throw error;

            setConnections(prev => prev.map(c =>
                c.id === pending.id ? { ...c, status: 'rejected' } : c
            ));
            setOfficials(prev => prev.map(o =>
                o.id === senderId ? { ...o, connectionStatus: 'rejected' } : o
            ));
            await fetchConnections();
        } catch (error) {
            console.error('Error:', error);
            alert('Error rejecting connection');
        } finally {
            setProcessingRequest(prev => ({ ...prev, [senderId]: null }));
        }
    };

    const hasIncomingRequest = (official) =>
        connections.some(c =>
            c.sender_id === official.id && c.receiver_id === user?.id && c.status === 'pending'
        );

    const isOutgoingRequest = (official) =>
        connections.some(c =>
            c.sender_id === user?.id && c.receiver_id === official.id && c.status === 'pending'
        );

    const getRoleLabel = (role) => {
        const labels = {
            governor: 'Executive Governor',
            commissioner: 'Commissioner',
            chairman: 'LGA Chairman',
            admin: 'Administrator',
            official: 'Government Official'
        };
        return labels[role] || role || 'Government Official';
    };

    const getRoleColor = (role) => {
        const colors = {
            governor: '#1e3a5f',
            commissioner: '#016b40',
            chairman: '#f57c00',
            admin: '#9c27b0',
        };
        return colors[role] || '#016b40';
    };

    const getInitials = (name) => {
        if (!name) return 'G';
        const parts = name.split(' ');
        return parts.length >= 2
            ? (parts[0][0] + parts[1][0]).toUpperCase()
            : name.substring(0, 2).toUpperCase();
    };

    const filteredOfficials = officials.filter(o =>
        !searchTerm ||
        o.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.lga?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.role?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const pendingRequests = connections.filter(c => c.status === 'pending' && c.receiver_id === user?.id);
    const acceptedConnections = connections.filter(c => c.status === 'accepted');

    return (
        <div className="network-page">
            <div className="bg-pattern"></div>
            <div className="gradient-orb"></div>
            <div className="gradient-orb-2"></div>

            <Header />

            <main className="network-main">
                <div className="container">

                    {/* Page Header */}
                    <div className="network-header">
                        <div>
                            <h1 className="network-title">
                                <i className="fas fa-network-wired"></i> Network
                            </h1>
                            <p className="network-subtitle">
                                Connect and communicate with officials across Ekiti State
                            </p>
                        </div>
                        <div className="network-stats">
                            <div className="net-stat">
                                <span className="net-stat-value">{officials.length}</span>
                                <span className="net-stat-label">Officials</span>
                            </div>
                            <div className="net-stat">
                                <span className="net-stat-value">{acceptedConnections.length}</span>
                                <span className="net-stat-label">Connected</span>
                            </div>
                            <div className="net-stat">
                                <span className="net-stat-value">{pendingRequests.length}</span>
                                <span className="net-stat-label">Requests</span>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="network-tabs">
                        <button
                            className={`net-tab ${activeTab === 'discover' ? 'active' : ''}`}
                            onClick={() => setActiveTab('discover')}
                        >
                            <i className="fas fa-compass"></i> Discover
                        </button>
                        <button
                            className={`net-tab ${activeTab === 'connections' ? 'active' : ''}`}
                            onClick={() => setActiveTab('connections')}
                        >
                            <i className="fas fa-users"></i> Connected ({acceptedConnections.length})
                        </button>
                        <button
                            className={`net-tab ${activeTab === 'requests' ? 'active' : ''}`}
                            onClick={() => setActiveTab('requests')}
                        >
                            <i className="fas fa-user-plus"></i> Requests
                            {pendingRequests.length > 0 && (
                                <span className="req-badge">{pendingRequests.length}</span>
                            )}
                        </button>
                    </div>

                    {/* Search */}
                    <div className="network-search">
                        <i className="fas fa-search"></i>
                        <input
                            type="text"
                            placeholder="Search by name, LGA, role or department..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Content */}
                    {loading ? (
                        <div className="loading-state">
                            <i className="fas fa-spinner fa-spin"></i>
                            <p>Loading officials...</p>
                        </div>
                    ) : (
                        <>
                            {/* DISCOVER TAB */}
                            {activeTab === 'discover' && (
                                <div className="officials-grid">
                                    {filteredOfficials.length === 0 ? (
                                        <div className="empty-state">
                                            <i className="fas fa-users"></i>
                                            <h3>No officials found</h3>
                                            <p>Try a different search term</p>
                                        </div>
                                    ) : filteredOfficials.map(official => {
                                        const incoming = hasIncomingRequest(official);
                                        const outgoing = isOutgoingRequest(official);
                                        const roleColor = getRoleColor(official.role);

                                        return (
                                            <div key={official.id} className="official-card">
                                                <div className="official-avatar" style={{ background: roleColor }}>
                                                    {getInitials(official.full_name)}
                                                </div>
                                                <div className="official-info">
                                                    <h3>{official.full_name || 'Government Official'}</h3>
                                                    <div className="official-role" style={{ color: roleColor }}>
                                                        <i className="fas fa-shield-alt"></i>
                                                        {getRoleLabel(official.role)}
                                                    </div>
                                                    {official.lga && (
                                                        <div className="official-lga">
                                                            <i className="fas fa-map-marker-alt"></i>
                                                            {official.lga} LGA
                                                        </div>
                                                    )}
                                                    {official.department && (
                                                        <div className="official-dept">
                                                            <i className="fas fa-building"></i>
                                                            {official.department}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="official-actions">
                                                    {official.connectionStatus === 'accepted' ? (
                                                        <button
                                                            className="btn-net-message"
                                                            onClick={() => navigate(`/messages/${official.id}`)}
                                                        >
                                                            <i className="fas fa-envelope"></i> Message
                                                        </button>
                                                    ) : incoming ? (
                                                        <div className="incoming-actions">
                                                            <button
                                                                className="btn-net-accept"
                                                                onClick={() => handleAcceptConnection(official.id)}
                                                                disabled={processingRequest[official.id] === 'accepting'}
                                                            >
                                                                {processingRequest[official.id] === 'accepting'
                                                                    ? <><i className="fas fa-spinner fa-spin"></i> Accepting...</>
                                                                    : <><i className="fas fa-check"></i> Accept</>}
                                                            </button>
                                                            <button
                                                                className="btn-net-reject"
                                                                onClick={() => handleRejectConnection(official.id)}
                                                                disabled={processingRequest[official.id] === 'rejecting'}
                                                            >
                                                                <i className="fas fa-times"></i>
                                                            </button>
                                                        </div>
                                                    ) : outgoing ? (
                                                        <button className="btn-net-pending" disabled>
                                                            <i className="fas fa-clock"></i> Pending
                                                        </button>
                                                    ) : official.connectionStatus === 'rejected' ? (
                                                        <button className="btn-net-pending" disabled>
                                                            <i className="fas fa-times"></i> Declined
                                                        </button>
                                                    ) : (
                                                        <button
                                                            className="btn-net-connect"
                                                            onClick={() => handleConnect(official.id)}
                                                            disabled={sendingRequest[official.id]}
                                                        >
                                                            {sendingRequest[official.id]
                                                                ? <><i className="fas fa-spinner fa-spin"></i> Sending...</>
                                                                : <><i className="fas fa-user-plus"></i> Connect</>}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* CONNECTED TAB */}
                            {activeTab === 'connections' && (
                                <div className="officials-grid">
                                    {acceptedConnections.length === 0 ? (
                                        <div className="empty-state">
                                            <i className="fas fa-users"></i>
                                            <h3>No connections yet</h3>
                                            <p>Discover and connect with officials</p>
                                            <button className="btn-primary" onClick={() => setActiveTab('discover')}>
                                                <i className="fas fa-compass"></i> Discover Officials
                                            </button>
                                        </div>
                                    ) : acceptedConnections.map(conn => {
                                        const other = conn.sender_id === user?.id ? conn.receiver : conn.sender;
                                        if (!other) return null;
                                        const roleColor = getRoleColor(other.role);

                                        return (
                                            <div key={conn.id} className="official-card">
                                                <div className="official-avatar" style={{ background: roleColor }}>
                                                    {getInitials(other.full_name)}
                                                </div>
                                                <div className="official-info">
                                                    <h3>{other.full_name}</h3>
                                                    <div className="official-role" style={{ color: roleColor }}>
                                                        <i className="fas fa-shield-alt"></i>
                                                        {getRoleLabel(other.role)}
                                                    </div>
                                                    {other.lga && (
                                                        <div className="official-lga">
                                                            <i className="fas fa-map-marker-alt"></i>
                                                            {other.lga} LGA
                                                        </div>
                                                    )}
                                                    <div className="conn-since">
                                                        <i className="fas fa-link"></i>
                                                        Connected {new Date(conn.updated_at).toLocaleDateString()}
                                                    </div>
                                                </div>
                                                <div className="official-actions">
                                                    <button
                                                        className="btn-net-message"
                                                        onClick={() => navigate(`/messages/${other.id}`)}
                                                    >
                                                        <i className="fas fa-envelope"></i> Message
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* REQUESTS TAB */}
                            {activeTab === 'requests' && (
                                <div className="officials-grid">
                                    {pendingRequests.length === 0 ? (
                                        <div className="empty-state">
                                            <i className="fas fa-inbox"></i>
                                            <h3>No pending requests</h3>
                                            <p>Connection requests will appear here</p>
                                        </div>
                                    ) : pendingRequests.map(conn => {
                                        const sender = conn.sender;
                                        if (!sender) return null;
                                        const roleColor = getRoleColor(sender.role);

                                        return (
                                            <div key={conn.id} className="official-card">
                                                <div className="official-avatar" style={{ background: roleColor }}>
                                                    {getInitials(sender.full_name)}
                                                </div>
                                                <div className="official-info">
                                                    <h3>{sender.full_name}</h3>
                                                    <div className="official-role" style={{ color: roleColor }}>
                                                        <i className="fas fa-shield-alt"></i>
                                                        {getRoleLabel(sender.role)}
                                                    </div>
                                                    {sender.lga && (
                                                        <div className="official-lga">
                                                            <i className="fas fa-map-marker-alt"></i>
                                                            {sender.lga} LGA
                                                        </div>
                                                    )}
                                                    {conn.message && (
                                                        <div className="conn-message">
                                                            <i className="fas fa-quote-left"></i>
                                                            {conn.message}
                                                        </div>
                                                    )}
                                                    <div className="conn-since">
                                                        <i className="far fa-clock"></i>
                                                        {new Date(conn.created_at).toLocaleDateString()}
                                                    </div>
                                                </div>
                                                <div className="official-actions">
                                                    <div className="incoming-actions">
                                                        <button
                                                            className="btn-net-accept"
                                                            onClick={() => handleAcceptConnection(sender.id)}
                                                            disabled={processingRequest[sender.id] === 'accepting'}
                                                        >
                                                            {processingRequest[sender.id] === 'accepting'
                                                                ? <><i className="fas fa-spinner fa-spin"></i> Accepting...</>
                                                                : <><i className="fas fa-check"></i> Accept</>}
                                                        </button>
                                                        <button
                                                            className="btn-net-reject"
                                                            onClick={() => handleRejectConnection(sender.id)}
                                                            disabled={processingRequest[sender.id] === 'rejecting'}
                                                        >
                                                            {processingRequest[sender.id] === 'rejecting'
                                                                ? <i className="fas fa-spinner fa-spin"></i>
                                                                : <i className="fas fa-times"></i>}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default NetworkPage;
