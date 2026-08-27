import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { api } from '@/services/api';
import { 
  UIConversation, 
  UIMessage,
  DBMessage,
  DBConversation,
  transformDBToUIMessage,
  transformDBToUIConversation,
  MessageDirection,
  MessageType
} from '@/types';
import { toast } from 'sonner';

export function useConversations() {
  const [conversations, setConversations] = useState<UIConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(true);
  
  // Track processed message IDs to prevent duplicates across re-renders
  const processedMessageIds = useRef(new Set<string>());
  
  // Track conversation IDs being fetched to prevent duplicate fetches
  const fetchingConversationIds = useRef(new Set<string>());
  
  // Polling interval ref for fallback mechanism
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch a single conversation and add it to state
  const fetchAndAddConversation = useCallback(async (conversationId: string) => {
    // Prevent duplicate fetches
    if (fetchingConversationIds.current.has(conversationId)) {
      console.log('[Realtime] Already fetching conversation:', conversationId);
      return;
    }
    
    fetchingConversationIds.current.add(conversationId);
    console.log('[Realtime] 🔍 Fetching new conversation:', conversationId);
    
    try {
      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select(`*, contact:contacts(*)`)
        .eq('id', conversationId)
        .maybeSingle();
      
      if (convError || !convData) {
        console.error('[Realtime] Error fetching conversation:', convError);
        return;
      }
      
      const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('sent_at', { ascending: true });
      
      if (msgError) {
        console.error('[Realtime] Error fetching messages:', msgError);
      }
      
      const uiConversation = transformDBToUIConversation(
        convData as unknown as DBConversation,
        (messages || []) as DBMessage[]
      );
      
      // Add new conversation to state (at top, sorted by recency)
      setConversations(prev => {
        // Check if already added by another event
        if (prev.some(c => c.id === uiConversation.id)) {
          console.log('[Realtime] Conversation already in state, skipping add');
          return prev;
        }
        console.log('[Realtime] ✅ Adding new conversation to state:', uiConversation.id);
        return [uiConversation, ...prev];
      });
      
      // Mark messages as processed
      (messages || []).forEach(m => processedMessageIds.current.add(m.id));
      
    } catch (err) {
      console.error('[Realtime] Error in fetchAndAddConversation:', err);
    } finally {
      fetchingConversationIds.current.delete(conversationId);
    }
  }, []);

  // Initial fetch
  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.fetchConversations();
      
      // Reset processed IDs on fresh fetch and populate with existing messages
      processedMessageIds.current.clear();
      data.forEach(conv => {
        conv.messages.forEach(msg => {
          processedMessageIds.current.add(msg.id);
        });
      });
      
      setConversations(data);
    } catch (err) {
      console.error('[useConversations] Error fetching:', err);
      setError('Erro ao carregar conversas');
      toast.error('Erro ao carregar conversas');
    } finally {
      setLoading(false);
    }
  }, []);

  // Set up real-time subscription
  useEffect(() => {
    fetchConversations();

    console.log('[Realtime] Setting up real-time subscriptions...');

    // Subscribe to new messages
    const messagesChannel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          console.log('[Realtime] 📩 New message received:', payload.new);
          const newMessage = payload.new as DBMessage;
          
          // Early duplicate check using processed IDs set
          if (processedMessageIds.current.has(newMessage.id)) {
            console.log('[Realtime] Message already processed (by ID), skipping:', newMessage.id);
            return;
          }
          
          setConversations(prev => {
            // Check if conversation exists in our state
            const conversationExists = prev.some(c => c.id === newMessage.conversation_id);
            
            if (!conversationExists) {
              // Message from a new conversation - fetch it asynchronously
              console.log('[Realtime] Message from unknown conversation, fetching async...');
              fetchAndAddConversation(newMessage.conversation_id);
              return prev; // Return prev, async fetch will update state
            }

            return prev.map(conv => {
              if (conv.id === newMessage.conversation_id) {
                const uiMessage = transformDBToUIMessage(newMessage);
                
                // Check if message already exists by ID
                const existsById = conv.messages.some(m => m.id === uiMessage.id);
                if (existsById) {
                  console.log('[Realtime] Message already exists by ID in conversation, skipping');
                  return conv;
                }

                // Check if message already exists by whatsapp_message_id (for deduplication)
                if (newMessage.whatsapp_message_id) {
                  const existsByWAId = conv.messages.some(m => 
                    m.whatsappMessageId === newMessage.whatsapp_message_id
                  );
                  if (existsByWAId) {
                    console.log('[Realtime] Message already exists by whatsapp_message_id, skipping');
                    return conv;
                  }
                }

                // Check for temp message with same content and fromType (optimistic update)
                const tempMessageIndex = conv.messages.findIndex(m => 
                  m.id.startsWith('temp-') && 
                  m.content === uiMessage.content &&
                  m.fromType === uiMessage.fromType
                );
                
                if (tempMessageIndex !== -1) {
                  // Replace temp message with real one from database
                  console.log('[Realtime] Replacing temp message with real message');
                  const updatedMessages = [...conv.messages];
                  updatedMessages[tempMessageIndex] = uiMessage;
                  
                  // Track the new real ID
                  processedMessageIds.current.add(uiMessage.id);
                  
                  return {
                    ...conv,
                    messages: updatedMessages,
                    lastMessage: newMessage.content || '',
                    lastMessageTime: 'Agora'
                  };
                }

                // Normal flow for truly new messages (from contacts, Nina, etc)
                console.log('[Realtime] Adding new message:', uiMessage.id);
                
                // Track this message as processed
                processedMessageIds.current.add(uiMessage.id);
                
                return {
                  ...conv,
                  messages: [...conv.messages, uiMessage],
                  lastMessage: newMessage.content || '',
                  lastMessageTime: 'Agora',
                  // Increment unread if it's from user
                  unreadCount: newMessage.from_type === 'user' 
                    ? conv.unreadCount + 1 
                    : conv.unreadCount
                };
              }
              return conv;
            });
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          console.log('[Realtime] Message updated:', payload.new);
          const updatedMessage = payload.new as DBMessage;
          
          setConversations(prev => {
            return prev.map(conv => {
              if (conv.id === updatedMessage.conversation_id) {
                return {
                  ...conv,
                  messages: conv.messages.map(msg => {
                    if (msg.id === updatedMessage.id) {
                      return transformDBToUIMessage(updatedMessage);
                    }
                    return msg;
                  })
                };
              }
              return conv;
            });
          });
        }
      )
      .subscribe((status, err) => {
        console.log('[Realtime] Messages channel status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] ✅ Successfully connected to messages channel');
          setRealtimeConnected(true);
          // Clear polling if realtime reconnects
          if (pollingIntervalRef.current) {
            console.log('[Realtime] Clearing polling fallback - realtime reconnected');
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] ❌ Error connecting to messages channel:', err);
          setRealtimeConnected(false);
          // Start polling fallback
          if (!pollingIntervalRef.current) {
            console.log('[Realtime] 🔄 Starting polling fallback (every 10s)...');
            pollingIntervalRef.current = setInterval(() => {
              console.log('[Realtime] 📡 Polling for updates...');
              fetchConversations();
            }, 10000);
          }
          // Also attempt immediate fetch
          setTimeout(() => fetchConversations(), 2000);
        } else if (status === 'TIMED_OUT') {
          console.warn('[Realtime] ⚠️ Connection timed out');
          setRealtimeConnected(false);
          // Start polling fallback
          if (!pollingIntervalRef.current) {
            console.log('[Realtime] 🔄 Starting polling fallback after timeout...');
            pollingIntervalRef.current = setInterval(() => {
              console.log('[Realtime] 📡 Polling for updates...');
              fetchConversations();
            }, 10000);
          }
          setTimeout(() => fetchConversations(), 3000);
        }
      });

    // Subscribe to conversation changes
    const conversationsChannel = supabase
      .channel('conversations-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations'
        },
        (payload) => {
          console.log('[Realtime] 🆕 New conversation INSERT detected:', payload.new);
          const newConv = payload.new as any;
          
          // Check if already in state
          setConversations(prev => {
            if (prev.some(c => c.id === newConv.id)) {
              console.log('[Realtime] Conversation already in state from INSERT');
              return prev;
            }
            // Not in state - fetch it
            fetchAndAddConversation(newConv.id);
            return prev;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations'
        },
        (payload) => {
          console.log('[Realtime] Conversation UPDATE:', payload.new);
          const updated = payload.new as any;
          setConversations(prev => {
            return prev.map(conv => {
              if (conv.id === updated.id) {
                return {
                  ...conv,
                  status: updated.status,
                  isActive: updated.is_active,
                  assignedTeam: updated.assigned_team
                };
              }
              return conv;
            });
          });
        }
      )
      .subscribe((status, err) => {
        console.log('[Realtime] Conversations channel status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] ✅ Successfully connected to conversations channel');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] ❌ Error connecting to conversations channel:', err);
          // Don't duplicate polling - messages channel handles it
        }
      });

    // Cleanup
    return () => {
      console.log('[Realtime] Cleaning up subscriptions');
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(conversationsChannel);
      // Clear polling interval on cleanup
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [fetchConversations, fetchAndAddConversation]);

  // Send message
  const sendMessage = useCallback(async (conversationId: string, content: string) => {
    if (!content.trim()) return;

    // Optimistic update with temporary ID
    const tempId = `temp-${Date.now()}`;
    const tempMessage: UIMessage = {
      id: tempId,
      content,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      direction: MessageDirection.OUTGOING,
      type: MessageType.TEXT,
      status: 'sent',
      fromType: 'human',
      mediaUrl: null,
      mediaProxyId: null,
      whatsappMessageId: null
    };

    setConversations(prev => {
      return prev.map(conv => {
        if (conv.id === conversationId) {
          return {
            ...conv,
            messages: [...conv.messages, tempMessage],
            lastMessage: content,
            lastMessageTime: 'Agora'
          };
        }
        return conv;
      });
    });

    try {
      // The realtime handler will detect and replace the temp message automatically
      await api.sendMessage(conversationId, content);
    } catch (err) {
      console.error('[useConversations] Error sending message:', err);
      toast.error('Erro ao enviar mensagem');
      
      // Remove optimistic message on error
      setConversations(prev => {
        return prev.map(conv => {
          if (conv.id === conversationId) {
            return {
              ...conv,
              messages: conv.messages.filter(m => m.id !== tempId)
            };
          }
          return conv;
        });
      });
    }
  }, []);

  // Update conversation status
  const updateStatus = useCallback(async (
    conversationId: string, 
    status: 'nina' | 'human' | 'paused'
  ) => {
    try {
      await api.updateConversationStatus(conversationId, status);
      
      setConversations(prev => {
        return prev.map(conv => {
          if (conv.id === conversationId) {
            return { ...conv, status };
          }
          return conv;
        });
      });

      const statusLabels = {
        nina: 'IA ativada',
        human: 'Atendimento humano ativado',
        paused: 'Conversa pausada'
      };
      toast.success(statusLabels[status]);
    } catch (err) {
      console.error('[useConversations] Error updating status:', err);
      toast.error('Erro ao atualizar status');
    }
  }, []);

  // Mark messages as read
  const markAsRead = useCallback(async (conversationId: string) => {
    // Optimistic UI update
    setConversations(prev => {
      return prev.map(conv => {
        if (conv.id === conversationId) {
          return { ...conv, unreadCount: 0 };
        }
        return conv;
      });
    });

    // Persist to database
    try {
      await api.markMessagesAsRead(conversationId);
      console.log('[useConversations] Messages marked as read in database');
    } catch (err) {
      console.error('[useConversations] Error marking messages as read:', err);
      // Don't revert UI on error (better UX)
    }
  }, []);

  // Assign conversation (and sync with deal)
  const assignConversation = useCallback(async (conversationId: string, userId: string | null) => {
    const conv = conversations.find(c => c.id === conversationId);
    if (!conv) return;

    // Optimistic UI update
    setConversations(prev => {
      return prev.map(c => {
        if (c.id === conversationId) {
          return { ...c, assignedUserId: userId };
        }
        return c;
      });
    });

    // Persist to database
    try {
      await api.assignConversation(conversationId, userId, conv.contactId);
      console.log('[useConversations] Conversation and deal assigned');
    } catch (err) {
      console.error('[useConversations] Error assigning conversation:', err);
      // Revert on error
      setConversations(prev => {
        return prev.map(c => {
          if (c.id === conversationId) {
            return { ...c, assignedUserId: conv.assignedUserId };
          }
          return c;
        });
      });
    }
  }, [conversations]);

  return {
    conversations,
    loading,
    error,
    realtimeConnected,
    sendMessage,
    updateStatus,
    markAsRead,
    assignConversation,
    refetch: fetchConversations
  };
}
