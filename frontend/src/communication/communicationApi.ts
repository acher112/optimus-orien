import { request } from '../api';

export interface LeaderboardSchoolItem {
  id: number;
  name: string;
  campus: string;
  principal_name: string;
  city: string;
  country: string;
  curriculum: string;
  students_count: number;
  academic_average: number;
  rank_delta: string;
  trend: string;
  status: string;
  rank?: number;
  organisation_name?: string;
  campuses_count?: number;
  total_students?: number;
}

export interface LeaderboardPrincipalItem {
  rank: number;
  name: string;
  school: string;
  city: string;
  curriculum: string;
  tenure_years: number;
  institutional_index: number;
  retention_rate: string;
  status: string;
}

export interface LeaderboardTeacherItem {
  rank: number;
  name: string;
  subject: string;
  school: string;
  curriculum: string;
  pass_rate: string;
  class_average: number;
  students_taught: number;
  badges: string[];
}

export interface LeaderboardStudentItem {
  rank: number;
  name: string;
  grade: string;
  school: string;
  city: string;
  curriculum: string;
  academic_average: number;
  percentile: string;
  olympiad_wins: number;
  badges: string[];
}

export interface SchoolDetailModalData {
  id: number;
  name: string;
  campus: string;
  principal: string;
  city: string;
  country: string;
  curriculum: string;
  student_count: number;
  faculty_count: number;
  academic_average: number;
  consistency_rating: string;
  established_year: number;
  accreditations: string[];
  top_faculty: Array<{ name: string; role: string; distinction_rate: string }>;
  performance_breakdown: Record<string, number>;
}

export interface CommunityDirectoryItem {
  id: number;
  user_id?: number | null;
  target_type?: 'student' | 'teacher' | 'principal' | 'school' | string;
  has_account?: boolean;
  request_id?: number | null;
  name: string;
  handle?: string;
  grade?: string;
  school?: string;
  city?: string;
  curriculum?: string;
  status: 'active_user' | 'connected' | 'received_request' | 'sent_request' | 'not_connected' | 'no_account' | 'verified' | 'provisional';
  avatar_color?: string;
  badges?: string[];
  average?: number;
  subject?: string;
  experience?: string;
  classes?: number;
  tenure?: string;
  students?: number;
  principal?: string;
}

export interface StudentProfileData {
  id: number;
  name: string;
  handle: string;
  bio: string;
  school: string;
  city: string;
  curriculum: string;
  grade: string;
  connection_status: string;
  kpis: {
    academic_average: number;
    global_rank: number;
    assessments_taken: number;
    competitions_entered: number;
    badges_earned: number;
  };
  subjects: Array<{ name: string; score: number; grade: string }>;
  badges: Array<{ title: string; category: string; date: string; icon: string }>;
  verified_records: Array<{ competition: string; score: number; time: string; date: string; status: string }>;
}

export interface QuizCompetitionItem {
  id: number;
  title: string;
  sponsor_name: string;
  created_by_name?: string;
  created_by_role?: string;
  created_by_campus?: string;
  subject: string;
  topic?: string;
  grade_level: string;
  curriculum: string;
  duration_minutes: number;
  max_participants: number;
  registered_count: number;
  attempts_count?: number;
  eligible_countries: string;
  question_format_desc: string;
  total_marks: number;
  is_official: boolean;
  difficulty: string;
  scope: string;
  scope_label?: string;
  target_school_id?: number | null;
  target_school_name?: string | null;
  target_class_id?: number | null;
  target_class_name?: string | null;
  invite_code: string;
  generation_source?: string;
  start_time?: string | null;
  end_time?: string | null;
  created_at?: string | null;
  window_status?: 'live' | 'scheduled' | 'ended';
  questions_count: number;
  user_attempt?: {
    attempted: boolean;
    attempt_id?: number;
    score?: number;
    accuracy?: number;
    time_spent?: number;
    country?: string;
    region?: string;
    submitted_at?: string;
  };
}

export interface QuizQuestionItem {
  id: number;
  order: number;
  prompt: string;
  question_type: 'numerical' | 'multiple_choice' | 'true_false' | 'matching' | string;
  options?: any[];
  unit?: string;
  marks: number;
}

