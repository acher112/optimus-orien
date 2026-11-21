import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Award, TrendingUp, ShieldCheck, ShieldAlert, CheckCircle2,
  AlertCircle, Search, RefreshCw, X, ChevronRight, Check, Clock,
  MessageSquare, UserPlus, UserCheck, UserX, Globe, Building2,
  BookOpen, HeartHandshake, Eye, EyeOff, Sparkles, SlidersHorizontal,
  FileText, ExternalLink, Shield, Send, Flag, Lock, KeyRound, Copy,
  Trophy, Star
} from 'lucide-react';
import { type User } from '../api';
import { networkApi } from './networkApi';
import {
  MyNetworkProfile,
  PublicNetworkProfile,
  BoardCardItem,
  PodiumItem,
  StudentAchieverItem,
  ConnectionRequestItem,
  ActiveConnectionItem,
  BoardMetadata,
  SchoolNetworkSetting,
  RankDisplayMode,
  AllowRequestsFrom,
  PeerPublicKeyBundle,
  EncryptedMessageItem
} from './networkTypes';
import {
  initializeLocalKeyBundle,
  encryptMessageForPeer,
  decryptMessageFromPeer,
  computeSafetyNumber,
  storeInVault,
  getFromVault
} from './crypto';
import './network.css';

interface NetworkPageProps {
  user: User;
  notify: (msg: string, type?: 'success' | 'error' | 'info') => void;
  activeCampusId?: number | null;
  campuses?: any[];
  onNavigate?: (page: string) => void;
}

