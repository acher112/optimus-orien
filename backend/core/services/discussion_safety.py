import re
from rest_framework.exceptions import ValidationError, PermissionDenied
from django.utils import timezone
from core.models import DiscussionMute

DEFAULT_BLOCKED_WORDS = [
    'abuse', 'idiot', 'stupid', 'bastard', 'bitch', 'asshole', 'damn', 'crap',
    'chutiya', 'kameena', 'harami', 'kutta', 'bhenchod', 'madarchod', 'gandu',
    'bakwas', 'fraud', 'hate', 'kill', 'die', 'murder', 'cheat'
]

# Patterns for phone numbers, email addresses, and external links/URLs
PHONE_PATTERN = re.compile(r'(\+?\d[\d\s\-\(\)]{7,}\d)')
EMAIL_PATTERN = re.compile(r'([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)')
URL_PATTERN = re.compile(r'(https?://[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(?:com|org|net|edu|pk|io)[^\s]*)', re.IGNORECASE)

def check_discussion_content(text: str, school):
    """
    Validates text against:
    1. Phone numbers, emails, and external web links
    2. Blocked / profane words (built-in + campus specific)
    Raises ValidationError if any violation is found.
    """
    if not text:
        return

    # Check for phone numbers
    if PHONE_PATTERN.search(text):
        raise ValidationError({'detail': 'For safety and privacy, phone numbers, email addresses, and external links are not allowed in discussion posts.'})

    # Check for email addresses
    if EMAIL_PATTERN.search(text):
        raise ValidationError({'detail': 'For safety and privacy, phone numbers, email addresses, and external links are not allowed in discussion posts.'})

    # Check for URLs
    if URL_PATTERN.search(text):
        raise ValidationError({'detail': 'For safety and privacy, phone numbers, email addresses, and external links are not allowed in discussion posts.'})

    # Build blocked word set
    blocked = set(DEFAULT_BLOCKED_WORDS)
    if school and getattr(school, 'blocked_words', None):
        custom = [w.strip().lower() for w in school.blocked_words.replace(',', '\n').split() if w.strip()]
        blocked.update(custom)

    words = re.findall(r'\b\w+\b', text.lower())
    for w in words:
        if w in blocked:
            raise ValidationError({'detail': 'Please keep discussions polite and academic. Inappropriate language was detected.'})


def check_student_mute(student):
    """
    Checks if a student has an active mute.
    Raises PermissionDenied if currently muted.
    """
    if not student:
        return
    now = timezone.now()
    mute = DiscussionMute.objects.filter(student=student, until__gt=now).order_by('-until').first()
    if mute:
        until_str = mute.until.strftime('%b %d, %Y at %I:%M %p')
        raise PermissionDenied(f"You are currently muted from discussions until {until_str}. Reason: {mute.reason}")
