import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { departmentService } from '../services/departmentService';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';
import '../styles/DepartmentsPage.css';

const DepartmentsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingDepartment, setEditingDepartment] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        lga_id: null
    });

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        fetchDepartments();
    }, [user]);

    const fetchDepartments = async () => {
        setLoading(true);
        try {
            const { data, error } = await departmentService.getDepartments();
            if (error) throw error;
            setDepartments(data || []);
        } catch (error) {
            console.error('Error fetching departments:', error);
            alert('Error loading departments');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // 🔍 DEBUG: Log what we're submitting
        console.log('📤 SUBMITTING DEPARTMENT DATA:', formData);

        try {
            // Create a clean object with only the fields we need
            const departmentData = {
                name: formData.name.trim(),
                description: formData.description ? formData.description.trim() : '',
                lga_id: null  // Explicitly set to null
            };

            console.log('📤 CLEAN DATA TO INSERT:', departmentData);

            if (editingDepartment) {
                const { error } = await departmentService.updateDepartment(
                    editingDepartment.id,
                    departmentData
                );
                if (error) {
                    console.error('❌ Update error:', error);
                    throw error;
                }
                alert('Department updated successfully!');
            } else {
                const { data, error } = await departmentService.createDepartment(departmentData);
                if (error) {
                    console.error('❌ Create error:', error);
                    throw error;
                }
                console.log('✅ Department created:', data);
                alert('Department created successfully!');
            }
            setShowModal(false);
            setEditingDepartment(null);
            setFormData({ name: '', description: '', lga_id: null });
            fetchDepartments();
        } catch (error) {
            console.error('❌❌❌ Error saving department:', error);
            console.error('Error details:', error.message);
            console.error('Error code:', error.code);
            console.error('Full error object:', JSON.stringify(error, null, 2));
            alert(`Error saving department: ${error.message}`);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to deactivate this department?')) {
            try {
                const { error } = await departmentService.deleteDepartment(id);
                if (error) throw error;
                alert('Department deactivated successfully!');
                fetchDepartments();
            } catch (error) {
                console.error('Error deleting department:', error);
                alert('Error deleting department');
            }
        }
    };

    const openEditModal = (department) => {
        setEditingDepartment(department);
        setFormData({
            name: department.name,
            description: department.description || '',
            lga_id: department.lga_id || null
        });
        setShowModal(true);
    };

    const openCreateModal = () => {
        setEditingDepartment(null);
        setFormData({ name: '', description: '', lga_id: null });
        setShowModal(true);
    };

    return (
        <div className="departments-page">
            <div className="bg-pattern"></div>
            <div className="gradient-orb"></div>
            <div className="gradient-orb-2"></div>

            <Header />

            <main className="departments-main">
                <div className="container">
                    <div className="departments-header">
                        <div>
                            <h1 className="departments-title">
                                <i className="fas fa-building"></i>
                                Departments
                            </h1>
                            <p className="departments-subtitle">
                                Manage government departments and MDAs across Ekiti State
                            </p>
                        </div>
                        <button
                            className="btn-primary"
                            onClick={openCreateModal}
                        >
                            <i className="fas fa-plus-circle"></i>
                            New Department
                        </button>
                    </div>

                    {loading ? (
                        <div className="loading-state">
                            <i className="fas fa-spinner fa-spin"></i>
                            <p>Loading departments...</p>
                        </div>
                    ) : departments.length === 0 ? (
                        <div className="empty-state">
                            <i className="fas fa-building"></i>
                            <h3>No Departments Found</h3>
                            <p>Get started by creating your first department</p>
                            <button className="btn-primary" onClick={openCreateModal}>
                                <i className="fas fa-plus-circle"></i>
                                New Department
                            </button>
                        </div>
                    ) : (
                        <div className="departments-grid">
                            {departments.map(dept => (
                                <div key={dept.id} className="department-card">
                                    <div className="department-card-header">
                                        <h3>{dept.name}</h3>
                                        <span className={`status-badge ${dept.is_active !== false ? 'active' : 'inactive'}`}>
                                            {dept.is_active !== false ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                    {dept.description && (
                                        <p className="department-description">{dept.description}</p>
                                    )}
                                    <div className="department-card-actions">
                                        <button
                                            className="btn-icon edit"
                                            onClick={() => openEditModal(dept)}
                                            title="Edit"
                                        >
                                            <i className="fas fa-edit"></i>
                                        </button>
                                        <button
                                            className="btn-icon delete"
                                            onClick={() => handleDelete(dept.id)}
                                            title="Deactivate"
                                        >
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingDepartment ? 'Edit Department' : 'Create New Department'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Department Name *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                    placeholder="e.g., Works and Infrastructure"
                                />
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    rows="3"
                                    placeholder="Brief description of the department's responsibilities"
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-outline" onClick={() => setShowModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-primary">
                                    <i className={`fas ${editingDepartment ? 'fa-save' : 'fa-plus-circle'}`}></i>
                                    {editingDepartment ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <Footer />
        </div>
    );
};

export default DepartmentsPage;