export default function NetworkPage({
  user,
  notify,
  activeCampusId,
  campuses = [],
  onNavigate
}: NetworkPageProps) {
  const isMinorOrStudent = user.role === 'student' || user.role === 'parent';
  const isSchoolAdmin = ['organisation_admin', 'school_admin'].includes(user.role);

  // Language & RTL
  const [lang, setLang] = useState<'en' | 'ur'>('en');
  const isUrdu = lang === 'ur';

  // Primary navigation tabs
  // Students and parents ONLY have access to the Student Achievers recognition board and safety guidelines
  const [mainTab, setMainTab] = useState<'boards' | 'requests' | 'connections' | 'profile' | 'safety'>(
    isMinorOrStudent ? 'boards' : 'boards'
  );

  // Boards sub-tab ('principals' | 'teachers' | 'students')
  const [boardType, setBoardType] = useState<'principals' | 'teachers' | 'students'>(
    isMinorOrStudent ? 'students' : 'teachers'
  );

  // Loading & Error States
  const [loading, setLoading] = useState<boolean>(false);
  const [boardLoading, setBoardLoading] = useState<boolean>(false);

  // Metadata
  const [meta, setMeta] = useState<BoardMetadata>({
    periods: [],
    subjects: [],
    grade_levels: [],
    cities: []
  });

  // Filters for Boards
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [mostImprovedOnly, setMostImprovedOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Board Data
  const [podiumItems, setPodiumItems] = useState<PodiumItem[]>([]);
  const [boardItems, setBoardItems] = useState<BoardCardItem[]>([]);
  const [studentItems, setStudentItems] = useState<StudentAchieverItem[]>([]);
  const [boardTotalCount, setBoardTotalCount] = useState<number>(0);

  // Requests Data
  const [requestsSubTab, setRequestsSubTab] = useState<'received' | 'sent'>('received');
  const [receivedRequests, setReceivedRequests] = useState<ConnectionRequestItem[]>([]);
  const [sentRequests, setSentRequests] = useState<ConnectionRequestItem[]>([]);

  // Connections Data
  const [activeConnections, setActiveConnections] = useState<ActiveConnectionItem[]>([]);
  const [suggestedProfiles, setSuggestedProfiles] = useState<PublicNetworkProfile[]>([]);

  // Profile Data
  const [myProfile, setMyProfile] = useState<MyNetworkProfile | null>(null);
  const [profileSaving, setProfileSaving] = useState<boolean>(false);
  const [schoolSettings, setSchoolSettings] = useState<SchoolNetworkSetting | null>(null);

  // Form State for My Profile
  const [headlineInput, setHeadlineInput] = useState<string>('');
  const [bioInput, setBioInput] = useState<string>('');
  const [experienceInput, setExperienceInput] = useState<number>(0);
  const [qualificationsList, setQualificationsList] = useState<string[]>([]);
  const [newQualInput, setNewQualInput] = useState<string>('');
  const [subjectsList, setSubjectsList] = useState<string[]>([]);
  const [newSubjectInput, setNewSubjectInput] = useState<string>('');
  const [interestsList, setInterestsList] = useState<string[]>([]);
  const [newInterestInput, setNewInterestInput] = useState<string>('');

  // Privacy Form State
  const [hasConsent, setHasConsent] = useState<boolean>(false);
  const [rankDisplayMode, setRankDisplayMode] = useState<RankDisplayMode>('exact');
  const [allowRequestsFrom, setAllowRequestsFrom] = useState<AllowRequestsFrom>('anyone_verified');
  const [showSchoolName, setShowSchoolName] = useState<boolean>(true);
  const [showCity, setShowCity] = useState<boolean>(true);
  const [showOnlineStatus, setShowOnlineStatus] = useState<boolean>(false);
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState<boolean>(false);

  // Modals
  const [connectModalTarget, setConnectModalTarget] = useState<{ id: number; name: string; school: string } | null>(null);
  const [connectNote, setConnectNote] = useState<string>('');
  const [sendingConnect, setSendingConnect] = useState<boolean>(false);

  const [activeProfileDrawerId, setActiveProfileDrawerId] = useState<number | null>(null);
  const [drawerProfile, setDrawerProfile] = useState<PublicNetworkProfile | null>(null);
  const [drawerLoading, setDrawerLoading] = useState<boolean>(false);

  const [reportModalTarget, setReportModalTarget] = useState<{ id: number; name: string } | null>(null);
  const [reportCategory, setReportCategory] = useState<string>('unprofessional_conduct');
  const [reportDetails, setReportDetails] = useState<string>('');
  const [submittingReport, setSubmittingReport] = useState<boolean>(false);

  const [showMethodologyModal, setShowMethodologyModal] = useState<boolean>(false);

  // Stage 4: E2EE Chat State
  const [activeChatPeer, setActiveChatPeer] = useState<{ id: number; name: string; school: string; role: string } | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{
    id: number;
    sender_id: number;
    plaintext: string;
    sent_at: string;
    delivered_at: string | null;
    signature_verified: boolean;
    ciphertext: string;
    sender_signature: string;
  }>>([]);
  const [chatInputText, setChatInputText] = useState<string>('');
  const [sendingChatMessage, setSendingChatMessage] = useState<boolean>(false);
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [peerKeyBundle, setPeerKeyBundle] = useState<PeerPublicKeyBundle | null>(null);
  const [keyChangeWarning, setKeyChangeWarning] = useState<boolean>(false);
  const [showSafetyNumberModal, setShowSafetyNumberModal] = useState<boolean>(false);
  const [safetyNumberString, setSafetyNumberString] = useState<string>('');
  const [showRecoveryModal, setShowRecoveryModal] = useState<boolean>(false);
  const [userRecoveryPhrase, setUserRecoveryPhrase] = useState<string>('');
  const [externalLinkConfirm, setExternalLinkConfirm] = useState<string | null>(null);

  // ==========================================
  // Initial Data Fetching
  // ==========================================
  useEffect(() => {
    fetchMetadata();
    if (!isMinorOrStudent) {
      fetchMyProfile();
      if (isSchoolAdmin) {
        fetchSchoolSettings();
      }
    }
  }, [isMinorOrStudent, isSchoolAdmin]);

  const fetchMetadata = async () => {
    try {
      const data = await networkApi.getBoardMetadata();
      setMeta(data);
      if (data.periods && data.periods.length > 0 && !selectedPeriod) {
        setSelectedPeriod(data.periods[0]);
      }
      if (data.subjects && data.subjects.length > 0 && !selectedSubject) {
        setSelectedSubject(data.subjects[0]);
      }
      if (data.grade_levels && data.grade_levels.length > 0 && !selectedGrade) {
        setSelectedGrade(data.grade_levels[0]);
      }
    } catch {
      // Fallback empty metadata
    }
  };

  const fetchMyProfile = async () => {
    try {
      const p = await networkApi.getMyProfile();
      setMyProfile(p);
      setHeadlineInput(p.headline || '');
      setBioInput(p.bio || '');
      setExperienceInput(p.experience_years || 0);
      setQualificationsList(p.qualifications || []);
      setSubjectsList(p.subjects || []);
      setInterestsList(p.interests || []);
      setRankDisplayMode(p.rank_display_mode || 'exact');
      setAllowRequestsFrom(p.allow_requests_from || 'anyone_verified');
      setShowSchoolName(p.show_school_name !== false);
      setShowCity(p.show_city !== false);
      setShowOnlineStatus(p.show_online_status === true);
      setReadReceiptsEnabled(p.read_receipts_enabled === true);

      const consented = (p.consents || []).some(c => c.consent_type === 'board_inclusion');
      setHasConsent(consented);
    } catch {
      // Profile may not exist yet or unconsented
    }
  };

  const fetchSchoolSettings = async () => {
    try {
      const s = await networkApi.getSchoolSettings();
      setSchoolSettings(s);
    } catch {
      // School setting not configured
    }
  };

  // ==========================================
  // Board Fetching
  // ==========================================
  const loadBoardData = useCallback(async () => {
    setBoardLoading(true);
    try {
      if (boardType === 'principals') {
        const res = await networkApi.getPrincipalsBoard({
          period: selectedPeriod,
          city: selectedCity,
          search: searchQuery
        });
        const results = res.results as any;
        if (results && !Array.isArray(results)) {
          setPodiumItems(results.podium || []);
          setBoardItems(results.items || []);
        } else {
          setPodiumItems([]);
          setBoardItems((results as BoardCardItem[]) || []);
        }
        setBoardTotalCount(res.count || 0);
      } else if (boardType === 'teachers') {
        const res = await networkApi.getTeachersBoard({
          period: selectedPeriod,
          subject: selectedSubject,
          grade_level: selectedGrade,
          city: selectedCity,
          most_improved: mostImprovedOnly,
          search: searchQuery
        });
        const results = res.results as any;
        if (results && !Array.isArray(results)) {
          setPodiumItems(results.podium || []);
          setBoardItems(results.items || []);
        } else {
          setPodiumItems([]);
          setBoardItems((results as BoardCardItem[]) || []);
        }
        setBoardTotalCount(res.count || 0);
      } else if (boardType === 'students') {
        const res = await networkApi.getStudentAchieversBoard({
          period: selectedPeriod,
          subject: selectedSubject,
          grade_level: selectedGrade,
          city: selectedCity,
          search: searchQuery
        });
        setStudentItems(res.results || []);
        setPodiumItems([]);
        setBoardTotalCount(res.count || 0);
      }
    } catch {
      notify(isUrdu ? 'لیڈر بورڈ ڈیٹا لوڈ کرنے میں مسئلہ پیش آیا' : 'Failed to load leaderboard data', 'error');
    } finally {
      setBoardLoading(false);
    }
  }, [boardType, selectedPeriod, selectedSubject, selectedGrade, selectedCity, mostImprovedOnly, searchQuery, isUrdu, notify]);

  useEffect(() => {
    if (mainTab === 'boards') {
      loadBoardData();
    }
  }, [mainTab, boardType, selectedPeriod, selectedSubject, selectedGrade, selectedCity, mostImprovedOnly, loadBoardData]);

  // ==========================================
  // Requests & Connections Loading
  // ==========================================
  const loadRequests = useCallback(async () => {
    try {
      const [rec, snt] = await Promise.all([
        networkApi.getReceivedRequests(),
        networkApi.getSentRequests()
      ]);
      setReceivedRequests(rec || []);
      setSentRequests(snt || []);
    } catch {
      // Ignore
    }
  }, []);

  const loadConnections = useCallback(async () => {
    try {
      const [conns, suggs] = await Promise.all([
        networkApi.getConnections(),
        networkApi.getSuggestedConnections()
      ]);
      setActiveConnections(conns || []);
      setSuggestedProfiles(suggs || []);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    if (mainTab === 'requests') {
      loadRequests();
    } else if (mainTab === 'connections') {
      loadConnections();
    }
  }, [mainTab, loadRequests, loadConnections]);

  // ==========================================
  // Action Handlers
  // ==========================================
  const handleOpenConnectModal = (target: { id: number; name: string; school: string }) => {
    if (isMinorOrStudent) {
      notify(isUrdu ? 'طلبہ اور والدین رابطے کی درخواستیں نہیں بھیج سکتے' : 'Students and parents cannot send connection requests', 'error');
      return;
    }
    setConnectModalTarget(target);
    setConnectNote('');
  };

  const handleSendConnectRequest = async () => {
    if (!connectModalTarget) return;
    if (connectNote.length > 200) {
      notify(isUrdu ? 'پیغام زیادہ سے زیادہ 200 حروف پر مشتمل ہو سکتا ہے' : 'Note must be at most 200 characters', 'error');
      return;
    }
    setSendingConnect(true);
    try {
      await networkApi.sendConnectionRequest(connectModalTarget.id, connectNote);
      notify(isUrdu ? 'رابطے کی درخواست کامیابی کے ساتھ ارسال کر دی گئی' : 'Connection request sent successfully', 'success');
      setConnectModalTarget(null);
      // Reload board to update connection button status
      loadBoardData();
    } catch (err: any) {
      notify(err?.message || (isUrdu ? 'درخواست بھیجنے میں ناکامی' : 'Failed to send request'), 'error');
    } finally {
      setSendingConnect(false);
    }
  };

  const handleAcceptRequest = async (reqId: number) => {
    try {
      await networkApi.acceptRequest(reqId);
      notify(isUrdu ? 'رابطہ قبول کر لیا گیا' : 'Connection request accepted', 'success');
      loadRequests();
      loadConnections();
    } catch (err: any) {
      notify(err?.message || 'Error accepting request', 'error');
    }
  };

  const handleDeclineRequest = async (reqId: number) => {
    try {
      await networkApi.declineRequest(reqId);
      notify(isUrdu ? 'درخواست مسترد کر دی گئی' : 'Connection request declined', 'info');
      loadRequests();
    } catch (err: any) {
      notify(err?.message || 'Error declining request', 'error');
    }
  };

  const handleWithdrawRequest = async (reqId: number) => {
    try {
      await networkApi.withdrawRequest(reqId);
      notify(isUrdu ? 'درخواست واپس لے لی گئی' : 'Connection request withdrawn', 'info');
      loadRequests();
    } catch (err: any) {
      notify(err?.message || 'Error withdrawing request', 'error');
    }
  };

  const handleRemoveConnection = async (peerId: number, peerName: string) => {
    if (!window.confirm(isUrdu ? `کیا آپ واقعی ${peerName} کو اپنے رابطوں سے ہٹانا چاہتے ہیں؟` : `Are you sure you want to remove ${peerName} from your connections?`)) {
      return;
    }
    try {
      await networkApi.removeConnection(peerId);
      notify(isUrdu ? 'رابطہ ہٹا دیا گیا' : 'Connection removed', 'info');
      loadConnections();
    } catch (err: any) {
      notify(err?.message || 'Error removing connection', 'error');
    }
  };

  // Open Profile Drawer
  const handleOpenProfileDrawer = async (userId: number) => {
    setActiveProfileDrawerId(userId);
    setDrawerLoading(true);
    try {
      const p = await networkApi.getPublicProfile(userId);
      setDrawerProfile(p);
    } catch (err: any) {
      notify(err?.message || 'Could not load profile', 'error');
      setActiveProfileDrawerId(null);
    } finally {
      setDrawerLoading(false);
    }
  };

  // Profile Save
  const handleSaveProfile = async () => {
    setProfileSaving(true);
    try {
      await networkApi.updateMyProfile({
        headline: headlineInput,
        bio: bioInput,
        experience_years: Number(experienceInput) || 0,
        qualifications: qualificationsList,
        subjects: subjectsList,
        interests: interestsList,
        rank_display_mode: rankDisplayMode,
        allow_requests_from: allowRequestsFrom,
        show_school_name: showSchoolName,
        show_city: showCity,
        show_online_status: showOnlineStatus,
        read_receipts_enabled: readReceiptsEnabled
      });
      notify(isUrdu ? 'پروفائل اور ترجیحات محفوظ کر لی گئیں' : 'Profile & privacy preferences saved successfully', 'success');
      fetchMyProfile();
    } catch (err: any) {
      notify(err?.message || 'Failed to save profile', 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  // Consent Toggle
  const handleToggleConsent = async () => {
    const nextConsent = !hasConsent;
    try {
      if (nextConsent) {
        await networkApi.grantConsent('board_inclusion', '2026.1');
        setHasConsent(true);
        notify(isUrdu ? 'لیڈر بورڈ میں شمولیت کی رضامندی درج ہو گئی' : 'Board inclusion consent granted', 'success');
      } else {
        if (!window.confirm(isUrdu ? 'رضامندی واپس لینے سے آپ کا نام فوری طور پر تمام لیڈر بورڈز اور اسنیپ شاٹس سے خارج کر دیا جائے گا۔ کیا آپ جاری رکھنا چاہتے ہیں؟' : 'Withdrawing consent immediately purges your profile from all published leaderboards and searches. Continue?')) {
          return;
        }
        await networkApi.withdrawConsent('board_inclusion');
        setHasConsent(false);
        notify(isUrdu ? 'رضامندی کامیابی سے واپس لے لی گئی۔ آپ کا ریکارڈ تمام فہرستوں سے ہٹا دیا گیا ہے' : 'Consent withdrawn. Your profile has been purged from all rankings.', 'info');
      }
      fetchMyProfile();
    } catch (err: any) {
      notify(err?.message || 'Error updating consent', 'error');
    }
  };

  // School Admin Settings Save
  const handleToggleSchoolSetting = async (key: 'staff_board_enabled' | 'student_board_enabled', val: boolean) => {
    try {
      await networkApi.updateSchoolSettings({ [key]: val });
      setSchoolSettings(prev => prev ? { ...prev, [key]: val } : null);
      notify(isUrdu ? 'اسکول کی ترتیبات اپ ڈیٹ ہو گئیں' : 'School network settings updated', 'success');
    } catch (err: any) {
      notify(err?.message || 'Failed to update school settings', 'error');
    }
  };

  // Submit Report
  const handleSubmitReport = async () => {
    if (!reportModalTarget) return;
    if (!reportDetails.trim()) {
      notify(isUrdu ? 'براہ کرم تفصیلات درج کریں' : 'Please provide details for the report', 'error');
      return;
    }
    setSubmittingReport(true);
    try {
      await networkApi.fileReport(reportModalTarget.id, reportCategory, reportDetails);
      notify(isUrdu ? 'رپورٹ موصول ہو گئی ہے۔ انتظامیہ مکمل جانچ کرے گی' : 'Report submitted. Platform compliance team will investigate.', 'info');
      setReportModalTarget(null);
      setReportDetails('');
    } catch (err: any) {
      notify(err?.message || 'Failed to submit report', 'error');
    } finally {
      setSubmittingReport(false);
    }
  };

  // ==========================================
  // Stage 4: E2EE Chat Handlers
  // ==========================================
  const handleOpenChatDrawer = async (peerId: number, peerName: string, peerSchool: string, peerRole: string) => {
    if (isMinorOrStudent) {
      notify(isUrdu ? 'طلبہ اور والدین پیغام رسانی کا استعمال نہیں کر سکتے' : 'Students and parents cannot access messaging', 'error');
      return;
    }
    setActiveChatPeer({ id: peerId, name: peerName, school: peerSchool, role: peerRole });
    setChatLoading(true);
    setChatMessages([]);
    setKeyChangeWarning(false);

    try {
      // 1. Ensure local keys exist and are registered
      const bundle = await initializeLocalKeyBundle();
      if (bundle.isNew) {
        await networkApi.uploadKeyBundle({
          identity_key: bundle.identityKeyPubBase64,
          signed_prekey: bundle.signedPrekeyPubBase64,
          prekey_signature: bundle.prekeySignatureBase64,
          one_time_keys: bundle.oneTimeKeysPubBase64,
          device_id: 'browser_primary'
        });
        setUserRecoveryPhrase(bundle.recoveryPhrase);
        setShowRecoveryModal(true);
      }

      // 2. Open or get conversation
      const convRes = await networkApi.openConversation(peerId);
      setActiveConversationId(convRes.conversation_id);

      // 3. Fetch peer's public key bundle
      const pBundle = await networkApi.getPeerKeyBundle(peerId);
      setPeerKeyBundle(pBundle);

      // 4. Key change detection
      const cachedPeerKey = await getFromVault<string>(`peer_id_key_${peerId}`);
      if (cachedPeerKey && cachedPeerKey !== pBundle.identity_key) {
        setKeyChangeWarning(true);
      }
      await storeInVault(`peer_id_key_${peerId}`, pBundle.identity_key);

      // 5. Load and decrypt past messages
      const msgs = await networkApi.getConversationMessages(convRes.conversation_id);
      const decrypted = await Promise.all(
        msgs.map(async m => {
          if (m.sender_id === user.id) {
            return {
              id: m.id,
              sender_id: m.sender_id,
              plaintext: '[Outgoing encrypted message]',
              sent_at: m.sent_at,
              delivered_at: m.delivered_at,
              signature_verified: true,
              ciphertext: m.ciphertext,
              sender_signature: m.sender_signature
            };
          }
          try {
            const res = await decryptMessageFromPeer(
              m.ciphertext,
              m.nonce,
              m.nonce,
              m.sender_signature,
              pBundle.identity_key
            );
            return {
              id: m.id,
              sender_id: m.sender_id,
              plaintext: res.plaintext,
              sent_at: m.sent_at,
              delivered_at: m.delivered_at,
              signature_verified: res.signatureVerified,
              ciphertext: m.ciphertext,
              sender_signature: m.sender_signature
            };
          } catch {
            return {
              id: m.id,
              sender_id: m.sender_id,
              plaintext: '⚠️ Encrypted payload (unrecoverable on this device)',
              sent_at: m.sent_at,
              delivered_at: m.delivered_at,
              signature_verified: false,
              ciphertext: m.ciphertext,
              sender_signature: m.sender_signature
            };
          }
        })
      );
      setChatMessages(decrypted);
    } catch (err: any) {
      notify(err?.message || 'Could not establish encrypted session', 'error');
      setActiveChatPeer(null);
    } finally {
      setChatLoading(false);
    }
  };

  // Adaptive short-polling while chat is open
  useEffect(() => {
    if (!activeConversationId || !peerKeyBundle) return;
    const interval = setInterval(async () => {
      if (typeof document !== 'undefined' && !document.hasFocus()) return;
      try {
        const lastMsg = chatMessages[chatMessages.length - 1];
        const newMsgs = await networkApi.getConversationMessages(
          activeConversationId,
          lastMsg ? lastMsg.sent_at : undefined
        );
        if (newMsgs && newMsgs.length > 0) {
          const fresh = await Promise.all(
            newMsgs.map(async m => {
              if (m.sender_id === user.id) {
                return null;
              }
              try {
                const res = await decryptMessageFromPeer(
                  m.ciphertext,
                  m.nonce,
                  m.nonce,
                  m.sender_signature,
                  peerKeyBundle.identity_key
                );
                return {
                  id: m.id,
                  sender_id: m.sender_id,
                  plaintext: res.plaintext,
                  sent_at: m.sent_at,
                  delivered_at: m.delivered_at,
                  signature_verified: res.signatureVerified,
                  ciphertext: m.ciphertext,
                  sender_signature: m.sender_signature
                };
              } catch {
                return {
                  id: m.id,
                  sender_id: m.sender_id,
                  plaintext: '⚠️ Encrypted payload (unrecoverable)',
                  sent_at: m.sent_at,
                  delivered_at: m.delivered_at,
                  signature_verified: false,
                  ciphertext: m.ciphertext,
                  sender_signature: m.sender_signature
                };
              }
            })
          );
          const valid = fresh.filter(Boolean) as any[];
          if (valid.length > 0) {
            setChatMessages(prev => {
              const existingIds = new Set(prev.map(p => p.id));
              const additions = valid.filter(v => !existingIds.has(v.id));
              return additions.length > 0 ? [...prev, ...additions] : prev;
            });
          }
        }
      } catch {
        // Polling error silently handled
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [activeConversationId, peerKeyBundle, chatMessages, user.id]);

  const handleSendEncryptedMessage = async () => {
    if (!activeConversationId || !peerKeyBundle) return;
    const text = chatInputText.trim();
    if (!text) return;
    if (text.length > 2000) {
      notify(isUrdu ? 'پیغام زیادہ سے زیادہ 2,000 حروف پر مشتمل ہو سکتا ہے' : 'Message exceeds 2,000 characters', 'error');
      return;
    }

    setSendingChatMessage(true);
    try {
      const payload = await encryptMessageForPeer(peerKeyBundle.signed_prekey, text);
      const res = await networkApi.sendEncryptedMessage(activeConversationId, {
        ciphertext: payload.ciphertext,
        nonce: payload.nonce,
        sender_signature: payload.sender_signature
      });
      setChatMessages(prev => [
        ...prev,
        {
          id: res.message_id,
          sender_id: user.id,
          plaintext: text,
          sent_at: res.sent_at,
          delivered_at: null,
          signature_verified: true,
          ciphertext: payload.ciphertext,
          sender_signature: payload.sender_signature
        }
      ]);
      setChatInputText('');
    } catch (err: any) {
      notify(err?.message || 'Failed to dispatch encrypted message', 'error');
    } finally {
      setSendingChatMessage(false);
    }
  };

  const handleOpenSafetyNumber = async () => {
    if (!peerKeyBundle) return;
    try {
      const myIdKey = await getFromVault<string>('identity_pub_base64');
      if (myIdKey && peerKeyBundle.identity_key) {
        const num = await computeSafetyNumber(myIdKey, peerKeyBundle.identity_key);
        setSafetyNumberString(num);
        setShowSafetyNumberModal(true);
      }
    } catch {
      notify('Could not compute safety number', 'error');
    }
  };

  // Helper for positive band styling
  const getBandBadgeClass = (band: string) => {
    const b = (band || '').toLowerCase();
    if (b.includes('outstanding') || b.includes('tier 1')) return 'net-band-outstanding';
    if (b.includes('exemplary') || b.includes('tier 2')) return 'net-band-exemplary';
    if (b.includes('commendation') || b.includes('tier 3')) return 'net-band-commendation';
    return 'net-band-merit';
  };

  return (
    <div className={`network-container ${isUrdu ? 'rtl' : 'ltr'}`}>
      {/* Sleek, Compact Header matching Design Sample */}
      <div className="network-header" style={{ marginBottom: 12, paddingBottom: 12 }}>
        <div className="network-header-copy">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
              {isUrdu ? 'اکیڈمک نیٹ ورک اور اعزازی بورڈز' : 'Academic Network & Recognition'}
            </h1>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              padding: '3px 10px',
              borderRadius: 20,
              fontSize: '0.74rem',
              color: '#475569'
            }}>
              <ShieldCheck size={12} color="#059669" />
              <span>{isUrdu ? 'صرف تصدیق شدہ اسنیپ شاٹس' : 'Verified snapshots only'}</span>
              <button
                type="button"
                className="net-link-btn"
                style={{ fontSize: '0.74rem', fontWeight: 700 }}
                onClick={() => setShowMethodologyModal(true)}
              >
                {isUrdu ? 'طریقہ کار' : 'Methodology →'}
              </button>
            </div>
          </div>
        </div>

        <div className="network-header-actions" style={{ gap: 8 }}>
          <button
            type="button"
            className="net-lang-btn"
            onClick={() => setLang(l => l === 'en' ? 'ur' : 'en')}
            title="Toggle English / Urdu"
          >
            <Globe size={14} />
            <span>{isUrdu ? 'English' : 'اردو'}</span>
          </button>
        </div>
      </div>

      {/* Primary Navigation Tabs directly aligned with the 4 sample screens */}
      <div className="network-tabs-bar" style={{ marginBottom: 16 }}>
        {!isMinorOrStudent && (
          <>
            <button
              className={`net-tab-btn ${mainTab === 'boards' && boardType === 'principals' ? 'active' : ''}`}
              onClick={() => { setMainTab('boards'); setBoardType('principals'); }}
            >
              <Trophy size={16} />
              <span>{isUrdu ? 'عالمی اسکولز رینکنگ' : 'Global School Rankings'}</span>
            </button>

            <button
              className={`net-tab-btn ${mainTab === 'boards' && boardType === 'teachers' ? 'active' : ''}`}
              onClick={() => { setMainTab('boards'); setBoardType('teachers'); }}
            >
              <Users size={16} />
              <span>{isUrdu ? 'نمایاں اساتذہ' : 'Top Performing Educators'}</span>
            </button>
          </>
        )}

        <button
          className={`net-tab-btn ${mainTab === 'boards' && boardType === 'students' ? 'active' : ''}`}
          onClick={() => { setMainTab('boards'); setBoardType('students'); }}
        >
          <Award size={16} />
          <span>{isUrdu ? 'طلبہ کا اعزازی بورڈ' : 'Student Achievers Hub'}</span>
        </button>

        {!isMinorOrStudent && (
          <>
            <button
              className={`net-tab-btn ${mainTab === 'profile' ? 'active' : ''}`}
              onClick={() => setMainTab('profile')}
            >
              <Star size={16} />
              <span>{isUrdu ? 'پروفائل اور بیجز' : 'Badges & Achievements'}</span>
            </button>

            <button
              className={`net-tab-btn ${mainTab === 'requests' ? 'active' : ''}`}
              onClick={() => setMainTab('requests')}
            >
              <UserPlus size={16} />
              <span>{isUrdu ? 'درخواستیں' : 'Requests'}</span>
              {receivedRequests.length > 0 && (
                <span className="net-counter-bubble">{receivedRequests.length}</span>
              )}
            </button>

            <button
              className={`net-tab-btn ${mainTab === 'connections' ? 'active' : ''}`}
              onClick={() => setMainTab('connections')}
            >
              <MessageSquare size={16} />
              <span>{isUrdu ? 'رابطے اور چیٹ' : 'Connections & Chat'}</span>
              {activeConnections.length > 0 && (
                <span className="net-counter-bubble subtle">{activeConnections.length}</span>
              )}
            </button>
          </>
        )}

        <button
          className={`net-tab-btn ${mainTab === 'safety' ? 'active' : ''}`}
          onClick={() => setMainTab('safety')}
        >
          <ShieldCheck size={16} />
          <span>{isUrdu ? 'حفاظت اور اخلاقیات' : 'Safety & Ethics'}</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: RANKED BOARDS */}
      {/* ======================================================== */}
      {mainTab === 'boards' && (
        <div className="network-boards-view">

          {/* Filters Bar */}
          <div className="net-filters-bar">
            {/* Subject Filter (for Teachers & Students) */}
            {(boardType === 'teachers' || boardType === 'students') && (
              <div className="net-filter-group">
                <label>{isUrdu ? 'مضمون' : 'Subject'}</label>
                <select
                  value={selectedSubject}
                  onChange={e => setSelectedSubject(e.target.value)}
                  className="net-select"
                >
                  <option value="">{isUrdu ? 'تمام مضامین' : 'All Subjects'}</option>
                  {meta.subjects.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Grade Level Filter (for Teachers & Students) */}
            {(boardType === 'teachers' || boardType === 'students') && (
              <div className="net-filter-group">
                <label>{isUrdu ? 'کلاس / درجہ' : 'Grade Level'}</label>
                <select
                  value={selectedGrade}
                  onChange={e => setSelectedGrade(e.target.value)}
                  className="net-select"
                >
                  <option value="">{isUrdu ? 'تمام کلاسیں' : 'All Grade Levels'}</option>
                  {meta.grade_levels.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            )}

            {/* City Filter */}
            <div className="net-filter-group">
              <label>{isUrdu ? 'شہر' : 'City'}</label>
              <select
                value={selectedCity}
                onChange={e => setSelectedCity(e.target.value)}
                className="net-select"
              >
                <option value="">{isUrdu ? 'تمام شہر' : 'All Cities'}</option>
                {meta.cities.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Most Improved Toggle (Teachers only) */}
            {boardType === 'teachers' && (
              <div className="net-filter-group net-toggle-group">
                <label className="net-checkbox-label">
                  <input
                    type="checkbox"
                    checked={mostImprovedOnly}
                    onChange={e => setMostImprovedOnly(e.target.checked)}
                  />
                  <span>{isUrdu ? 'نمایاں بہتری (Most Improved)' : 'Most Improved Only'}</span>
                </label>
              </div>
            )}

            {/* Consented Name Search */}
            <div className="net-filter-group net-search-group">
              <label>{isUrdu ? 'نام سے تلاش کریں' : 'Search Consented Name'}</label>
              <div className="net-searchbox">
                <Search size={14} className="net-search-icon" />
                <input
                  type="text"
                  placeholder={isUrdu ? 'صرف رضامند ارکان...' : 'Search consented members...'}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') loadBoardData(); }}
                />
                {searchQuery && (
                  <button type="button" onClick={() => { setSearchQuery(''); loadBoardData(); }}>
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="net-filter-actions">
              <button
                type="button"
                className="net-action-btn primary"
                onClick={loadBoardData}
                disabled={boardLoading}
              >
                <RefreshCw size={14} className={boardLoading ? 'spin' : ''} />
                <span>{isUrdu ? 'تازہ کریں' : 'Refresh'}</span>
              </button>
            </div>
          </div>

          {/* Loading Indicator */}
          {boardLoading ? (
            <div className="net-loading-state">
              <RefreshCw size={28} className="spin" />
              <p>{isUrdu ? 'اسنیپ شاٹ درجہ بندیاں حاصل کی جا رہی ہیں...' : 'Loading verified snapshot rankings...'}</p>
            </div>
          ) : (
            <>
              {/* ======================================================== */}
              {/* 1. PRINCIPALS BOARD (GLOBAL SCHOOL RANKINGS) */}
              {/* ======================================================== */}
              {boardType === 'principals' && (
                <div className="net-sample-hero-card">
                  <div className="net-sample-hero-left">
                    <div className="net-sample-hero-badge">
                      <Trophy size={14} />
                      <span>{isUrdu ? 'عالمی اسکولز رینکنگ' : 'GLOBAL BENCHMARKS'}</span>
                    </div>
                    <h2 className="net-sample-hero-title">
                      {isUrdu ? 'عالمی اسکولز رینکنگ 🏆' : 'Global School Rankings 🏆'}
                    </h2>
                    <p className="net-sample-hero-sub">
                      {isUrdu
                        ? 'تصدیق شدہ امتحانی اسنیپ شاٹس اور اکیڈمک کوالٹی انڈیکس (AQI) کی بنیاد پر تعلیمی اداروں کی درجہ بندی'
                        : 'Observe performance rankings and academic quality indices for verified partner institutions'}
                    </p>
                    <div className="net-sample-hero-pills">
                      <span className="net-sample-pill-top">
                        <Star size={12} /> {isUrdu ? 'اعلیٰ ترین درجہ' : 'Top Rated'}
                      </span>
                      <span className="net-sample-pill-verified">
                        <ShieldCheck size={12} /> {isUrdu ? 'تصدیق شدہ نیٹ ورک' : 'Verified Network'}
                      </span>
                    </div>
                  </div>

                  <div className="net-sample-hero-right">
                    <div className="net-sample-perf-card">
                      <div className="net-sample-perf-title">
                        <Building2 size={14} />
                        <span>{isUrdu ? 'میرے ادارے کی کارکردگی' : "My School's Performance"}</span>
                      </div>
                      <div className="net-sample-rings-row">
                        <div className="net-sample-ring-item">
                          <div className="net-sample-ring teal">94%</div>
                          <label>{isUrdu ? 'حاضری' : 'Attendance'}</label>
                        </div>
                        <div className="net-sample-ring-item">
                          <div className="net-sample-ring amber">88%</div>
                          <label>{isUrdu ? 'کارکردگی' : 'Performance'}</label>
                        </div>
                        <div className="net-sample-ring-item">
                          <div className="net-sample-ring sky">6+</div>
                          <label>{isUrdu ? 'کریڈٹس' : 'Credits / AQI'}</label>
                        </div>
                      </div>
                      <div className="net-sample-stats-row">
                        <div>
                          <label>{isUrdu ? 'رابطے' : 'Connections'}</label>
                          <strong>{activeConnections.length > 0 ? activeConnections.length : 120}</strong>
                        </div>
                        <div>
                          <label>{isUrdu ? 'مضامین' : 'Subjects'}</label>
                          <strong>{meta.subjects.length > 0 ? meta.subjects.length : 8}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Podium View for Top 3 (Principals) */}
              {boardType === 'principals' && podiumItems.length > 0 && (
                <div className="net-podium-section">
                  <div className="net-podium-title">
                    <Sparkles size={16} />
                    <span>{isUrdu ? 'اعزازی پوزیشنز (ٹاپ 3)' : 'Podium of Honor (Top 3)'}</span>
                  </div>
                  <div className="net-podium-grid">
                    {/* Rank 2 (Silver) */}
                    {podiumItems.find(p => p.rank === 2) ? (
                      <div className="net-podium-slot rank-2">
                        <div className="net-podium-badge silver">🥈 2nd</div>
                        <div className="net-podium-avatar">
                          {podiumItems.find(p => p.rank === 2)?.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="net-podium-name">
                          {podiumItems.find(p => p.rank === 2)?.name}
                        </div>
                        <div className="net-podium-school">
                          {podiumItems.find(p => p.rank === 2)?.school_name}
                        </div>
                        <div className="net-podium-score">
                          <span className="net-score-val">{podiumItems.find(p => p.rank === 2)?.score.toFixed(1)}%</span>
                          <span className={`net-band-chip ${getBandBadgeClass(podiumItems.find(p => p.rank === 2)?.positive_band || '')}`}>
                            {podiumItems.find(p => p.rank === 2)?.positive_band}
                          </span>
                        </div>
                        <div className="net-pedestal pedestal-2">
                          <span>#2</span>
                        </div>
                      </div>
                    ) : <div className="net-podium-slot empty" />}

                    {/* Rank 1 (Gold) */}
                    {podiumItems.find(p => p.rank === 1) ? (
                      <div className="net-podium-slot rank-1">
                        <div className="net-podium-badge gold">🥇 1st Place</div>
                        <div className="net-podium-avatar gold-glow">
                          {podiumItems.find(p => p.rank === 1)?.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="net-podium-name">
                          {podiumItems.find(p => p.rank === 1)?.name}
                        </div>
                        <div className="net-podium-school">
                          {podiumItems.find(p => p.rank === 1)?.school_name}
                        </div>
                        <div className="net-podium-score">
                          <span className="net-score-val">{podiumItems.find(p => p.rank === 1)?.score.toFixed(1)}%</span>
                          <span className={`net-band-chip ${getBandBadgeClass(podiumItems.find(p => p.rank === 1)?.positive_band || '')}`}>
                            {podiumItems.find(p => p.rank === 1)?.positive_band}
                          </span>
                        </div>
                        <div className="net-pedestal pedestal-1">
                          <span>#1</span>
                        </div>
                      </div>
                    ) : <div className="net-podium-slot empty" />}

                    {/* Rank 3 (Bronze) */}
                    {podiumItems.find(p => p.rank === 3) ? (
                      <div className="net-podium-slot rank-3">
                        <div className="net-podium-badge bronze">🥉 3rd</div>
                        <div className="net-podium-avatar">
                          {podiumItems.find(p => p.rank === 3)?.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="net-podium-name">
                          {podiumItems.find(p => p.rank === 3)?.name}
                        </div>
                        <div className="net-podium-school">
                          {podiumItems.find(p => p.rank === 3)?.school_name}
                        </div>
                        <div className="net-podium-score">
                          <span className="net-score-val">{podiumItems.find(p => p.rank === 3)?.score.toFixed(1)}%</span>
                          <span className={`net-band-chip ${getBandBadgeClass(podiumItems.find(p => p.rank === 3)?.positive_band || '')}`}>
                            {podiumItems.find(p => p.rank === 3)?.positive_band}
                          </span>
                        </div>
                        <div className="net-pedestal pedestal-3">
                          <span>#3</span>
                        </div>
                      </div>
                    ) : <div className="net-podium-slot empty" />}
                  </div>
                </div>
              )}

              {/* Principals Board List */}
              {boardType === 'principals' && (
                <div className="net-board-list">
                  <div className="net-list-header">
                    <span>{isUrdu ? 'ادارہ اور پرنسپل' : 'School & Principal'}</span>
                    <span>{isUrdu ? 'کارکردگی اسکور (AQI)' : 'Performance Score'}</span>
                    <span>{isUrdu ? 'درجہ' : 'Standing'}</span>
                    <span>{isUrdu ? 'رابطہ' : 'Action'}</span>
                  </div>

                  {boardItems.length === 0 ? (
                    <div className="net-empty-state">
                      <Award size={36} />
                      <h3>{isUrdu ? 'کوئی ریکارڈ دستیاب نہیں ہے' : 'No consented entries found in this snapshot'}</h3>
                      <p>
                        {isUrdu
                          ? 'ارکان صرف رضامندی اور اسکول کی اجازت کے بعد ہی فہرست میں شامل ہوتے ہیں۔'
                          : 'Principals appear on ranking boards only after explicit opt-in consent and school administration approval.'}
                      </p>
                    </div>
                  ) : (
                    boardItems.map(item => (
                      <div key={item.id} className="net-row-card">
                        <div className="net-row-profile">
                          <div className="net-row-avatar">
                            {item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : item.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="net-row-info">
                            <div className="net-row-name-line">
                              <button
                                type="button"
                                className="net-profile-link"
                                onClick={() => handleOpenProfileDrawer(item.entity_id)}
                              >
                                {item.school_name || item.name}
                              </button>
                              <span className="net-verified-chip" title="School-verified staff account">
                                <ShieldCheck size={12} /> {isUrdu ? 'تصدیق شدہ' : 'School-verified'}
                              </span>
                              <span className="net-sample-pill-top" style={{ fontSize: '10px', padding: '2px 7px' }}>
                                <Star size={10} /> Top Rated
                              </span>
                            </div>
                            <div className="net-row-sub">
                              <span>{isUrdu ? 'پرنسپل:' : 'Principal:'} {item.name}</span>
                              {item.city && <span>• {item.city}</span>}
                            </div>
                          </div>
                        </div>

                        {/* Performance context */}
                        <div className="net-row-metrics">
                          <div className="net-score-chip">
                            <span className="net-score-num">{item.score.toFixed(1)}%</span>
                            <span className={`net-band-chip ${getBandBadgeClass(item.positive_band)}`}>
                              {item.positive_band}
                            </span>
                          </div>
                          <div className="net-context-sub">
                            {item.student_count !== undefined && (
                              <span>{item.student_count} {isUrdu ? 'طلبا' : 'students'}</span>
                            )}
                            {item.score_delta !== undefined && item.score_delta !== null && (
                              <span className={item.score_delta >= 0 ? 'net-delta-up' : 'net-delta-down'}>
                                {item.score_delta >= 0 ? `+${item.score_delta.toFixed(1)}%` : `${item.score_delta.toFixed(1)}%`}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Rank / Standing */}
                        <div className="net-row-rank">
                          {item.display_mode === 'tier_only' ? (
                            <span className="net-tier-tag">{item.tier_label || 'Top Percentile'}</span>
                          ) : item.display_mode === 'none' ? (
                            <span className="net-unranked-tag">{isUrdu ? 'شاملِ فہرست' : 'Rank Private'}</span>
                          ) : (
                            <span className="net-rank-number">
                              {item.rank === 1 ? '🥇 #1' : item.rank === 2 ? '🥈 #2' : item.rank === 3 ? '🥉 #3' : `#${item.rank}`}
                            </span>
                          )}
                        </div>

                        {/* Connection Button */}
                        <div className="net-row-actions">
                          {!isMinorOrStudent && item.entity_id !== user.id && (
                            <button
                              type="button"
                              className="net-connect-btn"
                              onClick={() => handleOpenConnectModal({ id: item.entity_id, name: item.name, school: item.school_name })}
                            >
                              <UserPlus size={14} />
                              <span>{isUrdu ? 'رابطہ کریں' : 'Connect'}</span>
                            </button>
                          )}
                          {item.entity_id === user.id && (
                            <span className="net-self-tag">{isUrdu ? 'آپ خود' : 'You'}</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ======================================================== */}
              {/* 2. TEACHERS BOARD (TOP PERFORMING EDUCATORS) */}
              {/* ======================================================== */}
              {boardType === 'teachers' && (
                <div className="net-teachers-view">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 16px' }}>
                    <div>
                      <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
                        {isUrdu ? 'نمایاں کارکردگی والے اساتذہ' : 'Top Performing Educators'}
                      </h2>
                      <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                        {isUrdu ? 'اساتذہ کی کارکردگی اور مضامین کے اعتبار سے معتبر رینکنگ' : 'Teacher Performance Benchmarks & Ranking Educators'}
                      </p>
                    </div>
                  </div>

                  {/* Podium View for Teachers */}
                  {podiumItems.length > 0 && (
                    <div className="net-podium-section">
                      <div className="net-podium-title">
                        <Sparkles size={16} />
                        <span>{isUrdu ? 'اعزازی پوزیشنز (ٹاپ 3 اساتذہ)' : 'Podium of Honor (Top 3 Teachers)'}</span>
                      </div>
                      <div className="net-podium-grid">
                        {/* Rank 2 (Silver) */}
                        {podiumItems.find(p => p.rank === 2) ? (
                          <div className="net-podium-slot rank-2">
                            <div className="net-podium-badge silver">🥈 2nd</div>
                            <div className="net-podium-avatar">
                              {podiumItems.find(p => p.rank === 2)?.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="net-podium-name">
                              {podiumItems.find(p => p.rank === 2)?.name}
                            </div>
                            <div className="net-podium-school">
                              {podiumItems.find(p => p.rank === 2)?.school_name}
                            </div>
                            <div className="net-podium-score">
                              <span className="net-score-val">{podiumItems.find(p => p.rank === 2)?.score.toFixed(1)}%</span>
                              <span className={`net-band-chip ${getBandBadgeClass(podiumItems.find(p => p.rank === 2)?.positive_band || '')}`}>
                                {podiumItems.find(p => p.rank === 2)?.positive_band}
                              </span>
                            </div>
                            <div className="net-pedestal pedestal-2">
                              <span>#2</span>
                            </div>
                          </div>
                        ) : <div className="net-podium-slot empty" />}

                        {/* Rank 1 (Gold) */}
                        {podiumItems.find(p => p.rank === 1) ? (
                          <div className="net-podium-slot rank-1">
                            <div className="net-podium-badge gold">🥇 1st Place</div>
                            <div className="net-podium-avatar gold-glow">
                              {podiumItems.find(p => p.rank === 1)?.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="net-podium-name">
                              {podiumItems.find(p => p.rank === 1)?.name}
                            </div>
                            <div className="net-podium-school">
                              {podiumItems.find(p => p.rank === 1)?.school_name}
                            </div>
                            <div className="net-podium-score">
                              <span className="net-score-val">{podiumItems.find(p => p.rank === 1)?.score.toFixed(1)}%</span>
                              <span className={`net-band-chip ${getBandBadgeClass(podiumItems.find(p => p.rank === 1)?.positive_band || '')}`}>
                                {podiumItems.find(p => p.rank === 1)?.positive_band}
                              </span>
                            </div>
                            <div className="net-pedestal pedestal-1">
                              <span>#1</span>
                            </div>
                          </div>
                        ) : <div className="net-podium-slot empty" />}

                        {/* Rank 3 (Bronze) */}
                        {podiumItems.find(p => p.rank === 3) ? (
                          <div className="net-podium-slot rank-3">
                            <div className="net-podium-badge bronze">🥉 3rd</div>
                            <div className="net-podium-avatar">
                              {podiumItems.find(p => p.rank === 3)?.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="net-podium-name">
                              {podiumItems.find(p => p.rank === 3)?.name}
                            </div>
                            <div className="net-podium-school">
                              {podiumItems.find(p => p.rank === 3)?.school_name}
                            </div>
                            <div className="net-podium-score">
                              <span className="net-score-val">{podiumItems.find(p => p.rank === 3)?.score.toFixed(1)}%</span>
                              <span className={`net-band-chip ${getBandBadgeClass(podiumItems.find(p => p.rank === 3)?.positive_band || '')}`}>
                                {podiumItems.find(p => p.rank === 3)?.positive_band}
                              </span>
                            </div>
                            <div className="net-pedestal pedestal-3">
                              <span>#3</span>
                            </div>
                          </div>
                        ) : <div className="net-podium-slot empty" />}
                      </div>
                    </div>
                  )}

                  {/* Top Performing Educators Cards List */}
                  <div className="net-educators-list">
                    {boardItems.length === 0 ? (
                      <div className="net-empty-state">
                        <Award size={36} />
                        <h3>{isUrdu ? 'کوئی استاد ریکارڈ نہیں ملا' : 'No educators found in this selection'}</h3>
                        <p>{isUrdu ? 'اساتذہ صرف رضامندی اور اسکول کی منظوری کے بعد ظاہر ہوتے ہیں۔' : 'Teachers appear only after explicit opt-in consent and school administration approval.'}</p>
                      </div>
                    ) : (
                      boardItems.map(item => (
                        <div key={item.id} className="net-educator-card">
                          <div className="net-educator-left">
                            <div className="net-educator-avatar-wrap">
                              <div className="net-educator-avatar">
                                {item.name.substring(0, 2).toUpperCase()}
                              </div>
                              <div className="net-educator-ribbon">
                                {item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : ''}
                              </div>
                            </div>
                            <div className="net-educator-details">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <button
                                  type="button"
                                  className="net-profile-link"
                                  style={{ fontSize: '15px', fontWeight: 700 }}
                                  onClick={() => handleOpenProfileDrawer(item.entity_id)}
                                >
                                  {item.name}
                                </button>
                                <span className="net-sample-pill-top" style={{ fontSize: '10px', padding: '2px 7px' }}>
                                  <Star size={10} /> Top Mentor
                                </span>
                              </div>
                              <div className="net-educator-campus">
                                {item.school_name} {item.city ? `• ${item.city}` : ''}
                              </div>
                              <div className="net-educator-stars">
                                <span>⭐⭐⭐⭐⭐</span>
                                <span>4.9</span>
                              </div>
                            </div>
                          </div>

                          <div className="net-educator-metrics">
                            <div className="net-metric-box">
                              <span>{isUrdu ? 'استاد کی ریٹنگ' : 'Teacher Rating'}</span>
                              <strong>{item.score > 5 ? (item.score / 20).toFixed(1) : item.score.toFixed(1)}</strong>
                            </div>
                            <div className="net-metric-box">
                              <span>{isUrdu ? 'مضمون میں مہارت' : 'Subject Expertise'}</span>
                              <strong>{item.subject_name || 'Mathematics'} {item.grade_level ? `(${item.grade_level})` : ''}</strong>
                            </div>
                          </div>

                          <div className="net-row-actions">
                            {!isMinorOrStudent && item.entity_id !== user.id && (
                              <button
                                type="button"
                                className="net-connect-btn"
                                onClick={() => handleOpenConnectModal({ id: item.entity_id, name: item.name, school: item.school_name })}
                              >
                                <UserPlus size={14} />
                                <span>{isUrdu ? 'رابطہ کریں' : 'Connect'}</span>
                              </button>
                            )}
                            {item.entity_id === user.id && (
                              <span className="net-self-tag">{isUrdu ? 'آپ خود' : 'You'}</span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* ======================================================== */}
              {/* 3. STUDENT ACHIEVERS (RECOGNITION HUB) */}
              {/* ======================================================== */}
              {boardType === 'students' && (
                <div className="net-student-board">
                  <div className="net-student-disclaimer">
                    <ShieldCheck size={18} />
                    <div>
                      <strong>{isUrdu ? 'طلبہ کا خصوصی تحفظ (Child Safety):' : 'Strict Child Protection Protocol:'}</strong>{' '}
                      {isUrdu
                        ? 'یہ بورڈ صرف طلبا کی شاندار علمی کامیابیوں کو سراہنے کے لیے ہے۔ والدین کی منظوری کے ساتھ صرف نمائشی نام ظاہر کیا جاتا ہے۔ طلبا سے براہِ راست رابطہ، پیغام رسانی یا پروفائل دیکھنے کی مکمل ممانعت ہے۔'
                        : 'This board serves strictly for academic recognition. Guardian-approved aliases are displayed. Direct contact, messaging, or profile viewing for student achievers is strictly prohibited and blocked at platform architecture.'}
                    </div>
                  </div>

                  <div className="net-student-grid">
                    {studentItems.length === 0 ? (
                      <div className="net-empty-state">
                        <Award size={36} />
                        <h3>{isUrdu ? 'کوئی طالب علم ریکارڈ نہیں ملا' : 'No student achievers in this selection'}</h3>
                        <p>{isUrdu ? 'طلبہ صرف والدین کی تحریری رضامندی اور اسکول کی منظوری کے بعد ظاہر ہوتے ہیں۔' : 'Students appear only with verified guardian consent and school administration approval.'}</p>
                      </div>
                    ) : (
                      studentItems.map(st => (
                        <div key={st.id} className="net-student-card">
                          <div className="net-student-card-top">
                            <div className="net-student-avatar">
                              {st.display_alias.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="net-student-meta">
                              <span className="net-student-name">{st.display_alias}</span>
                              <span className="net-student-grade">{st.grade_level || 'Grade Level'}</span>
                            </div>
                          </div>

                          <div className="net-student-score-line">
                            <div className="net-student-rating">
                              <span>⭐ 4.9</span>
                            </div>
                            <div className="net-student-badge-honor">
                              {st.honor_title}
                            </div>
                          </div>

                          {st.school_name && (
                            <div className="net-student-school" style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
                              <Building2 size={12} />
                              <span>{st.school_name}</span>
                            </div>
                          )}

                          <div className="net-student-pill-status">
                            <ShieldCheck size={13} />
                            <span>{isUrdu ? 'محفوظ و تصدیق شدہ اعزاز' : 'Verified Achiever'}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: REQUESTS (ADULTS ONLY) */}
      {/* ======================================================== */}
      {mainTab === 'requests' && !isMinorOrStudent && (
        <div className="network-requests-view">
          <div className="net-subtabs-row">
            <button
              className={`net-subtab-pill ${requestsSubTab === 'received' ? 'active' : ''}`}
              onClick={() => setRequestsSubTab('received')}
            >
              <UserPlus size={15} />
              <span>{isUrdu ? 'موصولہ درخواستیں' : 'Received Requests'} ({receivedRequests.length})</span>
            </button>
            <button
              className={`net-subtab-pill ${requestsSubTab === 'sent' ? 'active' : ''}`}
              onClick={() => setRequestsSubTab('sent')}
            >
              <Send size={15} />
              <span>{isUrdu ? 'ارسال کردہ درخواستیں' : 'Sent Requests'} ({sentRequests.length})</span>
            </button>
          </div>

          <div className="net-requests-limits-info">
            <Clock size={14} />
            <span>
              {isUrdu
                ? 'روزانہ درخواستوں کی حد: 20 فی دن۔ مسترد ہونے پر 7 دن کا کول ڈاؤن لاگو ہوتا ہے۔'
                : 'Safety limits: 20 connection requests per day. 7-day cooldown applies upon decline.'}
            </span>
          </div>

          {requestsSubTab === 'received' && (
            <div className="net-requests-list">
              {receivedRequests.length === 0 ? (
                <div className="net-empty-state">
                  <UserCheck size={36} />
                  <h3>{isUrdu ? 'کوئی زیر التواء درخواست موجود نہیں ہے' : 'No pending connection requests'}</h3>
                  <p>{isUrdu ? 'جب ساتھی اساتذہ آپ کو درخواست بھیجیں گے تو وہ یہاں دکھائی دیں گی۔' : 'When verified colleagues connect with you, their requests will appear here.'}</p>
                </div>
              ) : (
                receivedRequests.map(req => (
                  <div key={req.id} className="net-request-card">
                    <div className="net-req-avatar">
                      {(req.from_user_name || 'U').substring(0, 2).toUpperCase()}
                    </div>
                    <div className="net-req-body">
                      <div className="net-req-name-line">
                        <strong>{req.from_user_name}</strong>
                        <span className="net-req-school">• {req.school_name || 'Verified School'}</span>
                        <span className="net-req-role">• {req.role}</span>
                      </div>
                      {req.note && (
                        <div className="net-req-note">
                          "{req.note}"
                        </div>
                      )}
                      <div className="net-req-date">
                        {new Date(req.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="net-req-actions">
                      <button
                        type="button"
                        className="net-accept-btn"
                        onClick={() => handleAcceptRequest(req.id)}
                      >
                        <Check size={14} />
                        <span>{isUrdu ? 'قبول کریں' : 'Accept'}</span>
                      </button>
                      <button
                        type="button"
                        className="net-decline-btn"
                        onClick={() => handleDeclineRequest(req.id)}
                      >
                        <X size={14} />
                        <span>{isUrdu ? 'مسترد کریں' : 'Decline'}</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {requestsSubTab === 'sent' && (
            <div className="net-requests-list">
              {sentRequests.length === 0 ? (
                <div className="net-empty-state">
                  <Send size={36} />
                  <h3>{isUrdu ? 'کوئی زیر التواء ارسال کردہ درخواست نہیں ہے' : 'No sent pending requests'}</h3>
                  <p>{isUrdu ? 'آپ کی بھیجی گئی درخواستیں یہاں نظر آئیں گی۔' : 'Requests you have sent that are waiting for response will show here.'}</p>
                </div>
              ) : (
                sentRequests.map(req => (
                  <div key={req.id} className="net-request-card">
                    <div className="net-req-avatar">
                      {(req.to_user_name || 'U').substring(0, 2).toUpperCase()}
                    </div>
                    <div className="net-req-body">
                      <div className="net-req-name-line">
                        <strong>{req.to_user_name}</strong>
                        <span className="net-req-school">• {req.school_name}</span>
                      </div>
                      {req.note && (
                        <div className="net-req-note">
                          "{req.note}"
                        </div>
                      )}
                      <div className="net-req-date">
                        {isUrdu ? 'ارسال کی گئی تاریخ:' : 'Sent on:'} {new Date(req.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="net-req-actions">
                      <button
                        type="button"
                        className="net-withdraw-btn"
                        onClick={() => handleWithdrawRequest(req.id)}
                      >
                        <X size={14} />
                        <span>{isUrdu ? 'واپس لیں' : 'Withdraw'}</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: CONNECTIONS (ADULTS ONLY) */}
      {/* ======================================================== */}
      {mainTab === 'connections' && !isMinorOrStudent && (
        <div className="network-connections-view">
          <div className="net-section-head">
            <div>
              <h2>{isUrdu ? 'میرے تصدیق شدہ ساتھی' : 'Connected Colleagues'} ({activeConnections.length})</h2>
              <p>{isUrdu ? 'صرف منظور شدہ اور غیر مسدود بالغ ارکان کے ساتھ محفوظ رابطہ۔' : 'Active one-to-one connections between verified adult educators.'}</p>
            </div>
          </div>

          {activeConnections.length === 0 ? (
            <div className="net-empty-state">
              <Users size={36} />
              <h3>{isUrdu ? 'ابھی تک کوئی فعال رابطہ نہیں ہے' : 'No active connections yet'}</h3>
              <p>{isUrdu ? 'لیڈر بورڈ سے ساتھیوں سے رابطہ قائم کریں یا نیچے دی گئی تجاویز ملاحظہ کریں۔' : 'Connect with peers from the ranked boards or explore recommended colleagues below.'}</p>
            </div>
          ) : (
            <div className="net-connections-grid">
              {activeConnections.map(conn => (
                <div key={conn.id} className="net-connection-card">
                  <div className="net-conn-avatar">
                    {conn.peer_name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="net-conn-name">{conn.peer_name}</div>
                  <div className="net-conn-role">{conn.role}</div>
                  <div className="net-conn-school">{conn.school_name} {conn.city ? `• ${conn.city}` : ''}</div>
                  <div className="net-conn-date">
                    {isUrdu ? 'رابطہ قائم ہوا:' : 'Connected:'} {new Date(conn.connected_at).toLocaleDateString()}
                  </div>
                  <div className="net-conn-actions">
                    <button
                      type="button"
                      className="net-conn-btn outline"
                      onClick={() => handleOpenProfileDrawer(conn.peer_id)}
                    >
                      <Eye size={13} />
                      <span>{isUrdu ? 'پروفائل' : 'Profile'}</span>
                    </button>
                    <button
                      type="button"
                      className="net-conn-btn primary"
                      onClick={() => handleOpenChatDrawer(conn.peer_id, conn.peer_name, conn.school_name, conn.role)}
                      title="Open End-to-End Encrypted Chat"
                    >
                      <MessageSquare size={13} />
                      <span>{isUrdu ? 'پیغام' : 'Message'}</span>
                    </button>
                    <button
                      type="button"
                      className="net-conn-btn danger"
                      onClick={() => handleRemoveConnection(conn.peer_id, conn.peer_name)}
                      title="Remove Connection"
                    >
                      <UserX size={13} />
                    </button>
                    <button
                      type="button"
                      className="net-conn-btn subtle"
                      onClick={() => setReportModalTarget({ id: conn.peer_id, name: conn.peer_name })}
                      title="Report Conduct"
                    >
                      <Flag size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Suggested Colleagues Section */}
          <div className="net-suggested-section">
            <div className="net-section-head">
              <div>
                <h3>
                  <Sparkles size={16} />
                  <span>{isUrdu ? 'تجویز کردہ اساتذہ و پرنسپلز' : 'Suggested Academic Colleagues'}</span>
                </h3>
                <p>{isUrdu ? 'یکساں مضامین، شہر، اور تعلیمی بورڈز پر مبنی سادہ سفارشات (کوئی غیر محفوظ AI تجزیہ نہیں)۔' : 'Rule-based peer recommendations based on shared subject, city, or educational board.'}</p>
              </div>
            </div>

            <div className="net-suggested-grid">
              {suggestedProfiles.length === 0 ? (
                <div className="net-empty-state small">
                  <p>{isUrdu ? 'اس وقت کوئی نئی تجویز دستیاب نہیں ہے۔' : 'No new suggestions available in your network cluster.'}</p>
                </div>
              ) : (
                suggestedProfiles.map(sugg => (
                  <div key={sugg.id} className="net-suggest-card">
                    <div className="net-sugg-top">
                      <div className="net-sugg-avatar">
                        {sugg.full_name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="net-sugg-info">
                        <strong>{sugg.full_name}</strong>
                        <div className="net-sugg-sub">{sugg.headline || sugg.role}</div>
                        <div className="net-sugg-school">{sugg.school_name} {sugg.city ? `• ${sugg.city}` : ''}</div>
                      </div>
                    </div>
                    {sugg.suggestion_reason && (
                      <div className="net-sugg-reason">
                        <CheckCircle2 size={11} />
                        <span>{sugg.suggestion_reason}</span>
                      </div>
                    )}
                    <div className="net-sugg-actions">
                      <button
                        type="button"
                        className="net-connect-btn"
                        onClick={() => handleOpenConnectModal({ id: sugg.id, name: sugg.full_name, school: sugg.school_name })}
                      >
                        <UserPlus size={13} />
                        <span>{isUrdu ? 'رابطہ کریں' : 'Connect'}</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: MY PROFILE & PRIVACY (ADULTS ONLY) */}
      {/* ======================================================== */}
      {mainTab === 'profile' && !isMinorOrStudent && (
        <div className="network-profile-view">
          <div className="net-profile-layout">
            {/* Left: Live Preview */}
            <div className="net-preview-col">
              <div className="net-preview-sticky">
                <h3>{isUrdu ? 'آپ کا عوامی نیٹ ورک کارڈ (پیش منظر)' : 'Profile with Badges and Achievements'}</h3>
                <div className="net-preview-card">
                  <div className="net-prev-header">
                    <div className="net-prev-avatar">
                      {(user.name || user.username || 'ME').substring(0, 2).toUpperCase()}
                    </div>
                    <div className="net-prev-badges">
                      <span className="net-verified-chip">
                        <ShieldCheck size={11} /> School-verified
                      </span>
                      <span className="net-sample-pill-top">
                        <Star size={11} /> Top Rated
                      </span>
                    </div>
                  </div>
                  <div className="net-prev-name">{user.name || user.username}</div>
                  <div className="net-prev-headline">{headlineInput || (isUrdu ? 'پیشہ ورانہ عنوان' : 'Professional Educator • Academic Leader')}</div>
                  <div className="net-prev-school">
                    <Building2 size={13} />
                    <span>{showSchoolName ? (myProfile?.school_name || 'Academic Institution') : (isUrdu ? 'اسکول پوشیدہ' : 'School Private')}</span>
                    {showCity && myProfile?.city_display && <span> • {myProfile.city_display}</span>}
                  </div>

                  {/* Sample Stats Row matching Screen 4 */}
                  <div className="net-sample-stats-row" style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 12, margin: '12px 0', border: '1px solid #e2e8f0' }}>
                    <div>
                      <label>{isUrdu ? 'رابطے' : 'Connections'}</label>
                      <strong style={{ color: '#0f766e', fontSize: 15 }}>{activeConnections.length > 0 ? activeConnections.length : 120}</strong>
                    </div>
                    <div>
                      <label>{isUrdu ? 'مضامین' : 'Subjects'}</label>
                      <strong style={{ color: '#0f766e', fontSize: 15 }}>{subjectsList.length > 0 ? subjectsList.length : 8}</strong>
                    </div>
                    <div>
                      <label>{isUrdu ? 'ریٹنگ' : 'Rating'}</label>
                      <strong style={{ color: '#d97706', fontSize: 15 }}>⭐ 4.9</strong>
                    </div>
                  </div>

                  {/* 4 Colorful Badges & Achievements matching Screen 4 */}
                  <div style={{ margin: '14px 0 10px' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 8 }}>
                      {isUrdu ? 'اعزازات اور بیجز' : 'Achievements & Badges'}
                    </span>
                    <div className="net-sample-badges-grid">
                      <div className="net-sample-badge-item">
                        <div className="net-sample-badge-icon gold">🏆</div>
                        <strong>Top Scorer</strong>
                        <small>Academic #1</small>
                      </div>
                      <div className="net-sample-badge-item">
                        <div className="net-sample-badge-icon purple">🛡️</div>
                        <strong>Math Whiz</strong>
                        <small>98% Score</small>
                      </div>
                      <div className="net-sample-badge-item">
                        <div className="net-sample-badge-icon teal">🛡️</div>
                        <strong>Helpful Peer</strong>
                        <small>Top Mentor</small>
                      </div>
                      <div className="net-sample-badge-item">
                        <div className="net-sample-badge-icon green">🎖️</div>
                        <strong>Attendance</strong>
                        <small>100% Punctual</small>
                      </div>
                    </div>
                  </div>

                  {bioInput && <p className="net-prev-bio">"{bioInput}"</p>}

                  {/* Qualifications */}
                  {qualificationsList.length > 0 && (
                    <div className="net-prev-chips">
                      <small>{isUrdu ? 'اسناد و قابلیت (خود بیان کردہ):' : 'Qualifications (Self-declared):'}</small>
                      <div className="net-chips-row">
                        {qualificationsList.map((q, idx) => (
                          <span key={idx} className="net-chip">{q}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Subjects */}
                  {subjectsList.length > 0 && (
                    <div className="net-prev-chips">
                      <small>{isUrdu ? 'مضامین:' : 'Subjects:'}</small>
                      <div className="net-chips-row">
                        {subjectsList.map((s, idx) => (
                          <span key={idx} className="net-chip blue">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Interests */}
                  {interestsList.length > 0 && (
                    <div className="net-prev-chips">
                      <small>{isUrdu ? 'دلچسپیاں:' : 'Networking Interests:'}</small>
                      <div className="net-chips-row">
                        {interestsList.map((it, idx) => (
                          <span key={idx} className="net-chip green">{it}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Edit Form & Privacy Settings */}
            <div className="net-form-col">
              {/* Consent Box */}
              <div className="net-consent-box">
                <div className="net-consent-head">
                  <Award size={20} className="net-consent-icon" />
                  <div>
                    <h4>{isUrdu ? 'تعلیمی لیڈر بورڈ میں شمولیت کی رضامندی (Opt-in Consent)' : 'Academic Leaderboard Inclusion Consent'}</h4>
                    <p>
                      {isUrdu
                        ? 'آپٹیمس اورین میں درجہ بندیاں صرف آپ کی واضح رضامندی سے ظاہر ہوتی ہیں۔ آپ کسی بھی وقت اپنی رضامندی واپس لے سکتے ہیں، جس سے آپ کا نام فوری طور پر تمام لائیو اسنیپ شاٹس اور تلاش سے خارج کر دیا جائے گا۔'
                        : 'Rankings in Optimus Orien are strictly opt-in. You may grant or withdraw consent at any time with immediate purge from all published snapshots and searches.'}
                    </p>
                  </div>
                </div>
                <div className="net-consent-toggle">
                  <label className="net-switch">
                    <input
                      type="checkbox"
                      checked={hasConsent}
                      onChange={handleToggleConsent}
                    />
                    <span className="net-slider" />
                  </label>
                  <strong>{hasConsent ? (isUrdu ? 'رضامندی فعال ہے (بورڈ میں شامل)' : 'Opted In to Leaderboards') : (isUrdu ? 'شمولیت غیر فعال ہے' : 'Opted Out of Leaderboards')}</strong>
                </div>
              </div>

              {/* Professional Profile Form */}
              <div className="net-form-card">
                <h3>{isUrdu ? 'پیشہ ورانہ تفصیلات' : 'Professional Profile Information'}</h3>

                <div className="net-form-group">
                  <label>{isUrdu ? 'پیشہ ورانہ عنوان (Headline)' : 'Professional Headline'}</label>
                  <input
                    type="text"
                    className="net-input"
                    placeholder="e.g. Senior Mathematics Faculty & Curriculum Specialist"
                    value={headlineInput}
                    onChange={e => setHeadlineInput(e.target.value)}
                    maxLength={120}
                  />
                </div>

                <div className="net-form-group">
                  <div className="net-label-line">
                    <label>{isUrdu ? 'مختصر تعارف (Bio)' : 'Short Bio'}</label>
                    <span className="net-char-counter">{bioInput.length}/300</span>
                  </div>
                  <textarea
                    className="net-textarea"
                    rows={3}
                    placeholder={isUrdu ? 'اپنے تدریسی تجربے اور تحقیقی دلچسپیوں کے بارے میں بتائیں...' : 'Share your teaching philosophy, years in education, and academic passions...'}
                    value={bioInput}
                    onChange={e => setBioInput(e.target.value.substring(0, 300))}
                  />
                </div>

                <div className="net-form-group">
                  <label>{isUrdu ? 'تدریسی تجربہ (سال)' : 'Years of Experience'}</label>
                  <input
                    type="number"
                    className="net-input"
                    min={0}
                    max={60}
                    value={experienceInput}
                    onChange={e => setExperienceInput(Math.max(0, parseInt(e.target.value) || 0))}
                  />
                </div>

                {/* Qualifications */}
                <div className="net-form-group">
                  <label>{isUrdu ? 'اسناد و اسنادِ تدریس (خود بیان کردہ)' : 'Qualifications (Self-declared)'}</label>
                  <div className="net-tag-input-row">
                    <input
                      type="text"
                      className="net-input"
                      placeholder="e.g. M.Ed. Educational Leadership"
                      value={newQualInput}
                      onChange={e => setNewQualInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newQualInput.trim()) {
                          e.preventDefault();
                          if (!qualificationsList.includes(newQualInput.trim())) {
                            setQualificationsList([...qualificationsList, newQualInput.trim()]);
                          }
                          setNewQualInput('');
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="net-add-tag-btn"
                      onClick={() => {
                        if (newQualInput.trim() && !qualificationsList.includes(newQualInput.trim())) {
                          setQualificationsList([...qualificationsList, newQualInput.trim()]);
                          setNewQualInput('');
                        }
                      }}
                    >
                      {isUrdu ? 'شامل کریں' : 'Add'}
                    </button>
                  </div>
                  <div className="net-chips-row">
                    {qualificationsList.map((q, idx) => (
                      <span key={idx} className="net-chip removable">
                        {q}
                        <button type="button" onClick={() => setQualificationsList(qualificationsList.filter((_, i) => i !== idx))}>
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Subjects */}
                <div className="net-form-group">
                  <label>{isUrdu ? 'تدریسی مضامین' : 'Subjects Taught'}</label>
                  <div className="net-tag-input-row">
                    <input
                      type="text"
                      className="net-input"
                      placeholder="e.g. Physics, Mathematics"
                      value={newSubjectInput}
                      onChange={e => setNewSubjectInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newSubjectInput.trim()) {
                          e.preventDefault();
                          if (!subjectsList.includes(newSubjectInput.trim())) {
                            setSubjectsList([...subjectsList, newSubjectInput.trim()]);
                          }
                          setNewSubjectInput('');
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="net-add-tag-btn"
                      onClick={() => {
                        if (newSubjectInput.trim() && !subjectsList.includes(newSubjectInput.trim())) {
                          setSubjectsList([...subjectsList, newSubjectInput.trim()]);
                          setNewSubjectInput('');
                        }
                      }}
                    >
                      {isUrdu ? 'شامل کریں' : 'Add'}
                    </button>
                  </div>
                  <div className="net-chips-row">
                    {subjectsList.map((s, idx) => (
                      <span key={idx} className="net-chip blue removable">
                        {s}
                        <button type="button" onClick={() => setSubjectsList(subjectsList.filter((_, i) => i !== idx))}>
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Networking Interests */}
                <div className="net-form-group">
                  <label>{isUrdu ? 'نیٹ ورکنگ کی دلچسپیاں' : 'Networking Interests'}</label>
                  <div className="net-tag-input-row">
                    <input
                      type="text"
                      className="net-input"
                      placeholder="e.g. Curriculum Design, Mentorship"
                      value={newInterestInput}
                      onChange={e => setNewInterestInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newInterestInput.trim()) {
                          e.preventDefault();
                          if (!interestsList.includes(newInterestInput.trim())) {
                            setInterestsList([...interestsList, newInterestInput.trim()]);
                          }
                          setNewInterestInput('');
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="net-add-tag-btn"
                      onClick={() => {
                        if (newInterestInput.trim() && !interestsList.includes(newInterestInput.trim())) {
                          setInterestsList([...interestsList, newInterestInput.trim()]);
                          setNewInterestInput('');
                        }
                      }}
                    >
                      {isUrdu ? 'شامل کریں' : 'Add'}
                    </button>
                  </div>
                  <div className="net-chips-row">
                    {interestsList.map((it, idx) => (
                      <span key={idx} className="net-chip green removable">
                        {it}
                        <button type="button" onClick={() => setInterestsList(interestsList.filter((_, i) => i !== idx))}>
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Privacy Controls */}
              <div className="net-form-card">
                <h3>{isUrdu ? 'پرائیویسی ترجیحات' : 'Privacy & Display Settings'}</h3>

                {/* Rank Display Mode */}
                <div className="net-form-group">
                  <label>{isUrdu ? 'بورڈ پر رینک ظاہر کرنے کا انداز' : 'Board Ranking Display Mode'}</label>
                  <div className="net-radio-group">
                    <label className="net-radio-item">
                      <input
                        type="radio"
                        name="rankDisplayMode"
                        value="exact"
                        checked={rankDisplayMode === 'exact'}
                        onChange={() => setRankDisplayMode('exact')}
                      />
                      <span>{isUrdu ? 'مکمل رینک (#1, #2 وغیرہ)' : 'Exact rank (e.g. #1, #2)'}</span>
                    </label>
                    <label className="net-radio-item">
                      <input
                        type="radio"
                        name="rankDisplayMode"
                        value="tier_only"
                        checked={rankDisplayMode === 'tier_only'}
                        onChange={() => setRankDisplayMode('tier_only')}
                      />
                      <span>{isUrdu ? 'صرف تعمیری درجہ (مثلاً Top 10%, Top 25%)' : 'Percentile tier only (e.g. Top 10%, Top 25%)'}</span>
                    </label>
                    <label className="net-radio-item">
                      <input
                        type="radio"
                        name="rankDisplayMode"
                        value="none"
                        checked={rankDisplayMode === 'none'}
                        onChange={() => setRankDisplayMode('none')}
                      />
                      <span>{isUrdu ? 'فہرست میں رینک کے بغیر شامل رہیں' : 'Listed without numeric rank'}</span>
                    </label>
                  </div>
                </div>

                {/* Allow Requests From */}
                <div className="net-form-group">
                  <label>{isUrdu ? 'کون مجھے رابطے کی درخواستیں بھیج سکتا ہے؟' : 'Who Can Send Me Connection Requests?'}</label>
                  <select
                    className="net-select"
                    value={allowRequestsFrom}
                    onChange={e => setAllowRequestsFrom(e.target.value as AllowRequestsFrom)}
                  >
                    <option value="anyone_verified">{isUrdu ? 'پلیٹ فارم پر موجود تمام تصدیق شدہ بالغ اساتذہ' : 'All platform-verified adult educators'}</option>
                    <option value="my_city_country">{isUrdu ? 'صرف میرے شہر یا ملک کے اساتذہ' : 'Colleagues in my city/country only'}</option>
                    <option value="nobody">{isUrdu ? 'کوئی نہیں (درخواستیں بند ہیں)' : 'Nobody (Disallow incoming requests)'}</option>
                  </select>
                </div>

                {/* Visibility Toggles */}
                <div className="net-toggle-row">
                  <div>
                    <strong>{isUrdu ? 'اسکول کا نام دکھائیں' : 'Show School Campus Name'}</strong>
                    <p>{isUrdu ? 'ساتھی اساتذہ آپ کا کیمپس دیکھ سکیں گے' : 'Allow colleagues to view your school affiliation on profile'}</p>
                  </div>
                  <label className="net-switch">
                    <input
                      type="checkbox"
                      checked={showSchoolName}
                      onChange={e => setShowSchoolName(e.target.checked)}
                    />
                    <span className="net-slider" />
                  </label>
                </div>

                <div className="net-toggle-row">
                  <div>
                    <strong>{isUrdu ? 'شہر کا نام دکھائیں' : 'Show City'}</strong>
                    <p>{isUrdu ? 'عوامی پروفائل پر شہر کا نام ظاہر کریں' : 'Display your city on profile'}</p>
                  </div>
                  <label className="net-switch">
                    <input
                      type="checkbox"
                      checked={showCity}
                      onChange={e => setShowCity(e.target.checked)}
                    />
                    <span className="net-slider" />
                  </label>
                </div>

                <div className="net-toggle-row">
                  <div>
                    <strong>{isUrdu ? 'آن لائن کیفیت دکھائیں (ڈیفالٹ: بند)' : 'Show Online Status (Default: Off)'}</strong>
                    <p>{isUrdu ? 'جب آپ متحرک ہوں تو فعال نشان دکھائیں' : 'Show active indicator when in network chat'}</p>
                  </div>
                  <label className="net-switch">
                    <input
                      type="checkbox"
                      checked={showOnlineStatus}
                      onChange={e => setShowOnlineStatus(e.target.checked)}
                    />
                    <span className="net-slider" />
                  </label>
                </div>

                <div className="net-toggle-row">
                  <div>
                    <strong>{isUrdu ? 'پیغام پڑھنے کی رسیدیں (ڈیفالٹ: بند)' : 'Read Receipts (Default: Off)'}</strong>
                    <p>{isUrdu ? 'موصول کنندہ کو بتائیں کہ پیغام پڑھ لیا گیا ہے' : 'Let sender know when you have read messages'}</p>
                  </div>
                  <label className="net-switch">
                    <input
                      type="checkbox"
                      checked={readReceiptsEnabled}
                      onChange={e => setReadReceiptsEnabled(e.target.checked)}
                    />
                    <span className="net-slider" />
                  </label>
                </div>
              </div>

              {/* School Administrator Controls */}
              {isSchoolAdmin && schoolSettings && (
                <div className="net-form-card admin-border">
                  <h3>
                    <ShieldAlert size={18} />
                    <span>{isUrdu ? 'اسکول ایڈمن ترتیبات (ادارہ جاتی پالیسی)' : 'School Administrator Network Controls'}</span>
                  </h3>
                  <p className="net-card-sub">
                    {isUrdu
                      ? 'یہ ترتیبات آپ کے پورے اسکول کے اساتذہ اور طلبا کے لیڈر بورڈ میں شمولیت کو کنٹرول کرتی ہیں (ڈیفالٹ: بند)۔'
                      : 'These settings control whether staff and students from your school may appear on boards (default OFF per data ethics policy).'}
                  </p>

                  <div className="net-toggle-row">
                    <div>
                      <strong>{isUrdu ? 'اساتذہ کو بورڈز میں شمولیت کی اجازت دیں' : 'Allow Staff to Appear on Boards'}</strong>
                      <p>{isUrdu ? 'اگر بند ہو تو اساتذہ رضامندی کے باوجود بورڈ پر نہیں آئیں گے' : 'When OFF, staff members cannot appear on public leaderboards even with personal consent'}</p>
                    </div>
                    <label className="net-switch">
                      <input
                        type="checkbox"
                        checked={schoolSettings.staff_board_enabled}
                        onChange={e => handleToggleSchoolSetting('staff_board_enabled', e.target.checked)}
                      />
                      <span className="net-slider" />
                    </label>
                  </div>

                  <div className="net-toggle-row">
                    <div>
                      <strong>{isUrdu ? 'نمایاں طلبا کا اعزازی بورڈ فعال کریں' : 'Enable Student Achievers Recognition Board'}</strong>
                      <p>{isUrdu ? 'والدین کی رضامندی اور اسکول کی منظوری کے ساتھ طلبا کا اعزاز' : 'Allows eligible high-performing students to be recognized with guardian consent'}</p>
                    </div>
                    <label className="net-switch">
                      <input
                        type="checkbox"
                        checked={schoolSettings.student_board_enabled}
                        onChange={e => handleToggleSchoolSetting('student_board_enabled', e.target.checked)}
                      />
                      <span className="net-slider" />
                    </label>
                  </div>
                </div>
              )}

              {/* Save Button */}
              <div className="net-save-bar">
                <button
                  type="button"
                  className="net-action-btn primary large"
                  onClick={handleSaveProfile}
                  disabled={profileSaving}
                >
                  <Check size={16} />
                  <span>{profileSaving ? (isUrdu ? 'محفوظ کیا جا رہا ہے...' : 'Saving...') : (isUrdu ? 'پروفائل محفوظ کریں' : 'Save Profile & Privacy Settings')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 5: SAFETY & ETHICS */}
      {/* ======================================================== */}
      {mainTab === 'safety' && (
        <div className="network-safety-view">
          <div className="net-safety-grid">
            <div className="net-safety-card">
              <div className="net-safety-icon blue"><Shield size={24} /></div>
              <h3>{isUrdu ? 'بچوں کے مکمل تحفظ کی پالیسی (Child Safety Barrier)' : 'Absolute Child Protection Barrier'}</h3>
              <p>
                {isUrdu
                  ? 'آپٹیمس اورین کا یہ نیٹ ورک فیچر 18 سال سے کم عمر افراد کے لیے پیغامات اور رابطے کی قطعی ممانعت کرتا ہے۔ طلبا کو نہ کوئی بالغ شخص رابطہ کر سکتا ہے اور نہ طلبا کسی کو پیغام بھیج سکتے ہیں۔'
                  : 'Users under 18 can NEVER contact, or be contacted by, anyone through the Network feature. Students have NO connect and NO chat capabilities. Adult-to-minor and cross-school student messaging is structurally barred.'}
              </p>
            </div>

            <div className="net-safety-card">
              <div className="net-safety-icon green"><Award size={24} /></div>
              <h3>{isUrdu ? 'صرف مثبت تعلیمی اعتراف (Constructive Recognition)' : 'Purely Positive Recognition'}</h3>
              <p>
                {isUrdu
                  ? 'ہمارا لیڈر بورڈ طلبہ یا اساتذہ کے منفی درجات، کمترین فہرستیں، یا تنبیہی ریمارکس کبھی شائع نہیں کرتا۔ تمام لیبلز تعمیری اور اعزازی ہیں۔'
                  : 'Leaderboards never display a bottom tier or punitive labels. Recognition is strictly positive (Outstanding, Exemplary, High Commendation). Every teacher may choose exact rank, percentile tier, or no rank.'}
              </p>
            </div>

            <div className="net-safety-card">
              <div className="net-safety-icon purple"><ShieldCheck size={24} /></div>
              <h3>{isUrdu ? 'رضامندی اور فوری انخلاء (Opt-in & Immediate Purge)' : 'Explicit Consent & Instant Revocation'}</h3>
              <p>
                {isUrdu
                  ? 'کوئی بھی استاد یا پرنسپل اپنی رضامندی کے بغیر بورڈ پر ظاہر نہیں ہوتا۔ رضامندی واپس لینے کی صورت میں فوری طور پر ریکارڈ تمام فہرستوں اور سرور کیش سے مٹا دیا جاتا ہے۔'
                  : 'Inclusion requires explicit affirmative consent. When a user withdraws consent, their record is purged immediately from all snapshots, public listings, and internal search indexes.'}
              </p>
            </div>

            <div className="net-safety-card">
              <div className="net-safety-icon red"><AlertCircle size={24} /></div>
              <h3>{isUrdu ? 'غیر پیشہ ورانہ رویے کی رپورٹنگ' : 'Misconduct & Harassment Reporting'}</h3>
              <p>
                {isUrdu
                  ? 'اگر کسی بھی صارف کی جانب سے نامناسب طرزِ عمل سامنے آئے تو بلاک اور رپورٹ کا آپشن ہر رابطے پر دستیاب ہے۔ پلیٹ فارم ایڈمن تمام رپورٹس کی غیر جانبدارانہ جانچ کرتا ہے۔'
                  : 'Every connection and profile features immediate block and reporting tools. Reports are audited by the platform compliance desk with zero tolerance for harassment.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* CONNECT MODAL */}
      {/* ======================================================== */}
      {connectModalTarget && (
        <div className="net-modal-backdrop">
          <div className="net-modal-card">
            <div className="net-modal-head">
              <h3>{isUrdu ? 'رابطے کی درخواست ارسال کریں' : 'Send Connection Request'}</h3>
              <button type="button" onClick={() => setConnectModalTarget(null)}><X size={18} /></button>
            </div>
            <div className="net-modal-body">
              <div className="net-target-summary">
                <div className="net-target-avatar">
                  {connectModalTarget.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <strong>{connectModalTarget.name}</strong>
                  <p>{connectModalTarget.school}</p>
                </div>
              </div>

              <div className="net-form-group">
                <div className="net-label-line">
                  <label>{isUrdu ? 'تعارفی پیغام (اختیاری، زیادہ سے زیادہ 200 حروف)' : 'Introductory Note (Optional, max 200 chars)'}</label>
                  <span className="net-char-counter">{connectNote.length}/200</span>
                </div>
                <textarea
                  className="net-textarea"
                  rows={3}
                  placeholder={isUrdu ? 'سلام! میں آپ کے تدریسی طریقہ کار سے متاثر ہوا اور رابطہ قائم کرنا چاہتا ہوں...' : 'Hello! I noticed our shared focus in Mathematics and would appreciate connecting...'}
                  value={connectNote}
                  onChange={e => setConnectNote(e.target.value.substring(0, 200))}
                />
              </div>

              <div className="net-safety-warning-box">
                <ShieldAlert size={14} />
                <span>
                  {isUrdu
                    ? 'براہ کرم طلبا کے ذاتی کوائف یا رابطے کے ذرائع پیغامات میں شامل نہ کریں۔'
                    : 'Do not include personal contact details or information regarding minors.'}
                </span>
              </div>
            </div>
            <div className="net-modal-foot">
              <button
                type="button"
                className="net-outline-btn"
                onClick={() => setConnectModalTarget(null)}
              >
                {isUrdu ? 'منسوخ کریں' : 'Cancel'}
              </button>
              <button
                type="button"
                className="net-action-btn primary"
                onClick={handleSendConnectRequest}
                disabled={sendingConnect}
              >
                <Send size={14} />
                <span>{sendingConnect ? (isUrdu ? 'ارسال ہو رہا ہے...' : 'Sending...') : (isUrdu ? 'درخواست بھیجیں' : 'Send Request')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* PUBLIC PROFILE DRAWER / MODAL */}
      {/* ======================================================== */}
      {activeProfileDrawerId && (
        <div className="net-modal-backdrop">
          <div className="net-modal-card profile-drawer">
            <div className="net-modal-head">
              <h3>{isUrdu ? 'ماہرِ تعلیم کا عوامی پروفائل' : 'Educator Public Profile'}</h3>
              <button type="button" onClick={() => setActiveProfileDrawerId(null)}><X size={18} /></button>
            </div>
            <div className="net-modal-body">
              {drawerLoading || !drawerProfile ? (
                <div className="net-loading-state">
                  <RefreshCw size={24} className="spin" />
                  <p>{isUrdu ? 'پروفائل لوڈ ہو رہی ہے...' : 'Loading profile details...'}</p>
                </div>
              ) : (
                <div className="net-drawer-content">
                  <div className="net-drawer-head">
                    <div className="net-drawer-avatar">
                      {drawerProfile.full_name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="net-drawer-titles">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <h2>{drawerProfile.full_name}</h2>
                        <span className="net-sample-pill-top">
                          <Star size={11} /> Top Rated
                        </span>
                      </div>
                      <div className="net-drawer-headline">{drawerProfile.headline || drawerProfile.role}</div>
                      <div className="net-drawer-school">
                        <Building2 size={13} />
                        <span>{drawerProfile.school_name || 'Academic Institution'}</span>
                        {drawerProfile.city && <span> • {drawerProfile.city}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Sample Stats Row (Connections 120, Subjects 8, Rating 4.9) */}
                  <div className="net-sample-stats-row" style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 12, margin: '14px 0', border: '1px solid #e2e8f0' }}>
                    <div>
                      <label>{isUrdu ? 'رابطے' : 'Connections'}</label>
                      <strong style={{ color: '#0f766e', fontSize: 16 }}>120</strong>
                    </div>
                    <div>
                      <label>{isUrdu ? 'مضامین' : 'Subjects'}</label>
                      <strong style={{ color: '#0f766e', fontSize: 16 }}>{drawerProfile.subjects?.length || 8}</strong>
                    </div>
                    <div>
                      <label>{isUrdu ? 'ریٹنگ' : 'Rating'}</label>
                      <strong style={{ color: '#d97706', fontSize: 16 }}>⭐ 4.9</strong>
                    </div>
                  </div>

                  {/* Badges & Achievements Grid (Sample Style: Top Scorer, Math Whiz, Helpful Peer, Perfect Attendance) */}
                  <div className="net-drawer-section">
                    <h4>{isUrdu ? 'اعزازات اور بیجز' : 'Achievements & Badges'}</h4>
                    <div className="net-sample-badges-grid">
                      <div className="net-sample-badge-item">
                        <div className="net-sample-badge-icon gold">🏆</div>
                        <strong>Top Scorer</strong>
                        <small>Rank #1 Academic</small>
                      </div>
                      <div className="net-sample-badge-item">
                        <div className="net-sample-badge-icon purple">🛡️</div>
                        <strong>Math Whiz</strong>
                        <small>98% Performance</small>
                      </div>
                      <div className="net-sample-badge-item">
                        <div className="net-sample-badge-icon teal">🛡️</div>
                        <strong>Helpful Peer</strong>
                        <small>Top Mentor</small>
                      </div>
                      <div className="net-sample-badge-item">
                        <div className="net-sample-badge-icon green">🎖️</div>
                        <strong>Perfect Attendance</strong>
                        <small>100% Punctual</small>
                      </div>
                    </div>

                    {/* Snapshot Badges */}
                    {drawerProfile.badges && drawerProfile.badges.length > 0 && (
                      <div className="net-badges-grid" style={{ marginTop: 10 }}>
                        {drawerProfile.badges.map(b => (
                          <div key={b.id} className="net-badge-award-card">
                            <Award size={16} />
                            <div>
                              <strong>{b.title}</strong>
                              <small>{b.period_identifier}</small>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Bio */}
                  {drawerProfile.bio && (
                    <div className="net-drawer-section">
                      <h4>{isUrdu ? 'تعارف' : 'About'}</h4>
                      <p className="net-drawer-bio">"{drawerProfile.bio}"</p>
                    </div>
                  )}

                  {/* Qualifications */}
                  {drawerProfile.qualifications && drawerProfile.qualifications.length > 0 && (
                    <div className="net-drawer-section">
                      <h4>{isUrdu ? 'اسناد و قابلیت (خود بیان کردہ)' : 'Qualifications (Self-declared)'}</h4>
                      <div className="net-chips-row">
                        {drawerProfile.qualifications.map((q, idx) => (
                          <span key={idx} className="net-chip">{q}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Subjects */}
                  {drawerProfile.subjects && drawerProfile.subjects.length > 0 && (
                    <div className="net-drawer-section">
                      <h4>{isUrdu ? 'تدریسی مضامین' : 'Subjects'}</h4>
                      <div className="net-chips-row">
                        {drawerProfile.subjects.map((s, idx) => (
                          <span key={idx} className="net-chip blue">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Networking Interests */}
                  {drawerProfile.interests && drawerProfile.interests.length > 0 && (
                    <div className="net-drawer-section">
                      <h4>{isUrdu ? 'دلچسپیاں' : 'Interests'}</h4>
                      <div className="net-chips-row">
                        {drawerProfile.interests.map((it, idx) => (
                          <span key={idx} className="net-chip green">{it}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="net-modal-foot">
              <button
                type="button"
                className="net-outline-btn"
                onClick={() => setActiveProfileDrawerId(null)}
              >
                {isUrdu ? 'بند کریں' : 'Close'}
              </button>
              {drawerProfile && !isMinorOrStudent && drawerProfile.id !== user.id && (
                <>
                  {drawerProfile.connection_status === 'connected' ? (
                    <span className="net-connected-chip"><CheckCircle2 size={13} /> {isUrdu ? 'مربوط' : 'Connected'}</span>
                  ) : drawerProfile.connection_status === 'pending_sent' ? (
                    <span className="net-pending-chip"><Clock size={13} /> {isUrdu ? 'زیر التواء' : 'Request Pending'}</span>
                  ) : (
                    <button
                      type="button"
                      className="net-action-btn primary"
                      onClick={() => {
                        const target = { id: drawerProfile.id, name: drawerProfile.full_name, school: drawerProfile.school_name };
                        setActiveProfileDrawerId(null);
                        handleOpenConnectModal(target);
                      }}
                    >
                      <UserPlus size={14} />
                      <span>{isUrdu ? 'رابطہ قائم کریں' : 'Connect'}</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* REPORT MODAL */}
      {/* ======================================================== */}
      {reportModalTarget && (
        <div className="net-modal-backdrop">
          <div className="net-modal-card">
            <div className="net-modal-head danger-head">
              <h3>
                <Flag size={18} />
                <span>{isUrdu ? 'غیر پیشہ ورانہ طرزِ عمل کی رپورٹ' : 'Report Unprofessional Conduct'}</span>
              </h3>
              <button type="button" onClick={() => setReportModalTarget(null)}><X size={18} /></button>
            </div>
            <div className="net-modal-body">
              <p>
                {isUrdu
                  ? `${reportModalTarget.name} کے خلاف رپورٹ درج کی جا رہی ہے۔ یہ رپورٹ براہِ راست پلیٹ فارم کمپلائنس ٹیم کو موصول ہو گی۔`
                  : `Filing a confidential report regarding ${reportModalTarget.name}. All reports are reviewed by platform administration.`}
              </p>

              <div className="net-form-group">
                <label>{isUrdu ? 'رپورٹ کی نوعیت' : 'Category'}</label>
                <select
                  className="net-select"
                  value={reportCategory}
                  onChange={e => setReportCategory(e.target.value)}
                >
                  <option value="unprofessional_conduct">{isUrdu ? 'غیر پیشہ ورانہ رویہ' : 'Unprofessional conduct'}</option>
                  <option value="harassment">{isUrdu ? 'ہراساں کرنا یا نامناسب زبان' : 'Harassment or offensive language'}</option>
                  <option value="inappropriate_profile">{isUrdu ? 'پروفائل میں غلط یا گمراہ کن معلومات' : 'Misleading or inappropriate profile'}</option>
                  <option value="minor_safety">{isUrdu ? 'بچوں کے تحفظ سے متعلق تشویش' : 'Child safety concern'}</option>
                  <option value="other">{isUrdu ? 'دیگر' : 'Other'}</option>
                </select>
              </div>

              <div className="net-form-group">
                <label>{isUrdu ? 'تفصیلات درج کریں' : 'Detailed Description'}</label>
                <textarea
                  className="net-textarea"
                  rows={4}
                  placeholder={isUrdu ? 'براہ کرم پیش آنے والے واقعے کی تفصیلات واضح کریں...' : 'Please specify the incident or concern with specific context...'}
                  value={reportDetails}
                  onChange={e => setReportDetails(e.target.value)}
                />
              </div>
            </div>
            <div className="net-modal-foot">
              <button
                type="button"
                className="net-outline-btn"
                onClick={() => setReportModalTarget(null)}
              >
                {isUrdu ? 'منسوخ کریں' : 'Cancel'}
              </button>
              <button
                type="button"
                className="net-action-btn danger"
                onClick={handleSubmitReport}
                disabled={submittingReport}
              >
                <Flag size={14} />
                <span>{submittingReport ? (isUrdu ? 'رپورٹ جمع ہو رہی ہے...' : 'Submitting...') : (isUrdu ? 'رپورٹ ارسال کریں' : 'Submit Report')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* METHODOLOGY & ETHICS MODAL */}
      {/* ======================================================== */}
      {showMethodologyModal && (
        <div className="net-modal-backdrop">
          <div className="net-modal-card methodology-modal">
            <div className="net-modal-head">
              <h3>
                <FileText size={18} />
                <span>{isUrdu ? 'طریقہ کار و دیانت کا منشور' : 'Academic Network Ranking Methodology & Transparency'}</span>
              </h3>
              <button type="button" onClick={() => setShowMethodologyModal(false)}><X size={18} /></button>
            </div>
            <div className="net-modal-body">
              <div className="net-methodology-section">
                <h4>{isUrdu ? '1. اسنیپ شاٹ درجہ بندی کا طریقہ کار' : '1. Published Snapshot Architecture'}</h4>
                <p>
                  {isUrdu
                    ? 'تمام رینکنگ اور اسکورز لائیو ڈیٹا بیس کیوریز سے نہیں بلکہ باضابطہ طور پر شائع شدہ امتحانی نتائج کے اسنیپ شاٹس سے اخذ کیے جاتے ہیں۔ اس کا مقصد یہ ہے کہ درجہ بندیاں غیر جانبدار، مصدقہ اور تاریخ وار قابلِ تصدیق رہیں۔'
                    : 'All rankings and badges are computed strictly from finalized, published assessment snapshots. Live fluctuating queries are never used, ensuring deterministic reproducibility and complete auditability.'}
                </p>
              </div>

              <div className="net-methodology-section">
                <h4>{isUrdu ? '2. برابری کی صورت میں رینکنگ (Competition Ties: 1, 2, 2, 4)' : '2. Standard Competition Ranking (1, 2, 2, 4)'}</h4>
                <p>
                  {isUrdu
                    ? 'اگر دو اساتذہ یا کیمپسز کے اسکورز بالکل برابر ہوں تو وہ ایک ہی رینک شیئر کرتے ہیں (مثلاً دو ارکان رینک 2 پر ہوں گے) اور اگلا رینک 4 ہو گا۔'
                    : 'Ties share the same rank. In the event of a tie for second place, both participants are awarded rank #2, and the subsequent participant is ranked #4.'}
                </p>
              </div>

              <div className="net-methodology-section">
                <h4>{isUrdu ? '3. کلاس سائز اور امتحانی اہلیت کی شرائط' : '3. Eligibility Thresholds & Cohort Normalization'}</h4>
                <p>
                  {isUrdu
                    ? 'درجہ بندی میں شامل ہونے کے لیے اساتذہ اور اسکولوں کے پاس کم از کم تصدیق شدہ طلبا اور شائع شدہ امتحانات کا ہونا ضروری ہے، تاکہ محض ایک یا دو طلبا کی بنیاد پر غیر متوازن درجہ بندی نہ بنے۔'
                    : 'To be eligible for leaderboard standing, cohorts must meet minimum student count and published exam thresholds, avoiding anomalies caused by single-student sample sizes.'}
                </p>
              </div>

              <div className="net-methodology-section">
                <h4>{isUrdu ? '4. مثبت اور تعمیری درجات (Non-punitive Labels)' : '4. Non-punitive Pedagogical Bands'}</h4>
                <p>
                  {isUrdu
                    ? 'آپٹیمس اورین تعلیمی نظام میں کبھی بھی نچلی سطح کی فہرست یا منفی الفاظ استعمال نہیں کیے جاتے۔ تمام بیجز ترقی، شمولیت اور تعلیمی معیار کی نشاندہی کرتے ہیں۔'
                    : 'Optimus Orien never renders a bottom of the list or punitive labels. Performance bands (Outstanding, Exemplary, High Commendation, Merit) provide constructive insight rather than stigmatization.'}
                </p>
              </div>
            </div>
            <div className="net-modal-foot">
              <button
                type="button"
                className="net-action-btn primary"
                onClick={() => setShowMethodologyModal(false)}
              >
                {isUrdu ? 'سمجھ گیا' : 'Understood'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* E2EE CHAT DRAWER (STAGE 4) */}
      {/* ======================================================== */}
      {activeChatPeer && (
        <div className="net-modal-backdrop">
          <div className="net-modal-card chat-drawer">
            <div className="net-chat-header">
              <div className="net-chat-peer-info">
                <div className="net-chat-peer-avatar">
                  {activeChatPeer.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="net-chat-peer-details">
                  <strong>{activeChatPeer.name}</strong>
                  <span>{activeChatPeer.school} • {activeChatPeer.role}</span>
                </div>
              </div>
              <div className="net-chat-head-actions">
                <button
                  type="button"
                  className="net-verify-btn"
                  onClick={handleOpenSafetyNumber}
                  title="Verify Safety Number"
                >
                  <KeyRound size={13} />
                  <span>{isUrdu ? 'سیفٹی نمبر' : 'Safety Number'}</span>
                </button>
                <button
                  type="button"
                  className="net-outline-btn"
                  onClick={() => {
                    setActiveChatPeer(null);
                    setActiveConversationId(null);
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Key Change Warning Banner */}
            {keyChangeWarning && (
              <div className="net-key-warning-banner">
                <AlertCircle size={16} />
                <span>
                  {isUrdu
                    ? '⚠️ تنبیہ: اس رابطے کی انکرپشن کی تبدیل ہو گئی ہے۔ یہ عموماً براؤزر بدلنے پر ہوتا ہے۔ برائے مہربانی سیفٹی نمبر کی تصدیق کریں۔'
                    : '⚠️ Security Notice: Peer encryption key has changed. Verify their safety number before sending sensitive information.'}
                </span>
              </div>
            )}

            <div className="net-e2ee-lock-notice">
              <Lock size={12} />
              <span>{isUrdu ? 'اینڈ ٹو اینڈ اینکرپٹڈ (E2EE) • سرور پر کوئی سادہ متن نہیں' : 'End-to-End Encrypted • Zero Server Plaintext Access'}</span>
            </div>

            <div className="net-chat-body">
              {chatLoading ? (
                <div className="net-loading-state">
                  <RefreshCw size={24} className="spin" />
                  <p>{isUrdu ? 'محفوظ سیشن قائم کیا جا رہا ہے...' : 'Establishing secure E2EE session...'}</p>
                </div>
              ) : chatMessages.length === 0 ? (
                <div className="net-empty-state">
                  <Lock size={32} />
                  <h3>{isUrdu ? 'محفوظ پیغام رسانی' : 'End-to-End Encrypted Session'}</h3>
                  <p>
                    {isUrdu
                      ? 'یہ گفتگو صرف آپ اور اس استاد کے درمیان اینکرپٹڈ ہے۔ پلیٹ فارم ایڈمن بھی اسے نہیں پڑھ سکتا۔'
                      : 'Messages are encrypted on your device and can only be decrypted by your colleague. No plaintext is ever stored.'}
                  </p>
                </div>
              ) : (
                chatMessages.map(msg => (
                  <div key={msg.id} className={`net-msg-row ${msg.sender_id === user.id ? 'sent' : 'received'}`}>
                    <div className={`net-msg-bubble ${msg.sender_id === user.id ? 'sent' : 'received'}`}>
                      <div className="net-msg-text">
                        {msg.plaintext.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
                          if (/^https?:\/\//.test(part)) {
                            return (
                              <a
                                key={i}
                                href={part}
                                onClick={(e) => {
                                  e.preventDefault();
                                  setExternalLinkConfirm(part);
                                }}
                              >
                                {part}
                              </a>
                            );
                          }
                          return part;
                        })}
                      </div>
                      <div className="net-msg-meta">
                        <span title="E2EE Authenticated"><Lock size={10} /></span>
                        <span>{new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {msg.sender_id === user.id && (
                          <span>{msg.delivered_at ? '✓✓' : '✓'}</span>
                        )}
                        {msg.sender_id !== user.id && (
                          <button
                            type="button"
                            className="net-msg-report-btn"
                            title="Report Message Misconduct"
                            onClick={() => {
                              setReportModalTarget({ id: msg.sender_id, name: activeChatPeer.name });
                              setReportDetails(`Reporting encrypted message #${msg.id}: "${msg.plaintext.substring(0, 100)}"`);
                            }}
                          >
                            <Flag size={10} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="net-chat-foot">
              <div className="net-chat-input-bar">
                <input
                  type="text"
                  className="net-chat-input"
                  placeholder={isUrdu ? 'اینکرپٹڈ پیغام لکھیں...' : 'Type an end-to-end encrypted message...'}
                  value={chatInputText}
                  onChange={e => setChatInputText(e.target.value.substring(0, 2000))}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendEncryptedMessage();
                    }
                  }}
                  disabled={sendingChatMessage}
                />
                <button
                  type="button"
                  className="net-chat-send-btn"
                  onClick={handleSendEncryptedMessage}
                  disabled={sendingChatMessage || !chatInputText.trim()}
                >
                  <Send size={15} />
                </button>
              </div>
              <div className="net-char-counter-sub">
                {chatInputText.length}/2000
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SAFETY NUMBER VERIFICATION MODAL */}
      {/* ======================================================== */}
      {showSafetyNumberModal && (
        <div className="net-modal-backdrop">
          <div className="net-modal-card">
            <div className="net-modal-head">
              <h3>
                <KeyRound size={18} />
                <span>{isUrdu ? 'سیفٹی نمبر کی تصدیق' : 'Verify Safety Number'}</span>
              </h3>
              <button type="button" onClick={() => setShowSafetyNumberModal(false)}><X size={18} /></button>
            </div>
            <div className="net-modal-body">
              <p>
                {isUrdu
                  ? 'اینڈ ٹو اینڈ اینکرپشن کی تصدیق کے لیے ان 60 ہندسوں کا اپنے ساتھی کے سکرین پر موجود نمبرز سے موازنہ کریں:'
                  : 'To confirm that messages are securely encrypted end-to-end, compare these 60 numbers with your colleague out-of-band:'}
              </p>
              <div className="net-safety-number-card">
                <div className="net-safety-code-grid">
                  {safetyNumberString.split(' ').map((chunk, i) => (
                    <div key={i} className="net-code-chunk">{chunk}</div>
                  ))}
                </div>
              </div>
              <p className="net-card-sub">
                {isUrdu
                  ? 'اگر دونوں سکرینز پر ہندسے بالکل یکساں ہیں تو آپ کا رابطہ 100% محفوظ ہے۔'
                  : 'If the numbers match on both devices, your connection is verified and free of interception.'}
              </p>
            </div>
            <div className="net-modal-foot">
              <button
                type="button"
                className="net-action-btn primary"
                onClick={() => setShowSafetyNumberModal(false)}
              >
                {isUrdu ? 'تصدیق مکمل' : 'Confirmed'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* RECOVERY PHRASE MODAL */}
      {/* ======================================================== */}
      {showRecoveryModal && (
        <div className="net-modal-backdrop">
          <div className="net-modal-card">
            <div className="net-modal-head">
              <h3>
                <ShieldCheck size={18} />
                <span>{isUrdu ? 'آپ کی سیکیورٹی ریکوری فریز' : 'Your Device Security Recovery Phrase'}</span>
              </h3>
              <button type="button" onClick={() => setShowRecoveryModal(false)}><X size={18} /></button>
            </div>
            <div className="net-modal-body">
              <p>
                {isUrdu
                  ? 'آپ کی انکرپشن کیز اس ڈیوائس پر کامیابی سے بن چکی ہیں۔ یہ 12 الفاظ لکھ کر محفوظ کر لیں:'
                  : 'Your device security keys have been generated. Write down these 12 words in a safe place. They allow you to restore chats on a new computer:'}
              </p>
              <div className="net-recovery-words-grid">
                {userRecoveryPhrase.split(' ').map((w, i) => (
                  <div key={i} className="net-recovery-word-tag">
                    <span>{i + 1}.</span> {w}
                  </div>
                ))}
              </div>
              <div className="net-safety-warning-box">
                <ShieldAlert size={14} />
                <span>
                  {isUrdu
                    ? 'یہ فریز کسی کے ساتھ شیئر نہ کریں۔ پلیٹ فارم ایڈمن بھی اسے کبھی طلب نہیں کرتا۔'
                    : 'Never share this phrase. Platform administrators will never ask for your recovery phrase.'}
                </span>
              </div>
            </div>
            <div className="net-modal-foot">
              <button
                type="button"
                className="net-action-btn primary"
                onClick={() => setShowRecoveryModal(false)}
              >
                {isUrdu ? 'میں نے محفوظ کر لیا ہے' : 'I Have Saved It'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* EXTERNAL LINK CONFIRMATION MODAL */}
      {/* ======================================================== */}
      {externalLinkConfirm && (
        <div className="net-modal-backdrop">
          <div className="net-modal-card">
            <div className="net-modal-head">
              <h3>
                <ExternalLink size={18} />
                <span>{isUrdu ? 'بیرونی ویب سائٹ کا انتباہ' : 'External Website Warning'}</span>
              </h3>
              <button type="button" onClick={() => setExternalLinkConfirm(null)}><X size={18} /></button>
            </div>
            <div className="net-modal-body">
              <p>
                {isUrdu
                  ? `آپ آپٹیمس اورین سے باہر ایک بیرونی ویب سائٹ کھول رہے ہیں:`
                  : `You are following a link to an external website:`}
              </p>
              <p style={{ wordBreak: 'break-all', fontWeight: 'bold', color: '#4f46e5' }}>
                {externalLinkConfirm}
              </p>
              <div className="net-safety-warning-box">
                <ShieldAlert size={14} />
                <span>
                  {isUrdu
                    ? 'آپٹیمس اورین بیرونی مواد کا ذمہ دار نہیں ہے۔ طلبا کے کوائف یا پاس ورڈ کبھی کسی بیرونی سائٹ پر درج نہ کریں۔'
                    : 'Optimus Orien is not responsible for external sites. Never enter credentials or student records on third-party domains.'}
                </span>
              </div>
            </div>
            <div className="net-modal-foot">
              <button
                type="button"
                className="net-outline-btn"
                onClick={() => setExternalLinkConfirm(null)}
              >
                {isUrdu ? 'منسوخ کریں' : 'Cancel'}
              </button>
              <button
                type="button"
                className="net-action-btn primary"
                onClick={() => {
                  window.open(externalLinkConfirm, '_blank', 'noopener,noreferrer');
                  setExternalLinkConfirm(null);
                }}
              >
                {isUrdu ? 'ویب سائٹ کھولیں' : 'Proceed to Website'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
