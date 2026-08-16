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
        .or(`max_amount.gte.${budgetAmount},max_amount.is.null`)
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
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
        .from('project_approvals')
        .select(`
            *,
            project:project_id(*),
            approval_level:approval_levels(*),
            approver:approver_id(full_name, role, lga)
        `)
        .eq('approver_id', user?.id)
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

// Roles authorized to approve/reject/escalate. Matches the organogram
// design (citizen/department_staff can never appear here).
const APPROVAL_ROLES = ['lg_legislative', 'executive_chairman', 'mda_oversight', 'governor'];
// Escalation only makes sense below the top of the chain.
const ESCALATION_ROLES = ['lg_legislative', 'executive_chairman', 'mda_oversight'];

// The full possible approval sequence, in order. A project's actual
// chain is a prefix of this list, determined by its budget (see
// computeApprovalChain below). "HOD" is deliberately excluded from
// every computed chain -- that tier is unrelated to this feature and
// left exactly as it was before.
const LEVEL_ORDER = ['Director', 'Chairman', 'State'];

// Determines the full sequence of approval_levels.name values a project
// must pass through, based on budget. This is the actual fix for the
// "LG Legislative reviews before Chairman" requirement: previously, a
// project needing Chairman-level approval was routed straight to the
// Chairman, skipping LG Legislative (Director) entirely. Now, any
// project whose final required level is Chairman or State always
// passes through Director first.
// Returns null if the project's budget doesn't require this chain at
// all (falls in the lowest/HOD tier -- unchanged, out of scope here).
const computeApprovalChain = async (budgetAmount) => {
    const { data: levelData, error } = await getRequiredApprovalLevel(budgetAmount);
    if (error || !levelData) return null;

    const finalLevelName = levelData.approval_levels.name;
    const finalIndex = LEVEL_ORDER.indexOf(finalLevelName);

    if (finalIndex === -1) {
        // Final level is "HOD" (or unrecognized) -- not part of this
        // chain feature, leave existing behavior alone.
        return null;
    }

    return LEVEL_ORDER.slice(0, finalIndex + 1);
};

// Shared guard: confirms the current user (a) is logged in, (b) holds an
// authorized role from ekiti_users, and (c) is not the creator of the
// project tied to this approval record. Also returns the project's
// budget and the current approval stage's level name, both needed to
// advance the chain to its next stage on approval.
const authorizeApprovalAction = async (approvalId, requiredRoles) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
        throw new Error('Not logged in.');
    }

    const { data: profile, error: profileError } = await supabase
        .from('ekiti_users')
        .select('id, role')
        .eq('phone', `+${authUser.phone}`)
        .single();

    if (profileError || !profile) {
        throw new Error('Could not verify your role. Please log in again.');
    }

    // First check: is this role in the approval-authorized set at all
    // (rules out citizen/department_staff immediately).
    if (!requiredRoles.includes(profile.role)) {
        throw new Error('You do not have permission to perform this action.');
    }

    const { data: approvalData, error: fetchError } = await supabase
        .from('project_approvals')
        .select(`
            project_id,
            project:project_id(created_by, budget_amount),
            approval_level:approval_level_id(name)
        `)
        .eq('id', approvalId)
        .single();

    if (fetchError) throw fetchError;

    // FIXED: this is the real bug behind "a project above someone's
    // approval level should require a higher authority, but this
    // wasn't actually enforced." The check above only confirmed the
    // approver holds SOME approval-authorized role -- it never checked
    // that their role matches the SPECIFIC stage this approval row is
    // for. That meant, e.g., an lg_legislative account could directly
    // approve a Chairman- or State-tier approval row, completely
    // bypassing the sequential chain. This second check closes that gap.
    const stageLevelName = approvalData?.approval_level?.name;
    if (stageLevelName) {
        const requiredRoleForStage = getRoleForLevel(stageLevelName);
        if (profile.role !== requiredRoleForStage) {
            throw new Error(
                `This approval requires the "${requiredRoleForStage}" role for the "${stageLevelName}" stage. Your role ("${profile.role}") does not match.`
            );
        }
    }

    if (approvalData?.project?.created_by === authUser.id) {
        throw new Error('You cannot approve or reject a project you submitted yourself.');
    }

    return {
        authUserId: authUser.id,
        projectId: approvalData.project_id,
        budgetAmount: approvalData.project?.budget_amount ?? 0,
        currentLevelName: approvalData.approval_level?.name ?? null,
    };
};

