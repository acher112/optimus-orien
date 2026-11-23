import React, { useState } from 'react';
import { Trophy, Globe, ClipboardCheck, MessageSquare } from 'lucide-react';
import { type User } from './api';
import LeaderboardView from './communication/LeaderboardView';
import CommunityView from './communication/CommunityView';
import OnlineAssessmentsView from './communication/OnlineAssessmentsView';
import './hr.css';
import './communication/communication.css';

interface CommunicationProps {
  user: User;
  notify: (m: string, type?: string) => void;
  activeCampusId?: number | null;
  campuses?: Array<{ id: number; name: string; principal_name?: string }>;
  onSelectCampus?: (id: number | null) => void;
  initialTab?: 'leaderboard' | 'community' | 'assessments';
}

export default function Communication({
  user,
  notify,
  activeCampusId,
  campuses = [],
  onSelectCampus,
  initialTab = 'leaderboard'
}: CommunicationProps) {
  const [activeSuiteTab, setActiveSuiteTab] = useState<'leaderboard' | 'community' | 'assessments'>(initialTab);

  return (
    <div style={{ minHeight: '100vh', background: '#fbf8f3' }}>
      {/* Top Suite Tab Switcher */}
      <div style={{
        background: 'rgba(255, 253, 249, 0.95)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(254, 230, 133, 0.8)',
        padding: '12px 32px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        position: 'sticky',
        top: 0,
        zIndex: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 16, fontWeight: 800, fontSize: 15, color: '#1e1633' }}>
          <div style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #ff6b35, #f43f5e, #c026d3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff'
          }}>
            <MessageSquare size={16} />
          </div>
          <span>Communication</span>
        </div>

        <button
          className={`comm-tab-pill ${activeSuiteTab === 'leaderboard' ? 'active-leaderboard' : ''}`}
          onClick={() => setActiveSuiteTab('leaderboard')}
        >
          <Trophy size={15} /> Leaderboard
        </button>
        <button
          className={`comm-tab-pill ${activeSuiteTab === 'community' ? 'active-community' : ''}`}
          onClick={() => setActiveSuiteTab('community')}
        >
          <Globe size={15} /> Community
        </button>
        <button
          className={`comm-tab-pill ${activeSuiteTab === 'assessments' ? 'active-assessments' : ''}`}
          onClick={() => setActiveSuiteTab('assessments')}
        >
          <ClipboardCheck size={15} /> Online Assessments &amp; Quiz Competitions
        </button>
      </div>

      {/* Render Active View */}
      {activeSuiteTab === 'leaderboard' && (
        <LeaderboardView notify={notify} />
      )}
      {activeSuiteTab === 'community' && (
        <CommunityView notify={notify} />
      )}
      {activeSuiteTab === 'assessments' && (
        <OnlineAssessmentsView notify={notify} />
      )}
    </div>
  );
}
