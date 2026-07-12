import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { departmentService } from '../services/departmentService';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import '../styles/BenchmarkingPage.css';

const BenchmarkingPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [lgaData, setLgaData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('ranking');
    const [sortBy, setSortBy] = useState('total_projects');

    useEffect(() => {
        fetchBenchmarkingData();
    }, []);

    const fetchBenchmarkingData = async () => {
        setLoading(true);
        try {
            const { data: projects, error } = await supabase
                .from('projects')
                .select(`
                    *,
                    lga:lga_id(id, full_name, lga)
                `);

            if (error) throw error;

            // Group by LGA
            const lgaMap = {};
            (projects || []).forEach(project => {
                const lgaName = project.lga?.lga || project.lga?.full_name || 'Unassigned';
                const lgaId = project.lga_id || 'unassigned';

                if (!lgaMap[lgaId]) {
                    lgaMap[lgaId] = {
                        lga_id: lgaId,
                        lga_name: lgaName,
                        total_projects: 0,
                        total_budget: 0,
                        avg_completion: 0,
                        completed: 0,
                        ongoing: 0,
                        stalled: 0,
                        approved: 0,
                        planning: 0,
                        completions: [],
                    };
                }

                const lga = lgaMap[lgaId];
                lga.total_projects++;
                lga.total_budget += parseFloat(project.budget_amount || 0);
                lga.completions.push(project.completion_percentage || 0);

                switch (project.status) {
                    case 'completed': lga.completed++; break;
                    case 'ongoing': lga.ongoing++; break;
                    case 'stalled': lga.stalled++; break;
                    case 'approved': lga.approved++; break;
                    case 'planning': lga.planning++; break;
                    default: break;
                }
            });

            // Calculate averages and scores
            const lgaArray = Object.values(lgaMap).map(lga => {
                const avg = lga.completions.length > 0
                    ? lga.completions.reduce((a, b) => a + b, 0) / lga.completions.length
                    : 0;

                // Performance score (0-100)
                const completionScore = avg * 0.4;
                const activeScore = lga.total_projects > 0
                    ? ((lga.completed + lga.ongoing) / lga.total_projects) * 40
                    : 0;
                const stalledPenalty = lga.total_projects > 0
                    ? (lga.stalled / lga.total_projects) * 20
                    : 0;
                const score = Math.round(completionScore + activeScore - stalledPenalty + 20);

                return {
                    ...lga,
                    avg_completion: Math.round(avg),
                    performance_score: Math.min(100, Math.max(0, score)),
                };
            });

            // Sort by selected field
            lgaArray.sort((a, b) => b[sortBy] - a[sortBy]);
            setLgaData(lgaArray);

        } catch (error) {
            console.error('Error fetching benchmarking data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (lgaData.length > 0) {
            const sorted = [...lgaData].sort((a, b) => b[sortBy] - a[sortBy]);
            setLgaData(sorted);
        }
    }, [sortBy]);

    const formatCurrency = (amount) => {
        if (amount >= 1000000000) return `₦${(amount / 1000000000).toFixed(1)}B`;
        if (amount >= 1000000) return `₦${(amount / 1000000).toFixed(1)}M`;
        if (amount >= 1000) return `₦${(amount / 1000).toFixed(0)}K`;
        return `₦${amount.toLocaleString()}`;
    };

    const getMedal = (index) => {
        if (index === 0) return '🥇';
        if (index === 1) return '🥈';
        if (index === 2) return '🥉';
        return `#${index + 1}`;
    };

    const getScoreColor = (score) => {
        if (score >= 70) return '#016b40';
        if (score >= 40) return '#f57c00';
        return '#c62828';
    };

    const getStatusColor = (status) => {
        const colors = {
            completed: '#016b40',
            ongoing: '#1976d2',
            approved: '#9c27b0',
            planning: '#f57c00',
            stalled: '#c62828',
        };
        return colors[status] || '#757575';
    };

    const totalProjects = lgaData.reduce((s, l) => s + l.total_projects, 0);
    const totalBudget = lgaData.reduce((s, l) => s + l.total_budget, 0);
    const totalCompleted = lgaData.reduce((s, l) => s + l.completed, 0);
    const totalStalled = lgaData.reduce((s, l) => s + l.stalled, 0);

    return (
        <div className="bench-page">
            <div className="bg-pattern"></div>
            <div className="gradient-orb"></div>
            <div className="gradient-orb-2"></div>

            <Header />

            <main className="bench-main">
                <div className="container">

                    {/* Page Header */}
                    <div className="bench-header">
                        <div>
                            <h1 className="bench-title">
                                <i className="fas fa-hands-helping"></i> LGA Support Dashboard
                            </h1>
                            <p className="bench-subtitle">
                                Governor's overview of where state support and resources are needed most
                            </p>
                        </div>
                        {/*<button className="btn-outline" onClick={() => navigate('/projects')}>
                           <i className="fas fa-plus"></i>TRANSPARENCY
                        </button>*/}
                        <button className="btn-outline">
                            <i className="fas fa-plus"></i>TRANSPARENCY
                        </button>
                    </div>

                    {/* State KPI Cards */}
                    <div className="bench-kpis">
                        {[
                            { label: 'TOTAL PROJECTS', value: totalProjects, icon: 'fa-project-diagram', color: '#016b40' },
                            { label: 'TOTAL COMMITTED', value: formatCurrency(totalBudget), icon: 'fa-coins', color: '#1e3a5f' },
                            { label: 'DELIVERED', value: totalCompleted, icon: 'fa-check-circle', color: '#016b40' },
                            { label: 'NEED ATTENTION', value: totalStalled, icon: 'fa-hands-helping', color: '#f57c00' },
                            { label: 'LGAs REPORTING', value: lgaData.filter(l => l.lga_name !== 'Unassigned').length, icon: 'fa-map-marker-alt', color: '#1e3a5f' },
                        ].map((kpi, i) => (
                            <div key={i} className="bench-kpi-card">
                                <div className="bench-kpi-icon" style={{ background: `${kpi.color}18`, color: kpi.color }}>
                                    <i className={`fas ${kpi.icon}`}></i>
                                </div>
                                <div>
                                    <div className="bench-kpi-value" style={{ color: kpi.color }}>{kpi.value}</div>
                                    <div className="bench-kpi-label">{kpi.label}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Tabs */}
                    <div className="bench-tabs">
                        {[
                            { id: 'ranking', label: 'SUPPORT OVERVIEW', icon: 'fa-hands-helping' },
                            { id: 'breakdown', label: 'PROJECT PROGRESS', icon: 'fa-tasks' },
                            { id: 'budget', label: 'RESOURCE ALLOCATION', icon: 'fa-coins' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                className={`bench-tab ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <i className={`fas ${tab.icon}`}></i> {tab.label}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <div className="loading-state">
                            <i className="fas fa-spinner fa-spin"></i>
                            <p>Loading benchmarking data...</p>
                        </div>
                    ) : lgaData.length === 0 ? (
                        <div className="empty-state">
                            <i className="fas fa-chart-bar"></i>
                            <h3>No data available</h3>
                            <p>Assign LGAs to projects to see benchmarking data</p>
                            <button className="btn-primary" onClick={() => navigate('/projects')}>
                                <i className="fas fa-plus"></i> Add Projects
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* RANKING TAB */}
                            {activeTab === 'ranking' && (
                                <div className="bench-card">
                                    <div className="bench-card-header">
                                        <h3><i className="fas fa-hands-helping"></i> LGA Support Index — Where does the Governor focus?</h3>
                                        <div className="sort-control">
                                            <label>View by:</label>
                                            <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                                                <option value="total_projects">Total Projects</option>
                                                <option value="total_budget">Resources Committed</option>
                                                <option value="completed">Projects Delivered</option>
                                                <option value="performance_score">Support Index</option>
                                                <option value="avg_completion">Progress Level</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="ranking-list">
                                        {lgaData.map((lga, index) => (
                                            <div key={lga.lga_id} className="ranking-row">
                                                <div className="rank-medal">{getMedal(index)}</div>

                                                <div className="rank-info">
                                                    <div className="rank-name">{lga.lga_name}</div>
                                                    <div className="rank-meta">
                                                        <span><i className="fas fa-project-diagram"></i> {lga.total_projects} projects</span>
                                                        <span><i className="fas fa-coins"></i> {formatCurrency(lga.total_budget)}</span>
                                                        <span><i className="fas fa-check"></i> {lga.completed} delivered</span>
                                                        {lga.stalled > 0 && (
                                                            <span style={{ color: '#f57c00' }}>
                                                                <i className="fas fa-hands-helping"></i> {lga.stalled} need support
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="rank-score-section">
                                                    <div className="rank-completion">
                                                        <div className="completion-bar-track">
                                                            <div
                                                                className="completion-bar-fill"
                                                                style={{
                                                                    width: `${lga.avg_completion}%`,
                                                                    background: getScoreColor(lga.avg_completion)
                                                                }}
                                                            />
                                                        </div>
                                                        <span style={{ color: getScoreColor(lga.avg_completion) }}>
                                                            {lga.avg_completion}%
                                                        </span>
                                                    </div>
                                                    <div
                                                        className="performance-score"
                                                        style={{
                                                            background: `${getScoreColor(lga.performance_score)}18`,
                                                            color: getScoreColor(lga.performance_score),
                                                            border: `1.5px solid ${getScoreColor(lga.performance_score)}44`
                                                        }}
                                                    >
                                                        Support Index: {lga.performance_score}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* BREAKDOWN TAB */}
                            {activeTab === 'breakdown' && (
                                <div className="bench-card">
                                    <div className="bench-card-header">
                                        <h3><i className="fas fa-tasks"></i> Project Progress by LGA — Where is state support needed?</h3>
                                    </div>
                                    <div className="breakdown-table-wrap">
                                        <table className="breakdown-table">
                                            <thead>
                                                <tr>
                                                    <th>LGA</th>
                                                    <th>Total</th>
                                                    <th style={{ color: '#b5f0e0' }}>Delivered</th>
                                                    <th style={{ color: '#b5f0e0' }}>Ongoing</th>
                                                    <th style={{ color: '#b5f0e0' }}>Approved</th>
                                                    <th style={{ color: '#b5f0e0' }}>Planning</th>
                                                    <th style={{ color: '#ffd700' }}>Needs Support</th>
                                                    <th>Progress</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {lgaData.map((lga, i) => (
                                                    <tr key={lga.lga_id} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
                                                        <td className="lga-name-cell">
                                                            <span className="rank-dot">{getMedal(i)}</span>
                                                            {lga.lga_name}
                                                        </td>
                                                        <td><strong>{lga.total_projects}</strong></td>
                                                        <td><span className="status-pill completed">{lga.completed}</span></td>
                                                        <td><span className="status-pill ongoing">{lga.ongoing}</span></td>
                                                        <td><span className="status-pill approved">{lga.approved}</span></td>
                                                        <td><span className="status-pill planning">{lga.planning}</span></td>
                                                        <td><span className="status-pill stalled">{lga.stalled}</span></td>
                                                        <td>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <div style={{ flex: 1, background: '#e0f2ec', borderRadius: 99, height: 8 }}>
                                                                    <div style={{
                                                                        width: `${lga.avg_completion}%`,
                                                                        background: getScoreColor(lga.avg_completion),
                                                                        height: '100%', borderRadius: 99
                                                                    }} />
                                                                </div>
                                                                <span style={{ fontSize: 12, fontWeight: 700, color: getScoreColor(lga.avg_completion), width: 36 }}>
                                                                    {lga.avg_completion}%
                                                                </span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* BUDGET TAB */}
                            {activeTab === 'budget' && (
                                <div className="bench-card">
                                    <div className="bench-card-header">
                                        <h3><i className="fas fa-coins"></i> Resource Allocation by LGA — How is the state budget distributed?</h3>
                                    </div>
                                    <div className="budget-list">
                                        {[...lgaData].sort((a, b) => b.total_budget - a.total_budget).map((lga, i) => {
                                            const maxBudget = Math.max(...lgaData.map(l => l.total_budget));
                                            const pct = maxBudget > 0 ? (lga.total_budget / maxBudget) * 100 : 0;
                                            return (
                                                <div key={lga.lga_id} className="budget-row">
                                                    <div className="budget-rank">{getMedal(i)}</div>
                                                    <div className="budget-info">
                                                        <div className="budget-name">{lga.lga_name}</div>
                                                        <div className="budget-bar-track">
                                                            <div
                                                                className="budget-bar-fill"
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="budget-amount">{formatCurrency(lga.total_budget)}</div>
                                                    <div className="budget-projects">{lga.total_projects} projects</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="budget-total">
                                        <span>TOTAL STATE RESOURCES COMMITTED</span>
                                        <span className="budget-total-value">{formatCurrency(totalBudget)}</span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default BenchmarkingPage;