export interface QuizAttemptResult {
  message: string;
  attempt_id: number;
  competition_id: number;
  title?: string;
  subject?: string;
  difficulty?: string;
  scope?: string;
  scope_label?: string;
  score_percentage: number;
  raw_score: number;
  total_marks: number;
  accuracy_percentage: number;
  time_spent_seconds: number;
  speed_seconds_per_question?: number;
  country?: string;
  region?: string;
  rank?: number;
  total_participants?: number;
  saved_to_profile?: boolean;
  is_official: boolean;
  graded_breakdown: Array<{
    question_id: number;
    order: number;
    prompt: string;
    question_type: string;
    user_answer: string;
    correct_answer: string;
    is_correct: boolean;
    marks_earned: number;
    max_marks: number;
    explanation: string;
  }>;
}

export interface CountryPerformanceStat {
  rank: number;
  country: string;
  participants: number;
  avg_score: number;
  avg_accuracy: number;
  best_score: number;
  avg_time_seconds: number;
  avg_time_display: string;
  top_performer: string;
}

export interface QuizChartItem {
  id: number;
  title: string;
  short_title: string;
  subject: string;
  difficulty: string;
  scope: string;
  scope_label: string;
  attempts_count: number;
  avg_score: number;
  avg_accuracy: number;
  top_score: number;
  creator_name: string;
}

export interface CountryChartItem {
  country: string;
  student_count: number;
  avg_score: number;
  avg_accuracy: number;
  avg_time_seconds: number;
  top_score: number;
  top_performer: string;
}

export interface HonorBadge {
  id: string;
  title: string;
  category: string;
  tier: 'gold' | 'silver' | 'bronze' | 'purple' | 'emerald' | 'blue';
  icon: string;
  color: string;
  description: string;
  assigned_at?: string;
  awarded_by?: string;
}

export interface TopStudentHonor {
  id: number;
  name: string;
  handle: string;
  avatar_color?: string;
  initials?: string;
  school_name: string;
  country: string;
  best_score: number;
  avg_score: number;
  avg_accuracy: number;
  quizzes_attempted: number;
  fastest_time_seconds?: number;
  fastest_time_display?: string;
  badges: HonorBadge[];
}

export interface TopTeacherHonor {
  id: number;
  name: string;
  email?: string;
  avatar_color?: string;
  initials?: string;
  school_name: string;
  subject: string;
  quizzes_created: number;
  total_students_assessed: number;
  avg_participants_per_quiz?: number;
  avg_student_score: number;
  avg_student_accuracy: number;
  badges: HonorBadge[];
  quizzes_list?: Array<{
    id: number;
    title: string;
    subject: string;
    difficulty: string;
    scope: string;
    scope_label: string;
    attempts_count: number;
    avg_score: number;
    created_at?: string;
  }>;
}

export interface TopPrincipalHonor {
  id: number;
  name: string;
  principal_name?: string;
  avatar_color?: string;
  initials?: string;
  school_id: number;
  campus_name: string;
  city_country: string;
  total_campus_participants: number;
  campus_avg_score: number;
  campus_avg_accuracy: number;
  top_student_score: number;
  badges: HonorBadge[];
  top_students?: TopStudentHonor[];
}

export interface AssessmentsAnalyticsResponse {
  summary: {
    total_quizzes: number;
    total_attempts: number;
    total_students_participated: number;
    total_countries_participated: number;
    avg_score: number;
    avg_accuracy: number;
    highest_score: number;
  };
  quiz_attempts_chart: QuizChartItem[];
  country_distribution_chart: CountryChartItem[];
  badges: {
    students: TopStudentHonor[];
    teachers: TopTeacherHonor[];
    principals: TopPrincipalHonor[];
  };
}

