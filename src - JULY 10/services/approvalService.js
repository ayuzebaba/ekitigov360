import { supabase } from './supabase';
import { auditService } from './auditService';

// Get approval levels
export const getApprovalLevels = async () => {
    const { data, error } = await supabase
        .from('approval_levels')
        .select('*')
        .order('level_order');
    return { data, error };
};

// Get approval thresholds
export const getApprovalThresholds = async () => {
    const { data, error } = await supabase
        .from('approval_thresholds')
        .select('*, approval_levels(*)')
        .order('min_amount');
    return { data, error };
};

// Get required approval level based on budget
export const getRequiredApprovalLevel = async (budgetAmount) => {
    const { data, error } = await supabase
        .from('approval_thresholds')
        .select('*, approval_levels(*)')
        .gte('max_amount', budgetAmount)
        .or(`max_amount.is.null`)
        .order('min_amount', { ascending: true })
        .limit(1);

    if (error) return { error };
    return { data: data?.[0] || null };
};

// Get project approvals
export const getProjectApprovals = async (projectId) => {
    const { data, error } = await supabase
        .from('project_approvals')
        .select(`
            *,
            approval_level:approval_levels(*),
            approver:approver_id(full_name, role, lga)
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });
    return { data, error };
};

// Get pending approvals for current user
export const getPendingApprovals = async () => {
    const { data, error } = await supabase
        .from('project_approvals')
        .select(`
            *,
            project:project_id(*),
            approval_level:approval_levels(*),
            approver:approver_id(full_name, role, lga)
        `)
        .eq('approver_id', supabase.auth.user()?.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
    return { data, error };
};

// Get all pending approvals (for admin/chairman)
export const getAllPendingApprovals = async () => {
    const { data, error } = await supabase
        .from('project_approvals')
        .select(`
            *,
            project:project_id(*),
            approval_level:approval_levels(*),
            approver:approver_id(full_name, role, lga)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
    return { data, error };
};

// Create approval record
export const createProjectApproval = async (projectId, approvalLevelId, approverId) => {
    const { data, error } = await supabase
        .from('project_approvals')
        .insert([{
            project_id: projectId,
            approval_level_id: approvalLevelId,
            approver_id: approverId,
            status: 'pending'
        }])
        .select()
        .single();
    return { data, error };
};

// ✅ FIXED: Approve a project
export const approveProject = async (approvalId, comments = '') => {
    try {
        // 1. Get the approval record first to get project_id
        const { data: approvalData, error: fetchError } = await supabase
            .from('project_approvals')
            .select('project_id')
            .eq('id', approvalId)
            .single();

        if (fetchError) throw fetchError;

        // 2. Update approval status
        const { data, error } = await supabase
            .from('project_approvals')
            .update({
                status: 'approved',
                comments: comments,
                approved_at: new Date().toISOString()
            })
            .eq('id', approvalId)
            .select()
            .single();

        if (error) throw error;

        // 3. Update project status to 'approved'
        const { error: projectError } = await supabase
            .from('projects')
            .update({ status: 'approved' })
            .eq('id', approvalData.project_id);

        if (projectError) throw projectError;

        // 4. Log to audit trail
        await auditService.logAction({
            userId: supabase.auth.user()?.id,
            actionType: 'APPROVE',
            tableName: 'project_approvals',
            recordId: approvalId,
            newValue: JSON.stringify(data),
            metadata: { action: 'APPROVE', comments, project_id: approvalData.project_id }
        });

        return { data, error: null };
    } catch (error) {
        console.error('Error approving project:', error);
        return { data: null, error };
    }
};

// ✅ FIXED: Reject a project
export const rejectProject = async (approvalId, comments = '') => {
    try {
        // 1. Get the approval record first to get project_id
        const { data: approvalData, error: fetchError } = await supabase
            .from('project_approvals')
            .select('project_id')
            .eq('id', approvalId)
            .single();

        if (fetchError) throw fetchError;

        // 2. Update approval status
        const { data, error } = await supabase
            .from('project_approvals')
            .update({
                status: 'rejected',
                comments: comments,
                approved_at: new Date().toISOString()
            })
            .eq('id', approvalId)
            .select()
            .single();

        if (error) throw error;

        // 3. Update project status to 'rejected'
        const { error: projectError } = await supabase
            .from('projects')
            .update({ status: 'rejected' })
            .eq('id', approvalData.project_id);

        if (projectError) throw projectError;

        // 4. Log to audit trail
        await auditService.logAction({
            userId: supabase.auth.user()?.id,
            actionType: 'REJECT',
            tableName: 'project_approvals',
            recordId: approvalId,
            newValue: JSON.stringify(data),
            metadata: { action: 'REJECT', comments, project_id: approvalData.project_id }
        });

        return { data, error: null };
    } catch (error) {
        console.error('Error rejecting project:', error);
        return { data: null, error };
    }
};

// ✅ FIXED: Escalate a project
export const escalateProject = async (approvalId, comments = '') => {
    try {
        // 1. Get the approval record first to get project_id
        const { data: approvalData, error: fetchError } = await supabase
            .from('project_approvals')
            .select('project_id')
            .eq('id', approvalId)
            .single();

        if (fetchError) throw fetchError;

        // 2. Update approval status
        const { data, error } = await supabase
            .from('project_approvals')
            .update({
                status: 'escalated',
                comments: comments,
                approved_at: new Date().toISOString()
            })
            .eq('id', approvalId)
            .select()
            .single();

        if (error) throw error;

        // 3. Update project status to 'escalated'
        const { error: projectError } = await supabase
            .from('projects')
            .update({ status: 'escalated' })
            .eq('id', approvalData.project_id);

        if (projectError) throw projectError;

        // 4. Log to audit trail
        await auditService.logAction({
            userId: supabase.auth.user()?.id,
            actionType: 'ESCALATE',
            tableName: 'project_approvals',
            recordId: approvalId,
            newValue: JSON.stringify(data),
            metadata: { action: 'ESCALATE', comments, project_id: approvalData.project_id }
        });

        return { data, error: null };
    } catch (error) {
        console.error('Error escalating project:', error);
        return { data: null, error };
    }
};

// Route project through approval workflow
export const routeProjectForApproval = async (projectId, budgetAmount) => {
    try {
        // 1. Get required approval level
        const { data: levelData, error: levelError } = await getRequiredApprovalLevel(budgetAmount);
        if (levelError) throw levelError;
        if (!levelData) {
            throw new Error('No approval level found for budget amount');
        }

        const approvalLevelId = levelData.approval_level_id;

        // 2. Get all users with that approval level
        const { data: approvers, error: approverError } = await supabase
            .from('profiles')
            .select('id, full_name, role')
            .eq('role', getRoleForLevel(levelData.approval_levels.name));

        if (approverError) throw approverError;
        if (!approvers || approvers.length === 0) {
            throw new Error(`No approver found for level: ${levelData.approval_levels.name}`);
        }

        // 3. Create approval record for each approver (or just the first one)
        const approver = approvers[0];
        const { data: approval, error: approvalError } = await createProjectApproval(
            projectId,
            approvalLevelId,
            approver.id
        );

        if (approvalError) throw approvalError;

        // 4. Update project status to 'pending_approval'
        await supabase
            .from('projects')
            .update({ status: 'pending_approval' })
            .eq('id', projectId);

        // 5. Log to audit
        await auditService.logAction({
            userId: supabase.auth.user()?.id,
            actionType: 'ROUTE_APPROVAL',
            tableName: 'projects',
            recordId: projectId,
            newValue: JSON.stringify({ approvalLevel: levelData.approval_levels.name, approver: approver.id }),
            metadata: { action: 'ROUTE_APPROVAL', budgetAmount, approvalLevel: levelData.approval_levels.name }
        });

        return { data: approval, level: levelData.approval_levels };
    } catch (error) {
        console.error('Error routing project for approval:', error);
        return { error };
    }
};

// Helper: Map approval level name to profile role
const getRoleForLevel = (levelName) => {
    const roleMap = {
        'HOD': 'hod',
        'Director': 'director',
        'Chairman': 'chairman',
        'State': 'commissioner'
    };
    return roleMap[levelName] || 'official';
};

// Check if project needs approval
export const needsApproval = async (budgetAmount) => {
    const { data, error } = await getRequiredApprovalLevel(budgetAmount);
    if (error) return { error };
    return { needsApproval: !!data };
};

// Get approval status for a project
export const getApprovalStatus = async (projectId) => {
    const { data, error } = await getProjectApprovals(projectId);
    if (error) return { error };

    if (!data || data.length === 0) {
        return { status: 'none' };
    }

    // Check if any are rejected
    if (data.some(a => a.status === 'rejected')) {
        return { status: 'rejected', data };
    }

    // Check if any are pending
    if (data.some(a => a.status === 'pending')) {
        return { status: 'pending', data };
    }

    // Check if any are escalated
    if (data.some(a => a.status === 'escalated')) {
        return { status: 'escalated', data };
    }

    // All are approved
    if (data.every(a => a.status === 'approved')) {
        return { status: 'approved', data };
    }

    return { status: 'unknown', data };
};