// Approve a project — role-gated, self-approval-blocked, and now
// sequential-chain-aware: if the current stage is not the final stage
// in the computed chain (e.g. Director approving before Chairman), this
// advances the project to the next stage instead of finalizing it.
export const approveProject = async (approvalId, comments = '') => {
    try {
        const { authUserId, projectId, budgetAmount, currentLevelName } =
            await authorizeApprovalAction(approvalId, APPROVAL_ROLES);

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

        const chain = await computeApprovalChain(budgetAmount);
        const currentIndex = chain ? chain.indexOf(currentLevelName) : -1;
        const nextLevelName = chain && currentIndex !== -1 ? chain[currentIndex + 1] : undefined;

        if (nextLevelName) {
            // Not the final stage -- advance to the next one in the
            // chain rather than finalizing the project.
            const { error: advanceError } = await advanceToNextStage(projectId, nextLevelName, authUserId);
            if (advanceError) throw advanceError;
        } else {
            // Final stage (or no chain applies) -- finalize as before.
            const { error: projectError } = await supabase
                .from('projects')
                .update({ status: 'approved' })
                .eq('id', projectId);

            if (projectError) throw projectError;
        }

        await auditService.logAction({
            userId: authUserId,
            actionType: 'APPROVE',
            tableName: 'project_approvals',
            recordId: approvalId,
            newValue: JSON.stringify(data),
            metadata: { action: 'APPROVE', comments, project_id: projectId, currentLevelName, nextLevelName: nextLevelName || null }
        });

        return { data, error: null };
    } catch (error) {
        console.error('Error approving project:', error);
        return { data: null, error };
    }
};

// Creates the next stage's project_approvals record and finds an
// approver for it, keeping the project at 'pending_approval' rather
// than finalizing it. Shared by approveProject and routeProjectForApproval.
const advanceToNextStage = async (projectId, levelName, actingUserId) => {
    try {
        const { data: levelRow, error: levelError } = await supabase
            .from('approval_levels')
            .select('id')
            .eq('name', levelName)
            .single();

        if (levelError || !levelRow) {
            throw new Error(`Could not find approval level: ${levelName}`);
        }

        const requiredRole = getRoleForLevel(levelName);

        const { data: approverAuthId, error: authLookupError } = await supabase
            .rpc('get_approver_auth_id', { required_role: requiredRole });

        if (authLookupError) throw authLookupError;
        if (!approverAuthId) {
            throw new Error(`No approver found with role: ${requiredRole}. Assign someone this role in ekiti_users first, and make sure they have logged in at least once.`);
        }

        const { error: approvalError } = await createProjectApproval(
            projectId,
            levelRow.id,
            approverAuthId
        );

        if (approvalError) throw approvalError;

        // Project stays 'pending_approval' -- no status change needed,
        // it was already in that state from the previous stage.

        await auditService.logAction({
            userId: actingUserId,
            actionType: 'ADVANCE_APPROVAL_STAGE',
            tableName: 'projects',
            recordId: projectId,
            newValue: JSON.stringify({ nextLevel: levelName, approver: approverAuthId }),
            metadata: { action: 'ADVANCE_APPROVAL_STAGE', nextLevel: levelName }
        });

        return { error: null };
    } catch (error) {
        console.error('Error advancing to next approval stage:', error);
        return { error };
    }
};

// Reject a project — role-gated and self-approval-blocked
export const rejectProject = async (approvalId, comments = '') => {
    try {
        const { authUserId, projectId } = await authorizeApprovalAction(approvalId, APPROVAL_ROLES);

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

        const { error: projectError } = await supabase
            .from('projects')
            .update({ status: 'rejected' })
            .eq('id', projectId);

        if (projectError) throw projectError;

        await auditService.logAction({
            userId: authUserId,
            actionType: 'REJECT',
            tableName: 'project_approvals',
            recordId: approvalId,
            newValue: JSON.stringify(data),
            metadata: { action: 'REJECT', comments, project_id: projectId }
        });

        return { data, error: null };
    } catch (error) {
        console.error('Error rejecting project:', error);
        return { data: null, error };
    }
};

