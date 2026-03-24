import React, { useState, useEffect, useRef } from 'react';
import { doc, updateDoc, getDoc, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { useAgencyContext } from '../contexts/AgencyContext';
import { useToast } from '../components/Toast';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { Loader2, Save, Mail, Users, Briefcase, UserPlus, CreditCard, ImagePlus, Trash2, FileText } from 'lucide-react';

interface UserProfile {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
}

export const AgencyProfilePage: React.FC = () => {
  const { agencyId, agency, loading: agencyLoading } = useAgencyContext();
  const { showToast } = useToast();
  const [agencyName, setAgencyName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, UserProfile>>({});
  // Reports & branding
  const [sendFromEmail, setSendFromEmail] = useState('');
  const [reportDay, setReportDay] = useState<number>(1);
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Load agency name and report settings when agency data is available
  useEffect(() => {
    if (!agencyLoading && agency) {
      setAgencyName(agency.name);
      setSendFromEmail(agency.googleSendFromEmail ?? '');
      const day = agency.monthlyReportDayOfMonth;
      setReportDay(day != null && day >= 1 && day <= 28 ? day : 1);
    }
  }, [agency, agencyLoading]);

  // Fetch member profiles
  useEffect(() => {
    // Wait for agency to finish loading before fetching members
    if (agencyLoading) return;
    
    if (!agencyId || !agency?.members || agency.members.length === 0) {
      setMemberProfiles({});
      return;
    }

    const fetchMemberProfiles = async () => {
      try {
        const profiles: Record<string, UserProfile> = {};
        
        // Fetch user documents for each member
        const userPromises = agency.members.map(async (uid: string) => {
          const userRef = doc(db, 'users', uid);
          const userDoc = await getDoc(userRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            profiles[uid] = {
              uid,
              email: userData.email || null,
              displayName: userData.displayName || null,
              photoURL: userData.photoURL || null,
            };
          } else {
            // Fallback: just store the UID if user doc doesn't exist
            profiles[uid] = {
              uid,
            };
          }
        });

        await Promise.all(userPromises);
        setMemberProfiles(profiles);
      } catch (error) {
        console.error('Error fetching member profiles:', error);
      }
    };

    fetchMemberProfiles();
  }, [agencyId, agency?.members]);

  const handleSaveAgencyName = async () => {
    if (!agencyId || !agencyName.trim()) {
      showToast('error', 'Agency name cannot be empty');
      return;
    }

    setIsSaving(true);
    try {
      const agencyRef = doc(db, 'agencies', agencyId);
      await updateDoc(agencyRef, {
        name: agencyName.trim(),
        updatedAt: new Date(),
      });
      showToast('success', 'Agency name updated successfully');
    } catch (error: any) {
      console.error('Error updating agency name:', error);
      showToast('error', 'Failed to update agency name');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInviteMember = async () => {
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
      showToast('error', 'Please enter a valid email address');
      return;
    }

    setIsInviting(true);
    try {
      const sendInvite = httpsCallable(functions, 'sendTeamInviteCallable');
      const result = await sendInvite({ email: inviteEmail.trim() });
      const data = result.data as { success: boolean; action: string; message: string };

      if (data.success) {
        if (data.action === 'added_immediately') {
          showToast('success', 'User added to agency immediately');
        } else {
          showToast('success', 'Invitation sent successfully');
        }
        setInviteEmail('');
        // The agency data will update automatically via the useAgency hook
      } else {
        showToast('error', data.message || 'Failed to send invitation');
      }
    } catch (error: any) {
      console.error('Error sending invitation:', error);
      showToast('error', error.message || 'Failed to send invitation');
    } finally {
      setIsInviting(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !agencyId) return;
    if (!file.type.startsWith('image/')) {
      showToast('error', 'Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('error', 'Image must be under 5MB');
      return;
    }
    setIsUploadingLogo(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const storageRef = ref(storage, `agencies/${agencyId}/logo.${ext}`);
      await uploadBytes(storageRef, file);
      const logoUrl = await getDownloadURL(storageRef);
      const agencyRef = doc(db, 'agencies', agencyId);
      await updateDoc(agencyRef, { logoUrl, updatedAt: new Date() });
      showToast('success', 'Logo updated');
      if (logoInputRef.current) logoInputRef.current.value = '';
    } catch (err: any) {
      console.error('Logo upload error:', err);
      showToast('error', err.message || 'Failed to upload logo');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!agencyId || !agency?.logoUrl) return;
    setIsUploadingLogo(true);
    try {
      const agencyRef = doc(db, 'agencies', agencyId);
      await updateDoc(agencyRef, { logoUrl: deleteField(), updatedAt: new Date() });
      showToast('success', 'Logo removed');
    } catch (err: any) {
      console.error('Remove logo error:', err);
      showToast('error', 'Failed to remove logo');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleSaveBranding = async () => {
    if (!agencyId) return;
    const day = Math.min(28, Math.max(1, reportDay));
    setIsSavingBranding(true);
    try {
      const agencyRef = doc(db, 'agencies', agencyId);
      await updateDoc(agencyRef, {
        googleSendFromEmail: sendFromEmail.trim() || null,
        googleAccountLinked: !!sendFromEmail.trim(),
        monthlyReportDayOfMonth: day,
        updatedAt: new Date(),
      });
      setReportDay(day);
      showToast('success', 'Report settings saved');
    } catch (err: any) {
      console.error('Save branding error:', err);
      showToast('error', 'Failed to save settings');
    } finally {
      setIsSavingBranding(false);
    }
  };

  const handleManageBilling = async () => {
    if (!agencyId || !agency) {
      showToast('error', 'Agency not found');
      return;
    }

    if (agency.billingType !== 'stripe') {
      showToast('info', 'Billing management is only available for Stripe subscriptions');
      return;
    }

    try {
      const createPortalSession = httpsCallable(functions, 'createPortalSessionCallable');
      const result = await createPortalSession({
        agencyId: agencyId,
        returnUrl: `${window.location.origin}/agency`,
      });
      const data = result.data as { url: string };
      window.location.href = data.url;
    } catch (error: any) {
      console.error('Error creating portal session:', error);
      showToast('error', error.message || 'Failed to open billing portal');
    }
  };

  if (agencyLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!agencyId || !agency) {
    return (
      <div className="min-h-screen bg-slate-900 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 text-center">
            <Briefcase className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">No Agency Found</h2>
            <p className="text-slate-400 mb-6">
              Please initialize your agency in Settings to access this page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const memberCount = agency.members.length;

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Briefcase className="w-8 h-8 text-blue-400" />
              <h1 className="text-3xl font-bold text-white">My Agency</h1>
            </div>
            {agency.billingType === 'stripe' && (
              <button
                onClick={handleManageBilling}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                <span>Manage Billing</span>
              </button>
            )}
          </div>

          {/* Agency Name Editor */}
          <div>
            <label htmlFor="agencyName" className="block text-sm font-medium text-slate-300 mb-2">
              Agency Name
            </label>
            <div className="flex gap-3">
              <input
                id="agencyName"
                type="text"
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter agency name"
              />
              <button
                onClick={handleSaveAgencyName}
                disabled={isSaving || agencyName.trim() === agency.name}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Reports & Branding */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <div className="flex items-center gap-3 mb-6">
            <FileText className="w-6 h-6 text-blue-400" />
            <h2 className="text-2xl font-bold text-white">Reports & Branding</h2>
          </div>

          <div className="space-y-6">
            {/* Logo */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Agency logo</label>
              <div className="flex items-center gap-4">
                {agency.logoUrl ? (
                  <>
                    <img src={agency.logoUrl} alt="Agency logo" className="h-16 w-auto object-contain rounded border border-slate-600" />
                    <div className="flex gap-2">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoUpload}
                        disabled={isUploadingLogo}
                      />
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={isUploadingLogo}
                        className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded-lg flex items-center gap-2"
                      >
                        {isUploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        disabled={isUploadingLogo}
                        className="px-3 py-1.5 bg-red-600/80 hover:bg-red-600 text-white text-sm rounded-lg flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                      disabled={isUploadingLogo}
                    />
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={isUploadingLogo}
                      className="h-16 w-32 border border-dashed border-slate-600 rounded-lg flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-slate-500 hover:text-slate-300"
                    >
                      {isUploadingLogo ? <Loader2 className="w-6 h-6 animate-spin" /> : <ImagePlus className="w-6 h-6" />}
                      <span className="text-xs">Upload logo</span>
                    </button>
                  </>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">Used on monthly client reports. Max 5MB, image files only.</p>
            </div>

            {/* Send-from email */}
            <div>
              <label htmlFor="sendFromEmail" className="block text-sm font-medium text-slate-300 mb-2">
                Send-from email (Reply-To for monthly reports)
              </label>
              <input
                id="sendFromEmail"
                type="email"
                value={sendFromEmail}
                onChange={(e) => setSendFromEmail(e.target.value)}
                placeholder="e.g. reports@youragency.com"
                className="w-full max-w-md px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">Optional. Used as Reply-To and display “From” for monthly report emails.</p>
            </div>

            {/* Monthly report day */}
            <div>
              <label htmlFor="reportDay" className="block text-sm font-medium text-slate-300 mb-2">
                Monthly report day
              </label>
              <select
                id="reportDay"
                value={reportDay}
                onChange={(e) => setReportDay(Number(e.target.value))}
                className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">Day of month (1–28) when client monthly reports are sent.</p>
            </div>

            <button
              onClick={handleSaveBranding}
              disabled={isSavingBranding}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg flex items-center gap-2"
            >
              {isSavingBranding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save report settings
            </button>
          </div>
        </div>

        {/* Team Management Section */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <div className="flex items-center gap-3 mb-6">
            <Users className="w-6 h-6 text-blue-400" />
            <h2 className="text-2xl font-bold text-white">Team Management</h2>
          </div>

          {/* Current Members */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Active Members ({memberCount})
              </h3>
            </div>

            {memberCount === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No members yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {agency.members.map((memberId: string) => {
                  const profile = memberProfiles[memberId];
                  const isOwner = memberId === agency.ownerId;

                  return (
                    <div
                      key={memberId}
                      className="flex items-center justify-between p-4 bg-slate-700/50 border border-slate-600 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {profile?.photoURL ? (
                          <img
                            src={profile.photoURL}
                            alt={profile.displayName || 'Member'}
                            className="w-10 h-10 rounded-full"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                            <Users className="w-5 h-5 text-blue-400" />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">
                              {profile?.displayName || profile?.email || 'Member'}
                            </span>
                            {isOwner && (
                              <span className="px-2 py-0.5 text-xs font-semibold text-purple-300 bg-purple-500/20 rounded">
                                Owner
                              </span>
                            )}
                          </div>
                          {profile?.email && (
                            <span className="text-sm text-slate-400">{profile.email}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-sm text-slate-400 font-mono">
                        {memberId.substring(0, 8)}...
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Invite Form */}
          <div className="pt-6 border-t border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-4">Invite New Member</h3>
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleInviteMember();
                    }
                  }}
                  placeholder="Enter email address"
                  className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={handleInviteMember}
                disabled={isInviting || !inviteEmail.trim()}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {isInviting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Inviting...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Invite Member</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-sm text-slate-400 mt-2">
              {agency.billingType === 'internal' 
                ? 'Internal accounts can invite unlimited members.'
                : 'Invited users will be added immediately if they have an account, or receive an invitation email.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgencyProfilePage;
