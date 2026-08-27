import React, { useEffect, useState } from 'react';
import { UserPlus, Search, Loader2, X, Check, Edit2, Users, Settings, Trash2 } from 'lucide-react';
import { Button } from './Button';
import { Badge } from '@/components/ui/badge';
import { api } from '../services/api';
import { TeamMember, type Team as TeamType, type TeamFunction } from '../types';
import { supabase } from '@/integrations/supabase/client';
import TeamConfigModal from './TeamConfigModal';
import { toast } from 'sonner';

const Team: React.FC = () => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teams, setTeams] = useState<TeamType[]>([]);
  const [functions, setFunctions] = useState<TeamFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [formData, setFormData] = useState({ 
    name: '', 
    email: '', 
    role: 'agent',
    team_id: '',
    function_id: '',
    weight: 1
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    email: '',
    role: 'agent',
    status: 'invited' as 'active' | 'invited' | 'disabled',
    team_id: '',
    function_id: '',
    weight: 1
  });

  useEffect(() => {
    loadAllData();
    const cleanup = setupRealtime();
    return cleanup;
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [membersData, teamsData, functionsData] = await Promise.all([
        api.fetchTeam(),
        api.fetchTeams(),
        api.fetchTeamFunctions()
      ]);
      setMembers(membersData);
      setTeams(teamsData as TeamType[]);
      setFunctions(functionsData as TeamFunction[]);
    } catch (error) {
      console.error("Erro ao carregar dados da equipe", error);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtime = () => {
    const channel = supabase
      .channel('team-members-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, () => {
        loadAllData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await api.createTeamMember({
        name: formData.name,
        email: formData.email,
        role: formData.role as 'agent' | 'admin' | 'manager',
        team_id: formData.team_id || undefined,
        function_id: formData.function_id || undefined,
        weight: formData.weight
      });

      toast.success('Membro convidado com sucesso!');
      setShowModal(false);
      setFormData({ name: '', email: '', role: 'agent', team_id: '', function_id: '', weight: 1 });
      await loadAllData();
    } catch (error) {
      console.error('Erro ao convidar membro:', error);
      toast.error('Erro ao convidar membro. Verifique se o email já não está cadastrado.');
    }
  };

  const handleUpdateMember = async (id: string, field: string, value: any) => {
    try {
      await api.updateTeamMember(id, { [field]: value });
      toast.success('Membro atualizado com sucesso');
    } catch (error) {
      console.error('Erro ao atualizar membro:', error);
      toast.error('Erro ao atualizar membro');
    }
  };

  const handleDeleteMember = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir ${name}?`)) return;
    try {
      await api.deleteTeamMember(id);
      toast.success('Membro removido com sucesso');
      await loadAllData();
    } catch (error) {
      console.error('Erro ao remover membro:', error);
      toast.error('Erro ao remover membro');
    }
  };

  const handleEditClick = (member: TeamMember) => {
    setEditingMember(member);
    setEditFormData({
      name: member.name,
      email: member.email,
      role: member.role,
      status: member.status,
      team_id: member.team_id || '',
      function_id: member.function_id || '',
      weight: member.weight || 1
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    try {
      await api.updateTeamMember(editingMember.id, {
        name: editFormData.name,
        email: editFormData.email,
        role: editFormData.role as 'admin' | 'manager' | 'agent',
        status: editFormData.status,
        team_id: editFormData.team_id || null,
        function_id: editFormData.function_id || null,
        weight: editFormData.weight
      });
      toast.success('Membro atualizado com sucesso!');
      setShowEditModal(false);
      setEditingMember(null);
      await loadAllData();
    } catch (error) {
      console.error('Erro ao editar membro:', error);
      toast.error('Erro ao editar membro');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
        case 'active':
            return <Badge variant="success">Ativo</Badge>;
        case 'invited':
            return <Badge variant="outline">Pendente</Badge>;
        default:
            return <Badge variant="muted">Inativo</Badge>;
    }
  };

  // Filtered members based on search
  const filteredMembers = members.filter(m => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const teamName = teams.find(t => t.id === m.team_id)?.name || '';
    const funcName = functions.find(f => f.id === m.function_id)?.name || '';
    return (
      m.name.toLowerCase().includes(term) ||
      m.email.toLowerCase().includes(term) ||
      teamName.toLowerCase().includes(term) ||
      funcName.toLowerCase().includes(term)
    );
  });

  // Dynamic stats
  const stats = {
    total: members.length,
    admins: members.filter(m => m.role === 'admin').length,
    members: members.filter(m => m.role !== 'admin').length,
    teams: teams.length
  };

  return (
    <div className="operation-page custom-scrollbar">
      <div className="operation-container">
      {/* Header Section */}
      <header className="operation-header">
        <div>
          <p className="via-eyebrow">Organização</p>
          <h1>Equipe.</h1>
          <p>Gerencie usuários, papéis e times da operação.</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => setShowConfigModal(true)} variant="outline">
            <Settings className="w-4 h-4 mr-2" />
            Configurar
          </Button>
          <Button onClick={() => setShowModal(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            Convidar usuário
          </Button>
        </div>
      </header>

      {/* Stats Cards Row */}
      <div className="operation-metrics">
        <div className="via-metric via-metric--atmos">
            <div className="via-metric__label">Total de usuários</div>
            <div className="via-metric__value">{loading ? '—' : stats.total}</div>
        </div>
        <div className="via-metric via-metric--atmos">
            <div className="via-metric__label">Administradores</div>
            <div className="via-metric__value">{loading ? '—' : stats.admins}</div>
        </div>
        <div className="via-metric via-metric--atmos">
            <div className="via-metric__label">Membros</div>
            <div className="via-metric__value">{loading ? '—' : stats.members}</div>
        </div>
        <div className="via-metric via-metric--atmos">
            <div className="via-metric__label">Times ativos</div>
            <div className="via-metric__value">{stats.teams}</div>
        </div>
      </div>

      {/* Search Bar */}
      <label className="operation-search operation-search--standalone">
        <Search aria-hidden="true" />
        <span className="sr-only">Buscar integrantes da equipe</span>
        <input
            type="text"
            placeholder="Buscar por nome, email, time ou função..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
        />
      </label>

      {/* Main Table Card */}
      <div className="via-table-wrap team-table">
        <div className="p-6 border-b border-border">
            <h3 className="text-lg font-semibold text-foreground">Usuários da Equipe</h3>
            <p className="text-sm text-muted-foreground mt-1">Gerencie roles e times dos usuários</p>
        </div>

        {loading ? (
             <div className="flex flex-col items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                <span className="text-sm text-muted-foreground">Carregando dados...</span>
           </div>
        ) : members.length === 0 ? (
            <div className="operation-empty">
                <span className="operation-empty-icon"><Users aria-hidden="true" /></span>
                <p>Nenhum membro cadastrado ainda.</p>
                <Button onClick={() => setShowModal(true)}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Convidar primeiro membro
                </Button>
            </div>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-border/50">
                            <th className="px-6 py-4 via-eyebrow text-muted-foreground">Usuário</th>
                            <th className="px-6 py-4 via-eyebrow text-muted-foreground">Email</th>
                            <th className="px-6 py-4 via-eyebrow text-muted-foreground">Role</th>
                            <th className="px-6 py-4 via-eyebrow text-muted-foreground">Time</th>
                            <th className="px-6 py-4 via-eyebrow text-muted-foreground">Função</th>
                            <th className="px-6 py-4 via-eyebrow text-muted-foreground">Peso</th>
                            <th className="px-6 py-4 via-eyebrow text-muted-foreground text-center">Status</th>
                            <th className="px-6 py-4 via-eyebrow text-muted-foreground text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                        {filteredMembers.map((member) => (
                            <tr key={member.id} className="hover:bg-accent/50 transition-colors group">
                                {/* User Info */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-3">
                                        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold text-muted-foreground border border-border uppercase">
                                            {member.name.substring(0, 2)}
                                        </div>
                                        <span className="text-sm font-medium text-foreground">{member.name}</span>
                                    </div>
                                </td>
                                
                                {/* Email */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="text-sm text-muted-foreground">{member.email}</span>
                                </td>

                                {/* Role Selector */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <select
                                        value={member.role}
                                        onChange={(e) => handleUpdateMember(member.id, 'role', e.target.value)}
                                        className="w-32 px-3 py-1.5 bg-secondary border border-input rounded-md text-sm text-foreground cursor-pointer hover:border-ring transition-colors"
                                    >
                                        <option value="agent">Atendente</option>
                                        <option value="manager">Gerente</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </td>

                                {/* Time Selector */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <select
                                        value={member.team_id || ''}
                                        onChange={(e) => handleUpdateMember(member.id, 'team_id', e.target.value || null)}
                                        className="w-32 px-3 py-1.5 bg-secondary border border-input rounded-md text-sm text-foreground cursor-pointer hover:border-ring transition-colors"
                                    >
                                        <option value="">Sem time</option>
                                        {teams.map(team => (
                                            <option key={team.id} value={team.id}>{team.name}</option>
                                        ))}
                                    </select>
                                </td>

                                {/* Function Selector */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <select
                                        value={member.function_id || ''}
                                        onChange={(e) => handleUpdateMember(member.id, 'function_id', e.target.value || null)}
                                        className="w-32 px-3 py-1.5 bg-secondary border border-input rounded-md text-sm text-foreground cursor-pointer hover:border-ring transition-colors"
                                    >
                                        <option value="">Sem função</option>
                                        {functions.map(func => (
                                            <option key={func.id} value={func.id}>{func.name}</option>
                                        ))}
                                    </select>
                                </td>

                                {/* Weight */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <input
                                        type="number"
                                        min="1"
                                        max="10"
                                        value={member.weight || 1}
                                        onChange={(e) => handleUpdateMember(member.id, 'weight', parseInt(e.target.value))}
                                        className="w-16 px-2 py-1 bg-secondary border border-input rounded-md text-sm text-foreground text-center"
                                    />
                                </td>

                                {/* Status */}
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                    {getStatusBadge(member.status)}
                                </td>

                                {/* Actions */}
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <button
                                            onClick={() => handleEditClick(member)}
                                            aria-label={`Editar ${member.name}`}
                                            className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                                            title="Editar membro"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteMember(member.id, member.name)}
                                            aria-label={`Excluir ${member.name}`}
                                            className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                                            title="Excluir membro"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
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

      {/* Invite Modal */}
      {showModal && (
        <div className="via-dialog-overlay fixed inset-0 z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="via-dialog-content relative max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-border flex justify-between items-center">
                    <div>
                        <p className="via-eyebrow mb-2">Acesso ao workspace</p>
                        <h3 className="via-dialog-title">Convidar pessoa</h3>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowModal(false)}
                        aria-label="Fechar convite"
                        className="via-dialog-close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <form onSubmit={handleInvite} className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="invite-name" className="text-sm font-medium text-muted-foreground">Nome completo</label>
                        <input 
                            id="invite-name"
                            required
                            type="text" 
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-ring outline-none transition-all"
                            placeholder="Ex: João da Silva"
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                        />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="invite-email" className="text-sm font-medium text-muted-foreground">Email corporativo</label>
                        <input 
                            id="invite-email"
                            required
                            type="email" 
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-ring outline-none transition-all"
                            placeholder="colaborador@empresa.com"
                            value={formData.email}
                            onChange={(e) => setFormData({...formData, email: e.target.value})}
                        />
                    </div>
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">Nível de acesso</p>
                        <div className="grid grid-cols-3 gap-2">
                            {['agent', 'manager', 'admin'].map((role) => (
                                <button
                                    type="button"
                                    key={role}
                                    onClick={() => setFormData({...formData, role})}
                                    aria-pressed={formData.role === role}
                                    className={`rounded-lg border p-2 text-center transition-all ${
                                        formData.role === role 
                                        ? 'bg-primary/10 border-primary text-foreground'
                                        : 'bg-secondary border-border text-muted-foreground hover:border-ring'
                                    }`}
                                >
                                    <div className="text-xs font-medium mb-1">{role === 'agent' ? 'Atendente' : role === 'manager' ? 'Gerente' : 'Admin'}</div>
                                    {formData.role === role && <div className="flex justify-center"><Check className="w-3 h-3" /></div>}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="invite-team" className="text-sm font-medium text-muted-foreground">Time (opcional)</label>
                        <select
                            id="invite-team"
                            value={formData.team_id}
                            onChange={(e) => setFormData({...formData, team_id: e.target.value})}
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground"
                        >
                            <option value="">Sem time</option>
                            {teams.map(team => (
                                <option key={team.id} value={team.id}>{team.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="invite-function" className="text-sm font-medium text-muted-foreground">Função (opcional)</label>
                        <select
                            id="invite-function"
                            value={formData.function_id}
                            onChange={(e) => setFormData({...formData, function_id: e.target.value})}
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground"
                        >
                            <option value="">Sem função</option>
                            {functions.map(func => (
                                <option key={func.id} value={func.id}>{func.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="invite-weight" className="text-sm font-medium text-muted-foreground">Peso (para distribuição)</label>
                        <input
                            id="invite-weight"
                            type="number"
                            min="1"
                            max="10"
                            value={formData.weight}
                            onChange={(e) => setFormData({...formData, weight: parseInt(e.target.value)})}
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground"
                        />
                    </div>

                    <div className="pt-4 flex gap-3">
                        <Button type="button" variant="outline" onClick={() => setShowModal(false)} className="flex-1">Cancelar</Button>
                        <Button type="submit" className="flex-1">Enviar convite</Button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Config Modal */}
      <TeamConfigModal 
        isOpen={showConfigModal} 
        onClose={() => setShowConfigModal(false)} 
        onUpdate={loadAllData}
      />

      {/* Edit Member Modal */}
      {showEditModal && editingMember && (
        <div className="via-dialog-overlay fixed inset-0 z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="via-dialog-content relative max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-border flex justify-between items-center">
                    <div>
                        <p className="via-eyebrow mb-2">Permissões do workspace</p>
                        <h3 className="via-dialog-title">Editar membro</h3>
                    </div>
                    <button
                        type="button"
                        onClick={() => { setShowEditModal(false); setEditingMember(null); }}
                        aria-label="Fechar edição do membro"
                        className="via-dialog-close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="edit-member-name" className="text-sm font-medium text-muted-foreground">Nome completo</label>
                        <input 
                            id="edit-member-name"
                            required
                            type="text" 
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-ring outline-none transition-all"
                            value={editFormData.name}
                            onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                        />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="edit-member-email" className="text-sm font-medium text-muted-foreground">Email</label>
                        <input 
                            id="edit-member-email"
                            required
                            type="email" 
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-ring outline-none transition-all"
                            value={editFormData.email}
                            onChange={(e) => setEditFormData({...editFormData, email: e.target.value})}
                        />
                    </div>
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">Nível de acesso</p>
                        <div className="grid grid-cols-3 gap-2">
                            {['agent', 'manager', 'admin'].map((role) => (
                                <button
                                    type="button"
                                    key={role}
                                    onClick={() => setEditFormData({...editFormData, role})}
                                    aria-pressed={editFormData.role === role}
                                    className={`rounded-lg border p-2 text-center transition-all ${
                                        editFormData.role === role 
                                        ? 'bg-primary/10 border-primary text-foreground'
                                        : 'bg-secondary border-border text-muted-foreground hover:border-ring'
                                    }`}
                                >
                                    <div className="text-xs font-medium mb-1">{role === 'agent' ? 'Atendente' : role === 'manager' ? 'Gerente' : 'Admin'}</div>
                                    {editFormData.role === role && <div className="flex justify-center"><Check className="w-3 h-3" /></div>}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="edit-member-status" className="text-sm font-medium text-muted-foreground">Status</label>
                        <select
                            id="edit-member-status"
                            value={editFormData.status}
                            onChange={(e) => setEditFormData({...editFormData, status: e.target.value as 'active' | 'invited' | 'disabled'})}
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground"
                        >
                            <option value="active">Ativo</option>
                            <option value="invited">Pendente</option>
                            <option value="disabled">Inativo</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="edit-member-team" className="text-sm font-medium text-muted-foreground">Time</label>
                        <select
                            id="edit-member-team"
                            value={editFormData.team_id}
                            onChange={(e) => setEditFormData({...editFormData, team_id: e.target.value})}
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground"
                        >
                            <option value="">Sem time</option>
                            {teams.map(team => (
                                <option key={team.id} value={team.id}>{team.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="edit-member-function" className="text-sm font-medium text-muted-foreground">Função</label>
                        <select
                            id="edit-member-function"
                            value={editFormData.function_id}
                            onChange={(e) => setEditFormData({...editFormData, function_id: e.target.value})}
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground"
                        >
                            <option value="">Sem função</option>
                            {functions.map(func => (
                                <option key={func.id} value={func.id}>{func.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="edit-member-weight" className="text-sm font-medium text-muted-foreground">Peso</label>
                        <input
                            id="edit-member-weight"
                            type="number"
                            min="1"
                            max="10"
                            value={editFormData.weight}
                            onChange={(e) => setEditFormData({...editFormData, weight: parseInt(e.target.value)})}
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground"
                        />
                    </div>

                    <div className="pt-4 flex gap-3">
                        <Button type="button" variant="outline" onClick={() => { setShowEditModal(false); setEditingMember(null); }} className="flex-1">Cancelar</Button>
                        <Button type="submit" className="flex-1">Salvar alterações</Button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default Team;
