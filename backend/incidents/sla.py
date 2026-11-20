from datetime import timedelta

from django.utils import timezone

from .models import Incident


SLA_HOURS_BY_PRIORITY = {
    Incident.Priority.CRITICAL: 4,
    Incident.Priority.HIGH: 8,
    Incident.Priority.MEDIUM: 24,
    Incident.Priority.LOW: 72,
}


def incident_sla_due_at(incident):
    return incident.created_at + timedelta(hours=SLA_HOURS_BY_PRIORITY[incident.priority])


def incident_sla_status(incident, now=None):
    due_at = incident_sla_due_at(incident)
    now = now or timezone.now()

    if incident.status in {Incident.Status.RESOLVED, Incident.Status.CLOSED}:
        return 'resolved_on_time' if incident.updated_at <= due_at else 'resolved_late'
    if now >= due_at:
        return 'overdue'
    return 'on_track'