export const communicationApi = {
  // 1. Leaderboard
  getSchools: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return request<{ view_type: string; count: number; results: LeaderboardSchoolItem[] }>(
      `/api/v1/communication/leaderboard/schools/?${q}`
    );
  },
  getPrincipals: () =>
    request<{ results: LeaderboardPrincipalItem[] }>('/api/v1/communication/leaderboard/principals/'),
  getTeachers: () =>
    request<{ results: LeaderboardTeacherItem[] }>('/api/v1/communication/leaderboard/teachers/'),
  getStudents: () =>
    request<{ results: LeaderboardStudentItem[] }>('/api/v1/communication/leaderboard/students/'),
  getSchoolDetail: (id: number) =>
    request<SchoolDetailModalData>(`/api/v1/communication/leaderboard/schools/${id}/`),
  getMethodology: () =>
    request<{ weights: Array<{ factor: string; weight: number; description: string }>; fairness_rules: string[] }>(
      '/api/v1/communication/leaderboard/methodology/'
    ),
  getPrivacySettings: () =>
    request<{ visibility_tier: string; show_student_names: boolean; publish_assessment_scores: boolean; show_teacher_contacts: boolean; allow_incoming_connections: boolean }>(
      '/api/v1/communication/leaderboard/privacy/'
    ),
  updatePrivacySettings: (data: any) =>
    request<{ detail: string }>('/api/v1/communication/leaderboard/privacy/', {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),

  // 2. Community
  getDirectory: (category: 'students' | 'teachers' | 'principals' | 'schools', search = '') => {
    const q = new URLSearchParams({ category, search }).toString();
    return request<{
      category: string;
      count: number;
      results: CommunityDirectoryItem[];
      category_counts?: { students: number; teachers: number; principals: number; schools: number };
    }>(
      `/api/v1/communication/community/directory/?${q}`
    );
  },
  getMemberProfile: (type: 'student' | 'teacher' | 'principal', id: number) =>
    request<StudentProfileData>(`/api/v1/communication/community/profile/${type}/${id}/`),
  getConnections: () =>
    request<{ received: any[]; connected: any[]; sent: any[]; received_count: number; connected_count: number }>(
      '/api/v1/communication/community/connections/'
    ),
  handleConnectionAction: (
    action: string,
    target_id: number,
    extra?: { target_user_id?: number | null; target_type?: string; request_id?: number | null }
  ) =>
    request<{ status: string; detail: string; action?: string; request_id?: number }>('/api/v1/communication/community/connections/', {
      method: 'POST',
      body: JSON.stringify({ action, target_id, ...(extra || {}) })
    }),

  // 3. Online Assessments & Quiz Competitions
  getCompetitions: () =>
    request<{
      available_quizzes: QuizCompetitionItem[];
      official_competitions: QuizCompetitionItem[];
      student_challenges: QuizCompetitionItem[];
      participant_country?: string;
      participant_region?: string;
      user_class_info?: { id: number; name: string; grade_level?: string; section?: string } | null;
      available_classes?: Array<{ id: number; name: string; grade_level?: string; section?: string }>;
    }>(
      '/api/v1/communication/assessments/competitions/'
    ),
  getCompetitionDetails: (id: number) =>
    request<{
      id: number;
      title: string;
      subject: string;
      topic?: string;
      difficulty?: string;
      scope?: string;
      scope_label?: string;
      created_by_name?: string;
      created_by_role?: string;
      created_by_campus?: string;
      start_time?: string | null;
      end_time?: string | null;
      window_status?: string;
      duration_minutes: number;
      total_marks: number;
      is_official: boolean;
      has_attempted: boolean;
      participant_country?: string;
      participant_region?: string;
      existing_attempt?: any;
      questions: QuizQuestionItem[];
    }>(`/api/v1/communication/assessments/competitions/${id}/`),
  submitAttempt: (
    id: number,
    answers: Record<string, any>,
    timeSpentSeconds: number,
    location?: { country?: string; region?: string }
  ) =>
    request<QuizAttemptResult>(`/api/v1/communication/assessments/competitions/${id}/attempt/`, {
      method: 'POST',
      body: JSON.stringify({
        answers,
        time_spent_seconds: timeSpentSeconds,
        ...(location || {})
      })
    }),
  generateQuizQuestions: (data: {
    subject: string;
    topic?: string;
    difficulty?: string;
    grade_level?: string;
    num_questions?: number;
  }) =>
    request<{ source: string; difficulty: string; subject: string; topic: string; questions: any[] }>(
      '/api/v1/communication/assessments/generate-questions/',
      { method: 'POST', body: JSON.stringify(data) }
    ),
  createQuiz: (data: any) =>
    request<{
      message: string;
      competition_id: number;
      invite_code: string;
      title: string;
      questions_count?: number;
      scope_label?: string;
    }>(
      '/api/v1/communication/assessments/create-quiz/',
      { method: 'POST', body: JSON.stringify(data) }
    ),
  joinQuizByCode: (code: string) =>
    request<any>(`/api/v1/communication/assessments/join/${code}/`),
  getQuizLeaderboard: (params: { quiz_id?: string; scope?: string; country?: string; mine_only?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (params.quiz_id) q.set('quiz_id', params.quiz_id);
    if (params.scope) q.set('scope', params.scope);
    if (params.country) q.set('country', params.country);
    if (params.mine_only) q.set('mine_only', 'true');
    return request<{
      results: any[];
      country_analytics: CountryPerformanceStat[];
      available_countries: string[];
      quiz_options: Array<{ id: number; title: string; subject: string; difficulty: string; scope_label: string; attempts_count: number }>;
      my_summary: { total_attempted: number; average_score: number | null; average_accuracy: number | null; best_score: number | null };
    }>(
      `/api/v1/communication/assessments/leaderboard/?${q.toString()}`
    );
  },
  getPeerScores: (id: number) =>
    request<{ challenge_id: number; title: string; author: string; standings: any[] }>(
      `/api/v1/communication/assessments/peer-scores/${id}/`
    ),
  getCompetitionStandings: (id: number) =>
    request<{ competition_id: number; title: string; standings: any[] }>(
      `/api/v1/communication/assessments/competitions/${id}/standings/`
    ),
  getAssessmentsAnalytics: (params: { scope?: string; country?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.scope) q.set('scope', params.scope);
    if (params.country) q.set('country', params.country);
    return request<AssessmentsAnalyticsResponse>(
      `/api/v1/communication/assessments/analytics-badges/?${q.toString()}`
    );
  },
  assignHonorBadge: (data: {
    target_role: 'student' | 'teacher' | 'principal';
    target_id: number;
    badge_title: string;
    badge_tier?: string;
    badge_description?: string;
  }) =>
    request<{ success: boolean; message: string; badge: HonorBadge }>(
      '/api/v1/communication/assessments/analytics-badges/',
      { method: 'POST', body: JSON.stringify(data) }
    ),

  // 4. Inbox & Direct Messaging (WhatsApp / Instagram Direct style)
  getInboxConversations: () =>
    request<{ count: number; conversations: InboxConversation[] }>(
      '/api/v1/communication/inbox/conversations/'
    ),
  openInboxConversation: (peerId: number) =>
    request<{ detail: string; conversation_id: number; status: string; created_at: string }>(
      '/api/v1/communication/inbox/conversations/',
      { method: 'POST', body: JSON.stringify({ peer_id: peerId }) }
    ),
  getInboxMessages: (conversationId: number, since?: string) => {
    const q = since ? `?since=${encodeURIComponent(since)}` : '';
    return request<{ count: number; messages: InboxMessage[] }>(
      `/api/v1/communication/inbox/conversations/${conversationId}/messages/${q}`
    );
  },
  sendInboxMessage: (conversationId: number, message: string, nonce: string = 'backend-e2ee', sender_signature: string = '') =>
    request<{ detail: string; message_id: number; sent_at: string }>(
      `/api/v1/communication/inbox/conversations/${conversationId}/messages/`,
      { method: 'POST', body: JSON.stringify({ message, text: message, ciphertext: message, nonce, sender_signature }) }
    ),
  getInboxUnreadCount: () =>
    request<{ unread_count: number }>(
      '/api/v1/communication/inbox/unread-count/'
    ),

  // 5. Academic Q&A Discussion Forum
  getDiscussions: (params?: {
    scope?: string;
    category?: string;
    subject?: string;
    status?: string;
    search?: string;
    campus_id?: number | string;
  }) => {
    const query = new URLSearchParams();
    if (params?.scope) query.set('scope', params.scope);
    if (params?.category) query.set('category', params.category);
    if (params?.subject) query.set('subject', params.subject);
    if (params?.status) query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.campus_id) query.set('campus_id', String(params.campus_id));
    const qs = query.toString();
    return request<{ stats: QADiscussionStats; count: number; results: QADiscussionItem[] }>(
      `/api/v1/communication/discussions/${qs ? `?${qs}` : ''}`
    );
  },
  getDiscussionDetail: (id: number) =>
    request<QADiscussionDetail>(`/api/v1/communication/discussions/${id}/`),
  createDiscussion: (data: {
    title: string;
    body: string;
    category?: string;
    subject_id?: number | null;
    custom_subject?: string;
    class_id?: number | null;
    class_grade_label?: string;
    audience_scope?: string;
    school_id?: number | null;
  }) =>
    request<QADiscussionItem>('/api/v1/communication/discussions/', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  postDiscussionAnswer: (discussionId: number, body: string) =>
    request<QADiscussionAnswer>(`/api/v1/communication/discussions/${discussionId}/answers/`, {
      method: 'POST',
      body: JSON.stringify({ body })
    }),
  acceptDiscussionSolution: (discussionId: number, answerId: number) =>
    request<{ detail: string; question_status: string; accepted_answer_id: number }>(
      `/api/v1/communication/discussions/${discussionId}/accept-solution/`,
      { method: 'POST', body: JSON.stringify({ answer_id: answerId }) }
    ),
  upvoteDiscussion: (discussionId: number, answerId?: number) =>
    request<{ detail: string; helpful_count?: number; upvotes_count?: number }>(
      `/api/v1/communication/discussions/${discussionId}/helpful/`,
      { method: 'POST', body: JSON.stringify(answerId ? { answer_id: answerId } : {}) }
    )
};

export interface InboxPeer {
  id: number;
  name: string;
  username: string;
  role: string;
  role_label: string;
  school: string;
  city: string;
  avatar_color: string;
}

export interface InboxConversation {
  conversation_id: number | null;
  peer: InboxPeer;
  total_messages: number;
  unread_count: number;
  who_msg_first: 'you' | 'peer' | 'none';
  who_msg_first_label: string;
  last_message: {
    text?: string;
    ciphertext?: string;
    sender_name?: string;
    sender_id?: number;
    sent_at: string;
    is_mine: boolean;
    delivered: boolean;
  } | null;
  last_activity_at: string;
}

export interface InboxMessage {
  id: number;
  conversation_id: number;
  sender_id: number;
  sender_name: string;
  is_mine: boolean;
  text?: string;
  ciphertext: string;
  nonce: string;
  sender_signature?: string;
  sent_at: string;
  delivered_at: string | null;
}

export interface QADiscussionAuthor {
  id: number | null;
  name: string;
  username: string;
  role: string;
  avatar_color: string;
  avatar_image?: string;
}

export interface QADiscussionItem {
  id: number;
  title: string;
  body_preview: string;
  category: string;
  subject_id: number | null;
  subject_name: string;
  is_custom_subject: boolean;
  class_id: number | null;
  class_name: string;
  school_id: number | null;
  school_name: string;
  audience_scope: 'campus_teachers' | 'campus_students' | 'campus_staff_all' | 'all_campuses' | 'worldwide' | string;
  audience_scope_label: string;
  status: 'open' | 'answered' | 'closed';
  status_label: string;
  author: QADiscussionAuthor;
  upvotes_count: number;
  views_count: number;
  answers_count: number;
  has_accepted_solution: boolean;
  can_reply: boolean;
  created_at: string;
  updated_at: string;
}

export interface QADiscussionAnswer {
  id: number;
  author: QADiscussionAuthor;
  body: string;
  is_accepted_solution: boolean;
  helpful_count: number;
  created_at: string;
  updated_at: string;
}

export interface QADiscussionDetail extends QADiscussionItem {
  body: string;
  reply_permission_reason?: string;
  can_mark_solution?: boolean;
  answers: QADiscussionAnswer[];
}

export interface QADiscussionStats {
  total_queries: number;
  worldwide_count: number;
  campus_queries: number;
  solved_count: number;
  my_queries: number;
}
