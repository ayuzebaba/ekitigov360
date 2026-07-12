import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { departmentService } from '../services/departmentService';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import '../styles/MessagesPage.css';

const MessagesPage = () => {
    const { userId } = useParams();
    const navigate = useNavigate();
    const { user: currentUser } = useAuth();
    const [otherUser, setOtherUser] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        fetchData();
        const subscription = subscribeToMessages();
        return () => subscription?.unsubscribe();
    }, [userId]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data: userData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();
            setOtherUser(userData);

            const { data: messagesData } = await supabase
                .from('messages')
                .select('*')
                .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${currentUser.id})`)
                .order('created_at', { ascending: true });

            setMessages(messagesData || []);

            // Mark messages as read
            await supabase
                .from('messages')
                .update({ read: true })
                .eq('sender_id', userId)
                .eq('receiver_id', currentUser.id)
                .eq('read', false);

        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const subscribeToMessages = () => {
        return supabase
            .channel(`messages:${currentUser.id}:${userId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
            }, (payload) => {
                const msg = payload.new;
                if (
                    (msg.sender_id === currentUser.id && msg.receiver_id === userId) ||
                    (msg.sender_id === userId && msg.receiver_id === currentUser.id)
                ) {
                    setMessages(prev => [...prev, msg]);
                }
            })
            .subscribe();
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        setSending(true);
        try {
            const { error } = await supabase
                .from('messages')
                .insert([{
                    sender_id: currentUser.id,
                    receiver_id: userId,
                    content: newMessage.trim(),
                    read: false,
                    created_at: new Date().toISOString()
                }]);

            if (error) throw error;
            setNewMessage('');
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Error sending message. Please try again.');
        } finally {
            setSending(false);
        }
    };

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

    const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const formatDate = (ts) => new Date(ts).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const groupMessagesByDate = (msgs) => {
        const groups = {};
        msgs.forEach(msg => {
            const date = new Date(msg.created_at).toDateString();
            if (!groups[date]) groups[date] = [];
            groups[date].push(msg);
        });
        return groups;
    };

    if (loading) {
        return (
            <div className="messages-page">
                <Header />
                <div className="loading-state">
                    <i className="fas fa-spinner fa-spin"></i>
                    <p>Loading messages...</p>
                </div>
                <Footer />
            </div>
        );
    }

    if (!otherUser) {
        return (
            <div className="messages-page">
                <Header />
                <div className="error-state">
                    <i className="fas fa-user-slash"></i>
                    <h3>Official not found</h3>
                    <button className="btn-primary" onClick={() => navigate('/network')}>
                        <i className="fas fa-arrow-left"></i> Back to Network
                    </button>
                </div>
                <Footer />
            </div>
        );
    }

    const roleColor = getRoleColor(otherUser.role);
    const grouped = groupMessagesByDate(messages);

    return (
        <div className="messages-page">
            <div className="bg-pattern"></div>
            <div className="gradient-orb"></div>
            <div className="gradient-orb-2"></div>

            <Header />

            <main className="messages-main">
                <div className="container">
                    <div className="messages-card">

                        {/* Chat Header */}
                        <div className="chat-header">
                            <button className="back-btn" onClick={() => navigate('/network')}>
                                <i className="fas fa-arrow-left"></i>
                            </button>
                            <div className="chat-avatar" style={{ background: roleColor }}>
                                {getInitials(otherUser.full_name)}
                            </div>
                            <div className="chat-user-info">
                                <h3>{otherUser.full_name}</h3>
                                <p style={{ color: roleColor }}>
                                    <i className="fas fa-shield-alt"></i>
                                    {getRoleLabel(otherUser.role)}
                                    {otherUser.lga ? ` · ${otherUser.lga} LGA` : ''}
                                </p>
                            </div>
                            <div className="chat-actions">
                                <button
                                    className="btn-outline"
                                    onClick={() => navigate(`/video-call`)}
                                    title="Start Video Call"
                                >
                                    <i className="fas fa-video"></i> Video Call
                                </button>
                            </div>
                        </div>

                        {/* Messages Container */}
                        <div className="messages-container">
                            {messages.length === 0 ? (
                                <div className="empty-messages">
                                    <div className="empty-avatar" style={{ background: roleColor }}>
                                        {getInitials(otherUser.full_name)}
                                    </div>
                                    <h3>{otherUser.full_name}</h3>
                                    <p>{getRoleLabel(otherUser.role)}</p>
                                    <p className="empty-hint">Send a secure message to start the conversation</p>
                                </div>
                            ) : (
                                Object.entries(grouped).map(([date, msgs]) => (
                                    <div key={date}>
                                        <div className="date-divider">
                                            <span>{formatDate(msgs[0].created_at)}</span>
                                        </div>
                                        {msgs.map(msg => (
                                            <div
                                                key={msg.id}
                                                className={`message-row ${msg.sender_id === currentUser.id ? 'sent' : 'received'}`}
                                            >
                                                {msg.sender_id !== currentUser.id && (
                                                    <div className="msg-avatar" style={{ background: roleColor }}>
                                                        {getInitials(otherUser.full_name)}
                                                    </div>
                                                )}
                                                <div className={`message-bubble ${msg.sender_id === currentUser.id ? 'sent' : 'received'}`}>
                                                    <p>{msg.content}</p>
                                                    <span className="msg-time">
                                                        {formatTime(msg.created_at)}
                                                        {msg.sender_id === currentUser.id && (
                                                            <i className={`fas fa-check${msg.read ? '-double' : ''} read-indicator`}></i>
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Message Input */}
                        <form className="message-input-form" onSubmit={handleSendMessage}>
                            <div className="input-wrapper">
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder="Type a secure message..."
                                    disabled={sending}
                                />
                                <button
                                    type="submit"
                                    className="send-btn"
                                    disabled={sending || !newMessage.trim()}
                                >
                                    {sending
                                        ? <i className="fas fa-spinner fa-spin"></i>
                                        : <i className="fas fa-paper-plane"></i>}
                                </button>
                            </div>
                            <p className="secure-hint">
                                <i className="fas fa-lock"></i>
                                Secure government channel · EkitiGov360
                            </p>
                        </form>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default MessagesPage;
