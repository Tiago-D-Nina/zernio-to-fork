import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Clock, AlignLeft, X, Loader2, LayoutGrid, List, Columns, Video, User, UserCircle, Bot, Pencil, CalendarCheck2, CircleAlert, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './Button';
import { Appointment, Contact } from '../types';
import { api } from '../services/api';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type ViewMode = 'month' | 'week' | 'day';

const CalendarSyncMark: React.FC<{ appointment: Appointment; className?: string }> = ({ appointment, className = '' }) => {
  if (appointment.calendar_sync_status === 'synced') {
    return <CalendarCheck2 className={`shrink-0 text-success ${className}`} aria-label="Sincronizado com o Google Calendar" />;
  }
  if (appointment.calendar_sync_status === 'pending') {
    return <Loader2 className={`shrink-0 animate-spin text-muted-foreground ${className}`} aria-label="Sincronizando com o Google Calendar" />;
  }
  if (appointment.calendar_sync_status === 'error') {
    return <CircleAlert className={`shrink-0 text-destructive ${className}`} aria-label="Erro ao sincronizar com o Google Calendar" />;
  }
  return null;
};

const Scheduling: React.FC = () => {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    time: '09:00',
    type: 'demo',
    description: '',
    duration: 60
  });

  // Edit Form State
  const [editFormData, setEditFormData] = useState({
    title: '',
    date: '',
    time: '09:00',
    type: 'demo',
    description: '',
    duration: 60,
    attendees: ''
  });
  const [editContactId, setEditContactId] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [appointmentsData, contactsData] = await Promise.all([
          api.fetchAppointments(),
          api.fetchContacts()
        ]);
        setAppointments(appointmentsData);
        setContacts(contactsData);
      } catch (error) {
        console.error("Erro ao carregar dados", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Setup realtime subscription
    const channel = supabase
      .channel('appointments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments'
        },
        () => {
          console.log('Appointment changed, refetching...');
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Navigation Logic
  const navigateDate = (direction: number) => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
        newDate.setMonth(newDate.getMonth() + direction);
    } else if (viewMode === 'week') {
        newDate.setDate(newDate.getDate() + (direction * 7));
    } else {
        newDate.setDate(newDate.getDate() + direction);
    }
    setCurrentDate(newDate);
  };

  const goToToday = () => setCurrentDate(new Date());

  // Date Formatters
  const getMonthLabel = () => currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
  const getDayLabel = () => currentDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const getWeekLabel = () => {
     const start = getStartOfWeek(currentDate);
     const end = new Date(start);
     end.setDate(end.getDate() + 6);
     return `${start.getDate()} ${start.toLocaleString('pt-BR', { month: 'short' })} - ${end.getDate()} ${end.toLocaleString('pt-BR', { month: 'short' })}`;
  };

  // Helper: Get Start of Week (Sunday)
  const getStartOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  };

  // Helper: Get Days in Month
  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  // Helper: Format Date YYYY-MM-DD
  const formatDateStr = (date: Date) => date.toISOString().split('T')[0];

  const handleDateClick = (day: number) => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
    setShowCreateModal(true);
  };
  
  const handleSlotClick = (dateStr: string, time?: string) => {
      setSelectedDate(dateStr);
      if(time) setFormData(prev => ({ ...prev, time }));
      setShowCreateModal(true);
  };

  const handleAppointmentClick = (app: Appointment, e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedAppointment(app);
  };

  // Helper: Calculate end time
  const calculateEndTime = (startTime: string, durationMinutes: number): string => {
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMinutes = totalMinutes % 60;
    return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate) return;

    setIsSaving(true);
    try {
      const attendeesInput = (document.querySelector('[name="attendees"]') as HTMLInputElement)?.value || '';
      const attendeesArray = attendeesInput.split(',').map(a => a.trim()).filter(Boolean);

      await api.createAppointment({
        title: formData.title,
        description: formData.description,
        date: selectedDate,
        time: formData.time,
        duration: formData.duration,
        type: formData.type as 'demo' | 'meeting' | 'support' | 'followup',
        attendees: attendeesArray,
        contact_id: selectedContactId || undefined
      });

      toast.success('Agendamento criado com sucesso!');
      setShowCreateModal(false);
      setFormData({ title: '', time: '09:00', type: 'demo', description: '', duration: 60 });
      setSelectedDate(null);
      setSelectedContactId(null);
    } catch (error) {
      console.error('Error creating appointment:', error);
      toast.error('Erro ao criar agendamento');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este agendamento?')) {
      return;
    }

    try {
      await api.deleteAppointment(id);
      toast.success('Agendamento excluído com sucesso!');
      setSelectedAppointment(null);
    } catch (error) {
      console.error('Error deleting appointment:', error);
      toast.error('Erro ao excluir agendamento');
    }
  };

  const handleEditClick = (appointment: Appointment) => {
    setEditFormData({
      title: appointment.title,
      date: appointment.date,
      time: appointment.time,
      type: appointment.type,
      description: appointment.description || '',
      duration: appointment.duration,
      attendees: appointment.attendees?.join(', ') || ''
    });
    setEditContactId(appointment.contact_id || null);
    setShowEditModal(true);
    setSelectedAppointment(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointment) return;

    setIsSaving(true);
    try {
      const attendeesArray = editFormData.attendees
        .split(',')
        .map(a => a.trim())
        .filter(Boolean);

      await api.updateAppointment(selectedAppointment.id, {
        title: editFormData.title,
        date: editFormData.date,
        time: editFormData.time,
        type: editFormData.type as 'demo' | 'meeting' | 'support' | 'followup',
        description: editFormData.description,
        duration: editFormData.duration,
        attendees: attendeesArray,
        contact_id: editContactId || undefined
      });

      toast.success('Agendamento atualizado com sucesso!');
      setShowEditModal(false);
      setSelectedAppointment(null);
    } catch (error) {
      console.error('Error updating appointment:', error);
      toast.error('Erro ao atualizar agendamento');
    } finally {
      setIsSaving(false);
    }
  };

  const getEventTypeColor = (type: string) => {
    switch (type) {
        case 'demo': return 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20';
        case 'meeting': return 'bg-secondary text-secondary-foreground border-border hover:bg-accent';
        case 'support': return 'bg-secondary text-foreground border-border hover:bg-accent';
        case 'followup': return 'bg-muted text-muted-foreground border-border hover:bg-accent';
        default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  // --- RENDERERS ---

  const renderMonthView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const days = daysInMonth(year, month);
    const firstDay = firstDayOfMonth(year, month);

    return (
        <div className="grid grid-cols-7 flex-1 auto-rows-fr">
            {Array.from({ length: firstDay }).map((_, index) => (
                <div key={`empty-${index}`} className="border-b border-r border-border/50 bg-muted/40 min-h-[100px]" />
            ))}
            {Array.from({ length: days }).map((_, index) => {
                const day = index + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayAppointments = appointments.filter(a => a.date === dateStr);
                const isToday = formatDateStr(new Date()) === dateStr;

                return (
                    <div 
                        key={day} 
                        onClick={() => handleDateClick(day)}
                        className={`border-b border-r border-border/50 p-2 min-h-[120px] cursor-pointer transition-colors hover:bg-accent/30 group relative ${isToday ? 'bg-primary/5' : ''}`}
                    >
                        <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-2 ${isToday ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground group-hover:text-foreground'}`}>
                            {day}
                        </span>
                        <div className="space-y-1">
                            {dayAppointments.map(app => (
                                <div 
                                    key={app.id} 
                                    className={`text-[10px] px-2 py-1 rounded border truncate font-medium cursor-pointer relative ${getEventTypeColor(app.type)}`}
                                    onClick={(e) => handleAppointmentClick(app, e)}
                                >
                                    {app.metadata?.source === 'nina_ai' && (
                                      <Bot className="w-2.5 h-2.5 inline-block mr-0.5 text-primary" />
                                    )}
                                    <CalendarSyncMark appointment={app} className="mr-0.5 inline-block h-2.5 w-2.5" />
                                    {app.time} - {app.title}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
             {/* Fill remaining cells to keep grid structure */}
             {Array.from({ length: 42 - (days + firstDay) }).map((_, index) => (
                <div key={`remaining-${index}`} className="border-b border-r border-border/50 bg-muted/40" />
            ))}
        </div>
    );
  };

  const renderWeekView = () => {
    const startOfWeek = getStartOfWeek(currentDate);
    const weekDays = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(startOfWeek);
        d.setDate(d.getDate() + i);
        return d;
    });
    const hours = Array.from({ length: 14 }).map((_, i) => i + 6); // 06:00 to 19:00

    return (
        <div className="flex flex-col flex-1 overflow-y-auto custom-scrollbar bg-card">
            {/* Header Row */}
            <div className="grid grid-cols-8 border-b border-border sticky top-0 bg-card z-10">
                <div className="p-4 text-xs font-medium text-muted-foreground border-r border-border">GMT-3</div>
                {weekDays.map((day, i) => {
                     const isToday = formatDateStr(new Date()) === formatDateStr(day);
                     return (
                        <div key={i} className={`p-2 text-center border-r border-border/50 ${isToday ? 'bg-primary/10' : ''}`}>
                            <div className={`text-xs uppercase font-semibold ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                                {day.toLocaleDateString('pt-BR', { weekday: 'short' })}
                            </div>
                            <div className={`text-xl font-semibold ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                                {day.getDate()}
                            </div>
                        </div>
                     )
                })}
            </div>
            
            {/* Time Grid */}
            <div className="flex-1">
                {hours.map(hour => {
                    const timeStr = `${String(hour).padStart(2, '0')}:00`;
                    return (
                        <div key={hour} className="grid grid-cols-8 min-h-[80px]">
                            {/* Time Column */}
                            <div className="border-r border-b border-border/50 p-2 text-xs text-muted-foreground text-right sticky left-0 bg-card">
                                {timeStr}
                            </div>
                            {/* Days Columns */}
                            {weekDays.map((day, i) => {
                                const dateStr = formatDateStr(day);
                                const isToday = formatDateStr(new Date()) === dateStr;
                                const apps = appointments.filter(a => {
                                    const appHour = parseInt(a.time.split(':')[0]);
                                    return a.date === dateStr && appHour === hour;
                                });

                                return (
                                    <div 
                                        key={i} 
                                        onClick={() => handleSlotClick(dateStr, timeStr)}
                                        className={`border-r border-b border-border/50 relative p-1 transition-colors hover:bg-accent/20 group cursor-pointer ${isToday ? 'bg-primary/5' : ''}`}
                                    >
                                        {/* Add Button on Hover */}
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                                            <Plus className="w-4 h-4 text-muted-foreground" />
                                        </div>

                                        {apps.map(app => (
                                            <div 
                                                key={app.id} 
                                                className={`mb-1 p-2 rounded text-xs border cursor-pointer hover:brightness-110 relative z-10 shadow-sm ${getEventTypeColor(app.type)}`}
                                                onClick={(e) => handleAppointmentClick(app, e)} 
                                                style={{ minHeight: `${Math.max(40, (app.duration / 60) * 80)}px` }}
                                            >
                                                <div className="font-semibold truncate flex items-center gap-1">
                                                    {app.metadata?.source === 'nina_ai' && (
                                                      <Bot className="w-3 h-3 text-primary flex-shrink-0" />
                                                    )}
                                                    <CalendarSyncMark appointment={app} className="h-3 w-3" />
                                                    {app.title}
                                                </div>
                                                <div className="text-[10px]">{app.time} - {calculateEndTime(app.time, app.duration)}</div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    )
                })}
            </div>
        </div>
    );
  };

  const renderDayView = () => {
    const hours = Array.from({ length: 14 }).map((_, i) => i + 6); // 06:00 to 19:00
    const dateStr = formatDateStr(currentDate);

    return (
        <div className="flex flex-col flex-1 overflow-y-auto custom-scrollbar bg-card">
             <div className="p-4 border-b border-border bg-card sticky top-0 z-10">
                <h3 className="text-xl font-semibold text-foreground capitalize">{currentDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
             </div>
             
             <div className="flex-1 p-4">
                 {hours.map(hour => {
                    const timeStr = `${String(hour).padStart(2, '0')}:00`;
                    const apps = appointments.filter(a => {
                        const appHour = parseInt(a.time.split(':')[0]);
                        return a.date === dateStr && appHour === hour;
                    });

                    return (
                        <div key={hour} className="flex border-b border-border/50 min-h-[100px] group hover:bg-accent/30 transition-colors">
                            <div className="w-20 py-4 pr-6 text-right text-sm font-medium text-muted-foreground border-r border-border/50">
                                {timeStr}
                            </div>
                            <div 
                                className="flex-1 p-2 relative cursor-pointer"
                                onClick={() => handleSlotClick(dateStr, timeStr)}
                            >
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-10 pointer-events-none">
                                    <Plus className="w-6 h-6 text-muted-foreground" />
                                </div>
                                {apps.map(app => (
                                    <div 
                                        key={app.id} 
                                        className={`mb-2 p-3 rounded-lg border flex justify-between items-center shadow-md relative z-10 cursor-pointer hover:brightness-110 ${getEventTypeColor(app.type)}`}
                                        onClick={(e) => handleAppointmentClick(app, e)}
                                        style={{ minHeight: `${Math.max(60, (app.duration / 60) * 100)}px` }}
                                    >
                                        <div>
                                            <div className="font-semibold text-sm flex items-center gap-1.5">
                                                {app.metadata?.source === 'nina_ai' && (
                                                  <Bot className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                                )}
                                                <CalendarSyncMark appointment={app} className="h-3.5 w-3.5" />
                                                {app.title}
                                            </div>
                                            <div className="text-xs mt-1">{app.description || 'Sem descrição'}</div>
                                        </div>
                                        <div className="text-right">
                                             <div className="font-mono text-sm">{app.time} - {calculateEndTime(app.time, app.duration)}</div>
                                             <div className="via-eyebrow mt-1">{app.type} • {app.duration}min</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                 })}
             </div>
        </div>
    );
  };

  return (
    <div className="scheduling-page">
      {/* Header */}
      <header className="scheduling-header">
        <div>
           <p className="via-eyebrow">Calendário comercial</p>
           <h1>Agendamentos.</h1>
           <p>Gerencie demos, reuniões e suporte técnico.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full xl:w-auto">
            {/* View Switcher */}
            <div className="flex bg-card p-1 rounded-lg border border-border">
                <button 
                    onClick={() => setViewMode('month')} 
                    className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all ${viewMode === 'month' ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    <LayoutGrid className="w-3.5 h-3.5" /> Mês
                </button>
                <button 
                    onClick={() => setViewMode('week')} 
                    className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all ${viewMode === 'week' ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    <Columns className="w-3.5 h-3.5" /> Semana
                </button>
                <button 
                    onClick={() => setViewMode('day')} 
                    className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all ${viewMode === 'day' ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    <List className="w-3.5 h-3.5" /> Dia
                </button>
            </div>

            {/* Date Nav */}
            <div className="flex items-center bg-card border border-border rounded-lg p-1">
                <button
                    onClick={() => navigateDate(-1)}
                    aria-label="Período anterior"
                    className="p-2 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex flex-col items-center justify-center w-48 px-2 cursor-pointer" onClick={goToToday} title="Ir para hoje">
                    <span className="text-sm font-semibold text-foreground capitalize">
                        {viewMode === 'month' ? getMonthLabel() : viewMode === 'week' ? getWeekLabel() : getDayLabel()}
                    </span>
                    {viewMode === 'week' && <span className="text-[10px] text-muted-foreground">{currentDate.getFullYear()}</span>}
                </div>
                <button
                    onClick={() => navigateDate(1)}
                    aria-label="Próximo período"
                    className="p-2 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>

            <Button
              variant="secondary"
              onClick={() => navigate('/settings?tab=calendar')}
              className="gap-2"
            >
                <CalendarCheck2 className="w-4 h-4" />
                Agenda externa
            </Button>

            <Button onClick={() => { setSelectedDate(new Date().toISOString().split('T')[0]); setShowCreateModal(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                Agendar
            </Button>
        </div>
      </header>

      {/* Main Calendar Area */}
      <div className="scheduling-calendar">
        {loading ? (
             <div className="flex-1 flex items-center justify-center">
                 <Loader2 className="w-8 h-8 animate-spin text-primary" />
             </div>
        ) : (
            <>
                {viewMode === 'month' && (
                    <>
                        <div className="grid grid-cols-7 border-b border-border bg-card">
                            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                                <div key={day} className="py-3 text-center via-eyebrow text-muted-foreground">
                                    {day}
                                </div>
                            ))}
                        </div>
                        {renderMonthView()}
                    </>
                )}
                {viewMode === 'week' && renderWeekView()}
                {viewMode === 'day' && renderDayView()}
            </>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="via-dialog-overlay fixed inset-0 z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div
              className="via-dialog-content relative max-w-md w-full max-h-[calc(100svh-2rem)] overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-appointment-title"
            >
                <div className="p-6 border-b border-border flex justify-between items-center">
                    <div>
                      <p className="via-eyebrow mb-2">Calendário comercial</p>
                      <h3 id="create-appointment-title" className="via-dialog-title">Novo agendamento</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      aria-label="Fechar novo agendamento"
                      className="via-dialog-close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
                    <div className="space-y-2">
                         <p className="via-eyebrow">Data selecionada</p>
                         <div className="flex items-center gap-2 text-foreground font-medium bg-secondary p-3 rounded-lg border border-border">
                            <CalendarIcon className="w-4 h-4 text-primary" />
                            {selectedDate?.split('-').reverse().join('/')}
                         </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                             <label htmlFor="create-appointment-time" className="via-eyebrow">Horário</label>
                             <div className="relative">
                                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input 
                                    id="create-appointment-time"
                                    type="time" 
                                    className="w-full bg-secondary border border-input rounded-lg pl-10 pr-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none"
                                    value={formData.time}
                                    onChange={e => setFormData({...formData, time: e.target.value})}
                                />
                             </div>
                        </div>
                        <div className="space-y-2">
                             <label htmlFor="create-appointment-duration" className="via-eyebrow">Duração</label>
                             <select 
                                id="create-appointment-duration"
                                className="w-full bg-secondary border border-input rounded-lg px-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none appearance-none"
                                value={formData.duration}
                                onChange={e => setFormData({...formData, duration: parseInt(e.target.value)})}
                             >
                                <option value="15">15 min</option>
                                <option value="30">30 min</option>
                                <option value="45">45 min</option>
                                <option value="60">1 hora</option>
                                <option value="90">1h 30min</option>
                                <option value="120">2 horas</option>
                             </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                         <label htmlFor="create-appointment-type" className="via-eyebrow">Tipo</label>
                         <select 
                            id="create-appointment-type"
                            className="w-full bg-secondary border border-input rounded-lg px-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none appearance-none"
                            value={formData.type}
                            onChange={e => setFormData({...formData, type: e.target.value})}
                         >
                            <option value="demo">Demo</option>
                            <option value="meeting">Reunião</option>
                            <option value="support">Suporte</option>
                            <option value="followup">Follow-up</option>
                         </select>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="create-appointment-name" className="via-eyebrow">Título do evento</label>
                        <input 
                            id="create-appointment-name"
                            required
                            type="text" 
                            className="w-full bg-secondary border border-input rounded-lg p-3 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none placeholder:text-muted-foreground"
                            placeholder="Ex: Apresentação para Cliente X"
                            value={formData.title}
                            onChange={(e) => setFormData({...formData, title: e.target.value})}
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="create-appointment-description" className="via-eyebrow">Descrição</label>
                        <div className="relative">
                            <AlignLeft className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                            <textarea 
                                id="create-appointment-description"
                                className="w-full bg-secondary border border-input rounded-lg pl-10 pr-3 py-3 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none placeholder:text-muted-foreground resize-none h-24"
                                placeholder="Detalhes adicionais..."
                                value={formData.description}
                                onChange={(e) => setFormData({...formData, description: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="create-appointment-contact" className="via-eyebrow">Contato vinculado</label>
                        <div className="relative">
                            <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <select 
                                id="create-appointment-contact"
                                value={selectedContactId || ''}
                                onChange={(e) => setSelectedContactId(e.target.value || null)}
                                className="w-full bg-secondary border border-input rounded-lg pl-10 pr-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none appearance-none"
                            >
                                <option value="">Selecionar contato (opcional)</option>
                                {contacts.map(contact => (
                                    <option key={contact.id} value={contact.id}>
                                        {contact.name || contact.phone} - {contact.phone}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <p className="text-xs text-muted-foreground">Vincule um contato existente ao evento</p>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="create-appointment-attendees" className="via-eyebrow">Participantes adicionais</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input 
                                id="create-appointment-attendees"
                                type="text" 
                                name="attendees"
                                className="w-full bg-secondary border border-input rounded-lg pl-10 pr-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none placeholder:text-muted-foreground"
                                placeholder="Ex: joao@empresa.com, maria@empresa.com"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">Separe os e-mails por vírgula. Eles recebem o convite do Google.</p>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <Button type="button" variant="ghost" onClick={() => setShowCreateModal(false)} className="flex-1 border">Cancelar</Button>
                        <Button type="submit" disabled={isSaving} className="flex-1">
                            {isSaving ? 'Salvando...' : 'Salvar'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Appointment Details Modal */}
      {selectedAppointment && !showEditModal && (
         <div className="via-dialog-overlay fixed inset-0 z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
             <div
               className="via-dialog-content relative max-w-md w-full max-h-[calc(100svh-2rem)] overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
               role="dialog"
               aria-modal="true"
               aria-labelledby="appointment-details-title"
             >
                 {/* Header */}
                 <div className="p-6 border-b border-border">
                     <div>
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-2">
                                <span className={`px-2 py-1 rounded text-[11px] font-medium border ${getEventTypeColor(selectedAppointment.type)}`}>
                                    {selectedAppointment.type}
                                </span>
                                {selectedAppointment.metadata?.source === 'nina_ai' && (
                                    <span className="px-2 py-1 rounded text-[11px] font-medium border bg-primary/10 text-primary border-primary/30 flex items-center gap-1">
                                        <Bot className="w-3 h-3" />
                                        Criado por IA
                                    </span>
                                )}
                                {selectedAppointment.calendar_sync_status === 'synced' && (
                                    <span className="via-meta-chip flex items-center gap-1 text-success">
                                        <CalendarCheck2 className="h-3 w-3" />
                                        Google Calendar
                                    </span>
                                )}
                                {selectedAppointment.calendar_sync_status === 'error' && (
                                    <span className="via-meta-chip flex items-center gap-1 border-destructive/20 bg-destructive/10 text-destructive">
                                        <CircleAlert className="h-3 w-3" />
                                        Falha ao sincronizar
                                    </span>
                                )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedAppointment(null)}
                              aria-label="Fechar detalhes do agendamento"
                              className="via-dialog-close"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <h3 id="appointment-details-title" className="via-dialog-title mb-2">{selectedAppointment.title}</h3>
                         <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                                <Clock className="w-4 h-4 text-primary" />
                                {selectedAppointment.time} - {calculateEndTime(selectedAppointment.time, selectedAppointment.duration)} ({selectedAppointment.duration}min)
                            </div>
                            <div className="flex items-center gap-1.5">
                                <CalendarIcon className="w-4 h-4 text-primary" />
                                {selectedAppointment.date.split('-').reverse().join('/')}
                            </div>
                        </div>
                     </div>
                 </div>

                 {/* Body */}
                 <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
                     {selectedAppointment.description && (
                         <div className="space-y-2">
                             <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Descrição</h4>
                             <p className="text-sm text-muted-foreground leading-relaxed bg-secondary p-3 rounded-lg border border-border">
                                 {selectedAppointment.description}
                             </p>
                         </div>
                     )}

                     {selectedAppointment.contact_id && (
                         <div className="space-y-2">
                             <h4 className="via-eyebrow">Contato vinculado</h4>
                             <div className="flex items-center gap-2 bg-secondary px-3 py-2 rounded-lg border border-border">
                                 <UserCircle className="w-5 h-5 text-primary" />
                                 <div className="flex-1">
                                     <span className="text-sm text-foreground font-medium">
                                         {selectedAppointment.contact?.name || 'Contato'}
                                     </span>
                                     <span className="text-xs text-muted-foreground ml-2">
                                         {selectedAppointment.contact?.phone_number}
                                     </span>
                                 </div>
                             </div>
                         </div>
                     )}

                     <div className="space-y-2">
                         <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Participantes</h4>
                         <div className="flex flex-wrap items-center gap-2">
                             {selectedAppointment.attendees && selectedAppointment.attendees.length > 0 ? (
                                 selectedAppointment.attendees.map((attendee, i) => (
                                     <div key={i} className="flex items-center gap-2 bg-secondary px-3 py-1.5 rounded-full border border-border">
                                         <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[10px] text-primary-foreground font-semibold">
                                             {attendee.charAt(0)}
                                         </div>
                                         <span className="text-xs text-foreground">{attendee}</span>
                                     </div>
                                 ))
                             ) : (
                                 <span className="text-sm text-muted-foreground">Nenhum participante adicional.</span>
                             )}
                         </div>
                     </div>

                     <div className="space-y-3">
                          <div className="flex gap-2">
                              <Button 
                                type="button"
                                variant="outline"
                                onClick={() => handleDeleteAppointment(selectedAppointment.id)}
                                className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
                              >
                                  Excluir
                              </Button>
                              <Button 
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  handleEditClick(selectedAppointment);
                                }}
                                className="flex-1"
                              >
                                  <Pencil className="w-4 h-4 mr-1" />
                                  Editar
                              </Button>
                          </div>
                          
                          <Button 
                             className="w-full py-3"
                             size="lg"
                             onClick={() => {
                                 if (selectedAppointment.meeting_url) {
                                   window.open(selectedAppointment.meeting_url, '_blank', 'noopener,noreferrer');
                                 } else {
                                   navigate(`/meeting/${selectedAppointment.id}`);
                                 }
                             }}
                          >
                              <Video className="w-5 h-5 mr-2" />
                              {selectedAppointment.meeting_url ? 'Entrar no Google Meet' : 'Entrar na sala de reunião'}
                              {selectedAppointment.meeting_url && <ExternalLink className="h-4 w-4" />}
                          </Button>
                          <p className="text-center text-xs text-muted-foreground">
                              A sala estará disponível 5 minutos antes do horário.
                          </p>
                      </div>
                 </div>
             </div>
         </div>
      )}

      {/* Edit Appointment Modal */}
      {showEditModal && selectedAppointment && (
        <div className="via-dialog-overlay fixed inset-0 z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="via-dialog-content relative max-w-lg w-full max-h-[calc(100svh-2rem)] overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-appointment-title"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <p className="via-eyebrow mb-2">Calendário comercial</p>
                <h2 id="edit-appointment-title" className="via-dialog-title">Editar agendamento</h2>
              </div>
              <button 
                type="button"
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedAppointment(null);
                }}
                aria-label="Fechar edição do agendamento"
                className="via-dialog-close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleEditSubmit} className="p-6 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="edit-appointment-date" className="via-eyebrow">Data</label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input 
                      id="edit-appointment-date"
                      type="date" 
                      required
                      className="w-full bg-secondary border border-input rounded-lg pl-10 pr-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none"
                      value={editFormData.date}
                      onChange={e => setEditFormData({...editFormData, date: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="edit-appointment-time" className="via-eyebrow">Horário</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input 
                      id="edit-appointment-time"
                      type="time" 
                      className="w-full bg-secondary border border-input rounded-lg pl-10 pr-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none"
                      value={editFormData.time}
                      onChange={e => setEditFormData({...editFormData, time: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="edit-appointment-duration" className="via-eyebrow">Duração</label>
                  <select 
                    id="edit-appointment-duration"
                    className="w-full bg-secondary border border-input rounded-lg px-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none appearance-none"
                    value={editFormData.duration}
                    onChange={e => setEditFormData({...editFormData, duration: parseInt(e.target.value)})}
                  >
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">1 hora</option>
                    <option value="90">1h 30min</option>
                    <option value="120">2 horas</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="edit-appointment-type" className="via-eyebrow">Tipo</label>
                  <select 
                    id="edit-appointment-type"
                    className="w-full bg-secondary border border-input rounded-lg px-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none appearance-none"
                    value={editFormData.type}
                    onChange={e => setEditFormData({...editFormData, type: e.target.value})}
                  >
                    <option value="demo">Demo</option>
                    <option value="meeting">Reunião</option>
                    <option value="support">Suporte</option>
                    <option value="followup">Follow-up</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="edit-appointment-name" className="via-eyebrow">Título do evento</label>
                <input 
                  id="edit-appointment-name"
                  required
                  type="text" 
                  className="w-full bg-secondary border border-input rounded-lg p-3 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none placeholder:text-muted-foreground"
                  placeholder="Ex: Apresentação para Cliente X"
                  value={editFormData.title}
                  onChange={(e) => setEditFormData({...editFormData, title: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="edit-appointment-description" className="via-eyebrow">Descrição</label>
                <div className="relative">
                  <AlignLeft className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <textarea 
                    id="edit-appointment-description"
                    className="w-full bg-secondary border border-input rounded-lg pl-10 pr-3 py-3 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none placeholder:text-muted-foreground resize-none h-24"
                    placeholder="Detalhes adicionais..."
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({...editFormData, description: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="edit-appointment-contact" className="via-eyebrow">Contato vinculado</label>
                <div className="relative">
                  <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <select 
                    id="edit-appointment-contact"
                    value={editContactId || ''}
                    onChange={(e) => setEditContactId(e.target.value || null)}
                    className="w-full bg-secondary border border-input rounded-lg pl-10 pr-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none appearance-none"
                  >
                    <option value="">Selecionar contato (opcional)</option>
                    {contacts.map(contact => (
                      <option key={contact.id} value={contact.id}>
                        {contact.name || contact.phone} - {contact.phone}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="edit-appointment-attendees" className="via-eyebrow">Participantes adicionais</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input 
                    id="edit-appointment-attendees"
                    type="text" 
                    className="w-full bg-secondary border border-input rounded-lg pl-10 pr-3 py-2.5 text-sm text-foreground focus:ring-1 focus:ring-ring outline-none placeholder:text-muted-foreground"
                    placeholder="Ex: joao@empresa.com, maria@empresa.com"
                    value={editFormData.attendees}
                    onChange={(e) => setEditFormData({...editFormData, attendees: e.target.value})}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Separe os e-mails por vírgula. Eles recebem o convite do Google.</p>
              </div>

              <div className="pt-4 flex gap-3">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedAppointment(null);
                  }} 
                  className="flex-1 border"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSaving} className="flex-1">
                  {isSaving ? 'Salvando...' : 'Salvar alterações'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Scheduling;
