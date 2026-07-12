import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import { logProjectAction } from '../services/auditService';
import { routeProjectForApproval, needsApproval } from '../services/approvalService';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';
import '../styles/ProjectFormPage.css';

const ProjectFormPage = () => {
    const { id } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();

    console.log('🔍 AUTH USER DETAILS:', {
        id: user?.id,
        email: user?.email,
        phone: user?.phone,
        user_metadata: user?.user_metadata,
        full_user: user
    });

    const [activeTab, setActiveTab] = useState(1);
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(false);
    const [lgas, setLgas] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [boqFile, setBoqFile] = useState(null);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        lga_id: '',
        department_id: '',
        budget_amount: '',
        contractor: '',
        start_date: '',
        end_date: '',
        ward: '',
        community: '',
        latitude: '',
        longitude: '',
        status: 'planning'
    });

    useEffect(() => {
        console.log('👤 Current user from useAuth:', user);
        console.log('🔑 User ID:', user?.id);
        fetchLgasAndDepartments();
        if (id) {
            fetchProject();
        }
    }, [id, user]);

    const fetchLgasAndDepartments = async () => {
        console.log('📋 Fetching LGAs and Departments...');

        const { data: lgaData, error: lgaError } = await supabase
            .from('profiles')
            .select('id, full_name, lga')
            .eq('role', 'chairman');

        if (lgaError) console.error('❌ Error fetching LGAs:', lgaError);
        setLgas(lgaData || []);
        console.log('✅ LGAs loaded:', lgaData?.length);

        const { data: deptData, error: deptError } = await supabase
            .from('departments')
            .select('id, name')
            .order('name');

        if (deptError) console.error('❌ Error fetching departments:', deptError);
        setDepartments(deptData || []);
        console.log('✅ Departments loaded:', deptData?.length);
    };

    const fetchProject = useCallback(async () => {
        setFetching(true);
        try {
            console.log('📋 Fetching project with ID:', id);

            const { data, error } = await supabase
                .from('projects')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;

            console.log('✅ Project loaded:', data);

            if (data) {
                setFormData({
                    title: data.title || '',
                    description: data.description || '',
                    lga_id: data.lga_id || '',
                    department_id: data.department_id || '',
                    budget_amount: data.budget_amount || '',
                    contractor: data.contractor || '',
                    start_date: data.start_date || '',
                    end_date: data.end_date || '',
                    ward: data.ward || '',
                    community: data.community || '',
                    latitude: data.latitude || '',
                    longitude: data.longitude || '',
                    status: data.status || 'planning'
                });
            }
        } catch (error) {
            console.error('❌ Error fetching project:', error);
        } finally {
            setFetching(false);
        }
    }, [id]);

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleFileChange = (e) => {
        setBoqFile(e.target.files[0]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            console.log('👤 USER VERIFICATION:', {
                userExists: !!user,
                userId: user?.id,
                userEmail: user?.email,
                userMetadata: user?.user_metadata
            });

            if (!user?.id) {
                throw new Error('No authenticated user found! Please log in again.');
            }

            const projectData = {
                title: formData.title || '',
                description: formData.description || '',
                lga_id: formData.lga_id || null,
                department_id: formData.department_id || null,
                budget_amount: formData.budget_amount ? parseFloat(formData.budget_amount) : 0,
                contractor: formData.contractor || null,
                start_date: formData.start_date || null,
                end_date: formData.end_date || null,
                ward: formData.ward || null,
                community: formData.community || null,
                latitude: formData.latitude ? parseFloat(formData.latitude) : null,
                longitude: formData.longitude ? parseFloat(formData.longitude) : null,
                status: formData.status || 'planning',
                updated_at: new Date().toISOString()
            };

            console.log('📤 PROJECT DATA TO SUBMIT:', {
                projectData,
                isEdit: !!id,
                userId: user.id
            });

            let projectId = id;

            if (id) {
                console.log('🔄 UPDATING project ID:', id);

                // Get old data for audit log
                const { data: oldData } = await supabase
                    .from('projects')
                    .select('*')
                    .eq('id', id)
                    .single();

                const { data, error } = await supabase
                    .from('projects')
                    .update(projectData)
                    .eq('id', id)
                    .select();

                console.log('📥 UPDATE RESPONSE:', { data, error });

                if (error) throw error;

                // Log the update
                await logProjectAction(
                    user.id,
                    'UPDATE',
                    id,
                    oldData,
                    projectData
                );
                console.log('✅ Audit log created for project update');

                // Check if budget changed - route for re-approval
                if (oldData && oldData.budget_amount !== projectData.budget_amount) {
                    const { needsApproval: needsApprovalResult, error: approvalCheckError } = await needsApproval(projectData.budget_amount || 0);
                    if (!approvalCheckError && needsApprovalResult) {
                        const { data: routeData, error: routeError } = await routeProjectForApproval(
                            id,
                            projectData.budget_amount || 0
                        );
                        if (routeError) {
                            console.error('Error routing project for approval:', routeError);
                        } else {
                            console.log('✅ Project re-routed for approval due to budget change:', routeData);
                            alert('Project updated! Budget change requires re-approval.');
                        }
                    }
                }

                alert('Project updated successfully!');
            } else {
                const insertData = {
                    ...projectData,
                    created_by: user.id,
                    created_at: new Date().toISOString()
                };

                console.log('➕ INSERTING new project:', insertData);

                const { data, error } = await supabase
                    .from('projects')
                    .insert([insertData])
                    .select()
                    .single();

                console.log('📥 INSERT RESPONSE:', { data, error });

                if (error) throw error;
                projectId = data.id;

                // Log the creation
                await logProjectAction(
                    user.id,
                    'CREATE',
                    projectId,
                    null,
                    insertData
                );
                console.log('✅ Audit log created for project creation');

                // ✅ ROUTE FOR APPROVAL AUTOMATICALLY
                const { needsApproval: needsApprovalResult, error: approvalCheckError } = await needsApproval(projectData.budget_amount || 0);
                if (!approvalCheckError && needsApprovalResult) {
                    const { data: routeData, error: routeError } = await routeProjectForApproval(
                        projectId,
                        projectData.budget_amount || 0
                    );
                    if (routeError) {
                        console.error('Error routing project for approval:', routeError);
                        alert('Project created but approval routing failed. Please check console.');
                    } else {
                        console.log('✅ Project routed for approval:', routeData);
                        alert('Project created! Waiting for approval.');
                    }
                } else {
                    // No approval needed
                    await supabase
                        .from('projects')
                        .update({ status: 'approved' })
                        .eq('id', projectId);
                    alert('Project created successfully!');
                }
            }

            if (boqFile && projectId) {
                console.log('📎 Uploading BOQ file:', boqFile.name);

                const fileExt = boqFile.name.split('.').pop();
                const fileName = `projects/${projectId}/boq_${Date.now()}.${fileExt}`;

                const { error: uploadError } = await supabase.storage
                    .from('EkitiGov360-documents')
                    .upload(fileName, boqFile);

                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage
                    .from('EkitiGov360-documents')
                    .getPublicUrl(fileName);

                const { error: docError } = await supabase
                    .from('project_documents')
                    .insert([{
                        project_id: projectId,
                        document_name: boqFile.name,
                        document_url: urlData.publicUrl,
                        document_type: 'BOQ',
                        uploaded_by: user.id,
                        created_at: new Date().toISOString()
                    }]);

                if (docError) throw docError;

                console.log('✅ BOQ uploaded and linked to project successfully');
            }

            navigate('/projects');
        } catch (error) {
            console.error('❌❌❌ ERROR SAVING PROJECT - FULL DETAILS ❌❌❌');
            console.error('Error name:', error.name);
            console.error('Error message:', error.message);
            console.error('Error code:', error.code);
            console.error('Error details:', error.details);
            console.error('Error hint:', error.hint);
            console.error('Error stack:', error.stack);

            console.error('Complete error object:', error);

            try {
                console.error('Stringified error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
            } catch (e) {
                console.error('Could not stringify error');
            }

            console.log('🔍 Checking Supabase connection...');
            const { data: testData, error: testError } = await supabase
                .from('projects')
                .select('count', { count: 'exact', head: true });

            console.log('Supabase test query:', { testData, testError });

            alert(`❌ Error saving project:\n\nMessage: ${error.message}\n\nCode: ${error.code || 'N/A'}\n\nDetails: ${error.details || 'N/A'}\n\nCheck console for more details.`);
        } finally {
            setLoading(false);
        }
    };

    const nextTab = () => {
        if (activeTab < 5) setActiveTab(activeTab + 1);
    };

    const prevTab = () => {
        if (activeTab > 1) setActiveTab(activeTab - 1);
    };

    if (fetching) {
        return (
            <div className="form-page">
                <Header />
                <div className="loading-state">
                    <i className="fas fa-spinner fa-spin"></i>
                    <p>Loading project...</p>
                </div>
                <Footer />
            </div>
        );
    }

    return (
        <div className="form-page">
            <div className="bg-pattern"></div>
            <div className="gradient-orb"></div>
            <div className="gradient-orb-2"></div>

            <Header />

            <main className="form-main">
                <div className="container">
                    <div className="form-card">
                        <div className="form-header">
                            <h1 className="form-title">
                                <i className={`fas ${id ? 'fa-edit' : 'fa-plus-circle'}`}></i>
                                {id ? 'Edit Project' : 'Create New Project'}
                            </h1>
                            <p className="form-subtitle">
                                {id ? 'Update project information' : 'Enter the details of the new government project'}
                            </p>
                        </div>

                        <div className="form-tabs">
                            <button
                                className={`tab-btn ${activeTab === 1 ? 'active' : ''}`}
                                onClick={() => setActiveTab(1)}
                            >
                                <i className="fas fa-info-circle"></i> Basic Info
                            </button>
                            <button
                                className={`tab-btn ${activeTab === 2 ? 'active' : ''}`}
                                onClick={() => setActiveTab(2)}
                            >
                                <i className="fas fa-coins"></i> Budget
                            </button>
                            <button
                                className={`tab-btn ${activeTab === 3 ? 'active' : ''}`}
                                onClick={() => setActiveTab(3)}
                            >
                                <i className="fas fa-map-marker-alt"></i> Location
                            </button>
                            <button
                                className={`tab-btn ${activeTab === 4 ? 'active' : ''}`}
                                onClick={() => setActiveTab(4)}
                            >
                                <i className="fas fa-file-pdf"></i> Documents
                            </button>
                            {id && (
                                <button
                                    className={`tab-btn ${activeTab === 5 ? 'active' : ''}`}
                                    onClick={() => setActiveTab(5)}
                                >
                                    <i className="fas fa-tasks"></i> Status
                                </button>
                            )}
                        </div>

                        <form onSubmit={handleSubmit}>
                            {activeTab === 1 && (
                                <div className="tab-content">
                                    <h3 className="section-title">Basic Information</h3>

                                    <div className="form-group">
                                        <label>Project Title *</label>
                                        <input
                                            type="text"
                                            name="title"
                                            value={formData.title}
                                            onChange={handleChange}
                                            required
                                            placeholder="e.g., Construction of Primary Healthcare Center"
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Description *</label>
                                        <textarea
                                            name="description"
                                            value={formData.description}
                                            onChange={handleChange}
                                            required
                                            rows="4"
                                            placeholder="Detailed description of the project..."
                                        />
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>LGA</label>
                                            <select
                                                name="lga_id"
                                                value={formData.lga_id}
                                                onChange={handleChange}
                                            >
                                                <option value="">Select LGA (Optional)</option>
                                                {lgas.map(lga => (
                                                    <option key={lga.id} value={lga.id}>
                                                        {lga.lga || lga.full_name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="form-group">
                                            <label>Department</label>
                                            <select
                                                name="department_id"
                                                value={formData.department_id}
                                                onChange={handleChange}
                                            >
                                                <option value="">Select Department (Optional)</option>
                                                {departments.map(dept => (
                                                    <option key={dept.id} value={dept.id}>
                                                        {dept.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 2 && (
                                <div className="tab-content">
                                    <h3 className="section-title">Budget & Contractor</h3>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Budget Amount (₦)</label>
                                            <input
                                                type="number"
                                                name="budget_amount"
                                                value={formData.budget_amount}
                                                onChange={handleChange}
                                                placeholder="e.g., 50000000"
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label>Contractor</label>
                                            <input
                                                type="text"
                                                name="contractor"
                                                value={formData.contractor}
                                                onChange={handleChange}
                                                placeholder="e.g., XYZ Construction Ltd"
                                            />
                                        </div>
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Start Date</label>
                                            <input
                                                type="date"
                                                name="start_date"
                                                value={formData.start_date}
                                                onChange={handleChange}
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label>End Date</label>
                                            <input
                                                type="date"
                                                name="end_date"
                                                value={formData.end_date}
                                                onChange={handleChange}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 3 && (
                                <div className="tab-content">
                                    <h3 className="section-title">Location Details</h3>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Ward</label>
                                            <input
                                                type="text"
                                                name="ward"
                                                value={formData.ward}
                                                onChange={handleChange}
                                                placeholder="e.g., Ward 4"
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label>Community</label>
                                            <input
                                                type="text"
                                                name="community"
                                                value={formData.community}
                                                onChange={handleChange}
                                                placeholder="e.g., Oke-Ila"
                                            />
                                        </div>
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Latitude</label>
                                            <input
                                                type="number"
                                                step="0.00000001"
                                                name="latitude"
                                                value={formData.latitude}
                                                onChange={handleChange}
                                                placeholder="e.g., 7.62023"
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label>Longitude</label>
                                            <input
                                                type="number"
                                                step="0.00000001"
                                                name="longitude"
                                                value={formData.longitude}
                                                onChange={handleChange}
                                                placeholder="e.g., 5.22134"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 4 && (
                                <div className="tab-content">
                                    <h3 className="section-title">Documents</h3>

                                    <div className="form-group">
                                        <label>Bill of Quantities (BOQ) PDF</label>
                                        <input
                                            type="file"
                                            accept=".pdf"
                                            onChange={handleFileChange}
                                        />
                                        <small className="input-hint">
                                            Upload the detailed BOQ document (PDF only, max 10MB) - Optional
                                        </small>
                                    </div>
                                </div>
                            )}

                            {activeTab === 5 && id && (
                                <div className="tab-content">
                                    <h3 className="section-title">Project Status</h3>
                                    <div className="form-group">
                                        <label>Current Status</label>
                                        <select
                                            name="status"
                                            value={formData.status}
                                            onChange={handleChange}
                                        >
                                            <option value="planning">Planning</option>
                                            <option value="pending_approval">Pending Approval</option>
                                            <option value="approved">Approved</option>
                                            <option value="ongoing">Ongoing</option>
                                            <option value="stalled">Stalled</option>
                                            <option value="completed">Completed</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            <div className="tab-navigation">
                                <div>
                                    {activeTab > 1 && (
                                        <button
                                            type="button"
                                            className="btn-outline"
                                            onClick={prevTab}
                                        >
                                            <i className="fas fa-arrow-left"></i> Previous
                                        </button>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <button
                                        type="button"
                                        className="btn-outline"
                                        onClick={() => navigate('/projects')}
                                    >
                                        Cancel
                                    </button>
                                    {activeTab < (id ? 5 : 4) ? (
                                        <button
                                            type="button"
                                            className="btn-primary"
                                            onClick={nextTab}
                                        >
                                            Next <i className="fas fa-arrow-right"></i>
                                        </button>
                                    ) : (
                                        <button
                                            type="submit"
                                            className="btn-primary"
                                            disabled={loading}
                                        >
                                            {loading ? (
                                                <>
                                                    <i className="fas fa-spinner fa-spin"></i>
                                                    {id ? 'Updating...' : 'Creating...'}
                                                </>
                                            ) : (
                                                <>
                                                    <i className={`fas ${id ? 'fa-save' : 'fa-check-circle'}`}></i>
                                                    {id ? 'Update Project' : 'Create Project'}
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default ProjectFormPage;