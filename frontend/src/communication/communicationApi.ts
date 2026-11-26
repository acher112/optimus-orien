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
    )
};
