import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import Header from '../../components/shared/Header';
import Footer from '../../components/shared/Footer';
import '../../styles/reports/TimelineReport.css';

const TimelineReport = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState([]);
    const [filteredProjects, setFilteredProjects] = useState([]);
    const [filters, setFilters] = useState({
        status: '',
        dateRange: 'all' // all, upcoming, ending_soon, completed
    });
    const [summary, setSummary] = useState({
        total: 0,
        upcoming: 0,
        endingSoon: 0,
        overdue: 0,
        completed: 0
    });

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        fetchTimelineData();
    }, []);

    useEffect(() => {
        applyFilters();
    }, [filters, projects]);

    const fetchTimelineData = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('projects')
                .select(`
                    *,
                    department:department_id(id, name),
                    lga:lga_id(full_name, lga)
                `)
                .order('start_date', { ascending: true });

            if (error) throw error;

            setProjects(data || []);
            calculateSummary(data || []);
        } catch (error) {
            console.error('Error fetching timeline data:', error);
            alert('Error loading timeline report');
        } finally {
            setLoading(false);
        }
    };

    const calculateSummary = (data) => {
        const today = new Date();
        const thirtyDays = new Date(today);
        thirtyDays.setDate(today.getDate() + 30);

        let upcoming = 0;
        let endingSoon = 0;
        let overdue = 0;
        let completed = 0;

        data.forEach(project => {
            const startDate = project.start_date ? new Date(project.start_date) : null;
            const endDate = project.end_date ? new Date(project.end_date) : null;

            if (project.status === 'completed') {
                completed++;
            } else if (startDate && startDate > today && startDate <= thirtyDays) {
                upcoming++;
            } else if (endDate && endDate < today && project.status !== 'completed') {
                overdue++;
            } else if (endDate && endDate <= thirtyDays && project.status !== 'completed') {
                endingSoon++;
            }
        });

        setSummary({ total: data.length, upcoming, endingSoon, overdue, completed });
    };

    const applyFilters = () => {
        let filtered = [...projects];
        const today = new Date();
        const thirtyDays = new Date(today);
        thirtyDays.setDate(today.getDate() + 30);

        if (filters.status) {
            filtered = filtered.filter(p => p.status === filters.status);
        }

        if (filters.dateRange === 'upcoming') {
            filtered = filtered.filter(p => {
                const startDate = p.start_date ? new Date(p.start_date) : null;
                return startDate && startDate > today && startDate <= thirtyDays && p.status !== 'completed';
            });
        } else if (filters.dateRange === 'ending_soon') {
            filtered = filtered.filter(p => {
                const endDate = p.end_date ? new Date(p.end_date) : null;
                return endDate && endDate <= thirtyDays && p.status !== 'completed';
            });
        } else if (filters.dateRange === 'overdue') {
            filtered = filtered.filter(p => {
                const endDate = p.end_date ? new Date(p.end_date) : null;
                return endDate && endDate < today && p.status !== 'completed';
            });
        } else if (filters.dateRange === 'completed') {
            filtered = filtered.filter(p => p.status === 'completed');
        }

        setFilteredProjects(filtered);
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount || 0);
    };

    const getStatusColor = (status) => {
        const colors = {
            planning: '#f57c00',
            pending_approval: '#9c27b0',
            approved: '#1976d2',
            ongoing: '#2e7d32',
            stalled: '#c62828',
            completed: '#00796b'
        };
        return colors[status] || '#757575';
    };

    const getStatusLabel = (status) => {
        return status?.split('_').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ') || 'Unknown';
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-NG', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const handleClearFilters = () => {
        setFilters({ status: '', dateRange: 'all' });
    };

    return (
        <div className="timeline-report-page">
            <div className="bg-pattern"></div>
            <div className="gradient-orb"></div>
            <div className="gradient-orb-2"></div>

            <Header />

            <main className="timeline-report-main">
                <div className="container">
                    <div className="timeline-report-header">
                        <div>
                            <h1 className="timeline-report-title">
                                <i className="fas fa-calendar-alt"></i>
                                Timeline Report
                            </h1>
                            <p className="timeline-report-subtitle">
                                Projects by start and end dates
                            </p>
                        </div>
                        <button
                            className="btn-outline"
                            onClick={() => navigate('/reports')}
                        >
                            <i className="fas fa-arrow-left"></i> Back to Reports
                        </button>
                    </div>

                    {/* Summary Cards */}
                    <div className="timeline-summary-cards">
                        <div className="timeline-summary-card">
                            <div className="timeline-summary-card-icon" style={{ background: '#4a8c6f' }}>
                                <i className="fas fa-folder-open"></i>
                            </div>
                            <div className="timeline-summary-card-content">
                                <span className="timeline-summary-card-value">{summary.total}</span>
                                <span className="timeline-summary-card-label">Total Projects</span>
                            </div>
                        </div>
                        <div className="timeline-summary-card">
                            <div className="timeline-summary-card-icon" style={{ background: '#1976d2' }}>
                                <i className="fas fa-rocket"></i>
                            </div>
                            <div className="timeline-summary-card-content">
                                <span className="timeline-summary-card-value">{summary.upcoming}</span>
                                <span className="timeline-summary-card-label">Starting Soon</span>
                            </div>
                        </div>
                        <div className="timeline-summary-card">
                            <div className="timeline-summary-card-icon" style={{ background: '#f57c00' }}>
                                <i className="fas fa-hourglass-end"></i>
                            </div>
                            <div className="timeline-summary-card-content">
                                <span className="timeline-summary-card-value">{summary.endingSoon}</span>
                                <span className="timeline-summary-card-label">Ending Soon</span>
                            </div>
                        </div>
                        <div className="timeline-summary-card">
                            <div className="timeline-summary-card-icon" style={{ background: '#c62828' }}>
                                <i className="fas fa-exclamation-triangle"></i>
                            </div>
                            <div className="timeline-summary-card-content">
                                <span className="timeline-summary-card-value">{summary.overdue}</span>
                                <span className="timeline-summary-card-label">Overdue</span>
                            </div>
                        </div>
                        <div className="timeline-summary-card">
                            <div className="timeline-summary-card-icon" style={{ background: '#2e7d32' }}>
                                <i className="fas fa-check-circle"></i>
                            </div>
                            <div className="timeline-summary-card-content">
                                <span className="timeline-summary-card-value">{summary.completed}</span>
                                <span className="timeline-summary-card-label">Completed</span>
                            </div>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="timeline-filters-section">
                        <select
                            className="filter-select"
                            value={filters.status}
                            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                        >
                            <option value="">All Status</option>
                            <option value="planning">Planning</option>
                            <option value="pending_approval">Pending Approval</option>
                            <option value="approved">Approved</option>
                            <option value="ongoing">Ongoing</option>
                            <option value="stalled">Stalled</option>
                            <option value="completed">Completed</option>
                        </select>

                        <select
                            className="filter-select"
                            value={filters.dateRange}
                            onChange={(e) => setFilters({ ...filters, dateRange: e.target.value })}
                        >
                            <option value="all">All Projects</option>
                            <option value="upcoming">Starting Soon (30 days)</option>
                            <option value="ending_soon">Ending Soon (30 days)</option>
                            <option value="overdue">Overdue</option>
                            <option value="completed">Completed</option>
                        </select>

                        <button
                            className="btn-text"
                            onClick={handleClearFilters}
                        >
                            <i className="fas fa-times"></i> Clear
                        </button>
                    </div>

                    {/* Timeline Table */}
                    {loading ? (
                        <div className="loading-state">
                            <i className="fas fa-spinner fa-spin"></i>
                            <p>Loading timeline data...</p>
                        </div>
                    ) : filteredProjects.length === 0 ? (
                        <div className="empty-state">
                            <i className="fas fa-calendar-alt"></i>
                            <h3>No Projects Found</h3>
                            <p>Try adjusting your filters</p>
                        </div>
                    ) : (
                        <div className="timeline-table-container">
                            <table className="timeline-report-table">
                                <thead>
                                    <tr>
                                        <th>Title</th>
                                        <th>Department</th>
                                        <th>LGA</th>
                                        <th>Budget</th>
                                        <th>Start Date</th>
                                        <th>End Date</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredProjects.map(project => {
                                        const today = new Date();
                                        const endDate = project.end_date ? new Date(project.end_date) : null;
                                        const isOverdue = endDate && endDate < today && project.status !== 'completed';

                                        return (
                                            <tr key={project.id} className={isOverdue ? 'overdue-row' : ''}>
                                                <td><strong>{project.title}</strong></td>
                                                <td>{project.department?.name || 'N/A'}</td>
                                                <td>{project.lga?.lga || 'N/A'}</td>
                                                <td>{formatCurrency(project.budget_amount)}</td>
                                                <td>{formatDate(project.start_date)}</td>
                                                <td className={isOverdue ? 'overdue-date' : ''}>
                                                    {formatDate(project.end_date)}
                                                    {isOverdue && <span className="overdue-badge"> Overdue!</span>}
                                                </td>
                                                <td>
                                                    <span
                                                        className="status-badge-small"
                                                        style={{ background: getStatusColor(project.status) }}
                                                    >
                                                        {getStatusLabel(project.status)}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default TimelineReport;