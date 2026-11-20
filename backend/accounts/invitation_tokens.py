import base64
import hashlib
import hmac
import secrets
from datetime import timedelta
from zoneinfo import ZoneInfo

from cryptography.fernet import Fernet
from django.conf import settings


BUSINESS_TIME_ZONE = ZoneInfo('America/Bogota')
INVITATION_ENCRYPTION_CONTEXT = b'nefijj:organization-invitation:v1'


def create_invitation_code():
    return secrets.token_urlsafe(32)


def hash_invitation_code(code):
    return hashlib.sha256(code.encode('utf-8')).hexdigest()


def encrypt_invitation_code(code):
    key = hmac.new(
        settings.SECRET_KEY.encode('utf-8'),
        INVITATION_ENCRYPTION_CONTEXT,
        hashlib.sha256,
    ).digest()
    return Fernet(base64.urlsafe_b64encode(key)).encrypt(code.encode('utf-8')).decode('ascii')


def decrypt_invitation_code(ciphertext):
    key = hmac.new(
        settings.SECRET_KEY.encode('utf-8'),
        INVITATION_ENCRYPTION_CONTEXT,
        hashlib.sha256,
    ).digest()
    return Fernet(base64.urlsafe_b64encode(key)).decrypt(
        ciphertext.encode('ascii'),
    ).decode('utf-8')


def add_business_days(start, days):
    result = start.astimezone(BUSINESS_TIME_ZONE)
    remaining = days
    while remaining:
        result += timedelta(days=1)
        if result.weekday() < 5:
            remaining -= 1
    return result.astimezone(start.tzinfo)
