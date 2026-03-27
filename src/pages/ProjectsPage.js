import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';
import '../styles/ProjectsPage.css';

const ProjectsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        status: '',
        lga_id: '',
        search: ''
    });
    const [lgas, setLgas] = useState([]);

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        fetchProjects();
        fetchLgas();
    }, [filters, user]);

    const fetchProjects = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('projects')
                .select(`
                    *,
                    lga:lga_id(full_name, lga),
                    mda:mda_id(full_name, department),
                    creator:created_by(full_name)
                `)
                .order('created_at', { ascending: false });

            // Apply filters
            if (filters.status) query = query.eq('status', filters.status);
            if (filters.lga_id) query = query.eq('lga_id', filters.lga_id);
            if (filters.search) {
                query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
            }

            const { data, error } = await query;

            if (error) throw error;
            setProjects(data || []);
        } catch (error) {
            console.error('Error fetching projects:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchLgas = async () => {
        const { data } = await supabase
            .from('profiles')
            .select('id, full_name, lga')
            .eq('role', 'chairman');
        setLgas(data || []);
    };

    const handleDelete = async (projectId) => {
        if (window.confirm('Are you sure you want to delete this project?')) {
            try {
                const { error } = await supabase
                    .from('projects')
                    .delete()
                    .eq('id', projectId);

                if (error) throw error;
                fetchProjects();
                alert('Project deleted successfully!');
            } catch (error) {
                console.error('Error deleting project:', error);
                alert('Error deleting project');
            }
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

    const getStatusColor = (status) => {
        const colors = {
            planning: '#f57c00',
            pending_approval: '#9c27b0',
            approved: '#1976d2',
            ongoing: '#2e7d32',
            stalled: '#c62828',
            completed: '#00796b',
            rejected: '#d32f2f'
        };
        return colors[status] || '#757575';
    };

    const getStatusLabel = (status) => {
        return status?.split('_').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ') || 'Unknown';
    };

    return (
        <div className="projects-page">
            <div className="bg-pattern"></div>
            <div className="gradient-orb"></div>
            <div className="gradient-orb-2"></div>

            <Header />

            <main className="projects-main">
                <div className="container">
                    {/* Header with title and new button */}
                    <div className="projects-header">
                        <div>
                            <h1 className="projects-title">
                                <i className="fas fa-project-diagram"></i>
                                Projects
                            </h1>
                            <p className="projects-subtitle">
                                Manage and track all government projects across Ekiti State
                            </p>
                        </div>
                        <button
                            className="btn-primary"
                            onClick={() => navigate('/projects/new')}
                        >
                            <i className="fas fa-plus-circle"></i>
                            New Project
                        </button>
                    </div>

                    {/* Filters */}
                    <div className="filters-section">
                        <div className="search-box">
                            <i className="fas fa-search"></i>
                            <input
                                type="text"
                                placeholder="Search projects..."
                                value={filters.search}
                                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                            />
                        </div>

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
                            value={filters.lga_id}
                            onChange={(e) => setFilters({ ...filters, lga_id: e.target.value })}
                        >
                            <option value="">All LGAs</option>
                            {lgas.map(lga => (
                                <option key={lga.id} value={lga.id}>
                                    {lga.lga || lga.full_name}
                                </option>
                            ))}
                        </select>

                        <button
                            className="btn-text"
                            onClick={() => setFilters({ status: '', lga_id: '', search: '' })}
                        >
                            <i className="fas fa-times"></i> Clear
                        </button>
                    </div>

                    {/* Projects List */}
                    {loading ? (
                        <div className="loading-state">
                            <i className="fas fa-spinner fa-spin"></i>
                            <p>Loading projects...</p>
                        </div>
                    ) : projects.length === 0 ? (
                        <div className="empty-state">
                            <i className="fas fa-folder-open"></i>
                            <h3>No Projects Found</h3>
                            <p>Get started by creating your first project</p>
                            <button
                                className="btn-primary"
                                onClick={() => navigate('/projects/new')}
                            >
                                <i className="fas fa-plus-circle"></i>
                                New Project
                            </button>
                        </div>
                    ) : (
                        <div className="projects-list">
                            {projects.map(project => (
                                <div key={project.id} className="project-card">
                                    <div className="project-card-header">
                                        <div className="project-title-section">
                                            <h3>{project.title}</h3>
                                            <span
                                                className="project-status-badge"
                                                style={{
                                                    background: getStatusColor(project.status),
                                                    color: 'white'
                                                }}
                                            >
                                                {getStatusLabel(project.status)}
                                            </span>
                                        </div>
                                        <p className="project-description">
                                            {project.description?.substring(0, 150)}
                                            {project.description?.length > 150 ? '...' : ''}
                                        </p>
                                    </div>

                                    <div className="project-details">
                                        <div className="detail-item">
                                            <i className="fas fa-map-marker-alt"></i>
                                            <span>{project.lga?.lga || 'N/A'} LGA</span>
                                        </div>
                                        <div className="detail-item">
                                            <i className="fas fa-building"></i>
                                            <span>{project.mda?.department || 'N/A'}</span>
                                        </div>
                                        <div className="detail-item">
                                            <i className="fas fa-coins"></i>
                                            <span>{formatCurrency(project.budget_amount)}</span>
                                        </div>
                                        <div className="detail-item">
                                            <i className="fas fa-user"></i>
                                            <span>{project.contractor || 'Not assigned'}</span>
                                        </div>
                                    </div>

                                    <div className="progress-section">
                                        <div className="progress-header">
                                            <span className="progress-label">Completion</span>
                                            <span className="progress-value">{project.completion_percentage}%</span>
                                        </div>
                                        <div className="progress-bar">
                                            <div
                                                className="progress-fill"
                                                style={{ width: `${project.completion_percentage}%` }}
                                            ></div>
                                        </div>
                                    </div>

                                    <div className="project-footer">
                                        <div className="dates">
                                            <div className="date-item">
                                                <i className="far fa-calendar-alt"></i>
                                                <span>Start: {project.start_date || 'TBD'}</span>
                                            </div>
                                            <div className="date-item">
                                                <i className="far fa-calendar-check"></i>
                                                <span>End: {project.end_date || 'TBD'}</span>
                                            </div>
                                        </div>

                                        <div className="card-actions">
                                            <button
                                                className="btn-icon view"
                                                onClick={() => navigate(`/projects/${project.id}`)}
                                                title="View Details"
                                            >
                                                <i className="fas fa-eye"></i>
                                            </button>
                                            <button
                                                className="btn-icon edit"
                                                onClick={() => navigate(`/projects/edit/${project.id}`)}
                                                title="Edit"
                                            >
                                                <i className="fas fa-edit"></i>
                                            </button>
                                            <button
                                                className="btn-icon delete"
                                                onClick={() => handleDelete(project.id)}
                                                title="Delete"
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default ProjectsPage; 
