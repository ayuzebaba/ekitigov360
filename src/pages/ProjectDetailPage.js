import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';
import '../styles/ProjectDetailPage.css';

const ProjectDetailPage = () => {
    const { id } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [project, setProject] = useState(null);
    const [updates, setUpdates] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('details');
    const [updatingStatus, setUpdatingStatus] = useState(false);

    // Upload states
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    useEffect(() => {
        console.log('📋 ProjectDetailPage mounted with ID:', id);
        fetchProjectDetails();
    }, [id]);

    const fetchProjectDetails = async () => {
        setLoading(true);
        try {
            console.log('🔍 Fetching project details for ID:', id);

            // Fetch project with related data
            const { data: projectData, error: projectError } = await supabase
                .from('projects')
                .select(`
                    *,
                    lga:lga_id(id, full_name, lga),
                    mda:mda_id(id, full_name, department),
                    creator:created_by(id, full_name)
                `)
                .eq('id', id)
                .single();

            if (projectError) {
                console.error('❌ Project fetch error:', projectError);
                throw projectError;
            }

            console.log('✅ Project data loaded:', projectData);
            setProject(projectData);

            // Fetch project updates
            console.log('🔍 Fetching updates for project ID:', id);
            const { data: updatesData, error: updatesError } = await supabase
                .from('project_updates')
                .select(`
                    *,
                    updater:updated_by(id, full_name)
                `)
                .eq('project_id', id)
                .order('created_at', { ascending: false });

            if (updatesError) {
                console.error('❌ Updates fetch error:', updatesError);
            } else {
                console.log('✅ Updates loaded:', updatesData?.length || 0, updatesData);
                setUpdates(updatesData || []);
            }

            // Fetch project documents
            console.log('🔍 Fetching documents for project ID:', id);
            const { data: docsData, error: docsError } = await supabase
                .from('project_documents')
                .select('*')
                .eq('project_id', id)
                .order('created_at', { ascending: false });

            if (docsError) {
                console.error('❌ Documents fetch error:', docsError);
            } else {
                console.log('✅ Documents loaded:', docsData?.length || 0, docsData);
                setDocuments(docsData || []);
            }

        } catch (error) {
            console.error('❌ Error in fetchProjectDetails:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (newStatus) => {
        if (!window.confirm(`Change project status from ${getStatusLabel(project.status)} to ${getStatusLabel(newStatus)}?`)) {
            return;
        }

        setUpdatingStatus(true);
        try {
            console.log('🔄 Updating status to:', newStatus);

            // Update project status
            const { error } = await supabase
                .from('projects')
                .update({
                    status: newStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);

            if (error) throw error;

            // Create a status update record
            const { error: updateError } = await supabase
                .from('project_updates')
                .insert([{
                    project_id: id,
                    update_text: `Status changed from ${getStatusLabel(project.status)} to ${getStatusLabel(newStatus)}`,
                    status_update: newStatus,
                    updated_by: user.id,
                    created_at: new Date().toISOString()
                }]);

            if (updateError) throw updateError;

            console.log('✅ Status updated successfully');

            // Refresh data
            await fetchProjectDetails();
            alert('Status updated successfully!');
        } catch (error) {
            console.error('❌ Error updating status:', error);
            alert('Error updating status');
        } finally {
            setUpdatingStatus(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('Are you sure you want to delete this project?')) return;

        try {
            console.log('🗑️ Deleting project:', id);

            const { error } = await supabase
                .from('projects')
                .delete()
                .eq('id', id);

            if (error) throw error;

            console.log('✅ Project deleted successfully');
            alert('Project deleted successfully!');
            navigate('/projects');
        } catch (error) {
            console.error('❌ Error deleting project:', error);
            alert('Error deleting project');
        }
    };

    // Handle file upload
    const handleFileChange = (e) => {
        setUploadFile(e.target.files[0]);
    };

    const handleUpload = async () => {
        if (!uploadFile) {
            alert('Please select a file to upload');
            return;
        }

        setUploading(true);
        setUploadProgress(0);

        try {
            console.log('📎 Uploading document:', uploadFile.name);

            // Create a progress simulation (since Supabase doesn't have built-in progress)
            const progressInterval = setInterval(() => {
                setUploadProgress(prev => {
                    if (prev >= 90) {
                        clearInterval(progressInterval);
                        return 90;
                    }
                    return prev + 10;
                });
            }, 200);

            const fileExt = uploadFile.name.split('.').pop();
            const fileName = `projects/${id}/doc_${Date.now()}.${fileExt}`;

            // Upload file to storage
            const { error: uploadError, data: uploadData } = await supabase.storage
                .from('EkitiGov360-documents')
                .upload(fileName, uploadFile);

            clearInterval(progressInterval);
            setUploadProgress(100);

            if (uploadError) throw uploadError;

            // Get public URL
            const { data: urlData } = supabase.storage
                .from('EkitiGov360-documents')
                .getPublicUrl(fileName);

            // Create record in project_documents table
            const { error: docError } = await supabase
                .from('project_documents')
                .insert([{
                    project_id: id,
                    document_name: uploadFile.name,
                    document_url: urlData.publicUrl,
                    document_type: 'DOCUMENT',
                    uploaded_by: user.id,
                    created_at: new Date().toISOString()
                }]);

            if (docError) throw docError;

            console.log('✅ Document uploaded successfully');

            // Reset and refresh
            setUploadFile(null);
            setShowUploadModal(false);
            setUploadProgress(0);

            // Refresh documents list
            await fetchProjectDetails();

            alert('Document uploaded successfully!');

        } catch (error) {
            console.error('❌ Error uploading document:', error);
            alert(`Error uploading document: ${error.message}`);
        } finally {
            setUploading(false);
            setUploadProgress(0);
        }
    };

    const handleDeleteDocument = async (docId, docUrl) => {
        if (!window.confirm('Are you sure you want to delete this document?')) return;

        try {
            // Extract file path from URL
            const urlParts = docUrl.split('/');
            const filePath = urlParts.slice(urlParts.indexOf('EkitiGov360-documents') + 1).join('/');

            // Delete from storage
            const { error: storageError } = await supabase.storage
                .from('EkitiGov360-documents')
                .remove([filePath]);

            if (storageError) throw storageError;

            // Delete from database
            const { error: dbError } = await supabase
                .from('project_documents')
                .delete()
                .eq('id', docId);

            if (dbError) throw dbError;

            console.log('✅ Document deleted successfully');

            // Refresh documents list
            await fetchProjectDetails();

            alert('Document deleted successfully!');

        } catch (error) {
            console.error('❌ Error deleting document:', error);
            alert('Error deleting document');
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

    const formatDate = (dateString) => {
        if (!dateString) return 'Not set';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
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
        if (!status) return 'Unknown';
        return status.split('_').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    };

    if (loading) {
        return (
            <div className="detail-page">
                <Header />
                <div className="loading-state">
                    <i className="fas fa-spinner fa-spin"></i>
                    <p>Loading project details...</p>
                </div>
                <Footer />
            </div>
        );
    }

    if (!project) {
        return (
            <div className="detail-page">
                <Header />
                <div className="error-state">
                    <i className="fas fa-exclamation-circle"></i>
                    <h2>Project Not Found</h2>
                    <p>The project you're looking for doesn't exist or has been deleted.</p>
                    <button
                        className="btn-primary"
                        onClick={() => navigate('/projects')}
                    >
                        <i className="fas fa-arrow-left"></i> Back to Projects
                    </button>
                </div>
                <Footer />
            </div>
        );
    }

    return (
        <div className="detail-page">
            <div className="bg-pattern"></div>
            <div className="gradient-orb"></div>
            <div className="gradient-orb-2"></div>

            <Header />

            <main className="detail-main">
                <div className="container">
                    {/* Navigation Bar */}
                    <div className="detail-nav">
                        <button
                            className="back-btn"
                            onClick={() => navigate('/projects')}
                        >
                            <i className="fas fa-arrow-left"></i> Back to Projects
                        </button>
                        <div className="action-buttons">
                            <button
                                className="btn-outline"
                                onClick={() => navigate(`/projects/edit/${id}`)}
                            >
                                <i className="fas fa-edit"></i> Edit
                            </button>
                            <button
                                className="btn-outline delete"
                                onClick={handleDelete}
                            >
                                <i className="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </div>

                    {/* Project Header with Status Dropdown */}
                    <div className="project-header-card">
                        <div className="project-title-section">
                            <h1 className="project-title">{project.title}</h1>
                            <div className="status-control">
                                <span
                                    className="status-badge"
                                    style={{ background: getStatusColor(project.status) }}
                                >
                                    {getStatusLabel(project.status)}
                                </span>
                                <div className="status-dropdown">
                                    <button className="status-toggle" disabled={updatingStatus}>
                                        <i className="fas fa-chevron-down"></i>
                                    </button>
                                    <div className="status-menu">
                                        {['planning', 'pending_approval', 'approved', 'ongoing', 'stalled', 'completed'].map(status => (
                                            <button
                                                key={status}
                                                className={`status-option ${project.status === status ? 'active' : ''}`}
                                                onClick={() => handleStatusChange(status)}
                                                disabled={updatingStatus || project.status === status}
                                            >
                                                <span className="status-dot" style={{ background: getStatusColor(status) }}></span>
                                                {getStatusLabel(status)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <p className="project-description">{project.description}</p>
                    </div>

                    {/* Tabs */}
                    <div className="detail-tabs">
                        <button
                            className={`tab-btn ${activeTab === 'details' ? 'active' : ''}`}
                            onClick={() => setActiveTab('details')}
                        >
                            <i className="fas fa-info-circle"></i> Details
                        </button>
                        <button
                            className={`tab-btn ${activeTab === 'updates' ? 'active' : ''}`}
                            onClick={() => setActiveTab('updates')}
                        >
                            <i className="fas fa-history"></i> Updates ({updates.length})
                        </button>
                        <button
                            className={`tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
                            onClick={() => setActiveTab('documents')}
                        >
                            <i className="fas fa-file-pdf"></i> Documents ({documents.length})
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className="tab-content-container">
                        {/* DETAILS TAB */}
                        {activeTab === 'details' && (
                            <div className="details-tab">
                                <div className="info-grid">
                                    <div className="info-card">
                                        <h3><i className="fas fa-building"></i> Responsibility</h3>
                                        <div className="info-row">
                                            <span className="info-label">LGA:</span>
                                            <span className="info-value">{project.lga?.lga || project.lga?.full_name || 'Not assigned'}</span>
                                        </div>
                                        <div className="info-row">
                                            <span className="info-label">MDA:</span>
                                            <span className="info-value">{project.mda?.department || project.mda?.full_name || 'Not assigned'}</span>
                                        </div>
                                        <div className="info-row">
                                            <span className="info-label">Created by:</span>
                                            <span className="info-value">{project.creator?.full_name || 'System'}</span>
                                        </div>
                                    </div>

                                    <div className="info-card">
                                        <h3><i className="fas fa-coins"></i> Budget & Contractor</h3>
                                        <div className="info-row">
                                            <span className="info-label">Budget:</span>
                                            <span className="info-value budget">{formatCurrency(project.budget_amount)}</span>
                                        </div>
                                        <div className="info-row">
                                            <span className="info-label">Contractor:</span>
                                            <span className="info-value">{project.contractor || 'Not assigned'}</span>
                                        </div>
                                    </div>

                                    <div className="info-card">
                                        <h3><i className="fas fa-calendar"></i> Timeline</h3>
                                        <div className="info-row">
                                            <span className="info-label">Start date:</span>
                                            <span className="info-value">{formatDate(project.start_date)}</span>
                                        </div>
                                        <div className="info-row">
                                            <span className="info-label">End date:</span>
                                            <span className="info-value">{formatDate(project.end_date)}</span>
                                        </div>
                                    </div>

                                    <div className="info-card">
                                        <h3><i className="fas fa-map-marker-alt"></i> Location</h3>
                                        <div className="info-row">
                                            <span className="info-label">Ward:</span>
                                            <span className="info-value">{project.ward || 'Not specified'}</span>
                                        </div>
                                        <div className="info-row">
                                            <span className="info-label">Community:</span>
                                            <span className="info-value">{project.community || 'Not specified'}</span>
                                        </div>
                                        {project.latitude && project.longitude && (
                                            <div className="info-row">
                                                <span className="info-label">GPS:</span>
                                                <span className="info-value">{project.latitude}, {project.longitude}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Progress Section */}
                                <div className="progress-section">
                                    <h3><i className="fas fa-chart-line"></i> Progress</h3>
                                    <div className="progress-display">
                                        <div className="progress-circle">
                                            <svg viewBox="0 0 36 36" className="circular-chart">
                                                <path className="circle-bg"
                                                    d="M18 2.0845
                                                    a 15.9155 15.9155 0 0 1 0 31.831
                                                    a 15.9155 15.9155 0 0 1 0 -31.831"
                                                />
                                                <path className="circle"
                                                    strokeDasharray={`${project.completion_percentage}, 100`}
                                                    d="M18 2.0845
                                                    a 15.9155 15.9155 0 0 1 0 31.831
                                                    a 15.9155 15.9155 0 0 1 0 -31.831"
                                                />
                                                <text x="18" y="20.35" className="percentage">{project.completion_percentage}%</text>
                                            </svg>
                                        </div>
                                        <div className="progress-details">
                                            <div className="progress-bar-large">
                                                <div
                                                    className="progress-fill"
                                                    style={{ width: `${project.completion_percentage}%` }}
                                                ></div>
                                            </div>
                                            <p className="progress-status">
                                                Status: <span style={{ color: getStatusColor(project.status) }}>
                                                    {getStatusLabel(project.status)}
                                                </span>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* UPDATES TAB */}
                        {activeTab === 'updates' && (
                            <div className="updates-tab">
                                <div className="updates-header">
                                    <h3><i className="fas fa-history"></i> Project Updates</h3>
                                    <button className="btn-primary">
                                        <i className="fas fa-plus"></i> Add Update
                                    </button>
                                </div>

                                {updates.length === 0 ? (
                                    <div className="empty-state">
                                        <i className="fas fa-clock"></i>
                                        <p>No updates yet</p>
                                    </div>
                                ) : (
                                    <div className="updates-timeline">
                                        {updates.map((update, index) => (
                                            <div key={update.id} className="timeline-item">
                                                <div className="timeline-dot"></div>
                                                {index < updates.length - 1 && <div className="timeline-line"></div>}
                                                <div className="timeline-content">
                                                    <div className="timeline-header">
                                                        <span className="timeline-author">
                                                            {update.updater?.full_name || 'System'}
                                                        </span>
                                                        <span className="timeline-date">
                                                            {new Date(update.created_at).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                    <p className="timeline-text">{update.update_text}</p>
                                                    {update.status_update && (
                                                        <div className="timeline-status">
                                                            <span
                                                                className="status-dot"
                                                                style={{ background: getStatusColor(update.status_update) }}
                                                            ></span>
                                                            <span>Status: {getStatusLabel(update.status_update)}</span>
                                                        </div>
                                                    )}
                                                    {update.completion_update && (
                                                        <div className="timeline-progress">
                                                            Progress: {update.completion_update}%
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* DOCUMENTS TAB */}
                        {activeTab === 'documents' && (
                            <div className="documents-tab">
                                <div className="documents-header">
                                    <h3><i className="fas fa-file-pdf"></i> Documents</h3>
                                    <button
                                        className="btn-primary"
                                        onClick={() => setShowUploadModal(true)}
                                    >
                                        <i className="fas fa-upload"></i> Upload Document
                                    </button>
                                </div>

                                {documents.length === 0 ? (
                                    <div className="empty-state">
                                        <i className="fas fa-file"></i>
                                        <p>No documents uploaded</p>
                                    </div>
                                ) : (
                                    <div className="documents-list">
                                        {documents.map(doc => (
                                            <div key={doc.id} className="document-item">
                                                <div className="document-icon">
                                                    <i className="fas fa-file-pdf"></i>
                                                </div>
                                                <div className="document-info">
                                                    <h4>{doc.document_name}</h4>
                                                    <p>Uploaded {new Date(doc.created_at).toLocaleDateString()}</p>
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <a
                                                        href={doc.document_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="btn-outline"
                                                    >
                                                        <i className="fas fa-download"></i> Download
                                                    </a>
                                                    <button
                                                        className="btn-outline delete"
                                                        onClick={() => handleDeleteDocument(doc.id, doc.document_url)}
                                                        style={{ padding: '0.6rem 1rem' }}
                                                    >
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Upload Modal */}
            {showUploadModal && (
                <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Upload Document</h3>
                            <button className="modal-close" onClick={() => setShowUploadModal(false)}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>Select File</label>
                                <input
                                    type="file"
                                    onChange={handleFileChange}
                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png"
                                />
                                <small className="input-hint">
                                    Supported formats: PDF, Word, Excel, Images
                                </small>
                            </div>

                            {uploading && (
                                <div className="upload-progress">
                                    <div className="progress-bar">
                                        <div
                                            className="progress-fill"
                                            style={{ width: `${uploadProgress}%` }}
                                        ></div>
                                    </div>
                                    <p className="progress-text">{uploadProgress}% uploaded</p>
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn-outline"
                                onClick={() => setShowUploadModal(false)}
                                disabled={uploading}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn-primary"
                                onClick={handleUpload}
                                disabled={!uploadFile || uploading}
                            >
                                {uploading ? (
                                    <>
                                        <i className="fas fa-spinner fa-spin"></i>
                                        Uploading...
                                    </>
                                ) : (
                                    <>
                                        <i className="fas fa-cloud-upload-alt"></i>
                                        Upload
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <Footer />
        </div>
    );
};

export default ProjectDetailPage;