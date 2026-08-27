import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface OnboardingStep {
  id: 'identidade' | 'canal' | 'cerebro';
  title: string;
  description: string;
  isComplete: boolean;
}

export interface OnboardingStatus {
  loading: boolean;
  /** true quando a consulta de status falhou (rede/RLS) — nesse caso o app NÃO
   *  deve auto-abrir o wizard: estado desconhecido não é "não onboarded". */
  loadFailed: boolean;
  isComplete: boolean;
  isDismissed: boolean;
  settingsId: string | null;
  companyName: string;
  sdrName: string;
  steps: OnboardingStep[];
  completionPercentage: number;
  markCompleted: () => Promise<boolean>;
  dismiss: () => Promise<boolean>;
  reopen: () => Promise<void>;
  /** Alias de reopen — compatibilidade com Settings.tsx (Refazer onboarding). */
  resetWizard: () => Promise<void>;
  refetch: () => Promise<void>;
}

// Sincroniza todas as instâncias do hook (banner, layout, wizard) sem reload.
const listeners = new Set<() => void>();

/** Avisa todas as instâncias do hook para rebuscar o estado do onboarding. */
export function notifyOnboardingChange() {
  listeners.forEach((fn) => fn());
}

interface OnboardingData {
  settingsId: string | null;
  companyName: string;
  sdrName: string;
  completedAt: string | null;
  dismissedAt: string | null;
  hasWhatsappCloud: boolean;
  hasStructuredAgent: boolean;
  hasActiveConnection: boolean;
}

const EMPTY_DATA: OnboardingData = {
  settingsId: null,
  companyName: '',
  sdrName: '',
  completedAt: null,
  dismissedAt: null,
  hasWhatsappCloud: false,
  hasStructuredAgent: false,
  hasActiveConnection: false,
};

export function useOnboardingStatus(): OnboardingStatus {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [data, setData] = useState<OnboardingData>(EMPTY_DATA);
  const hasLoadedRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    if (!hasLoadedRef.current) setLoading(true);

    try {
      const [settingsRes, connectionsRes, draftRes] = await Promise.all([
        (supabase as any)
          .from('nina_settings_public')
          .select('id, company_name, sdr_name, onboarding_completed_at, onboarding_dismissed_at, has_whatsapp_cloud')
          .limit(1)
          .maybeSingle(),
        (supabase as any)
          .from('channel_connections')
          .select('id')
          .eq('status', 'active')
          .limit(1),
        (supabase as any)
          .from('agent_drafts')
          .select('config')
          .limit(1)
          .maybeSingle(),
      ]);

      // supabase-js não lança em erro de query — sem esta checagem, uma falha
      // de rede/RLS viraria "não onboarded" e o wizard abriria à toa
      if (settingsRes.error) throw settingsRes.error;
      if (connectionsRes.error) throw connectionsRes.error;
      if (draftRes.error) throw draftRes.error;

      const settings = settingsRes.data as {
        id: string;
        company_name: string | null;
        sdr_name: string | null;
        onboarding_completed_at: string | null;
        onboarding_dismissed_at: string | null;
        has_whatsapp_cloud: boolean | null;
      } | null;
      const draftConfig = draftRes.data?.config as Record<string, any> | null | undefined;
      const identity = draftConfig?.identity as Record<string, unknown> | undefined;

      setData({
        settingsId: settings?.id ?? null,
        companyName: settings?.company_name ?? '',
        sdrName: settings?.sdr_name ?? '',
        completedAt: settings?.onboarding_completed_at ?? null,
        dismissedAt: settings?.onboarding_dismissed_at ?? null,
        hasWhatsappCloud: !!settings?.has_whatsapp_cloud,
        // Mesmo critério de "identidade pronta" da visão geral da agente: sem
        // isso, o passo 1 do onboarding (nome+empresa) marcava sozinho o passo
        // "Agente" como configurado, e o checklist mentia.
        hasStructuredAgent: Boolean(
          identity?.agentName
          && identity?.companyName
          && identity?.role
          && identity?.whatCompanySells
          && identity?.primaryAudience,
        ),
        hasActiveConnection: (connectionsRes.data?.length ?? 0) > 0,
      });
      hasLoadedRef.current = true;
      setLoadFailed(false);
    } catch (error) {
      console.error('[useOnboardingStatus] Erro ao buscar status:', error);
      if (!hasLoadedRef.current) setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Registra a instância no broadcast global
  useEffect(() => {
    listeners.add(fetchStatus);
    return () => {
      listeners.delete(fetchStatus);
    };
  }, [fetchStatus]);

  const updateOnboarding = useCallback(
    async (patch: Record<string, string | null>): Promise<boolean> => {
      if (!data.settingsId) {
        toast.error('Configurações não encontradas. Recarregue a página e tente de novo.');
        return false;
      }
      const { error } = await (supabase as any)
        .from('nina_settings')
        .update(patch)
        .eq('id', data.settingsId);

      if (error) {
        console.error('[useOnboardingStatus] Erro ao atualizar onboarding:', error);
        toast.error('Erro ao atualizar o onboarding: ' + error.message);
        return false;
      }
      notifyOnboardingChange();
      return true;
    },
    [data.settingsId]
  );

  const markCompleted = useCallback(async (): Promise<boolean> => {
    return updateOnboarding({
      onboarding_completed_at: new Date().toISOString(),
      onboarding_dismissed_at: null,
    });
  }, [updateOnboarding]);

  const dismiss = useCallback(async (): Promise<boolean> => {
    return updateOnboarding({
      onboarding_dismissed_at: new Date().toISOString(),
    });
  }, [updateOnboarding]);

  const reopen = useCallback(async () => {
    await updateOnboarding({
      onboarding_completed_at: null,
      onboarding_dismissed_at: null,
    });
  }, [updateOnboarding]);

  const steps: OnboardingStep[] = [
    {
      id: 'identidade',
      title: 'Seu negócio',
      description: 'Nome da empresa e da agente',
      isComplete: !!(data.companyName && data.sdrName),
    },
    {
      id: 'canal',
      title: 'Canais',
      description: 'WhatsApp conectado',
      isComplete: data.hasWhatsappCloud || data.hasActiveConnection,
    },
    {
      id: 'cerebro',
      title: 'Agente',
      description: 'Configuração estruturada iniciada',
      isComplete: data.hasStructuredAgent,
    },
  ];

  const completedCount = steps.filter((s) => s.isComplete).length;
  const completionPercentage = Math.round((completedCount / steps.length) * 100);

  return {
    loading,
    loadFailed,
    isComplete: !!data.completedAt,
    isDismissed: !!data.dismissedAt,
    settingsId: data.settingsId,
    companyName: data.companyName,
    sdrName: data.sdrName,
    steps,
    completionPercentage,
    markCompleted,
    dismiss,
    reopen,
    resetWizard: reopen,
    refetch: fetchStatus,
  };
}
