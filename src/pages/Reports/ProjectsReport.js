import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import { isDbRoutingEnabled } from '../../services/approvalService';
import Header from '../../components/shared/Header';
import Footer from '../../components/shared/Footer';
import '../../styles/reports/ProjectsReport.css';

const ProjectsReport = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [departments, setDepartments] = useState([]);
    const [lgas, setLgas] = useState([]);
    const [filters, setFilters] = useState({
        department_id: '',
        lga_id: '',
        status: '',
        date_from: '',
        date_to: ''
    });
    const [summary, setSummary] = useState({
        total: 0,
        totalBudget: 0,
        byStatus: {}
    });

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        fetchFilters();
        fetchProjects();
    }, [filters]);

    const fetchFilters = async () => {
        const { data: deptData } = await supabase
            .from('departments')
            .select('id, name')
            .order('name');
        setDepartments(deptData || []);

        // FIXED: was querying `profiles` for role = 'chairman' (stale
        // table/role, always returned empty). Now uses the same
        // get_chairmen_directory() RPC used in ProjectsPage.js and
        // ProjectFormPage.js, which reads ekiti_users correctly.
        if (isDbRoutingEnabled()) {
            // DB routing (flag): the 16 real LGAs from the lgas table
            const { data: lgaRows } = await supabase.from('lgas').select('id, name').eq('is_active', true).order('name');
            setLgas((lgaRows || []).map(l => ({ id: l.id, lga: l.name })));
        } else {
            const { data: lgaData } = await supabase.rpc('get_chairmen_directory');
            setLgas(lgaData || []);
        }
    };

    const fetchProjects = async () => {
        setLoading(true);
        try {
            // FIXED: removed the `creator:created_by(full_name)` join.
            // projects.created_by's foreign key now points to auth.users
            // (not profiles), which isn't exposed to the API and has no
            // full_name column -- this join was causing every request
            // here to fail with a 400, surfaced to the user as
            // "Error loading projects report" with all-zero summary cards.
            let query = supabase
                .from('projects')
                .select(isDbRoutingEnabled()
                    ? `
                    *,
                    department:department_id(id, name),
                    lga:lga_id(full_name, lga),
                    lga_row:lga_ref(name)
                `
                    : `
                    *,
                    department:department_id(id, name),
                    lga:lga_id(full_name, lga)
                `)
                .order('created_at', { ascending: false });

            if (filters.department_id) {
                query = query.eq('department_id', filters.department_id);
            }
            if (filters.lga_id) {
                query = query.eq(isDbRoutingEnabled() ? 'lga_ref' : 'lga_id', filters.lga_id);
            }
            if (filters.status) {
                query = query.eq('status', filters.status);
            }
            if (filters.date_from) {
                query = query.gte('created_at', filters.date_from);
            }
            if (filters.date_to) {
                query = query.lte('created_at', filters.date_to);
            }

            const { data, error } = await query;
            if (error) throw error;

            setProjects(data || []);
            calculateSummary(data || []);
        } catch (error) {
            console.error('Error fetching projects:', error);
            alert('Error loading projects report');
        } finally {
            setLoading(false);
        }
    };

    const calculateSummary = (data) => {
        const total = data.length;
        const totalBudget = data.reduce((sum, p) => sum + (p.budget_amount || 0), 0);
        const byStatus = data.reduce((acc, p) => {
            const status = p.status || 'unknown';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});

        setSummary({ total, totalBudget, byStatus });
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount || 0);
    };

    const getStatusLabel = (status) => {
        return status?.split('_').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ') || 'Unknown';
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

    const handleClearFilters = () => {
        setFilters({
            department_id: '',
            lga_id: '',
            status: '',
            date_from: '',
            date_to: ''
        });
    };

    return (
        <div className="report-page">
            <div className="bg-pattern"></div>
            <div className="gradient-orb"></div>
            <div className="gradient-orb-2"></div>

            <Header />

            <main className="report-main">
                <div className="container">
                    <div className="report-header">
                        <div>
                            <h1 className="report-title">
                                <i className="fas fa-project-diagram"></i>
                                Projects Report
                            </h1>
                            <p className="report-subtitle">
                                View and filter all projects across Ekiti State
                            </p>
                        </div>
                        <button
                            className="btn-outline"
                            onClick={() => navigate('/reports')}
                        >
                            <i className="fas fa-arrow-left"></i> Back to Reports
                        </button>
                    </div>

                    <div className="summary-cards">
                        <div className="summary-card">
                            <div className="summary-card-icon" style={{ background: '#4a8c6f' }}>
                                <i className="fas fa-folder-open"></i>
                            </div>
                            <div className="summary-card-content">
                                <span className="summary-card-value">{summary.total}</span>
                                <span className="summary-card-label">Total Projects</span>
                            </div>
                        </div>
                        <div className="summary-card">
                            <div className="summary-card-icon" style={{ background: '#f57c00' }}>
                                <i className="fas fa-coins"></i>
                            </div>
                            <div className="summary-card-content">
                                <span className="summary-card-value">{formatCurrency(summary.totalBudget)}</span>
                                <span className="summary-card-label">Total Budget</span>
                            </div>
                        </div>
                        <div className="summary-card">
                            <div className="summary-card-icon" style={{ background: '#1976d2' }}>
                                <i className="fas fa-chart-pie"></i>
                            </div>
                            <div className="summary-card-content">
                                <span className="summary-card-value">
                                    {Object.keys(summary.byStatus).length} Statuses
                                </span>
                                <span className="summary-card-label">Distribution</span>
                            </div>
                        </div>
                    </div>

                    <div className="filters-section">
                        <select
                            className="filter-select"
                            value={filters.department_id}
                            onChange={(e) => setFilters({ ...filters, department_id: e.target.value })}
                        >
                            <option value="">All Departments</option>
                            {departments.map(dept => (
                                <option key={dept.id} value={dept.id}>{dept.name}</option>
                            ))}
                        </select>

                        <select
                            className="filter-select"
                            value={filters.lga_id}
                            onChange={(e) => setFilters({ ...filters, lga_id: e.target.value })}
                        >
                            <option value="">All LGAs</option>
                            {lgas.map(lga => (
                                <option key={lga.id} value={lga.id}>{lga.lga}</option>
                            ))}
                        </select>

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

                        <input
                            type="date"
                            className="filter-date"
                            value={filters.date_from}
                            onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                            placeholder="Date From"
                        />

                        <input
                            type="date"
                            className="filter-date"
                            value={filters.date_to}
                            onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
                            placeholder="Date To"
                        />

                        <button
                            className="btn-text"
                            onClick={handleClearFilters}
                        >
                            <i className="fas fa-times"></i> Clear
                        </button>
                    </div>

                    <div className="status-summary">
                        {Object.entries(summary.byStatus).map(([status, count]) => (
                            <span
                                key={status}
                                className="status-badge"
                                style={{ background: getStatusColor(status) }}
                            >
                                {getStatusLabel(status)}: {count}
                            </span>
                        ))}
                    </div>

                    {loading ? (
                        <div className="loading-state">
                            <i className="fas fa-spinner fa-spin"></i>
                            <p>Loading projects...</p>
                        </div>
                    ) : projects.length === 0 ? (
                        <div className="empty-state">
                            <i className="fas fa-folder-open"></i>
                            <h3>No Projects Found</h3>
                            <p>Try adjusting your filters</p>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table className="report-table">
                                <thead>
                                    <tr>
                                        <th>Title</th>
                                        <th>Department</th>
                                        <th>LGA</th>
                                        <th>Budget</th>
                                        <th>Status</th>
                                        <th>Created</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {projects.map(project => (
                                        <tr key={project.id}>
                                            <td><strong>{project.title}</strong></td>
                                            <td>{project.department?.name || 'N/A'}</td>
                                            <td>{project.lga_row?.name || project.lga?.lga || 'N/A'}</td>
                                            <td>{formatCurrency(project.budget_amount)}</td>
                                            <td>
                                                <span
                                                    className="status-badge-small"
                                                    style={{ background: getStatusColor(project.status) }}
                                                >
                                                    {getStatusLabel(project.status)}
                                                </span>
                                            </td>
                                            <td>{new Date(project.created_at).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
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

export default ProjectsReport;