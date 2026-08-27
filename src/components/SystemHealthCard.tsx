import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Loader2,
  MessageSquare,
  Bot,
  Mic,
  Clock,
  User,
  Layers,
  Compass,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ValidationResult {
  component: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  details?: string;
}

interface HealthData {
  results: ValidationResult[];
  overallStatus: 'ok' | 'warning' | 'error';
  summary: {
    ok: number;
    total: number;
    percentage: number;
  };
  message: string;
}

const componentIcons: Record<string, React.ReactNode> = {
  identity: <User className="w-4 h-4" />,
  whatsapp: <MessageSquare className="w-4 h-4" />,
  agent_prompt: <Bot className="w-4 h-4" />,
  elevenlabs: <Mic className="w-4 h-4" />,
  business_hours: <Clock className="w-4 h-4" />,
  lovable_ai: <Compass className="w-4 h-4" />,
  pipeline: <Layers className="w-4 h-4" />,
  profile: <User className="w-4 h-4" />,
  nina_settings: <Bot className="w-4 h-4" />,
};

const componentLabels: Record<string, string> = {
  identity: 'Identidade',
  whatsapp: 'WhatsApp',
  agent_prompt: 'Agente IA',
  elevenlabs: 'ElevenLabs',
  business_hours: 'Horário',
  lovable_ai: 'Lovable AI',
  pipeline: 'Pipeline',
  profile: 'Perfil',
  nina_settings: 'Configurações',
};

export const SystemHealthCard: React.FC = () => {
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('validate-setup');
      
      if (error) throw error;
      setHealthData(data);
    } catch (error) {
      console.error('Error fetching health:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const getStatusIcon = (status: 'ok' | 'warning' | 'error') => {
    switch (status) {
      case 'ok':
        return <CheckCircle className="w-4 h-4 text-success" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-muted-foreground" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-destructive" />;
    }
  };

  const getStatusColor = (status: 'ok' | 'warning' | 'error') => {
    switch (status) {
      case 'ok':
        return 'bg-secondary border-border text-foreground';
      case 'warning':
        return 'bg-muted border-border text-muted-foreground';
      case 'error':
        return 'bg-destructive/10 border-destructive/20 text-destructive';
    }
  };

  if (loading) {
    return (
      <div className="system-health-card via-card">
        <div className="flex items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Verificando sistema...</span>
        </div>
      </div>
    );
  }

  if (!healthData) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`system-health-card via-card is-${healthData.overallStatus}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {getStatusIcon(healthData.overallStatus)}
          <div>
            <h3 className="text-sm font-semibold text-foreground">Status do sistema</h3>
            <p className="text-xs text-muted-foreground">{healthData.message}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`via-pill border ${getStatusColor(healthData.overallStatus)}`}>
            {healthData.summary.percentage}% OK
          </div>
          <button
            onClick={fetchHealth}
            disabled={loading}
            aria-label="Atualizar status do sistema"
            className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-muted rounded-full overflow-hidden mb-4">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${healthData.summary.percentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className={`h-full rounded-full ${
            healthData.overallStatus === 'error' ? 'bg-destructive' : 'bg-primary'
          }`}
        />
      </div>

      {/* Expandable Details */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>{expanded ? 'Ocultar detalhes' : 'Ver detalhes'}</span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="grid grid-cols-2 gap-2 mt-2"
        >
          {healthData.results.map((result, index) => (
            <motion.div
              key={result.component}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`flex items-center gap-2 p-2 rounded-lg border ${getStatusColor(result.status)} bg-opacity-50`}
            >
              <div className="flex-shrink-0">
                {componentIcons[result.component] || <CheckCircle className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">
                  {componentLabels[result.component] || result.component}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{result.message}</p>
              </div>
              <div className="flex-shrink-0">
                {getStatusIcon(result.status)}
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
};
