import { supabase } from './supabase';

export const departmentService = {
    // Get all departments
    async getDepartments() {
        const { data, error } = await supabase
            .from('departments')
            .select('*')
            .order('name');
        return { data, error };
    },

    // Get single department
    async getDepartment(id) {
        const { data, error } = await supabase
            .from('departments')
            .select('*')
            .eq('id', id)
            .single();
        return { data, error };
    },

    // Create department
    async createDepartment(department) {
        // 🔍 DEBUG: Log what we're inserting
        console.log('📤 departmentService.createDepartment called with:', department);

        const { data, error } = await supabase
            .from('departments')
            .insert([department])
            .select();

        if (error) {
            console.error('❌ Supabase insert error:', error);
            console.error('Error details:', error.message, error.code, error.details);
        } else {
            console.log('✅ Supabase insert success:', data);
        }

        return { data, error };
    },

    // Update department
    async updateDepartment(id, updates) {
        console.log('📤 departmentService.updateDepartment called with:', { id, updates });

        const { data, error } = await supabase
            .from('departments')
            .update(updates)
            .eq('id', id)
            .select();

        if (error) {
            console.error('❌ Supabase update error:', error);
        } else {
            console.log('✅ Supabase update success:', data);
        }

        return { data, error };
    },

    // Soft delete department
    async deleteDepartment(id) {
        const { error } = await supabase
            .from('departments')
            .update({ is_active: false })
            .eq('id', id);
        return { error };
    },

    // Get departments by LGA
    async getDepartmentsByLGA(lgaId) {
        const { data, error } = await supabase
            .from('departments')
            .select('*')
            .eq('lga_id', lgaId)
            .order('name');
        return { data, error };
    }
};