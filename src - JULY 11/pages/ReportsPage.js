import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';
import '../styles/ReportsPage.css';

const ReportsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const reports = [
        {
            id: 'projects',
            title: 'Projects Report',
            icon: 'fa-project-diagram',
            color: '#4a8c6f',
            description: 'View and filter projects by department, LGA, status, and date range',
            link: '/reports/projects'
        },
        {
            id: 'budget',
            title: 'Budget Report',
            icon: 'fa-coins',
            color: '#f57c00',
            description: 'Budget overview with committed vs available by department',
            link: '/reports/budget'
        },
        {
            id: 'performance',
            title: 'Performance Report',
            icon: 'fa-chart-line',
            color: '#1976d2',
            description: 'Completion rates and performance metrics by LGA',
            link: '/reports/performance'
        },
        {
            id: 'audit',
            title: 'Audit Trail Report',
            icon: 'fa-history',
            color: '#9c27b0',
            description: 'Complete audit log of all actions with filtering and export',
            link: '/audit'
        },
        {
            id: 'departments',
            title: 'Department Summary',
            icon: 'fa-building',
            color: '#2e7d32',
            description: 'Projects per department with budget and status breakdown',
            link: '/reports/departments'
        },
        {
            id: 'timeline',
            title: 'Timeline Report',
            icon: 'fa-calendar-alt',
            color: '#c62828',
            description: 'Projects by start and end dates',
            link: '/reports/timeline'
        }
    ];

    return (
        <div className="reports-page">
            <div className="bg-pattern"></div>
            <div className="gradient-orb"></div>
            <div className="gradient-orb-2"></div>

            <Header />

            <main className="reports-main">
                <div className="container">
                    <div className="reports-header">
                        <div>
                            <h1 className="reports-title">
                                <i className="fas fa-chart-bar"></i>
                                Reports
                            </h1>
                            <p className="reports-subtitle">
                                Generate and export reports across all modules
                            </p>
                        </div>
                    </div>

                    <div className="reports-grid">
                        {reports.map((report) => (
                            <div
                                key={report.id}
                                className="report-card"
                                onClick={() => navigate(report.link)}
                                style={{ borderTopColor: report.color }}
                            >
                                <div className="report-card-icon" style={{ backgroundColor: report.color }}>
                                    <i className={`fas ${report.icon}`}></i>
                                </div>
                                <h3 className="report-card-title">{report.title}</h3>
                                <p className="report-card-description">{report.description}</p>
                                <span className="report-card-link">
                                    Generate Report <i className="fas fa-arrow-right"></i>
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default ReportsPage;