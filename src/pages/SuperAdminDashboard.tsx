import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, query, getDocs, doc, getDoc, where, Timestamp, orderBy, onSnapshot } from 'firebase/firestore';
import { db, functions } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';
import { Loader2, Building2, ExternalLink, ArrowLeft, Zap, FileText, MessageSquare, Send, DollarSign, CreditCard, AlertTriangle, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { getCurrencyForCountry, getCurrencySymbol, convertToAUD } from '../utils/currency';
import { Dashboard } from './Dashboard';
import { useToast } from '../components/Toast';
import { httpsCallable } from 'firebase/functions';

interface Agency {
  id: string;
  name: string;
  ownerId: string;
  members: string[];
  billingType: 'stripe' | 'internal';
  subscriptionStatus?: 'active' | 'trial' | 'past_due' | 'canceled' | 'unpaid';
  trialEndsAt?: Date;
  stripeCustomerId?: string;
  country?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface AgencyWithOwner extends Agency {
  ownerEmail: string | null;
  siteCount: number;
}

export const SuperAdminDashboard: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { agencyId } = useParams<{ agencyId: string }>();
  const [agencies, setAgencies] = useState<AgencyWithOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalAgencies: 0, totalSites: 0 });
  const { showToast } = useToast();
  const [runningScheduler, setRunningScheduler] = useState(false);
  const [runningDraftGenerator, setRunningDraftGenerator] = useState(false);
  const [activeTab, setActiveTab] = useState<'agencies' | 'support' | 'billing'>('agencies');
  
  // Support state
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'replied' | 'closed'>('open');
  
  // Billing state
  const [billingFilterStatus, setBillingFilterStatus] = useState<'all' | 'active' | 'trial' | 'past_due' | 'canceled'>('all');

  // Check if user is super admin (by email domain)
  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) {
      console.log('[SuperAdminDashboard] Auth still loading, waiting...');
      return;
    }

    if (!user) {
      console.log('[SuperAdminDashboard] No user found, redirecting to dashboard');
      navigate('/dashboard');
      return;
    }

    // Get email from user object
    const userEmail = user.email?.toLowerCase().trim();
    
    if (!userEmail) {
      console.log('[SuperAdminDashboard] User found but no email property:', {
        user,
        email: user.email,
        providerData: (user as any).providerData,
      });
      navigate('/dashboard');
      return;
    }

    console.log('[SuperAdminDashboard] Checking access for email:', userEmail);
    
    const isAdmin = userEmail.endsWith('@spotonwebsites.com.au') || userEmail.endsWith('@myapex.io');
    console.log('[SuperAdminDashboard] Is admin?', isAdmin, {
      email: userEmail,
      endsWithSpoton: userEmail.endsWith('@spotonwebsites.com.au'),
      endsWithMyapex: userEmail.endsWith('@myapex.io'),
    });

    if (!isAdmin) {
      console.log('[SuperAdminDashboard] ❌ Access denied - not a super admin email:', userEmail);
      navigate('/dashboard');
      return;
    }

    console.log('[SuperAdminDashboard] ✅ Access granted for:', userEmail);
  }, [user, authLoading, navigate]);

  // Load all agencies
  useEffect(() => {
    if (!user) return;

    const loadAgencies = async () => {
      setLoading(true);
      try {
        const agenciesRef = collection(db, 'agencies');
        const agenciesSnapshot = await getDocs(agenciesRef);

        const agenciesData: AgencyWithOwner[] = [];
        let totalSites = 0;

        // Fetch owner emails and site counts for each agency
        for (const agencyDoc of agenciesSnapshot.docs) {
          const agencyData = agencyDoc.data() as Agency;
          const agency: AgencyWithOwner = {
            id: agencyDoc.id,
            name: agencyData.name || 'Unnamed Agency',
            ownerId: agencyData.ownerId || '',
            members: agencyData.members || [],
            billingType: agencyData.billingType || 'stripe',
            subscriptionStatus: agencyData.subscriptionStatus,
            trialEndsAt: agencyData.trialEndsAt instanceof Timestamp ? agencyData.trialEndsAt.toDate() : (agencyData.trialEndsAt as Date | undefined),
            stripeCustomerId: agencyData.stripeCustomerId,
            country: agencyData.country,
            createdAt: agencyData.createdAt instanceof Timestamp ? agencyData.createdAt.toDate() : (agencyData.createdAt as Date | undefined),
            updatedAt: agencyData.updatedAt instanceof Timestamp ? agencyData.updatedAt.toDate() : (agencyData.updatedAt as Date | undefined),
            ownerEmail: null,
            siteCount: 0,
          };

          // Fetch owner email
          if (agency.ownerId) {
            try {
              const ownerRef = doc(db, 'users', agency.ownerId);
              const ownerDoc = await getDoc(ownerRef);
              if (ownerDoc.exists()) {
                agency.ownerEmail = ownerDoc.data().email || null;
              }
            } catch (error) {
              console.error(`Error fetching owner for agency ${agency.id}:`, error);
            }
          }

          // Count sites for this agency
          try {
            const sitesRef = collection(db, 'sites');
            const sitesQuery = query(sitesRef, where('agencyId', '==', agency.id));
            const sitesSnapshot = await getDocs(sitesQuery);
            agency.siteCount = sitesSnapshot.size;
            totalSites += sitesSnapshot.size;
          } catch (error) {
            console.error(`Error counting sites for agency ${agency.id}:`, error);
          }

          agenciesData.push(agency);
        }

        // Sort by created date (newest first)
        agenciesData.sort((a, b) => {
          const dateA = a.createdAt?.getTime() || 0;
          const dateB = b.createdAt?.getTime() || 0;
          return dateB - dateA;
        });

        setAgencies(agenciesData);
        setStats({
          totalAgencies: agenciesData.length,
          totalSites,
        });
      } catch (error) {
        console.error('[SuperAdminDashboard] Error loading agencies:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAgencies();
  }, [user]);

  // Load tickets for support tab
  useEffect(() => {
    if (activeTab !== 'support') return;

    const ticketsRef = collection(db, 'tickets');
    let ticketsQuery = query(ticketsRef, orderBy('updatedAt', 'desc'));

    if (filterStatus !== 'all') {
      ticketsQuery = query(ticketsRef, where('status', '==', filterStatus), orderBy('updatedAt', 'desc'));
    }

    const unsubscribe = onSnapshot(ticketsQuery, (snapshot) => {
      const ticketsData: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        ticketsData.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        });
      });
      setTickets(ticketsData);
    });

    return () => unsubscribe();
  }, [activeTab, filterStatus]);

  // Load messages for selected ticket
  useEffect(() => {
    if (!selectedTicket) {
      setMessages([]);
      return;
    }

    const messagesRef = collection(db, 'tickets', selectedTicket, 'messages');
    const messagesQuery = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const messagesData: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        messagesData.push({
          id: doc.id,
          ...data,
          timestamp: data.timestamp?.toDate() || new Date(),
        });
      });
      setMessages(messagesData);
    });

    return () => unsubscribe();
  }, [selectedTicket]);

  const handleSendMessage = async () => {
    if (!selectedTicket || !newMessage.trim()) return;

    setSending(true);
    try {
      const replyToTicket = httpsCallable(functions, 'replyToTicketCallable');
      await replyToTicket({
        ticketId: selectedTicket,
        message: newMessage.trim(),
        isAdmin: true,
      });

      setNewMessage('');
      showToast('success', 'Reply sent');
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

  // Handler for force running the scheduler
  const handleForceRunScheduler = async () => {
    if (!window.confirm('Force run the scheduled post processor? This will publish all approved posts that are due.')) {
      return;
    }

    setRunningScheduler(true);
    try {
      const forceRunScheduler = httpsCallable(functions, 'forceRunSchedulerCallable');
      const result = await forceRunScheduler({});
      const data = result.data as {
        success: boolean;
        totalFound: number;
        successful: number;
        failed: number;
        message: string;
      };

      if (data.success) {
        showToast(
          'success',
          `✅ Scheduler completed! Found ${data.totalFound} posts. ${data.successful} published successfully, ${data.failed} failed.`
        );
      } else {
        showToast('error', 'Failed to run scheduler');
      }
    } catch (error: any) {
      console.error('Error running scheduler:', error);
      showToast('error', error.message || 'Failed to run scheduler');
    } finally {
      setRunningScheduler(false);
    }
  };

  // Handler for force running the draft generator
  const handleForceRunDraftGenerator = async () => {
    if (!window.confirm('Force run the draft generator? This will generate drafts for all scheduled posts within the next 3 days.')) {
      return;
    }

    setRunningDraftGenerator(true);
    try {
      const forceRunDraftGenerator = httpsCallable(functions, 'forceRunDraftGeneratorCallable');
      const result = await forceRunDraftGenerator({});
      const data = result.data as {
        success: boolean;
        totalFound: number;
        successful: number;
        failed: number;
        message: string;
      };

      if (data.success) {
        showToast(
          'success',
          `✅ Draft generator completed! Found ${data.totalFound} posts. ${data.successful} drafts generated successfully, ${data.failed} failed.`
        );
      } else {
        showToast('error', 'Failed to run draft generator');
      }
    } catch (error: any) {
      console.error('Error running draft generator:', error);
      showToast('error', error.message || 'Failed to run draft generator');
    } finally {
      setRunningDraftGenerator(false);
    }
  };

  // If viewing a specific agency, show their dashboard
  if (agencyId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin')}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-white">Agency Dashboard</h1>
            <p className="text-slate-400 mt-1">Viewing agency: {agencyId}</p>
          </div>
        </div>
        <Dashboard overrideAgencyId={agencyId} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Super Admin Dashboard</h1>
          <p className="text-slate-400 mt-1">
            {activeTab === 'agencies' ? 'Manage all registered agencies' : 
             activeTab === 'support' ? 'Manage support tickets' : 
             'View billing and revenue metrics'}
          </p>
        </div>
        {activeTab === 'agencies' && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleForceRunDraftGenerator}
              disabled={runningDraftGenerator}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              title="Force run the draft generator to create drafts for posts scheduled within the next 3 days"
            >
              {runningDraftGenerator ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  📝 Generate Drafts
                </>
              )}
            </button>
            <button
              onClick={handleForceRunScheduler}
              disabled={runningScheduler}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              title="Force run the scheduled post processor to publish approved posts immediately"
            >
              {runningScheduler ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  ⚡ Force Run Scheduler
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700">
        <button
          onClick={() => setActiveTab('agencies')}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'agencies'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Agencies
        </button>
        <button
          onClick={() => setActiveTab('support')}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'support'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Support
        </button>
        <button
          onClick={() => setActiveTab('billing')}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'billing'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Billing
        </button>
      </div>

      {/* Content */}
      {activeTab === 'agencies' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-2">
                <Building2 className="w-6 h-6 text-blue-400" />
                <h3 className="text-lg font-semibold text-white">Total Agencies</h3>
              </div>
              <p className="text-3xl font-bold text-white">{stats.totalAgencies}</p>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-2">
                <ExternalLink className="w-6 h-6 text-green-400" />
                <h3 className="text-lg font-semibold text-white">Total Sites</h3>
              </div>
              <p className="text-3xl font-bold text-white">{stats.totalSites}</p>
            </div>
          </div>

          {/* Agencies Table */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-900 border-b border-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Agency Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Owner Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Created Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Billing Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Site Count
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Members
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {agencies.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                        No agencies found
                      </td>
                    </tr>
                  ) : (
                    agencies.map((agency) => (
                      <tr key={agency.id} className="hover:bg-slate-750 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-white">{agency.name}</div>
                          <div className="text-xs text-slate-500 font-mono mt-1">{agency.id}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-slate-300">
                            {agency.ownerEmail || 'N/A'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-slate-300">
                            {agency.createdAt
                              ? format(agency.createdAt, 'MMM d, yyyy')
                              : 'N/A'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              agency.billingType === 'internal'
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-blue-500/20 text-blue-400'
                            }`}
                          >
                            {agency.billingType === 'internal' ? 'Internal' : 'Stripe'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-white font-medium">{agency.siteCount}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-slate-300">{agency.members.length}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <button
                            onClick={() => navigate(`/admin/agency/${agency.id}`)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                            View Dashboard
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'support' && (
        <div className="flex gap-6 h-[calc(100vh-300px)]">
          {/* Tickets List */}
          <div className="w-96 bg-slate-800 border border-slate-700 rounded-lg overflow-hidden flex flex-col">
            {/* Filter */}
            <div className="p-4 border-b border-slate-700">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Tickets</option>
                <option value="open">Open</option>
                <option value="replied">Replied</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            {/* Tickets */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {tickets.length === 0 ? (
                <div className="text-center text-slate-400 py-8">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No tickets found</p>
                </div>
              ) : (
                tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    onClick={() => setSelectedTicket(ticket.id)}
                    className={`w-full text-left p-4 rounded-lg border transition-colors ${
                      selectedTicket === ticket.id
                        ? 'bg-slate-700 border-blue-500'
                        : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-medium text-white text-sm flex-1">
                        {ticket.subject}
                      </h3>
                      <span
                        className={`ml-2 px-2 py-0.5 text-xs rounded-full ${getStatusColor(ticket.status)}`}
                      >
                        {ticket.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-1">
                      Agency: {ticket.agencyId?.substring(0, 8)}...
                    </p>
                    <p className="text-xs text-slate-400">
                      {format(ticket.updatedAt, 'MMM d, yyyy')}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Chat Interface */}
          <div className="flex-1 bg-slate-800 border border-slate-700 rounded-lg flex flex-col overflow-hidden">
            {selectedTicket ? (
              <>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.sender === 'admin' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg p-3 ${
                          message.sender === 'admin'
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-700 text-slate-200'
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
                      placeholder="Type your reply..."
                      className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <p>Select a ticket to view and reply</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'billing' && (
        <>
          {/* Calculate billing metrics */}
          {(() => {
            const activeCount = agencies.filter(a => a.subscriptionStatus === 'active').length;
            const trialCount = agencies.filter(a => a.subscriptionStatus === 'trial').length;
            const atRiskCount = agencies.filter(a => a.subscriptionStatus === 'past_due').length;
            
            // Calculate revenue grouped by currency
            const activeAgencies = agencies.filter(a => a.subscriptionStatus === 'active');
            const revenueByCurrency: Record<string, { count: number; amount: number; currency: string; symbol: string }> = {};
            
            activeAgencies.forEach(agency => {
              const currency = getCurrencyForCountry(agency.country);
              const symbol = getCurrencySymbol(agency.country);
              
              if (!revenueByCurrency[currency]) {
                revenueByCurrency[currency] = {
                  count: 0,
                  amount: 0,
                  currency,
                  symbol,
                };
              }
              
              revenueByCurrency[currency].count += 1;
              revenueByCurrency[currency].amount += 99; // Base price is 99 in local currency
            });
            
            // Convert to AUD for total
            let totalRevenueAUD = 0;
            Object.values(revenueByCurrency).forEach(({ amount, currency }) => {
              totalRevenueAUD += convertToAUD(amount, currency);
            });

            // Filter agencies based on billing filter
            const filteredAgencies = billingFilterStatus === 'all'
              ? agencies
              : agencies.filter(a => a.subscriptionStatus === billingFilterStatus);

            return (
              <>
                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <TrendingUp className="w-6 h-6 text-green-400" />
                      <h3 className="text-lg font-semibold text-white">Total Active</h3>
                    </div>
                    <p className="text-3xl font-bold text-white">{activeCount}</p>
                    <p className="text-sm text-slate-400 mt-1">Active subscriptions</p>
                  </div>
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <CreditCard className="w-6 h-6 text-yellow-400" />
                      <h3 className="text-lg font-semibold text-white">Active Trials</h3>
                    </div>
                    <p className="text-3xl font-bold text-white">{trialCount}</p>
                    <p className="text-sm text-slate-400 mt-1">In trial period</p>
                  </div>
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <AlertTriangle className="w-6 h-6 text-red-400" />
                      <h3 className="text-lg font-semibold text-white">At Risk</h3>
                    </div>
                    <p className="text-3xl font-bold text-white">{atRiskCount}</p>
                    <p className="text-sm text-slate-400 mt-1">Past due payments</p>
                  </div>
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <DollarSign className="w-6 h-6 text-blue-400" />
                      <h3 className="text-lg font-semibold text-white">Est. Monthly Revenue</h3>
                    </div>
                    <div className="space-y-2">
                      {/* Currency breakdown */}
                      {Object.values(revenueByCurrency).length > 0 ? (
                        <>
                          <div className="space-y-1.5">
                            {Object.values(revenueByCurrency).map(({ currency, symbol, amount, count }) => (
                              <div key={currency} className="flex items-center justify-between text-sm">
                                <span className="text-slate-300 font-medium">
                                  {symbol}{amount.toLocaleString()} <span className="text-slate-400">{currency}</span>
                                </span>
                                <span className="text-slate-500 text-xs">({count})</span>
                              </div>
                            ))}
                          </div>
                          <div className="pt-3 border-t border-slate-700 mt-3">
                            <p className="text-2xl font-bold text-white">
                              ${Math.round(totalRevenueAUD).toLocaleString()}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">Total Est. Revenue (AUD)</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-3xl font-bold text-white">$0</p>
                          <p className="text-sm text-slate-400 mt-1">No active subscriptions</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Filter */}
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                  <select
                    value={billingFilterStatus}
                    onChange={(e) => setBillingFilterStatus(e.target.value as any)}
                    className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="trial">Trial</option>
                    <option value="past_due">Past Due</option>
                    <option value="canceled">Canceled</option>
                  </select>
                </div>

                {/* Billing Table */}
                <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-900 border-b border-slate-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                            Agency Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                            Trial Ends
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                            Billing Type
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                            Stripe Link
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                        {filteredAgencies.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                              No agencies found
                            </td>
                          </tr>
                        ) : (
                          filteredAgencies.map((agency) => {
                            const getStatusBadge = (status?: string) => {
                              switch (status) {
                                case 'active':
                                  return 'bg-green-500/20 text-green-400';
                                case 'trial':
                                  return 'bg-yellow-500/20 text-yellow-400';
                                case 'past_due':
                                case 'canceled':
                                  return 'bg-red-500/20 text-red-400';
                                default:
                                  return 'bg-gray-500/20 text-gray-400';
                              }
                            };

                            const getStatusLabel = (status?: string) => {
                              switch (status) {
                                case 'active':
                                  return 'Active';
                                case 'trial':
                                  return 'Trial';
                                case 'past_due':
                                  return 'Past Due';
                                case 'canceled':
                                  return 'Canceled';
                                default:
                                  return 'Unknown';
                              }
                            };

                            return (
                              <tr key={agency.id} className="hover:bg-slate-750 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm font-medium text-white">{agency.name}</div>
                                  <div className="text-xs text-slate-500 font-mono mt-1">{agency.id}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span
                                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(agency.subscriptionStatus)}`}
                                  >
                                    {getStatusLabel(agency.subscriptionStatus)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm text-slate-300">
                                    {agency.trialEndsAt
                                      ? format(agency.trialEndsAt, 'MMM d, yyyy')
                                      : 'N/A'}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span
                                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                      agency.billingType === 'internal'
                                        ? 'bg-green-500/20 text-green-400'
                                        : 'bg-blue-500/20 text-blue-400'
                                    }`}
                                  >
                                    {agency.billingType === 'internal' ? 'Internal' : 'Stripe'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  {agency.stripeCustomerId ? (
                                    <a
                                      href={`https://dashboard.stripe.com/customers/${agency.stripeCustomerId}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                                    >
                                      <ExternalLink className="w-4 h-4" />
                                      View in Stripe
                                    </a>
                                  ) : (
                                    <span className="text-sm text-slate-500">N/A</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}
        </>
      )}
    </div>
  );
};
