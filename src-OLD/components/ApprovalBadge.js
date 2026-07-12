import React from 'react';
import '../styles/ApprovalBadge.css';

const ApprovalBadge = ({ status, level }) => {
    const getStatusColor = (status) => {
        const colors = {
            pending: '#f57c00',
            approved: '#2e7d32',
            rejected: '#c62828',
            escalated: '#9c27b0',
            none: '#757575'
        };
        return colors[status] || '#757575';
    };

    const getStatusLabel = (status) => {
        const labels = {
            pending: 'Pending',
            approved: 'Approved',
            rejected: 'Rejected',
            escalated: 'Escalated',
            none: 'Not Submitted'
        };
        return labels[status] || status;
    };

    const getStatusIcon = (status) => {
        const icons = {
            pending: 'fa-clock',
            approved: 'fa-check-circle',
            rejected: 'fa-times-circle',
            escalated: 'fa-arrow-up',
            none: 'fa-minus-circle'
        };
        return icons[status] || 'fa-circle';
    };

    return (
        <div className="approval-badge" style={{ borderColor: getStatusColor(status) }}>
            <div className="approval-badge-icon" style={{ background: getStatusColor(status) }}>
                <i className={`fas ${getStatusIcon(status)}`}></i>
            </div>
            <div className="approval-badge-content">
                <span className="approval-badge-status" style={{ color: getStatusColor(status) }}>
                    {getStatusLabel(status)}
                </span>
                {level && (
                    <span className="approval-badge-level">{level}</span>
                )}
            </div>
        </div>
    );
};

export default ApprovalBadge;