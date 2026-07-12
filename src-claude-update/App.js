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
//import NetworkPage from './pages/NetworkPage';
import MessagesPage from './pages/MessagesPage';
import BenchmarkingPage from './pages/BenchmarkingPage';
import DepartmentsPage from './pages/DepartmentsPage';
import AuditPage from './pages/AuditPage';
import ApprovalsPage from './pages/ApprovalsPage';  // ← ADD THIS

const ProtectedRoute = ({ children }) => {
    const { user } = useAuth();
    const devBypass = sessionStorage.getItem('devBypass') === 'true';
    console.log('🔐 ProtectedRoute → user:', user, '| devBypass:', devBypass);
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
                    <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                    <Route path="/projects" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
                    <Route path="/projects/new" element={<ProtectedRoute><ProjectFormPage /></ProtectedRoute>} />
                    <Route path="/projects/edit/:id" element={<ProtectedRoute><ProjectFormPage /></ProtectedRoute>} />
                    <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetailPage /></ProtectedRoute>} />
                    <Route path="/departments" element={<ProtectedRoute><DepartmentsPage /></ProtectedRoute>} />
                    <Route path="/audit" element={<ProtectedRoute><AuditPage /></ProtectedRoute>} />
                    <Route path="/approvals" element={<ProtectedRoute><ApprovalsPage /></ProtectedRoute>} />  {/* ← ADD THIS */}
                    <Route path="/video-call" element={<ProtectedRoute><VideoCallPage /></ProtectedRoute>} />
                    <Route path="/sentiment" element={<ProtectedRoute><EkitiSentimentDashboard /></ProtectedRoute>} />
                    {/*<Route path="/network" element={<ProtectedRoute><NetworkPage /></ProtectedRoute>} />*/}
                    <Route path="/messages/:userId" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
                    <Route path="/benchmarking" element={<ProtectedRoute><BenchmarkingPage /></ProtectedRoute>} />
                </Routes>
            </Router>
        </AuthProvider>
    );
}

export default App;