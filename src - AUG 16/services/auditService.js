import { supabase } from './supabase';

export const auditService = {
    // Log an action
    async logAction({
        userId,
        actionType,
        tableName,
        recordId,
        fieldName = null,
        oldValue = null,
        newValue = null,
        metadata = null
    }) {
        try {
            const { data, error } = await supabase
                .from('audit_logs')
                .insert([{
                    user_id: userId,
                    action_type: actionType,
                    table_name: tableName,
                    record_id: recordId,
                    field_name: fieldName,
                    old_value: oldValue,
                    new_value: newValue,
                    metadata: metadata,
                    created_at: new Date().toISOString()
                }])
                .select();

            if (error) {
                console.error('❌ Error logging audit action:', error);
                return { error };
            }

            console.log('✅ Audit log created:', data);
            return { data };
        } catch (error) {
            console.error('❌ Audit service error:', error);
            return { error };
        }
    },

    // Get all audit logs with user info
    async getAuditLogs() {
        const { data, error } = await supabase
            .from('audit_logs')
            .select(`
        *,
        user:user_id(full_name, role, lga)
      `)
            .order('created_at', { ascending: false })
            .limit(100);

        return { data, error };
    },

    // Get audit logs for a specific record
    async getAuditLogsForRecord(recordId) {
        const { data, error } = await supabase
            .from('audit_logs')
            .select(`
        *,
        user:user_id(full_name, role, lga)
      `)
            .eq('record_id', recordId)
            .order('created_at', { ascending: false });

        return { data, error };
    },

    // Get audit logs by table
    async getAuditLogsByTable(tableName) {
        const { data, error } = await supabase
            .from('audit_logs')
            .select(`
        *,
        user:user_id(full_name, role, lga)
      `)
            .eq('table_name', tableName)
            .order('created_at', { ascending: false })
            .limit(50);

        return { data, error };
    },

    // Get recent audit logs (for dashboard)
    async getRecentAuditLogs(limit = 10) {
        const { data, error } = await supabase
            .from('audit_logs')
            .select(`
        *,
        user:user_id(full_name, role, lga)
      `)
            .order('created_at', { ascending: false })
            .limit(limit);

        return { data, error };
    },

    // Get audit logs with filters
    async getFilteredAuditLogs({
        actionType = null,
        tableName = null,
        userId = null,
        startDate = null,
        endDate = null
    }) {
        let query = supabase
            .from('audit_logs')
            .select(`
        *,
        user:user_id(full_name, role, lga)
      `)
            .order('created_at', { ascending: false });

        if (actionType) query = query.eq('action_type', actionType);
        if (tableName) query = query.eq('table_name', tableName);
        if (userId) query = query.eq('user_id', userId);
        if (startDate) query = query.gte('created_at', startDate);
        if (endDate) query = query.lte('created_at', endDate);

        const { data, error } = await query.limit(200);
        return { data, error };
    }
};

// Helper function to log project actions
export const logProjectAction = async (userId, actionType, projectId, oldData = null, newData = null) => {
    return await auditService.logAction({
        userId,
        actionType,
        tableName: 'projects',
        recordId: projectId,
        oldValue: oldData ? JSON.stringify(oldData) : null,
        newValue: newData ? JSON.stringify(newData) : null,
        metadata: {
            action: actionType,
            timestamp: new Date().toISOString()
        }
    });
};

// Helper function to log department actions
export const logDepartmentAction = async (userId, actionType, departmentId, oldData = null, newData = null) => {
    return await auditService.logAction({
        userId,
        actionType,
        tableName: 'departments',
        recordId: departmentId,
        oldValue: oldData ? JSON.stringify(oldData) : null,
        newValue: newData ? JSON.stringify(newData) : null,
        metadata: {
            action: actionType,
            timestamp: new Date().toISOString()
        }
    });
};