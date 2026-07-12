import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import HomePage from './pages/HomePage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectFormPage from './pages/ProjectFormPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import VideoCallPage from './pages/VideoCallPage';
import EkitiSentimentDashboard from './pages/EkitiSentimentDashboard';
import MessagesPage from './pages/MessagesPage';
import BenchmarkingPage from './pages/BenchmarkingPage';
import DepartmentsPage from './pages/DepartmentsPage';
import AuditPage from './pages/AuditPage';
import ApprovalsPage from './pages/ApprovalsPage';
import ReportsPage from './pages/ReportsPage';
import ProjectsReport from './pages/Reports/ProjectsReport';  // Capital R
import BudgetReport from './pages/Reports/BudgetReport';
import PerformanceReport from './pages/Reports/PerformanceReport';
import DepartmentSummary from './pages/Reports/DepartmentSummary';
import TimelineReport from './pages/Reports/TimelineReport';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ManageUsersPage from './pages/ManageUsersPage';
import NetworkPage from './pages/NetworkPage';

const ProtectedRoute = ({ children }) => {
    const { user, loading } = useAuth();
    const devBypass = sessionStorage.getItem('devBypass') === 'true';
    // Wait for the session check to actually finish before deciding to
    // redirect — otherwise a fresh page load (typing a URL directly, or
    // hitting refresh) sees `user` as null for a brief moment before
    // AuthContext finishes loading, and incorrectly bounces to /login
    // even when a valid session exists.
    if (loading) {
        return <div style={{ padding: '4rem', textAlign: 'center' }}>Loading...</div>;
    }
    if (!user && !devBypass) return <Navigate to="/login" />;
    return children;
};

function App() {
    return (
        <AuthProvider>
            <Router>
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                    <Route path="/projects" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
                    <Route path="/projects/new" element={<ProtectedRoute><ProjectFormPage /></ProtectedRoute>} />
                    <Route path="/projects/edit/:id" element={<ProtectedRoute><ProjectFormPage /></ProtectedRoute>} />
                    <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetailPage /></ProtectedRoute>} />
                    <Route path="/departments" element={<ProtectedRoute><DepartmentsPage /></ProtectedRoute>} />
                    <Route path="/audit" element={<ProtectedRoute><AuditPage /></ProtectedRoute>} />
                    <Route path="/approvals" element={<ProtectedRoute><ApprovalsPage /></ProtectedRoute>} />
                    <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
                    <Route path="/reports/projects" element={<ProtectedRoute><ProjectsReport /></ProtectedRoute>} />
                    <Route path="/video-call" element={<ProtectedRoute><VideoCallPage /></ProtectedRoute>} />
                    <Route path="/sentiment" element={<ProtectedRoute><EkitiSentimentDashboard /></ProtectedRoute>} />
                    <Route path="/messages/:userId" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
                    <Route path="/benchmarking" element={<ProtectedRoute><BenchmarkingPage /></ProtectedRoute>} />
                    <Route path="/reports/budget" element={<ProtectedRoute><BudgetReport /></ProtectedRoute>} />
                    <Route path="/reports/performance" element={<ProtectedRoute><PerformanceReport /></ProtectedRoute>} />
                    <Route path="/reports/departments" element={<ProtectedRoute><DepartmentSummary /></ProtectedRoute>} />
                    <Route path="/reports/timeline" element={<ProtectedRoute><TimelineReport /></ProtectedRoute>} />
                    <Route path="/network" element={<ProtectedRoute><NetworkPage /></ProtectedRoute>} />
                    <Route path="/admin/users" element={<ProtectedRoute><ManageUsersPage /></ProtectedRoute>} />
                </Routes>
            </Router>
        </AuthProvider>
    );
}

export default App;