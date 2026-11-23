import os
import sys
import django
from django.test import RequestFactory

sys.path.insert(0, r'd:\optimus-orien\optimus-orien\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config')
django.setup()

from core.communication_views import (
    LeaderboardSchoolsView,
    AssessmentsCompetitionsListView,
    CommunityDirectoryView
)
from core.models import User

rf = RequestFactory()
user = User.objects.first()

print("--- Testing LeaderboardSchoolsView ---")
req = rf.get('/api/v1/communication/leaderboard/schools/')
req.user = user
resp = LeaderboardSchoolsView.as_view()(req)
print(f"Status: {resp.status_code}, Found {len(resp.data.get('results', []))} schools.")

print("\n--- Testing AssessmentsCompetitionsListView ---")
req2 = rf.get('/api/v1/communication/assessments/competitions/')
req2.user = user
resp2 = AssessmentsCompetitionsListView.as_view()(req2)
print(f"Status: {resp2.status_code}, Official: {len(resp2.data.get('official_competitions', []))}, Practice: {len(resp2.data.get('student_challenges', []))}")

print("\n--- Testing CommunityDirectoryView ---")
req3 = rf.get('/api/v1/communication/community/directory/?category=students')
req3.user = user
resp3 = CommunityDirectoryView.as_view()(req3)
print(f"Status: {resp3.status_code}, Students: {len(resp3.data.get('results', []))}")

from core.communication_views import AssessmentsAttemptSubmitView
from core.models import QuizCompetition

print("\n--- Testing AssessmentsAttemptSubmitView ---")
comp = QuizCompetition.objects.filter(is_official=True).first()
q_list = list(comp.questions.all().order_by('order'))
# Provide sample answers for q1 (8.2), q2 (C), q3 (true), q4 matching
ans = {
    str(q_list[0].id): "8.2",
    str(q_list[1].id): "C",
    str(q_list[2].id): "true",
    str(q_list[3].id): {
        "Area of Circle": "πr²",
        "Circumference of Circle": "2πr",
        "Volume of Sphere": "4/3 πr³",
        "Surface Area of Sphere": "4πr²"
    }
}
req4 = rf.post(f'/api/v1/communication/assessments/competitions/{comp.id}/attempt/', {'answers': ans, 'time_spent_seconds': 145}, content_type='application/json')
req4.user = user
resp4 = AssessmentsAttemptSubmitView.as_view()(req4, pk=comp.id)
print(f"Submit Status: {resp4.status_code}, Score: {resp4.data.get('score_percentage')}%, Accuracy: {resp4.data.get('accuracy_percentage')}%")
