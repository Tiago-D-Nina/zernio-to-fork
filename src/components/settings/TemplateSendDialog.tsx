import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Send } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/Button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { whatsappTemplatesApi } from '@/services/whatsappTemplates';
import {
  countBodyVariables,
  renderTemplateText,
  type MetaTemplate,
} from '../../../supabase/functions/_shared/whatsapp-templates';

const CONTACT_NAME_TOKEN = '{{contact.name}}';
const MAX_CONTACTS = 200;

interface ContactOption {
  id: string;
  name: string | null;
  call_name: string | null;
  phone_number: string | null;
}

interface Props {
  template: MetaTemplate | null;
  onClose: () => void;
}

function contactLabel(contact: ContactOption): string {
  return (contact.call_name || contact.name || contact.phone_number || 'Sem nome').trim();
}

export default function TemplateSendDialog({ template, onClose }: Props) {
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [params, setParams] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const variableCount = template ? countBodyVariables(template.bodyText) : 0;

  const loadContacts = useCallback(async (term: string) => {
    setLoadingContacts(true);
    try {
      let query = supabase
        .from('contacts')
        .select('id, name, call_name, phone_number')
        .not('phone_number', 'is', null)
        .eq('is_blocked', false)
        .order('last_activity', { ascending: false })
        .limit(50);
      const trimmed = term.trim();
      if (trimmed) {
        query = query.or(`name.ilike.%${trimmed}%,call_name.ilike.%${trimmed}%,phone_number.ilike.%${trimmed}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      setContacts((data ?? []) as ContactOption[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar os contatos.');
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  useEffect(() => {
    if (!template) return;
    setSelected([]);
    setSearch('');
    setParams(Array.from({ length: countBodyVariables(template.bodyText) }, () => CONTACT_NAME_TOKEN));
    void loadContacts('');
  }, [template, loadContacts]);

  useEffect(() => {
    if (!template) return;
    const timer = window.setTimeout(() => { void loadContacts(search); }, 300);
    return () => window.clearTimeout(timer);
  }, [search, template, loadContacts]);

  const preview = useMemo(
    () => (template ? renderTemplateText(template.bodyText, params.map((value) => (value === CONTACT_NAME_TOKEN ? 'Maria' : value))) : ''),
    [template, params],
  );

  const toggle = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const handleSend = async () => {
    if (!template) return;
    if (selected.length === 0) {
      toast.error('Selecione ao menos um contato.');
      return;
    }
    if (params.some((value) => !value.trim())) {
      toast.error('Preencha todas as variáveis do template.');
      return;
    }
    setSending(true);
    try {
      const result = await whatsappTemplatesApi.send({
        name: template.name,
        language: template.language,
        bodyText: template.bodyText,
        params,
        contactIds: selected,
      });
      toast.success(
        result.skipped.length > 0
          ? `${result.queued} envio(s) na fila · ${result.skipped.length} contato(s) ignorado(s).`
          : `${result.queued} envio(s) na fila.`,
      );
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível disparar o template.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={template !== null} onOpenChange={(open) => { if (!open && !sending) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Disparar “{template?.name}”</DialogTitle>
          <DialogDescription>
            O template aprovado é o único formato que a Meta aceita fora da janela de 24 horas.
            Escolha os contatos (até {MAX_CONTACTS} por disparo) e o valor de cada variável.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          {variableCount > 0 && (
            <div>
              <p className="text-sm font-medium text-foreground">Variáveis</p>
              <div className="mt-2 space-y-2">
                {Array.from({ length: variableCount }, (_, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{`{{${index + 1}}}`}</span>
                    <Input
                      className="flex-1 min-w-48"
                      value={params[index] ?? ''}
                      onChange={(event) => setParams((current) => {
                        const next = [...current];
                        next[index] = event.target.value;
                        return next;
                      })}
                      placeholder="Texto fixo ou {{contact.name}}"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setParams((current) => {
                        const next = [...current];
                        next[index] = CONTACT_NAME_TOKEN;
                        return next;
                      })}
                    >
                      Nome do contato
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-xs font-medium text-muted-foreground">Prévia (exemplo)</p>
            {template?.headerText && <p className="mt-2 text-sm font-semibold text-foreground">{template.headerText}</p>}
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{preview}</p>
            {template?.footerText && <p className="mt-1.5 text-xs text-muted-foreground">{template.footerText}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">Contatos</p>
              <Badge variant="muted">{selected.length} selecionado(s)</Badge>
            </div>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou telefone" />
            </div>
            <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
              {loadingContacts ? (
                <p className="flex items-center gap-2 p-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando contatos…</p>
              ) : contacts.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">Nenhum contato com telefone encontrado.</p>
              ) : (
                contacts.map((contact) => (
                  <label key={contact.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-secondary">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-current"
                      checked={selected.includes(contact.id)}
                      onChange={() => toggle(contact.id)}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{contactLabel(contact)}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{contact.phone_number}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={sending}>Cancelar</Button>
          <Button variant="primary" onClick={() => void handleSend()} disabled={sending || selected.length === 0}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Enfileirando…' : `Disparar para ${selected.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
