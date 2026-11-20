from pathlib import Path
from uuid import uuid4

from django.core.exceptions import ValidationError
from django.db import models

from accounts.models import Location, Organization, User


class LegacyIntegerForeignKey(models.ForeignKey):
    def db_type(self, connection):
        return models.BigIntegerField().db_type(connection)


def incident_evidence_path(instance, filename):
    extension = Path(filename).suffix.lower()
    return f'evidences/{uuid4().hex}{extension}'


def incident_resolution_path(instance, filename):
    extension = Path(filename).suffix.lower()
    return f'evidences/resolutions/{uuid4().hex}{extension}'


class Category(models.Model):
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='incident_categories',
    )
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'incidents_category'
        ordering = ['name']

    def __str__(self):
        return self.name


class CategoryTechnician(models.Model):
    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,
        related_name='technician_routes',
    )
    location = models.ForeignKey(
        Location,
        on_delete=models.CASCADE,
        related_name='category_technician_routes',
    )
    technician = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='category_technician_routes',
    )

    class Meta:
        db_table = 'incidents_categorytechnician'
        constraints = [
            models.UniqueConstraint(
                fields=['category', 'location'],
                name='unique_category_location_technician_route',
            ),
        ]

    def clean(self):
        super().clean()
        if self.category_id and self.location_id:
            if self.category.organization_id != self.location.organization_id:
                raise ValidationError({'location': 'La sede debe pertenecer a la organización de la categoría.'})
        if self.technician_id and self.location_id:
            if (
                self.technician.effective_role != 'technician'
                or self.technician.location_id != self.location_id
            ):
                raise ValidationError({'technician': 'El técnico debe pertenecer a la sede seleccionada.'})


class Incident(models.Model):
    class Priority(models.TextChoices):
        LOW = 'baja', 'Baja'
        MEDIUM = 'media', 'Media'
        HIGH = 'alta', 'Alta'
        CRITICAL = 'critica', 'Crítica'

    class Status(models.TextChoices):
        PENDING = 'pendiente', 'Pendiente'
        IN_PROGRESS = 'en_proceso', 'En proceso'
        RESOLVED = 'resuelto', 'Resuelto'
        CLOSED = 'cerrado', 'Cerrado'

    organization = models.ForeignKey(
        Organization,
        on_delete=models.PROTECT,
        related_name='incidents',
    )
    location = models.ForeignKey(
        Location,
        on_delete=models.PROTECT,
        related_name='incidents',
    )
    reported_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='reported_incidents',
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name='incidents',
    )
    assigned_to = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='assigned_incidents',
    )
    title = models.CharField(max_length=255)
    description = models.TextField()
    priority = models.CharField(max_length=50, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=50, choices=Status.choices, default=Status.PENDING)
    evidence_image = models.ImageField(
        max_length=100,
        upload_to=incident_evidence_path,
        null=True,
        blank=True,
    )
    resolution_note = models.TextField(blank=True, default='')
    resolution_image = models.ImageField(
        max_length=120,
        upload_to=incident_resolution_path,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'incidents_incident'
        ordering = ['-created_at']

    def clean(self):
        super().clean()
        if self.location_id and self.organization_id != self.location.organization_id:
            raise ValidationError({'location': 'La sede debe pertenecer a la organización de la incidencia.'})
        if self.category_id and self.organization_id != self.category.organization_id:
            raise ValidationError({'category': 'La categoría debe pertenecer a la organización de la incidencia.'})
        if self.reported_by_id and self.reported_by.location_id != self.location_id:
            raise ValidationError({'reported_by': 'La sede debe coincidir con la del reportante.'})
        if self.assigned_to_id and (
            self.assigned_to.effective_role != 'technician'
            or self.assigned_to.location_id != self.location_id
        ):
            raise ValidationError({'assigned_to': 'El técnico debe pertenecer a la misma sede.'})

    def __str__(self):
        return self.title


class IncidentEvent(models.Model):
    class EventType(models.TextChoices):
        CREATED = 'created', 'Creada'
        ASSIGNED = 'assigned', 'Asignada'
        STATUS_CHANGED = 'status_changed', 'Cambio de estado'

    event_type = models.CharField(max_length=30, choices=EventType.choices)
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    actor = models.ForeignKey(User, on_delete=models.PROTECT, related_name='incident_events')
    incident = models.ForeignKey(
        Incident,
        on_delete=models.CASCADE,
        related_name='events',
    )

    class Meta:
        db_table = 'incidents_incidentevent'
        ordering = ['created_at']


class IncidentNotification(models.Model):
    recipient = LegacyIntegerForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='incident_notifications',
    )
    incident = LegacyIntegerForeignKey(
        Incident,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    event = LegacyIntegerForeignKey(
        IncidentEvent,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    message = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'incidents_incidentnotification'
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['recipient', 'event'],
                name='unique_incident_event_notification',
            ),
        ]