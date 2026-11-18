import hashlib
import secrets
from datetime import timedelta
from zoneinfo import ZoneInfo


BUSINESS_TIME_ZONE = ZoneInfo('America/Bogota')


def create_invitation_code():
    return secrets.token_urlsafe(32)


def hash_invitation_code(code):
    return hashlib.sha256(code.encode('utf-8')).hexdigest()


def add_business_days(start, days):
    result = start.astimezone(BUSINESS_TIME_ZONE)
    remaining = days
    while remaining:
        result += timedelta(days=1)
        if result.weekday() < 5:
            remaining -= 1
    return result.astimezone(start.tzinfo)