// Escalate a project — role-gated and self-approval-blocked
export const escalateProject = async (approvalId, comments = '') => {
    try {
        const { authUserId, projectId } = await authorizeApprovalAction(approvalId, ESCALATION_ROLES);

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

        const { error: projectError } = await supabase
            .from('projects')
            .update({ status: 'escalated' })
            .eq('id', projectId);

        if (projectError) throw projectError;

        await auditService.logAction({
            userId: authUserId,
            actionType: 'ESCALATE',
            tableName: 'project_approvals',
            recordId: approvalId,
            newValue: JSON.stringify(data),
            metadata: { action: 'ESCALATE', comments, project_id: projectId }
        });

        return { data, error: null };
    } catch (error) {
        console.error('Error escalating project:', error);
        return { data: null, error };
    }
};

// Route project through approval workflow.
// FIXED (this pass): previously routed directly to the single level a
// project's budget required (e.g. straight to Chairman), skipping any
// lower stages. Now routes to the FIRST stage of the computed chain
// (see computeApprovalChain above) — for any project requiring Chairman
// or State-level approval, that means LG Legislative (Director) always
// reviews first, matching the "checks and balances" step described in
// the original source document. Falls back to the old single-level
// behavior for the HOD tier, which this feature doesn't touch.
export const routeProjectForApproval = async (projectId, budgetAmount) => {
    try {
        const chain = await computeApprovalChain(budgetAmount);

        let levelName;
        let approvalLevelId;

        if (chain) {
            // Chain applies (Chairman or State tier) -- start at the
            // first stage, which is always Director (LG Legislative).
            levelName = chain[0];
            const { data: levelRow, error: levelRowError } = await supabase
                .from('approval_levels')
                .select('id')
                .eq('name', levelName)
                .single();
            if (levelRowError || !levelRow) {
                throw new Error(`Could not find approval level: ${levelName}`);
            }
            approvalLevelId = levelRow.id;
        } else {
            // No chain (HOD tier or unrecognized level) -- unchanged
            // original single-level behavior.
            const { data: levelData, error: levelError } = await getRequiredApprovalLevel(budgetAmount);
            if (levelError) throw levelError;
            if (!levelData) {
                throw new Error('No approval level found for budget amount');
            }
            levelName = levelData.approval_levels.name;
            approvalLevelId = levelData.approval_level_id;
        }

        const requiredRole = getRoleForLevel(levelName);

        // Single RPC call, security definer, bypasses the "view own row
        // only" RLS policy on ekiti_users deliberately and narrowly, just
        // for this one legitimate system lookup (finding *an* approver
        // with the required role) rather than loosening that policy
        // generally.
        const { data: approverAuthId, error: authLookupError } = await supabase
            .rpc('get_approver_auth_id', { required_role: requiredRole });

        if (authLookupError) throw authLookupError;
        if (!approverAuthId) {
            throw new Error(`No approver found with role: ${requiredRole}. Assign someone this role in ekiti_users first, and make sure they have logged in at least once.`);
        }

        const { data: approval, error: approvalError } = await createProjectApproval(
            projectId,
            approvalLevelId,
            approverAuthId
        );

        if (approvalError) throw approvalError;

        await supabase
            .from('projects')
            .update({ status: 'pending_approval' })
            .eq('id', projectId);

        const { data: { user: authUser } } = await supabase.auth.getUser();
        await auditService.logAction({
            userId: authUser?.id,
            actionType: 'ROUTE_APPROVAL',
            tableName: 'projects',
            recordId: projectId,
            newValue: JSON.stringify({ approvalLevel: levelName, approver: approverAuthId }),
            metadata: { action: 'ROUTE_APPROVAL', budgetAmount, approvalLevel: levelName }
        });

        return { data: approval, level: { name: levelName } };
    } catch (error) {
        console.error('Error routing project for approval:', error);
        return { error };
    }
};

// Map approval level names to the NEW organogram role names (ekiti_users.role)
const getRoleForLevel = (levelName) => {
    const roleMap = {
        'HOD': 'department_staff',
        'Director': 'lg_legislative',
        'Chairman': 'executive_chairman',
        'State': 'mda_oversight'
    };
    return roleMap[levelName] || 'department_staff';
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

    if (data.some(a => a.status === 'rejected')) {
        return { status: 'rejected', data };
    }

    if (data.some(a => a.status === 'pending')) {
        return { status: 'pending', data };
    }

    if (data.some(a => a.status === 'escalated')) {
        return { status: 'escalated', data };
    }

    if (data.every(a => a.status === 'approved')) {
        return { status: 'approved', data };
    }

    return { status: 'unknown', data };
};