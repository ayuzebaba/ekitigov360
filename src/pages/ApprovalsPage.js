import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import { getAllPendingApprovals, approveProject, rejectProject, escalateProject, escalateToCabinet, isDbRoutingEnabled } from '../services/approvalService';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';
import '../styles/ApprovalsPage.css';

const APPROVAL_ROLES = ['lg_legislative', 'executive_chairman', 'mda_oversight', 'governor'];
const ESCALATION_ROLES = ['lg_legislative', 'executive_chairman', 'mda_oversight'];

const ApprovalsPage = () => {
    const { user, profile } = useAuth();
    const navigate = useNavigate();
    const [approvals, setApprovals] = useState([]);
    const [loading, setLoading] = useState(true);

    const canApprove = APPROVAL_ROLES.includes(profile?.role);
    // DB routing (flag): the old per-approval Escalate is retired; the Governor can
    // escalate a project waiting at the Governor stage to Cabinet (reason required, logged).
    const dbRouting = isDbRoutingEnabled();
    const canEscalate = !dbRouting && ESCALATION_ROLES.includes(profile?.role);
    const isGovernor = profile?.role === 'governor';

    // DB routing (flag): show Approve/Reject only where the database would accept them.
    // The database still enforces all of this; this only hides buttons that would be refused.
    const ROLE_NAMES = {
        department_staff: 'Department Staff',
        lg_legislative: 'LG Legislative (Director)',
        executive_chairman: 'Executive Chairman',
        mda_oversight: 'MDA Oversight',
        governor: 'Governor',
    };
    const actionBlocker = (approval) => {
        const lvl = approval.approval_level;
        if (!lvl) return null;
        if (lvl.stage_type === 'committee') return null; // handled separately
        if (!lvl.required_role) return 'No approving role is configured for this stage.';
        if (lvl.required_role === 'department_staff') return 'Waiting for the Head of Department (no HOD is designated yet).';
        if (profile?.role !== lvl.required_role) {
            return 'Waiting for: ' + (ROLE_NAMES[lvl.required_role] || lvl.required_role);
        }
        if (lvl.stage_type !== 'joint' && approval.project?.created_by === user?.id) {
            return 'You submitted this project, so someone else must decide it.';
        }
        return null;
    };

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

            let enriched = data || [];

            // FIXED: "Requester: N/A" -- the query behind getAllPendingApprovals
            // never actually asked for the project creator's info (project:project_id(*)
            // only returns raw columns, including created_by as a bare UUID with no
            // name attached). Resolve real names here using the same
            // get_officials_directory() RPC built for the Network page, matching
            // each project's created_by against the directory's auth_id.
            if (enriched.length > 0) {
                const { data: directory } = await supabase.rpc('get_officials_directory');
                const nameMap = {};
                (directory || []).forEach(o => { nameMap[o.auth_id] = o; });

                enriched = enriched.map(approval => ({
                    ...approval,
                    project: {
                        ...approval.project,
                        creator: nameMap[approval.project?.created_by] || null
                    }
                }));
            }

            setApprovals(enriched);
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

        const { error } = await approveProject(approvalId, comments || 'Approved');
        if (error) {
            alert(error.message || 'Error approving project');
            return;
        }
        alert('Project approved successfully!');
        fetchApprovals();
    };

    const handleReject = async (approvalId) => {
        const comments = prompt('Enter rejection reason:');
        if (comments === null || !comments.trim()) {
            alert('Rejection reason is required');
            return;
        }

        const { error } = await rejectProject(approvalId, comments);
        if (error) {
            alert(error.message || 'Error rejecting project');
            return;
        }
        alert('Project rejected successfully!');
        fetchApprovals();
    };

    const handleEscalate = async (approvalId) => {
        const comments = prompt('Enter escalation reason:');
        if (comments === null || !comments.trim()) {
            alert('Escalation reason is required');
            return;
        }

        const { error } = await escalateProject(approvalId, comments);
        if (error) {
            alert(error.message || 'Error escalating project');
            return;
        }
        alert('Project escalated successfully!');
        fetchApprovals();
    };

    const handleCabinet = async (projectId) => {
        const reason = prompt('Enter the reason for escalating this project to Cabinet:');
        if (reason === null || !reason.trim()) {
            alert('A reason is required to escalate to Cabinet');
            return;
        }

        const { error } = await escalateToCabinet(projectId, reason.trim());
        if (error) {
            alert(error.message || 'Error escalating project to Cabinet');
            return;
        }
        alert('Project escalated to Cabinet.');
        fetchApprovals();
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

                    {!canApprove && !loading && (
                        <div className="empty-state" style={{ marginBottom: '1.5rem' }}>
                            <i className="fas fa-info-circle"></i>
                            <p>Your role ({profile?.role || 'unknown'}) does not have approval permissions. You can view pending items below, but cannot act on them.</p>
                        </div>
                    )}

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
                                            <span>Level: {(dbRouting && approval.approval_level?.display_name) || approval.approval_level?.name || 'N/A'}</span>
                                        </div>
                                        <div className="detail-item">
                                            <i className="fas fa-user"></i>
                                            <span>Requester: {approval.project?.creator?.full_name || approval.project?.creator?.username || 'N/A'}</span>
                                        </div>
                                        <div className="detail-item">
                                            <i className="fas fa-clock"></i>
                                            <span>Submitted: {formatDate(approval.created_at)}</span>
                                        </div>
                                    </div>

                                    {dbRouting && approval.approval_level?.stage_type === 'committee' ? (
                                        <div className="approval-actions">
                                            <span style={{ color: '#757575', fontSize: '0.9rem' }}>
                                                <i className="fas fa-users"></i> Decided by a committee resolution, not an individual approval
                                            </span>
                                        </div>
                                    ) : (dbRouting ? (canApprove && !actionBlocker(approval)) : canApprove) ? (
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
                                            {dbRouting && isGovernor && approval.approval_level?.code === 'GOVERNOR' && (
                                                <button
                                                    className="btn-escalate"
                                                    onClick={() => handleCabinet(approval.project_id)}
                                                >
                                                    <i className="fas fa-arrow-up"></i> Escalate to Cabinet
                                                </button>
                                            )}
                                            {canEscalate && (
                                                <button
                                                    className="btn-escalate"
                                                    onClick={() => handleEscalate(approval.id)}
                                                >
                                                    <i className="fas fa-arrow-up"></i> Escalate
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="approval-actions">
                                            <span style={{ color: '#757575', fontSize: '0.9rem' }}>
                                                <i className="fas fa-lock"></i> {dbRouting && canApprove && actionBlocker(approval) ? actionBlocker(approval) : 'View only — your role cannot act on approvals'}
                                            </span>
                                        </div>
                                    )}
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