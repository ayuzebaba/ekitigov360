import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import Header from '../../components/shared/Header';
import Footer from '../../components/shared/Footer';
import '../../styles/reports/PerformanceReport.css';

const PerformanceReport = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [performanceData, setPerformanceData] = useState([]);
    const [summary, setSummary] = useState({
        totalProjects: 0,
        completedProjects: 0,
        completionRate: 0,
        stalledProjects: 0,
        avgCompletionTime: 0
    });

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        fetchPerformanceData();
    }, []);

    const fetchPerformanceData = async () => {
        setLoading(true);
        try {
            // Fetch all projects with LGA and department info
            const { data: projects, error } = await supabase
                .from('projects')
                .select(`
                    id,
                    title,
                    status,
                    completion_percentage,
                    start_date,
                    end_date,
                    created_at,
                    lga:lga_id(full_name, lga),
                    department:department_id(id, name)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Process data by LGA
            const lgaMap = {};
            let totalProjects = 0;
            let completedProjects = 0;
            let stalledProjects = 0;
            let totalCompletionTime = 0;
            let projectsWithTime = 0;

            (projects || []).forEach(project => {
                const lgaName = project.lga?.lga || 'Unassigned';
                const status = project.status || 'planning';
                const completion = project.completion_percentage || 0;

                if (!lgaMap[lgaName]) {
                    lgaMap[lgaName] = {
                        lga: lgaName,
                        totalProjects: 0,
                        completed: 0,
                        stalled: 0,
                        ongoing: 0,
                        planning: 0,
                        pendingApproval: 0,
                        approved: 0,
                        totalCompletion: 0,
                        projectsWithCompletion: 0,
                        departments: new Set()
                    };
                }

                lgaMap[lgaName].totalProjects += 1;
                lgaMap[lgaName].totalCompletion += completion;
                if (completion > 0) {
                    lgaMap[lgaName].projectsWithCompletion += 1;
                }

                if (project.department?.id) {
                    lgaMap[lgaName].departments.add(project.department.name || 'Unnamed');
                }

                // Count by status
                if (status === 'completed') {
                    lgaMap[lgaName].completed += 1;
                } else if (status === 'stalled') {
                    lgaMap[lgaName].stalled += 1;
                } else if (status === 'ongoing') {
                    lgaMap[lgaName].ongoing += 1;
                } else if (status === 'planning') {
                    lgaMap[lgaName].planning += 1;
                } else if (status === 'pending_approval') {
                    lgaMap[lgaName].pendingApproval += 1;
                } else if (status === 'approved') {
                    lgaMap[lgaName].approved += 1;
                }

                totalProjects += 1;
                if (status === 'completed') completedProjects += 1;
                if (status === 'stalled') stalledProjects += 1;

                // Calculate completion time
                if (project.start_date && project.end_date) {
                    const start = new Date(project.start_date);
                    const end = new Date(project.end_date);
                    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
                    if (days > 0) {
                        totalCompletionTime += days;
                        projectsWithTime += 1;
                    }
                }
            });

            // Calculate averages and rates
            const processedData = Object.values(lgaMap).map(lga => ({
                ...lga,
                avgCompletion: lga.projectsWithCompletion > 0
                    ? lga.totalCompletion / lga.projectsWithCompletion
                    : 0,
                completionRate: lga.totalProjects > 0
                    ? (lga.completed / lga.totalProjects) * 100
                    : 0,
                stalledRate: lga.totalProjects > 0
                    ? (lga.stalled / lga.totalProjects) * 100
                    : 0,
                departmentCount: lga.departments.size
            }));

            // Sort by completion rate descending
            processedData.sort((a, b) => b.completionRate - a.completionRate);

            setPerformanceData(processedData);

            const avgCompletionTime = projectsWithTime > 0
                ? Math.round(totalCompletionTime / projectsWithTime)
                : 0;

            setSummary({
                totalProjects,
                completedProjects,
                completionRate: totalProjects > 0
                    ? (completedProjects / totalProjects) * 100
                    : 0,
                stalledProjects,
                avgCompletionTime
            });

        } catch (error) {
            console.error('Error fetching performance data:', error);
            alert('Error loading performance report');
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (rate) => {
        if (rate >= 80) return '#2e7d32';
        if (rate >= 50) return '#f57c00';
        return '#c62828';
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString();
    };

    return (
        <div className="performance-report-page">
            <div className="bg-pattern"></div>
            <div className="gradient-orb"></div>
            <div className="gradient-orb-2"></div>

            <Header />

            <main className="performance-report-main">
                <div className="container">
                    <div className="performance-report-header">
                        <div>
                            <h1 className="performance-report-title">
                                <i className="fas fa-chart-line"></i>
                                Performance Report
                            </h1>
                            <p className="performance-report-subtitle">
                                Completion rates and performance metrics by LGA
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
                    <div className="performance-summary-cards">
                        <div className="performance-summary-card">
                            <div className="performance-summary-card-icon" style={{ background: '#4a8c6f' }}>
                                <i className="fas fa-folder-open"></i>
                            </div>
                            <div className="performance-summary-card-content">
                                <span className="performance-summary-card-value">{summary.totalProjects}</span>
                                <span className="performance-summary-card-label">Total Projects</span>
                            </div>
                        </div>
                        <div className="performance-summary-card">
                            <div className="performance-summary-card-icon" style={{ background: '#2e7d32' }}>
                                <i className="fas fa-check-circle"></i>
                            </div>
                            <div className="performance-summary-card-content">
                                <span className="performance-summary-card-value">{summary.completedProjects}</span>
                                <span className="performance-summary-card-label">Completed</span>
                            </div>
                        </div>
                        <div className="performance-summary-card">
                            <div className="performance-summary-card-icon" style={{ background: '#9c27b0' }}>
                                <i className="fas fa-percent"></i>
                            </div>
                            <div className="performance-summary-card-content">
                                <span className="performance-summary-card-value">{summary.completionRate.toFixed(1)}%</span>
                                <span className="performance-summary-card-label">Completion Rate</span>
                            </div>
                        </div>
                        <div className="performance-summary-card">
                            <div className="performance-summary-card-icon" style={{ background: '#c62828' }}>
                                <i className="fas fa-exclamation-triangle"></i>
                            </div>
                            <div className="performance-summary-card-content">
                                <span className="performance-summary-card-value">{summary.stalledProjects}</span>
                                <span className="performance-summary-card-label">Stalled Projects</span>
                            </div>
                        </div>
                        <div className="performance-summary-card">
                            <div className="performance-summary-card-icon" style={{ background: '#1976d2' }}>
                                <i className="fas fa-clock"></i>
                            </div>
                            <div className="performance-summary-card-content">
                                <span className="performance-summary-card-value">{summary.avgCompletionTime} days</span>
                                <span className="performance-summary-card-label">Avg. Completion Time</span>
                            </div>
                        </div>
                    </div>

                    {/* LGA Performance Table */}
                    {loading ? (
                        <div className="loading-state">
                            <i className="fas fa-spinner fa-spin"></i>
                            <p>Loading performance data...</p>
                        </div>
                    ) : performanceData.length === 0 ? (
                        <div className="empty-state">
                            <i className="fas fa-chart-line"></i>
                            <h3>No Performance Data Found</h3>
                            <p>No LGA or project data available</p>
                        </div>
                    ) : (
                        <div className="performance-table-container">
                            <table className="performance-report-table">
                                <thead>
                                    <tr>
                                        <th>LGA</th>
                                        <th>Total</th>
                                        <th>Completed</th>
                                        <th>Ongoing</th>
                                        <th>Stalled</th>
                                        <th>Avg. Completion</th>
                                        <th>Completion Rate</th>
                                        <th>Departments</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {performanceData.map(lga => (
                                        <tr key={lga.lga}>
                                            <td><strong>{lga.lga}</strong></td>
                                            <td>{lga.totalProjects}</td>
                                            <td>{lga.completed}</td>
                                            <td>{lga.ongoing}</td>
                                            <td>
                                                <span style={{ color: lga.stalled > 0 ? '#c62828' : '#2e7d32' }}>
                                                    {lga.stalled}
                                                </span>
                                            </td>
                                            <td>{lga.avgCompletion.toFixed(0)}%</td>
                                            <td>
                                                <div className="performance-cell">
                                                    <div className="performance-bar-small">
                                                        <div
                                                            className="performance-bar-fill-small"
                                                            style={{
                                                                width: `${Math.min(lga.completionRate, 100)}%`,
                                                                background: getStatusColor(lga.completionRate)
                                                            }}
                                                        ></div>
                                                    </div>
                                                    <span className="performance-text">
                                                        {lga.completionRate.toFixed(0)}%
                                                    </span>
                                                </div>
                                            </td>
                                            <td>{lga.departmentCount}</td>
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

export default PerformanceReport;