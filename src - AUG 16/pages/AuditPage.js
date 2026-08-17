import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auditService } from '../services/auditService';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';
import '../styles/AuditPage.css';

const AuditPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [auditLogs, setAuditLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        actionType: '',
        tableName: '',
        search: ''
    });

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        fetchAuditLogs();
    }, [user, filters]);

    const fetchAuditLogs = async () => {
        setLoading(true);
        try {
            let { data, error } = await auditService.getAuditLogs();
            if (error) throw error;

            if (filters.actionType) {
                data = data.filter(log => log.action_type === filters.actionType);
            }
            if (filters.tableName) {
                data = data.filter(log => log.table_name === filters.tableName);
            }
            if (filters.search) {
                const searchLower = filters.search.toLowerCase();
                data = data.filter(log =>
                    log.user?.full_name?.toLowerCase().includes(searchLower) ||
                    log.action_type?.toLowerCase().includes(searchLower) ||
                    log.table_name?.toLowerCase().includes(searchLower)
                );
            }

            setAuditLogs(data || []);
        } catch (error) {
            console.error('Error fetching audit logs:', error);
            alert('Error loading audit logs');
        } finally {
            setLoading(false);
        }
    };

    const getActionBadgeColor = (actionType) => {
        const colors = {
            CREATE: '#2e7d32',
            UPDATE: '#1976d2',
            DELETE: '#c62828',
            STATUS_CHANGE: '#f57c00'
        };
        return colors[actionType] || '#757575';
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleString('en-NG', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const truncateText = (text, maxLength = 50) => {
        if (!text) return '-';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    };

    return (
        <div className="audit-page">
            <div className="bg-pattern"></div>
            <div className="gradient-orb"></div>
            <div className="gradient-orb-2"></div>

            <Header />

            <main className="audit-main">
                <div className="container">
                    <div className="audit-header">
                        <div>
                            <h1 className="audit-title">
                                <i className="fas fa-history"></i>
                                Audit Trail
                            </h1>
                            <p className="audit-subtitle">
                                Track all actions and changes across the platform
                            </p>
                        </div>
                    </div>

                    <div className="filters-section">
                        <select
                            className="filter-select"
                            value={filters.actionType}
                            onChange={(e) => setFilters({ ...filters, actionType: e.target.value })}
                        >
                            <option value="">All Actions</option>
                            <option value="CREATE">Create</option>
                            <option value="UPDATE">Update</option>
                            <option value="DELETE">Delete</option>
                            <option value="STATUS_CHANGE">Status Change</option>
                        </select>

                        <select
                            className="filter-select"
                            value={filters.tableName}
                            onChange={(e) => setFilters({ ...filters, tableName: e.target.value })}
                        >
                            <option value="">All Tables</option>
                            <option value="projects">Projects</option>
                            <option value="departments">Departments</option>
                        </select>

                        <div className="search-box">
                            <i className="fas fa-search"></i>
                            <input
                                type="text"
                                placeholder="Search by user or action..."
                                value={filters.search}
                                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                            />
                        </div>

                        <button
                            className="btn-text"
                            onClick={() => setFilters({ actionType: '', tableName: '', search: '' })}
                        >
                            <i className="fas fa-times"></i> Clear
                        </button>
                    </div>

                    {loading ? (
                        <div className="loading-state">
                            <i className="fas fa-spinner fa-spin"></i>
                            <p>Loading audit logs...</p>
                        </div>
                    ) : auditLogs.length === 0 ? (
                        <div className="empty-state">
                            <i className="fas fa-clipboard-list"></i>
                            <h3>No Audit Logs Found</h3>
                            <p>Actions will appear here once users start creating and updating records</p>
                        </div>
                    ) : (
                        <div className="audit-list">
                            {auditLogs.map(log => (
                                <div key={log.id} className="audit-item">
                                    <div className="audit-item-header">
                                        <div className="audit-user">
                                            <i className="fas fa-user-circle"></i>
                                            <span className="user-name">{log.user?.full_name || 'Unknown User'}</span>
                                            <span className="user-role">{log.user?.role || 'Official'}</span>
                                        </div>
                                        <span
                                            className="action-badge"
                                            style={{ background: getActionBadgeColor(log.action_type) }}
                                        >
                                            {log.action_type}
                                        </span>
                                    </div>

                                    <div className="audit-item-body">
                                        <p className="audit-description">
                                            <strong>{log.action_type}</strong>
                                            {' '}on <strong>{log.table_name}</strong>
                                            {log.field_name && ` - ${log.field_name}`}
                                        </p>
                                        {log.old_value && log.new_value && (
                                            <div className="audit-changes">
                                                <div className="change-old">
                                                    <span className="change-label">Before:</span>
                                                    <span className="change-value old">{truncateText(log.old_value)}</span>
                                                </div>
                                                <div className="change-new">
                                                    <span className="change-label">After:</span>
                                                    <span className="change-value new">{truncateText(log.new_value)}</span>
                                                </div>
                                            </div>
                                        )}
                                        <div className="audit-meta">
                                            <span className="audit-record">
                                                <i className="fas fa-hashtag"></i>
                                                Record: {log.record_id?.substring(0, 8) || 'N/A'}
                                            </span>
                                            <span className="audit-time">
                                                <i className="far fa-clock"></i>
                                                {formatDate(log.created_at)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default AuditPage;