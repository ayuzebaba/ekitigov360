import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import Header from '../../components/shared/Header';
import Footer from '../../components/shared/Footer';
import '../../styles/reports/BudgetReport.css';

const BudgetReport = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [departments, setDepartments] = useState([]);
    const [budgetData, setBudgetData] = useState([]);
    const [summary, setSummary] = useState({
        totalBudget: 0,
        totalCommitted: 0,
        totalAvailable: 0,
        utilizationRate: 0
    });

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        fetchBudgetData();
    }, []);

    const fetchBudgetData = async () => {
        setLoading(true);
        try {
            // Fetch all departments
            const { data: deptData } = await supabase
                .from('departments')
                .select('id, name')
                .order('name');
            setDepartments(deptData || []);

            // Fetch all projects with budget data
            const { data: projects, error } = await supabase
                .from('projects')
                .select(`
                    id,
                    title,
                    budget_amount,
                    status,
                    department:department_id(id, name)
                `)
                .order('budget_amount', { ascending: false });

            if (error) throw error;

            // Process data by department
            const deptMap = {};
            let totalBudget = 0;
            let totalCommitted = 0;

            (projects || []).forEach(project => {
                const deptId = project.department?.id || 'unassigned';
                const deptName = project.department?.name || 'Unassigned';
                const budget = project.budget_amount || 0;
                const isCommitted = ['planning', 'pending_approval', 'approved', 'ongoing'].includes(project.status);

                if (!deptMap[deptId]) {
                    deptMap[deptId] = {
                        id: deptId,
                        name: deptName,
                        totalBudget: 0,
                        committed: 0,
                        available: 0,
                        projectCount: 0
                    };
                }

                deptMap[deptId].totalBudget += budget;
                deptMap[deptId].projectCount += 1;
                if (isCommitted) {
                    deptMap[deptId].committed += budget;
                }
                totalBudget += budget;
                if (isCommitted) {
                    totalCommitted += budget;
                }
            });

            // Calculate available and utilization
            const processedData = Object.values(deptMap).map(dept => ({
                ...dept,
                available: dept.totalBudget - dept.committed,
                utilizationRate: dept.totalBudget > 0
                    ? (dept.committed / dept.totalBudget) * 100
                    : 0
            }));

            // Sort by total budget descending
            processedData.sort((a, b) => b.totalBudget - a.totalBudget);

            setBudgetData(processedData);

            const totalAvailable = totalBudget - totalCommitted;
            setSummary({
                totalBudget,
                totalCommitted,
                totalAvailable,
                utilizationRate: totalBudget > 0
                    ? (totalCommitted / totalBudget) * 100
                    : 0
            });

        } catch (error) {
            console.error('Error fetching budget data:', error);
            alert('Error loading budget report');
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

    const getUtilizationColor = (rate) => {
        if (rate >= 80) return '#c62828';
        if (rate >= 50) return '#f57c00';
        return '#2e7d32';
    };

    return (
        <div className="budget-report-page">
            <div className="bg-pattern"></div>
            <div className="gradient-orb"></div>
            <div className="gradient-orb-2"></div>

            <Header />

            <main className="budget-report-main">
                <div className="container">
                    <div className="budget-report-header">
                        <div>
                            <h1 className="budget-report-title">
                                <i className="fas fa-coins"></i>
                                Budget Report
                            </h1>
                            <p className="budget-report-subtitle">
                                Budget overview with committed vs available by department
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
                    <div className="budget-summary-cards">
                        <div className="budget-summary-card">
                            <div className="budget-summary-card-icon" style={{ background: '#4a8c6f' }}>
                                <i className="fas fa-coins"></i>
                            </div>
                            <div className="budget-summary-card-content">
                                <span className="budget-summary-card-value">{formatCurrency(summary.totalBudget)}</span>
                                <span className="budget-summary-card-label">Total Budget</span>
                            </div>
                        </div>
                        <div className="budget-summary-card">
                            <div className="budget-summary-card-icon" style={{ background: '#1976d2' }}>
                                <i className="fas fa-lock"></i>
                            </div>
                            <div className="budget-summary-card-content">
                                <span className="budget-summary-card-value">{formatCurrency(summary.totalCommitted)}</span>
                                <span className="budget-summary-card-label">Committed</span>
                            </div>
                        </div>
                        <div className="budget-summary-card">
                            <div className="budget-summary-card-icon" style={{ background: '#f57c00' }}>
                                <i className="fas fa-unlock"></i>
                            </div>
                            <div className="budget-summary-card-content">
                                <span className="budget-summary-card-value">{formatCurrency(summary.totalAvailable)}</span>
                                <span className="budget-summary-card-label">Available</span>
                            </div>
                        </div>
                        <div className="budget-summary-card">
                            <div className="budget-summary-card-icon" style={{ background: '#9c27b0' }}>
                                <i className="fas fa-percent"></i>
                            </div>
                            <div className="budget-summary-card-content">
                                <span className="budget-summary-card-value">{summary.utilizationRate.toFixed(1)}%</span>
                                <span className="budget-summary-card-label">Utilization Rate</span>
                            </div>
                        </div>
                    </div>

                    {/* Overall Utilization Bar */}
                    <div className="utilization-bar-container">
                        <div className="utilization-bar-header">
                            <span>Overall Budget Utilization</span>
                            <span>{summary.utilizationRate.toFixed(1)}%</span>
                        </div>
                        <div className="utilization-bar-track">
                            <div
                                className="utilization-bar-fill"
                                style={{
                                    width: `${Math.min(summary.utilizationRate, 100)}%`,
                                    background: summary.utilizationRate >= 80 ? '#c62828' :
                                        summary.utilizationRate >= 50 ? '#f57c00' : '#2e7d32'
                                }}
                            ></div>
                        </div>
                    </div>

                    {/* Department Table */}
                    {loading ? (
                        <div className="loading-state">
                            <i className="fas fa-spinner fa-spin"></i>
                            <p>Loading budget data...</p>
                        </div>
                    ) : budgetData.length === 0 ? (
                        <div className="empty-state">
                            <i className="fas fa-coins"></i>
                            <h3>No Budget Data Found</h3>
                            <p>No departments or projects with budget data available</p>
                        </div>
                    ) : (
                        <div className="budget-table-container">
                            <table className="budget-report-table">
                                <thead>
                                    <tr>
                                        <th>Department</th>
                                        <th>Projects</th>
                                        <th>Total Budget</th>
                                        <th>Committed</th>
                                        <th>Available</th>
                                        <th>Utilization</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {budgetData.map(dept => (
                                        <tr key={dept.id}>
                                            <td><strong>{dept.name}</strong></td>
                                            <td>{dept.projectCount}</td>
                                            <td>{formatCurrency(dept.totalBudget)}</td>
                                            <td>{formatCurrency(dept.committed)}</td>
                                            <td>{formatCurrency(dept.available)}</td>
                                            <td>
                                                <div className="utilization-cell">
                                                    <div className="utilization-bar-small">
                                                        <div
                                                            className="utilization-bar-fill-small"
                                                            style={{
                                                                width: `${Math.min(dept.utilizationRate, 100)}%`,
                                                                background: getUtilizationColor(dept.utilizationRate)
                                                            }}
                                                        ></div>
                                                    </div>
                                                    <span className="utilization-text">
                                                        {dept.utilizationRate.toFixed(0)}%
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

export default BudgetReport;