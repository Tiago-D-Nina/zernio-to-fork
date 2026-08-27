import React, { useState } from 'react';
import { Check, Copy, ExternalLink, KeyRound, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../Button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { calendarApi, type CalendarStatus } from '@/services/calendar';

interface NylasCredentialsSettingsProps {
  status: CalendarStatus | null;
  isAdmin: boolean;
  /** Recarrega o status da agenda depois de salvar/limpar as credenciais. */
  onSaved: () => void | Promise<void>;
}

/**
 * Formulário das credenciais do Nylas dentro da própria plataforma.
 *
 * As chaves ficam na configuração da instância e são gravadas pela edge
 * function (service role), que valida contra a API do Nylas antes de salvar.
 * O campo é write-only: mostra apenas se está configurado, nunca o valor.
 */
const NylasCredentialsSettings: React.FC<NylasCredentialsSettingsProps> = ({ status, isAdmin, onSaved }) => {
  const [clientId, setClientId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiUri, setApiUri] = useState('https://api.us.nylas.com');
  const [saving, setSaving] = useState(false);
  const [copiedRedirectUri, setCopiedRedirectUri] = useState(false);

  const configured = status?.credentialsSource === 'settings' || status?.credentialsSource === 'env';
  const fromEnv = status?.credentialsSource === 'env';
  const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/nylas-calendar`;

  const handleSave = async () => {
    const id = clientId.trim();
    const key = apiKey.trim();
    if (!id || !key) return;
    setSaving(true);
    try {
      await calendarApi.saveCredentials({ clientId: id, apiKey: key, apiUri: apiUri.trim() });
      toast.success('Credenciais do Nylas salvas.');
      setClientId('');
      setApiKey('');
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar as credenciais.');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await calendarApi.clearCredentials();
      toast.success('Credenciais removidas.');
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível remover as credenciais.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyRedirectUri = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopiedRedirectUri(true);
      setTimeout(() => setCopiedRedirectUri(false), 2000);
    } catch {
      toast.error('Não foi possível copiar a URL.');
    }
  };

  return (
    <div className="via-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--via-radius-sm)] border border-border bg-secondary text-primary">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <p className="via-eyebrow">Credenciais</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">Conexão com o Nylas</h3>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              O Nylas é a ponte entre a Nina e as agendas do Google, Outlook e iCloud. Cole aqui as
              credenciais da sua aplicação Nylas para liberar a conexão de contas.
            </p>
          </div>
        </div>
        <Badge variant={configured ? 'success' : 'muted'}>{configured ? 'Configurado' : 'Não configurado'}</Badge>
      </div>

      {fromEnv && (
        <p className="mt-4 text-xs text-muted-foreground">
          As credenciais em uso vêm da configuração do servidor. Salvar abaixo passa a usar estas.
        </p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nylas-client-id">Application ID (Client ID)</Label>
          <Input
            id="nylas-client-id"
            autoComplete="off"
            placeholder="00000000-0000-0000-0000-000000000000"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            disabled={!isAdmin || saving}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nylas-api-key">API Key</Label>
          <Input
            id="nylas-api-key"
            type="password"
            autoComplete="off"
            placeholder={configured ? 'Cole uma nova chave para substituir (nyk_…)' : 'nyk_…'}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            disabled={!isAdmin || saving}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="nylas-api-uri">Região da API</Label>
          <select
            id="nylas-api-uri"
            value={apiUri}
            onChange={(event) => setApiUri(event.target.value)}
            disabled={!isAdmin || saving}
            className="h-10 w-full rounded-[var(--via-radius-sm)] border border-border bg-background px-3 text-sm text-foreground sm:max-w-xs"
          >
            <option value="https://api.us.nylas.com">Estados Unidos (us)</option>
            <option value="https://api.eu.nylas.com">Europa (eu)</option>
          </select>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="primary"
          onClick={handleSave}
          disabled={!isAdmin || saving || !clientId.trim() || !apiKey.trim()}
          className="gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {configured ? 'Substituir credenciais' : 'Salvar credenciais'}
        </Button>
        {status?.credentialsSource === 'settings' && (
          <Button type="button" variant="secondary" onClick={handleClear} disabled={!isAdmin || saving}>
            Remover
          </Button>
        )}
      </div>

      {!isAdmin && (
        <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          Apenas administradores podem alterar estas credenciais.
        </p>
      )}

      <div className="mt-4 space-y-3 rounded-[var(--via-radius-sm)] border border-border bg-secondary/50 p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          No painel do{' '}
          <a
            href="https://dashboard-v3.nylas.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Nylas
            <ExternalLink className="h-3 w-3" />
          </a>
          : o <strong className="text-foreground">Application ID</strong> fica em App Settings e a{' '}
          <strong className="text-foreground">API Key</strong> em API Keys. Em Hosted Authentication,
          cadastre a redirect URI abaixo — sem ela o Nylas rejeita a autorização.
        </p>
        <div>
          <Label htmlFor="nylas-redirect-uri" className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Redirect URI (callback)
          </Label>
          <div className="flex gap-2">
            <Input
              id="nylas-redirect-uri"
              value={redirectUri}
              readOnly
              aria-label="Redirect URI do Nylas"
              className="flex-1 font-mono text-xs"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCopyRedirectUri}
              aria-label="Copiar redirect URI"
              className="gap-2 px-3"
            >
              {copiedRedirectUri ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiedRedirectUri ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NylasCredentialsSettings;
