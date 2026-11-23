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
  name: string;
  handle?: string;
  grade?: string;
  school?: string;
  city?: string;
  curriculum?: string;
  status: 'active_user' | 'connected' | 'received_request' | 'sent_request' | 'not_connected' | 'verified' | 'provisional';
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
  subject: string;
  grade_level: string;
  curriculum: string;
  duration_minutes: number;
  max_participants: number;
  registered_count: number;
  eligible_countries: string;
  question_format_desc: string;
  total_marks: number;
  is_official: boolean;
  difficulty: string;
  scope: string;
  invite_code: string;
  questions_count: number;
  user_attempt?: {
    attempted: boolean;
    score?: number;
    accuracy?: number;
    time_spent?: number;
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
  score_percentage: number;
  raw_score: number;
  total_marks: number;
  accuracy_percentage: number;
  time_spent_seconds: number;
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
    return request<{ category: string; count: number; results: CommunityDirectoryItem[] }>(
      `/api/v1/communication/community/directory/?${q}`
    );
  },
  getMemberProfile: (type: 'student' | 'teacher', id: number) =>
    request<StudentProfileData>(`/api/v1/communication/community/profile/${type}/${id}/`),
  getConnections: () =>
    request<{ received: any[]; connected: any[]; sent: any[]; received_count: number; connected_count: number }>(
      '/api/v1/communication/community/connections/'
    ),
  handleConnectionAction: (action: string, target_id: number) =>
    request<{ status: string; detail: string }>('/api/v1/communication/community/connections/', {
      method: 'POST',
      body: JSON.stringify({ action, target_id })
    }),

  // 3. Online Assessments & Quiz Competitions
  getCompetitions: () =>
    request<{ official_competitions: QuizCompetitionItem[]; student_challenges: QuizCompetitionItem[] }>(
      '/api/v1/communication/assessments/competitions/'
    ),
  getCompetitionDetails: (id: number) =>
    request<{
      id: number;
      title: string;
      subject: string;
      duration_minutes: number;
      total_marks: number;
      is_official: boolean;
      has_attempted: boolean;
      existing_attempt?: any;
      questions: QuizQuestionItem[];
    }>(`/api/v1/communication/assessments/competitions/${id}/`),
  submitAttempt: (id: number, answers: Record<string, any>, timeSpentSeconds: number) =>
    request<QuizAttemptResult>(`/api/v1/communication/assessments/competitions/${id}/attempt/`, {
      method: 'POST',
      body: JSON.stringify({ answers, time_spent_seconds: timeSpentSeconds })
    }),
  createQuiz: (data: any) =>
    request<{ message: string; competition_id: number; invite_code: string; title: string }>(
      '/api/v1/communication/assessments/create-quiz/',
      { method: 'POST', body: JSON.stringify(data) }
    ),
  joinQuizByCode: (code: string) =>
    request<any>(`/api/v1/communication/assessments/join/${code}/`),
  getQuizLeaderboard: (category: 'official' | 'student', scope = 'global') =>
    request<{ category: string; results: any[] }>(
      `/api/v1/communication/assessments/leaderboard/?category=${category}&scope=${scope}`
    ),
  getPeerScores: (id: number) =>
    request<{ challenge_id: number; title: string; author: string; standings: any[] }>(
      `/api/v1/communication/assessments/peer-scores/${id}/`
    )
};
