import React, { useEffect, useState } from 'react';
import { Search, Filter, MoreHorizontal, UserPlus, MessageSquare, Loader2, Mail, Phone, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './Button';
import { api } from '../services/api';
import { Contact } from '../types';

const Contacts: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const loadContacts = async () => {
      try {
        const data = await api.fetchContacts();
        setContacts(data);
      } catch (error) {
        console.error("Erro ao carregar contatos", error);
      } finally {
        setLoading(false);
      }
    };
    loadContacts();
  }, []);

  const filteredContacts = contacts.filter(c => {
    const term = searchTerm.toLowerCase();
    return (
      (c.name?.toLowerCase() || '').includes(term) ||
      (c.phone || '').includes(term) ||
      (c.email?.toLowerCase() || '').includes(term)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'customer': return 'is-customer';
      case 'lead': return 'is-lead';
      case 'churned': return 'is-churned';
      default: return '';
    }
  };

  const handleStartConversation = (contact: Contact) => {
    navigate(`/chat?contact=${encodeURIComponent(contact.phone)}`);
  };

  return (
    <div className="operation-page">
      <div className="operation-container">
      <header className="operation-header">
        <div>
          <p className="via-eyebrow">Relacionamento</p>
          <h1>Contatos.</h1>
          <p>Gerencie sua base de leads e clientes com inteligência.</p>
        </div>
        <Button
          variant="outline"
          className="opacity-50 cursor-not-allowed"
          disabled
          title="Em breve: Adicionar contato"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Novo contato
        </Button>
      </header>

      {/* Filters Bar */}
      <div className="operation-toolbar">
        <label className="operation-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Buscar contatos</span>
          <input
            type="text"
            placeholder="Buscar por nome, email ou telefone"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </label>
        <Button
          variant="outline"
          className="w-full sm:w-auto cursor-not-allowed opacity-50"
          disabled
          title="Em breve: Filtros avançados"
        >
          <Filter className="w-4 h-4 mr-2" />
          Filtros avançados
        </Button>
      </div>

      {/* Table */}
      <div className="via-table-wrap operation-table">
        {loading ? (
           <div className="flex flex-col items-center justify-center h-80">
             <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
             <span className="text-sm text-muted-foreground animate-pulse">Carregando base de dados...</span>
           </div>
        ) : filteredContacts.length === 0 ? (
          <div className="operation-empty">
            <span className="operation-empty-icon">
              <Users aria-hidden="true" />
            </span>
            <p>Nenhum contato encontrado.</p>
            <small>
              {searchTerm ? 'Tente buscar por outro termo' : 'Os contatos aparecerão aqui'}
            </small>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="via-table">
              <thead>
                <tr>
                  <th className="px-6 py-4">Nome / Telefone</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Canais</th>
                  <th className="px-6 py-4">Última Interação</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredContacts.map((contact) => (
                  <tr key={contact.id} className="hover:bg-accent/40 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-sm font-semibold text-primary-foreground">
                          {(contact.name || contact.phone || '?').substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                              {contact.name || 'Sem nome'}
                            </div>
                            <div className="text-xs text-muted-foreground">{contact.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`via-meta-chip contact-status ${getStatusColor(contact.status)}`}>
                        {contact.status === 'customer' ? 'Cliente Ativo' : contact.status === 'lead' ? 'Lead Qualificado' : 'Churned'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        {contact.email && (
                          <div className="flex items-center gap-2 text-muted-foreground text-xs">
                              <Mail className="w-3.5 h-3.5" />
                              {contact.email}
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                            <Phone className="w-3.5 h-3.5" />
                            {contact.phone}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                       <span className="text-muted-foreground">{new Date(contact.lastContact).toLocaleDateString('pt-BR')}</span>
                       <div className="text-[10px] text-muted-foreground">via WhatsApp</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                        <Button 
                          size="sm" 
                          variant="primary" 
                          className="h-8 w-8 p-0 rounded-lg shadow-none" 
                          title="Iniciar Conversa"
                          onClick={() => handleStartConversation(contact)}
                        >
                          <MessageSquare className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0 rounded-lg cursor-not-allowed opacity-50"
                          disabled
                          title="Em breve: Mais opções"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default Contacts;
