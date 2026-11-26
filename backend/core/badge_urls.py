"""
Badges and Achievements URL Configuration.
"""
from django.urls import path
from core import badge_views

urlpatterns = [
    path('catalogue/', badge_views.badge_catalogue_view, name='badge_catalogue'),
    path('my/', badge_views.my_achievements_view, name='my_achievements'),
    path('student/<int:student_id>/', badge_views.student_achievements_view, name='student_achievements'),
    path('school-summary/', badge_views.school_summary_view, name='badge_school_summary'),
    path('confer-manual/', badge_views.confer_manual_award_view, name='badge_confer_manual'),
    path('reviews/', badge_views.badge_reviews_view, name='badge_reviews'),
    path('resolve-review/', badge_views.resolve_badge_review_view, name='badge_resolve_review'),
    path('evaluate-trigger/', badge_views.evaluate_trigger_view, name='badge_evaluate_trigger'),
]
