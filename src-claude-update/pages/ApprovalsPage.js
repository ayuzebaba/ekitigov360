import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAllPendingApprovals, approveProject, rejectProject, escalateProject } from '../services/approvalService';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';
import '../styles/ApprovalsPage.css';

const ApprovalsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [approvals, setApprovals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('pending');

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        fetchApprovals();
    }, [user]);

    const fetchApprovals = async () => {
        setLoading(true);
        try {
            const { data, error } = await getAllPendingApprovals();
            if (error) throw error;
            setApprovals(data || []);
        } catch (error) {
            console.error('Error fetching approvals:', error);
            alert('Error loading approvals');
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (approvalId) => {
        const comments = prompt('Enter approval comments (optional):');
        if (comments === null) return;

        try {
            const { error } = await approveProject(approvalId, comments || 'Approved');
            if (error) throw error;
            alert('Project approved successfully!');
            fetchApprovals();
        } catch (error) {
            console.error('Error approving project:', error);
            alert('Error approving project');
        }
    };

    const handleReject = async (approvalId) => {
        const comments = prompt('Enter rejection reason:');
        if (comments === null || !comments.trim()) {
            alert('Rejection reason is required');
            return;
        }

        try {
            const { error } = await rejectProject(approvalId, comments);
            if (error) throw error;
            alert('Project rejected successfully!');
            fetchApprovals();
        } catch (error) {
            console.error('Error rejecting project:', error);
            alert('Error rejecting project');
        }
    };

    const handleEscalate = async (approvalId) => {
        const comments = prompt('Enter escalation reason:');
        if (comments === null || !comments.trim()) {
            alert('Escalation reason is required');
            return;
        }

        try {
            const { error } = await escalateProject(approvalId, comments);
            if (error) throw error;
            alert('Project escalated successfully!');
            fetchApprovals();
        } catch (error) {
            console.error('Error escalating project:', error);
            alert('Error escalating project');
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount || 0);
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

    const getStatusBadgeColor = (status) => {
        const colors = {
            pending: '#f57c00',
            approved: '#2e7d32',
            rejected: '#c62828',
            escalated: '#9c27b0'
        };
        return colors[status] || '#757575';
    };

    return (
        <div className="approvals-page">
            <div className="bg-pattern"></div>
            <div className="gradient-orb"></div>
            <div className="gradient-orb-2"></div>

            <Header />

            <main className="approvals-main">
                <div className="container">
                    <div className="approvals-header">
                        <div>
                            <h1 className="approvals-title">
                                <i className="fas fa-check-circle"></i>
                                Approvals
                            </h1>
                            <p className="approvals-subtitle">
                                Review and manage pending project approvals
                            </p>
                        </div>
                    </div>

                    {loading ? (
                        <div className="loading-state">
                            <i className="fas fa-spinner fa-spin"></i>
                            <p>Loading approvals...</p>
                        </div>
                    ) : approvals.length === 0 ? (
                        <div className="empty-state">
                            <i className="fas fa-check-circle"></i>
                            <h3>No Pending Approvals</h3>
                            <p>All projects have been reviewed. Check back later for new approvals.</p>
                        </div>
                    ) : (
                        <div className="approvals-list">
                            {approvals.map(approval => (
                                <div key={approval.id} className="approval-card">
                                    <div className="approval-card-header">
                                        <div className="approval-project-info">
                                            <h3>{approval.project?.title || 'Unknown Project'}</h3>
                                            <p className="approval-description">
                                                {approval.project?.description?.substring(0, 150)}
                                                {approval.project?.description?.length > 150 ? '...' : ''}
                                            </p>
                                        </div>
                                        <span
                                            className="approval-status-badge"
                                            style={{ background: getStatusBadgeColor(approval.status) }}
                                        >
                                            {approval.status?.toUpperCase()}
                                        </span>
                                    </div>

                                    <div className="approval-details">
                                        <div className="detail-item">
                                            <i className="fas fa-coins"></i>
                                            <span>Budget: {formatCurrency(approval.project?.budget_amount)}</span>
                                        </div>
                                        <div className="detail-item">
                                            <i className="fas fa-building"></i>
                                            <span>Level: {approval.approval_level?.name || 'N/A'}</span>
                                        </div>
                                        <div className="detail-item">
                                            <i className="fas fa-user"></i>
                                            <span>Requester: {approval.project?.creator?.full_name || 'N/A'}</span>
                                        </div>
                                        <div className="detail-item">
                                            <i className="fas fa-clock"></i>
                                            <span>Submitted: {formatDate(approval.created_at)}</span>
                                        </div>
                                    </div>

                                    <div className="approval-actions">
                                        <button
                                            className="btn-approve"
                                            onClick={() => handleApprove(approval.id)}
                                        >
                                            <i className="fas fa-check"></i> Approve
                                        </button>
                                        <button
                                            className="btn-reject"
                                            onClick={() => handleReject(approval.id)}
                                        >
                                            <i className="fas fa-times"></i> Reject
                                        </button>
                                        <button
                                            className="btn-escalate"
                                            onClick={() => handleEscalate(approval.id)}
                                        >
                                            <i className="fas fa-arrow-up"></i> Escalate
                                        </button>
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

export default ApprovalsPage;