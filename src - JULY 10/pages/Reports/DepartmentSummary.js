import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import Header from '../../components/shared/Header';
import Footer from '../../components/shared/Footer';
import '../../styles/reports/DepartmentSummary.css';

const DepartmentSummary = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [departments, setDepartments] = useState([]);
    const [summary, setSummary] = useState({
        totalDepartments: 0,
        totalProjects: 0,
        totalBudget: 0,
        avgProjectsPerDept: 0
    });

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        fetchDepartmentData();
    }, []);

    const fetchDepartmentData = async () => {
        setLoading(true);
        try {
            // Fetch all departments with project counts
            const { data: deptData, error } = await supabase
                .from('departments')
                .select(`
                    id,
                    name,
                    description,
                    projects:projects(id, budget_amount, status, completion_percentage)
                `)
                .order('name');

            if (error) throw error;

            // Process department data
            const processed = (deptData || []).map(dept => {
                const projects = dept.projects || [];
                const totalProjects = projects.length;
                const totalBudget = projects.reduce((sum, p) => sum + (p.budget_amount || 0), 0);
                const completed = projects.filter(p => p.status === 'completed').length;
                const ongoing = projects.filter(p => p.status === 'ongoing').length;
                const stalled = projects.filter(p => p.status === 'stalled').length;
                const planning = projects.filter(p => p.status === 'planning').length;
                const pendingApproval = projects.filter(p => p.status === 'pending_approval').length;
                const approved = projects.filter(p => p.status === 'approved').length;

                const avgCompletion = projects.length > 0
                    ? projects.reduce((sum, p) => sum + (p.completion_percentage || 0), 0) / projects.length
                    : 0;

                return {
                    ...dept,
                    totalProjects,
                    totalBudget,
                    completed,
                    ongoing,
                    stalled,
                    planning,
                    pendingApproval,
                    approved,
                    avgCompletion,
                    completionRate: totalProjects > 0 ? (completed / totalProjects) * 100 : 0
                };
            });

            // Sort by total projects descending
            processed.sort((a, b) => b.totalProjects - a.totalProjects);

            setDepartments(processed);

            // Calculate summary
            const totalDepartments = processed.length;
            const totalProjects = processed.reduce((sum, d) => sum + d.totalProjects, 0);
            const totalBudget = processed.reduce((sum, d) => sum + d.totalBudget, 0);

            setSummary({
                totalDepartments,
                totalProjects,
                totalBudget,
                avgProjectsPerDept: totalDepartments > 0 ? (totalProjects / totalDepartments) : 0
            });

        } catch (error) {
            console.error('Error fetching department data:', error);
            alert('Error loading department summary');
        } finally {
            setLoading(false);
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

    const getStatusColor = (rate) => {
        if (rate >= 80) return '#2e7d32';
        if (rate >= 50) return '#f57c00';
        return '#c62828';
    };

    return (
        <div className="dept-summary-page">
            <div className="bg-pattern"></div>
            <div className="gradient-orb"></div>
            <div className="gradient-orb-2"></div>

            <Header />

            <main className="dept-summary-main">
                <div className="container">
                    <div className="dept-summary-header">
                        <div>
                            <h1 className="dept-summary-title">
                                <i className="fas fa-building"></i>
                                Department Summary
                            </h1>
                            <p className="dept-summary-subtitle">
                                Projects per department with budget and status breakdown
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
                    <div className="dept-summary-cards">
                        <div className="dept-summary-card">
                            <div className="dept-summary-card-icon" style={{ background: '#4a8c6f' }}>
                                <i className="fas fa-building"></i>
                            </div>
                            <div className="dept-summary-card-content">
                                <span className="dept-summary-card-value">{summary.totalDepartments}</span>
                                <span className="dept-summary-card-label">Total Departments</span>
                            </div>
                        </div>
                        <div className="dept-summary-card">
                            <div className="dept-summary-card-icon" style={{ background: '#1976d2' }}>
                                <i className="fas fa-folder-open"></i>
                            </div>
                            <div className="dept-summary-card-content">
                                <span className="dept-summary-card-value">{summary.totalProjects}</span>
                                <span className="dept-summary-card-label">Total Projects</span>
                            </div>
                        </div>
                        <div className="dept-summary-card">
                            <div className="dept-summary-card-icon" style={{ background: '#f57c00' }}>
                                <i className="fas fa-coins"></i>
                            </div>
                            <div className="dept-summary-card-content">
                                <span className="dept-summary-card-value">{formatCurrency(summary.totalBudget)}</span>
                                <span className="dept-summary-card-label">Total Budget</span>
                            </div>
                        </div>
                        <div className="dept-summary-card">
                            <div className="dept-summary-card-icon" style={{ background: '#9c27b0' }}>
                                <i className="fas fa-chart-bar"></i>
                            </div>
                            <div className="dept-summary-card-content">
                                <span className="dept-summary-card-value">{summary.avgProjectsPerDept.toFixed(1)}</span>
                                <span className="dept-summary-card-label">Avg Projects/Dept</span>
                            </div>
                        </div>
                    </div>

                    {/* Department Table */}
                    {loading ? (
                        <div className="loading-state">
                            <i className="fas fa-spinner fa-spin"></i>
                            <p>Loading department data...</p>
                        </div>
                    ) : departments.length === 0 ? (
                        <div className="empty-state">
                            <i className="fas fa-building"></i>
                            <h3>No Departments Found</h3>
                            <p>Create departments to see the summary</p>
                        </div>
                    ) : (
                        <div className="dept-table-container">
                            <table className="dept-summary-table">
                                <thead>
                                    <tr>
                                        <th>Department</th>
                                        <th>Projects</th>
                                        <th>Total Budget</th>
                                        <th>Completed</th>
                                        <th>Ongoing</th>
                                        <th>Stalled</th>
                                        <th>Avg. Completion</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {departments.map(dept => (
                                        <tr key={dept.id}>
                                            <td><strong>{dept.name}</strong></td>
                                            <td>{dept.totalProjects}</td>
                                            <td>{formatCurrency(dept.totalBudget)}</td>
                                            <td style={{ color: '#2e7d32' }}>{dept.completed}</td>
                                            <td style={{ color: '#1976d2' }}>{dept.ongoing}</td>
                                            <td style={{ color: dept.stalled > 0 ? '#c62828' : '#6b7a8f' }}>
                                                {dept.stalled}
                                            </td>
                                            <td>{dept.avgCompletion.toFixed(0)}%</td>
                                            <td>
                                                <div className="dept-status-cell">
                                                    <div className="dept-status-bar">
                                                        <div
                                                            className="dept-status-fill"
                                                            style={{
                                                                width: `${Math.min(dept.completionRate, 100)}%`,
                                                                background: getStatusColor(dept.completionRate)
                                                            }}
                                                        ></div>
                                                    </div>
                                                    <span className="dept-status-text">
                                                        {dept.completionRate.toFixed(0)}%
                                                    </span>
                                                </div>
                                            </td>
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

export default DepartmentSummary;