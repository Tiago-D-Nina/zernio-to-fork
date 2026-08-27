import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getUserFromToken } from '../_shared/auth.ts';
import {
  compileAgentPrompt,
  type CompilerIssue,
} from '../_shared/agent-prompt-compiler.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Método não permitido' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = createClient(supabaseUrl, serviceRoleKey);

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return json(401, { error: 'Unauthorized' });

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const authClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userError } = await getUserFromToken(token);
    if (userError || !userData.user) return json(401, { error: 'Unauthorized' });

    const body = await req.json();
    const action = String(body.action || 'preview');
    const agentId = String(body.agent_id || '');
    if (!agentId) return json(400, { error: 'agent_id é obrigatório' });
    if (!['preview', 'publish'].includes(action)) {
      return json(400, { error: 'Ação inválida' });
    }

    const { data: agent, error: agentError } = await service
      .from('agents')
      .select('id, workspace_id, published_version_id')
      .eq('id', agentId)
      .maybeSingle();
    if (agentError) throw agentError;
    if (!agent) return json(404, { error: 'Agente não encontrada' });

    const { data: membership, error: membershipError } = await service
      .from('workspace_members')
      .select('role, can_publish_agent, status')
      .eq('workspace_id', agent.workspace_id)
      .eq('user_id', userData.user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return json(403, { error: 'Sem acesso a este workspace' });

    const { data: draft, error: draftError } = await service
      .from('agent_drafts')
      .select('id, config, revision, base_version_id, updated_at')
      .eq('agent_id', agentId)
      .maybeSingle();
    if (draftError) throw draftError;
    if (!draft) return json(404, { error: 'Rascunho não encontrado' });

    const compiled = compileAgentPrompt(draft.config);
    const artifactChecksum = await sha256(
      `${compiled.compilerVersion}\n${draft.revision}\n${compiled.prompt}`,
    );

    if (action === 'preview') {
      return json(200, {
        agent_id: agentId,
        draft_revision: draft.revision,
        base_version_id: draft.base_version_id,
        published_version_id: agent.published_version_id,
        compiler_version: compiled.compilerVersion,
        artifact_checksum: artifactChecksum,
        prompt: compiled.prompt,
        sections: compiled.sections,
        issues: compiled.issues,
        has_blocking_issues: compiled.hasBlockingIssues,
      });
    }

    const canPublish = membership.role === 'admin' || membership.can_publish_agent === true;
    if (!canPublish) return json(403, { error: 'Sem permissão para publicar esta agente' });

    const expectedRevision = Number(body.expected_revision);
    if (!Number.isInteger(expectedRevision) || expectedRevision !== draft.revision) {
      return json(409, {
        error: 'O rascunho mudou. Revise a versão mais recente antes de publicar.',
        code: 'draft_revision_conflict',
        actual_revision: draft.revision,
      });
    }

    // Modo permissivo de testes: publicação segue mesmo com pendências,
    // avaliação ausente/reprovada ou alertas não aceitos. Tudo vira registro.
    const evaluationRunIdInput = typeof body.evaluation_run_id === 'string'
      ? body.evaluation_run_id.trim()
      : '';
    let evaluationRunId: string | null = null;
    if (evaluationRunIdInput) {
      const { data: evaluationRun } = await service
        .from('eval_runs')
        .select('id')
        .eq('id', evaluationRunIdInput)
        .eq('workspace_id', agent.workspace_id)
        .eq('agent_id', agentId)
        .maybeSingle();
      evaluationRunId = evaluationRun?.id ?? null;
    }

    const acceptedWarnings = compiled.issues.map((issue: CompilerIssue) => ({
      code: issue.code,
      field: issue.field,
      message: issue.message,
      severity: issue.severity,
    }));

    const { data: versionData, error: publishError } = await service.rpc(
      'publish_compiled_agent_draft',
      {
        _agent_id: agentId,
        _expected_revision: expectedRevision,
        _compiled_prompt: compiled.prompt,
        _compiler_version: compiled.compilerVersion,
        _actor_user_id: userData.user.id,
        _evaluation_run_id: evaluationRunId,
        _label: typeof body.label === 'string' ? body.label : null,
        _accepted_warnings: acceptedWarnings,
      },
    );
    if (publishError) {
      if (publishError.code === '40001') {
        return json(409, { error: publishError.message, code: 'draft_revision_conflict' });
      }
      throw publishError;
    }

    const version = Array.isArray(versionData) ? versionData[0] : versionData;
    return json(200, {
      version: {
        id: version.id,
        agent_id: version.agent_id,
        workspace_id: version.workspace_id,
        version_number: version.version_number,
        checksum: version.checksum,
        compiler_version: version.compiler_version,
        label: version.label,
        source: version.source,
        evaluation_run_id: version.evaluation_run_id,
        accepted_warnings: version.accepted_warnings,
        restored_from_version_id: version.restored_from_version_id,
        created_by: version.created_by,
        published_at: version.published_at,
        created_at: version.created_at,
        config: version.config,
      },
      artifact_checksum: artifactChecksum,
      issues: compiled.issues,
    });
  } catch (error) {
    console.error('[agent-configuration] Error:', error);
    const message = error instanceof Error ? error.message : 'Erro interno';
    return json(500, { error: message });
  }
});
