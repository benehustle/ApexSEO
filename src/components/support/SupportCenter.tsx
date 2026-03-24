import React, { useState, useEffect } from 'react';
import { X, MessageSquare, Plus, Send, Loader2, AlertCircle } from 'lucide-react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db, functions } from '../../config/firebase';
import { useAgencyContext } from '../../contexts/AgencyContext';
import { useToast } from '../Toast';
import { httpsCallable } from 'firebase/functions';
import { format } from 'date-fns';

interface Ticket {
  id: string;
  agencyId: string;
  subject: string;
  status: 'open' | 'replied' | 'closed';
  createdAt: Date;
  updatedAt: Date;
}

interface Message {
  id: string;
  sender: 'user' | 'admin';
  text: string;
  timestamp: Date;
}

interface SupportCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupportCenter: React.FC<SupportCenterProps> = ({ isOpen, onClose }) => {
  const { agencyId } = useAgencyContext();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'tickets' | 'new'>('tickets');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  
  // New ticket form
  const [newSubject, setNewSubject] = useState('');
  const [newTicketMessage, setNewTicketMessage] = useState('');
  const [creating, setCreating] = useState(false);

  // Load tickets
  useEffect(() => {
    if (!isOpen || !agencyId) {
      setTickets([]);
      return;
    }

    const ticketsRef = collection(db, 'tickets');
    const ticketsQuery = query(
      ticketsRef,
      where('agencyId', '==', agencyId),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(ticketsQuery, (snapshot) => {
      const ticketsData: Ticket[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        ticketsData.push({
          id: doc.id,
          agencyId: data.agencyId,
          subject: data.subject,
          status: data.status,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        });
      });
      setTickets(ticketsData);
    });

    return () => unsubscribe();
  }, [isOpen, agencyId]);

  // Load messages for selected ticket
  useEffect(() => {
    if (!selectedTicket) {
      setMessages([]);
      return;
    }

    const messagesRef = collection(db, 'tickets', selectedTicket, 'messages');
    const messagesQuery = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const messagesData: Message[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        messagesData.push({
          id: doc.id,
          sender: data.sender,
          text: data.text,
          timestamp: data.timestamp?.toDate() || new Date(),
        });
      });
      setMessages(messagesData);
    });

    return () => unsubscribe();
  }, [selectedTicket]);

  const handleCreateTicket = async () => {
    if (!agencyId) {
      showToast('error', 'No agency found');
      return;
    }

    if (!newSubject.trim() || !newTicketMessage.trim()) {
      showToast('error', 'Please fill in all fields');
      return;
    }

    setCreating(true);
    try {
      const createTicket = httpsCallable(functions, 'createTicketCallable');
      const result = await createTicket({
        agencyId,
        subject: newSubject.trim(),
        message: newTicketMessage.trim(),
      });

      const data = result.data as { success: boolean; ticketId: string };
      if (data.success) {
        showToast('success', 'Ticket created successfully');
        setNewSubject('');
        setNewTicketMessage('');
        setActiveTab('tickets');
        setSelectedTicket(data.ticketId);
      }
    } catch (error: any) {
      console.error('Error creating ticket:', error);
      showToast('error', error.message || 'Failed to create ticket');
    } finally {
      setCreating(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedTicket || !newMessage.trim()) return;

    setSending(true);
    try {
      const replyToTicket = httpsCallable(functions, 'replyToTicketCallable');
      await replyToTicket({
        ticketId: selectedTicket,
        message: newMessage.trim(),
        isAdmin: false,
      });

      setNewMessage('');
    } catch (error: any) {
      console.error('Error sending message:', error);
      showToast('error', error.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleCloseTicket = async (ticketId: string) => {
    if (!window.confirm('Are you sure you want to close this ticket?')) return;

    try {
      const closeTicket = httpsCallable(functions, 'closeTicketCallable');
      await closeTicket({ ticketId });
      showToast('success', 'Ticket closed');
    } catch (error: any) {
      console.error('Error closing ticket:', error);
      showToast('error', error.message || 'Failed to close ticket');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-yellow-500/20 text-yellow-400';
      case 'replied':
        return 'bg-blue-500/20 text-blue-400';
      case 'closed':
        return 'bg-gray-500/20 text-gray-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-4xl h-full bg-slate-900 border-l border-slate-700 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-6 h-6 text-blue-400" />
            <h2 className="text-2xl font-bold text-white">Support Center</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => {
              setActiveTab('tickets');
              setSelectedTicket(null);
            }}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'tickets'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            My Tickets
          </button>
          <button
            onClick={() => {
              setActiveTab('new');
              setSelectedTicket(null);
            }}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'new'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            New Ticket
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {activeTab === 'tickets' && (
            <>
              {/* Tickets List */}
              <div className="w-80 border-r border-slate-700 overflow-y-auto">
                {tickets.length === 0 ? (
                  <div className="p-6 text-center text-slate-400">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No tickets yet</p>
                    <p className="text-sm mt-2">Create a new ticket to get started</p>
                  </div>
                ) : (
                  <div className="p-4 space-y-2">
                    {tickets.map((ticket) => (
                      <button
                        key={ticket.id}
                        onClick={() => setSelectedTicket(ticket.id)}
                        className={`w-full text-left p-4 rounded-lg border transition-colors ${
                          selectedTicket === ticket.id
                            ? 'bg-slate-800 border-blue-500'
                            : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-medium text-white text-sm truncate flex-1">
                            {ticket.subject}
                          </h3>
                          <span
                            className={`ml-2 px-2 py-0.5 text-xs rounded-full ${getStatusColor(ticket.status)}`}
                          >
                            {ticket.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          {format(ticket.updatedAt, 'MMM d, yyyy')}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Chat Interface */}
              <div className="flex-1 flex flex-col">
                {selectedTicket ? (
                  <>
                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[70%] rounded-lg p-3 ${
                              message.sender === 'user'
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-800 text-slate-200'
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                            <p className="text-xs mt-1 opacity-70">
                              {format(message.timestamp, 'MMM d, h:mm a')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Input */}
                    <div className="border-t border-slate-700 p-4">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendMessage();
                            }
                          }}
                          placeholder="Type your message..."
                          className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={handleSendMessage}
                          disabled={!newMessage.trim() || sending}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
                        >
                          {sending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                        </button>
                        {tickets.find((t) => t.id === selectedTicket)?.status !== 'closed' && (
                          <button
                            onClick={() => handleCloseTicket(selectedTicket)}
                            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm"
                          >
                            Close
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-slate-400">
                    <div className="text-center">
                      <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p>Select a ticket to view messages</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'new' && (
            <div className="flex-1 overflow-y-auto p-6">
              {!agencyId ? (
                <div className="max-w-2xl mx-auto text-center py-12">
                  <AlertCircle className="w-16 h-16 mx-auto mb-4 text-yellow-400" />
                  <h3 className="text-xl font-semibold text-white mb-2">No Agency Found</h3>
                  <p className="text-slate-400">
                    You need to be part of an agency to create support tickets.
                  </p>
                </div>
              ) : (
                <div className="max-w-2xl mx-auto space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      placeholder="Brief description of your issue..."
                      className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Message
                    </label>
                    <textarea
                      value={newTicketMessage}
                      onChange={(e) => setNewTicketMessage(e.target.value)}
                      placeholder="Describe your issue in detail..."
                      rows={10}
                      className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>

                  <button
                    onClick={handleCreateTicket}
                    disabled={!newSubject.trim() || !newTicketMessage.trim() || creating}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {creating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Create Ticket
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
