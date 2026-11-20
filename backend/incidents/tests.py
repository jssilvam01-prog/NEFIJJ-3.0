from datetime import timedelta
from io import BytesIO
from pathlib import Path
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.test import APITestCase

from accounts.models import Location, Organization, OrganizationMembership, User
from .models import (
    Category,
    CategoryTechnician,
    Incident,
    IncidentEvent,
    IncidentNotification,
)
from .sla import incident_sla_due_at, incident_sla_status


class IncidentApiTests(APITestCase):
    def setUp(self):
        self.media_dir = tempfile.TemporaryDirectory()
        self.media_override = override_settings(MEDIA_ROOT=self.media_dir.name)
        self.media_override.enable()

        self.organization = Organization.objects.create(name='Organización A')
        self.campus = Location.objects.create(
            organization=self.organization,
            name='Sede A',
            code='ORG-A-1',
        )
        self.other_campus = Location.objects.create(
            organization=self.organization,
            name='Sede B',
            code='ORG-A-2',
        )
        self.other_organization = Organization.objects.create(name='Organización B')
        self.other_org_campus = Location.objects.create(
            organization=self.other_organization,
            name='Sede C',
            code='ORG-B-1',
        )
        self.category = Category.objects.create(
            organization=self.organization,
            name='Infraestructura',
        )
        self.other_category = Category.objects.create(
            organization=self.other_organization,
            name='Redes',
        )
        self.reporter = self.create_user(
            'reporter',
            self.organization,
            self.campus,
            User.Role.STUDENT,
            OrganizationMembership.Role.USER,
        )
        self.second_reporter = self.create_user(
            'second-reporter',
            self.organization,
            self.campus,
            User.Role.STUDENT,
            OrganizationMembership.Role.USER,
        )
        self.technician = self.create_user(
            'technician',
            self.organization,
            self.campus,
            User.Role.TECHNICIAN,
            OrganizationMembership.Role.TECHNICIAN,
        )
        self.other_campus_technician = self.create_user(
            'other-campus-technician',
            self.organization,
            self.other_campus,
            User.Role.TECHNICIAN,
            OrganizationMembership.Role.TECHNICIAN,
        )
        self.other_org_user = self.create_user(
            'other-org-user',
            self.other_organization,
            self.other_org_campus,
            User.Role.STUDENT,
            OrganizationMembership.Role.USER,
        )

    def tearDown(self):
        self.media_override.disable()
        self.media_dir.cleanup()
        super().tearDown()

    def create_user(self, username, organization, location, user_role, membership_role):
        user = User.objects.create_user(
            username=username,
            email=f'{username}@example.test',
            password='Test-Pass-193!',
            role=user_role,
            location=location,
        )
        OrganizationMembership.objects.create(
            organization=organization,
            location=location,
            user=user,
            role=membership_role,
        )
        return user

    def create_incident(self, reporter=None, **kwargs):
        values = {
            'organization': self.organization,
            'location': self.campus,
            'reported_by': reporter or self.reporter,
            'category': self.category,
            'title': 'Lámpara dañada',
            'description': 'La lámpara del pasillo no enciende.',
        }
        values.update(kwargs)
        return Incident.objects.create(**values)

    @staticmethod
    def sample_image():
        buffer = BytesIO()
        Image.new('RGB', (8, 8), color='blue').save(buffer, format='JPEG')
        return SimpleUploadedFile('evidence.jpg', buffer.getvalue(), content_type='image/jpeg')

    def test_student_report_stores_image_and_returns_incident(self):
        self.client.force_authenticate(self.reporter)
        response = self.client.post(
            '/api/v1/incidents/',
            {
                'title': 'Lámpara dañada',
                'description': 'La lámpara del pasillo no enciende.',
                'category': self.category.pk,
                'priority': Incident.Priority.HIGH,
                'evidence_image': self.sample_image(),
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, 201)
        incident = Incident.objects.get(pk=response.data['id'])
        self.assertEqual(incident.reported_by, self.reporter)
        self.assertEqual(incident.location, self.campus)
        self.assertTrue(incident.evidence_image.name.startswith('evidences/'))
        self.assertLessEqual(len(incident.evidence_image.name), 100)
        self.assertTrue(Path(incident.evidence_image.path).is_file())
        self.assertEqual(incident.status, Incident.Status.PENDING)
        self.assertTrue(incident.events.filter(event_type=IncidentEvent.EventType.CREATED).exists())

    def test_invalid_evidence_is_rejected(self):
        self.client.force_authenticate(self.reporter)
        response = self.client.post(
            '/api/v1/incidents/',
            {
                'title': 'Evidencia inválida',
                'description': 'El archivo no es una imagen.',
                'category': self.category.pk,
                'priority': Incident.Priority.MEDIUM,
                'evidence_image': SimpleUploadedFile(
                    'evidence.jpg',
                    b'not-an-image',
                    content_type='image/jpeg',
                ),
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Incident.objects.filter(title='Evidencia inválida').exists())

    def test_evidence_requires_the_same_incident_visibility_scope(self):
        incident = self.create_incident(evidence_image=self.sample_image())

        self.client.force_authenticate(self.technician)

        response = self.client.get(f'/api/v1/incidents/{incident.pk}/evidence/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'image/jpeg')
        self.assertTrue(b''.join(response.streaming_content))
        response.close()

        from rest_framework_simplejwt.tokens import RefreshToken
        token = str(RefreshToken.for_user(self.technician).access_token)
        self.client.force_authenticate(user=None)
        response = self.client.get(f'/api/v1/incidents/{incident.pk}/evidence/?token={token}')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'image/jpeg')
        response.close()

        self.client.force_authenticate(self.other_campus_technician)
        response = self.client.get(f'/api/v1/incidents/{incident.pk}/evidence/')
        self.assertEqual(response.status_code, 404)

        self.client.force_authenticate(self.other_org_user)
        response = self.client.get(f'/api/v1/incidents/{incident.pk}/evidence/')
        self.assertEqual(response.status_code, 404)

    def test_user_and_technician_are_scoped_to_their_allowed_incidents(self):
        own_incident = self.create_incident(reporter=self.reporter)
        other_incident = self.create_incident(reporter=self.second_reporter, title='Otra incidencia')

        self.client.force_authenticate(self.reporter)
        response = self.client.get('/api/v1/incidents/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual({row['id'] for row in response.data}, {own_incident.pk})

        self.client.force_authenticate(self.technician)
        response = self.client.get('/api/v1/incidents/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual({row['id'] for row in response.data}, {own_incident.pk, other_incident.pk})

        self.client.force_authenticate(self.other_campus_technician)
        response = self.client.get(f'/api/v1/incidents/{own_incident.pk}/')
        self.assertEqual(response.status_code, 404)

        self.client.force_authenticate(self.other_org_user)
        response = self.client.get(f'/api/v1/incidents/{own_incident.pk}/')
        self.assertEqual(response.status_code, 404)

    def test_technician_can_update_only_assigned_incident(self):
        incident = self.create_incident(assigned_to=self.technician)
        skipped_status = self.create_incident(
            title='Salto de estado no permitido',
            assigned_to=self.technician,
        )
        unassigned = self.create_incident(title='Sin asignación')
        self.client.force_authenticate(self.technician)

        response = self.client.patch(
            f'/api/v1/incidents/{skipped_status.pk}/',
            {'status': Incident.Status.RESOLVED},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        skipped_status.refresh_from_db()
        self.assertEqual(skipped_status.status, Incident.Status.PENDING)

        response = self.client.patch(
            f'/api/v1/incidents/{incident.pk}/',
            {'status': Incident.Status.IN_PROGRESS},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        incident.refresh_from_db()
        self.assertEqual(incident.status, Incident.Status.IN_PROGRESS)
        event = incident.events.get(event_type=IncidentEvent.EventType.STATUS_CHANGED)
        self.assertEqual(event.old_value, {'status': Incident.Status.PENDING})
        self.assertEqual(event.new_value, {'status': Incident.Status.IN_PROGRESS})

        response = self.client.patch(
            f'/api/v1/incidents/{incident.pk}/',
            {
                'status': Incident.Status.RESOLVED,
                'resolution_note': 'Se reemplazó el cable dañado.',
                'resolution_image': self.sample_image(),
            },
            format='multipart',
        )
        self.assertEqual(response.status_code, 200)
        incident.refresh_from_db()
        self.assertEqual(incident.status, Incident.Status.RESOLVED)
        self.assertEqual(incident.resolution_note, 'Se reemplazó el cable dañado.')
        self.assertTrue(incident.resolution_image.name.startswith('evidences/resolutions/'))
        response = self.client.get(f'/api/v1/incidents/{incident.pk}/')
        self.assertIn('kind=resolution', response.data['resolution_image'])
        event = incident.events.get(
            event_type=IncidentEvent.EventType.STATUS_CHANGED,
            new_value__status=Incident.Status.RESOLVED,
        )
        self.assertEqual(event.new_value['resolution_note'], incident.resolution_note)
        self.client.force_authenticate(self.reporter)
        response = self.client.get(
            f'/api/v1/incidents/{incident.pk}/evidence/?kind=resolution',
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(b''.join(response.streaming_content))
        response.close()
        self.client.force_authenticate(self.technician)
        response = self.client.patch(
            f'/api/v1/incidents/{incident.pk}/',
            {'status': Incident.Status.IN_PROGRESS},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.patch(
            f'/api/v1/incidents/{unassigned.pk}/',
            {'status': Incident.Status.IN_PROGRESS},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_organization_admin_assigns_incident_to_same_site_technician_only(self):
        organization_admin = User.objects.create_user(
            username='assignment-admin',
            email='assignment-admin@example.test',
            password='Assignment-Admin-Secure-193!',
            role=User.Role.ADMIN,
        )
        OrganizationMembership.objects.create(
            organization=self.organization,
            user=organization_admin,
            role=OrganizationMembership.Role.ORGANIZATION_ADMIN,
        )
        incident = self.create_incident()
        self.client.force_authenticate(organization_admin)

        response = self.client.patch(
            f'/api/v1/incidents/{incident.pk}/',
            {'assigned_to': self.other_campus_technician.pk},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        incident.refresh_from_db()
        self.assertIsNone(incident.assigned_to)

        response = self.client.patch(
            f'/api/v1/incidents/{incident.pk}/',
            {'assigned_to': self.technician.pk},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['assigned_to'], self.technician.pk)
        incident.refresh_from_db()
        self.assertEqual(incident.assigned_to, self.technician)

        response = self.client.patch(
            f'/api/v1/incidents/{incident.pk}/',
            {'status': Incident.Status.IN_PROGRESS},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        incident.refresh_from_db()
        self.assertEqual(incident.status, Incident.Status.PENDING)
        response = self.client.patch(
            f'/api/v1/incidents/{incident.pk}/',
            {'assigned_to': self.other_org_user.pk},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        incident.refresh_from_db()
        self.assertEqual(incident.assigned_to, self.technician)
        self.assertTrue(
            IncidentNotification.objects.filter(
                recipient=self.technician,
                incident=incident,
                event__event_type=IncidentEvent.EventType.ASSIGNED,
            ).exists()
        )

        self.client.force_authenticate(self.technician)
        response = self.client.patch(
            f'/api/v1/incidents/{incident.pk}/',
            {'status': Incident.Status.IN_PROGRESS},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        reporter_notification = IncidentNotification.objects.get(
            recipient=self.reporter,
            incident=incident,
            event__event_type=IncidentEvent.EventType.STATUS_CHANGED,
        )
        self.client.force_authenticate(self.reporter)
        response = self.client.get('/api/v1/notifications/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['id'] for row in response.data], [reporter_notification.pk])

    def test_resolution_requires_a_nonempty_note(self):
        incident = self.create_incident(
            assigned_to=self.technician,
            status=Incident.Status.IN_PROGRESS,
        )
        self.client.force_authenticate(self.technician)

        response = self.client.patch(
            f'/api/v1/incidents/{incident.pk}/',
            {'status': Incident.Status.RESOLVED, 'resolution_note': '   '},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        incident.refresh_from_db()
        self.assertEqual(incident.status, Incident.Status.IN_PROGRESS)
        self.assertFalse(incident.resolution_image)

    def test_notifications_are_scoped_and_can_be_marked_read(self):
        incident = self.create_incident(assigned_to=self.technician)
        assignment_event = IncidentEvent.objects.create(
            incident=incident,
            actor=self.reporter,
            event_type=IncidentEvent.EventType.ASSIGNED,
            new_value={'technician_id': self.technician.pk, 'technician': self.technician.username},
        )
        notification = IncidentNotification.objects.create(
            recipient=self.technician,
            incident=incident,
            event=assignment_event,
            message='Te asignaron una incidencia.',
        )

        self.client.force_authenticate(self.reporter)
        response = self.client.get('/api/v1/notifications/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])
        response = self.client.post(f'/api/v1/notifications/{notification.pk}/read/')
        self.assertEqual(response.status_code, 404)

        self.client.force_authenticate(self.technician)
        response = self.client.get('/api/v1/notifications/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['id'] for row in response.data], [notification.pk])
        self.assertFalse(response.data[0]['is_read'])
        response = self.client.post(f'/api/v1/notifications/{notification.pk}/read/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['is_read'])

    def test_sla_hours_follow_priority_and_flag_due_or_late_incidents(self):
        incident = self.create_incident(priority=Incident.Priority.CRITICAL)
        IncidentEvent.objects.create(
            incident=incident,
            actor=self.reporter,
            event_type=IncidentEvent.EventType.CREATED,
            new_value={'status': incident.status},
        )
        self.client.force_authenticate(self.reporter)
        response = self.client.get(f'/api/v1/incidents/{incident.pk}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['sla_status'], 'on_track')
        self.assertEqual(response.data['events'][0]['event_type'], IncidentEvent.EventType.CREATED)
        self.assertTrue(response.data['sla_due_at'])

        expected_hours = {
            Incident.Priority.CRITICAL: 4,
            Incident.Priority.HIGH: 8,
            Incident.Priority.MEDIUM: 24,
            Incident.Priority.LOW: 72,
        }
        for priority, hours in expected_hours.items():
            incident.priority = priority
            due_at = incident_sla_due_at(incident)
            self.assertEqual(due_at - incident.created_at, timedelta(hours=hours))
            self.assertEqual(incident_sla_status(incident, now=due_at), 'overdue')

        incident.status = Incident.Status.RESOLVED
        incident.updated_at = due_at
        self.assertEqual(incident_sla_status(incident), 'resolved_on_time')
        incident.updated_at = due_at + timedelta(seconds=1)
        self.assertEqual(incident_sla_status(incident), 'resolved_late')

    def test_superadmin_has_global_read_access_but_cannot_manage_incidents(self):
        incident = self.create_incident()
        other_incident = Incident.objects.create(
            organization=self.other_organization,
            location=self.other_org_campus,
            reported_by=self.other_org_user,
            category=self.other_category,
            title='Incidencia global',
            description='Solo para supervisión global.',
        )
        superadmin = User.objects.create_superuser(
            username='global-admin',
            email='global-admin@example.test',
            password='Global-Secure-193!',
        )
        self.client.force_authenticate(superadmin)

        response = self.client.get('/api/v1/incidents/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            {row['id'] for row in response.data},
            {incident.pk, other_incident.pk},
        )
        response = self.client.patch(
            f'/api/v1/incidents/{incident.pk}/',
            {'status': Incident.Status.IN_PROGRESS},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        response = self.client.post(
            '/api/v1/incidents/',
            {
                'title': 'Intento superadmin',
                'description': 'No permitido.',
                'category': self.category.pk,
                'priority': Incident.Priority.MEDIUM,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        incident.refresh_from_db()
        self.assertEqual(incident.status, Incident.Status.PENDING)

    def test_superadmin_role_value_without_superuser_flag_does_not_grant_global_access(self):
        non_superuser = User.objects.create_user(
            username='role-only-admin',
            email='role-only-admin@example.test',
            password='Role-Only-Secure-193!',
            role=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(non_superuser)

        response = self.client.get('/api/v1/incidents/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])
        response = self.client.get('/api/v1/organizations/')
        self.assertEqual(response.status_code, 403)

    def test_inactive_membership_or_tenant_removes_user_incident_access(self):
        incident = self.create_incident()
        membership = self.reporter.organization_memberships.get()
        self.client.force_authenticate(self.reporter)

        membership.is_active = False
        membership.save(update_fields=['is_active'])
        response = self.client.get(f'/api/v1/incidents/{incident.pk}/')
        self.assertEqual(response.status_code, 404)

        membership.is_active = True
        membership.save(update_fields=['is_active'])
        self.organization.status = Organization.Status.SUSPENDED
        self.organization.save(update_fields=['status'])
        response = self.client.get(f'/api/v1/incidents/{incident.pk}/')
        self.assertEqual(response.status_code, 404)

    def test_organization_admin_is_scoped_to_its_organization(self):
        own_incident = self.create_incident()
        other_incident = Incident.objects.create(
            organization=self.other_organization,
            location=self.other_org_campus,
            reported_by=self.other_org_user,
            category=self.other_category,
            title='Incidencia de otra organización',
            description='No debe ser visible.',
        )
        organization_admin = User.objects.create_user(
            username='organization-admin',
            email='organization-admin@example.test',
            password='Test-Pass-693!',
            role=User.Role.ADMIN,
        )
        OrganizationMembership.objects.create(
            organization=self.organization,
            user=organization_admin,
            role=OrganizationMembership.Role.ORGANIZATION_ADMIN,
        )

        self.client.force_authenticate(organization_admin)
        response = self.client.get('/api/v1/incidents/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual({row['id'] for row in response.data}, {own_incident.pk})
        self.assertNotIn(other_incident.pk, {row['id'] for row in response.data})

    def test_reporter_cannot_use_another_organizations_category(self):
        self.client.force_authenticate(self.reporter)
        response = self.client.post(
            '/api/v1/incidents/',
            {
                'title': 'Reporte inválido',
                'description': 'Categoría ajena.',
                'category': self.other_category.pk,
                'priority': Incident.Priority.MEDIUM,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_organization_admin_manages_categories_and_routes_reports_to_site_technician(self):
        organization_admin = User.objects.create_user(
            username='category-admin',
            email='category-admin@example.test',
            password='Category-Admin-Secure-193!',
            role=User.Role.ADMIN,
        )
        OrganizationMembership.objects.create(
            organization=self.organization,
            user=organization_admin,
            role=OrganizationMembership.Role.ORGANIZATION_ADMIN,
        )
        self.client.force_authenticate(organization_admin)
        response = self.client.post(
            '/api/v1/categories/',
            {
                'name': 'Redes',
                'description': 'Conectividad institucional',
                'organization_id': self.organization.pk,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        category_id = response.data['id']

        response = self.client.post(
            f'/api/v1/categories/{category_id}/routes/',
            {
                'location_id': self.campus.pk,
                'technician_id': self.technician.pk,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)

        self.client.force_authenticate(self.reporter)
        response = self.client.post(
            '/api/v1/incidents/',
            {
                'title': 'Sin conexión',
                'description': 'El punto de acceso no conecta.',
                'category': category_id,
                'priority': Incident.Priority.HIGH,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        incident = Incident.objects.get(pk=response.data['id'])
        self.assertEqual(incident.assigned_to, self.technician)
        self.assertTrue(
            IncidentNotification.objects.filter(
                recipient=self.technician,
                incident=incident,
                event__event_type=IncidentEvent.EventType.ASSIGNED,
            ).exists()
        )

        self.client.force_authenticate(organization_admin)
        response = self.client.patch(
            f'/api/v1/categories/{category_id}/',
            {'is_active': False},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['is_active'])

    def test_category_routing_cannot_use_a_technician_from_another_campus(self):
        organization_admin = User.objects.create_user(
            username='route-admin',
            email='route-admin@example.test',
            password='Route-Admin-Secure-193!',
            role=User.Role.ADMIN,
        )
        OrganizationMembership.objects.create(
            organization=self.organization,
            user=organization_admin,
            role=OrganizationMembership.Role.ORGANIZATION_ADMIN,
        )
        self.client.force_authenticate(organization_admin)
        response = self.client.post(
            f'/api/v1/categories/{self.category.pk}/routes/',
            {
                'location_id': self.campus.pk,
                'technician_id': self.other_campus_technician.pk,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(
            CategoryTechnician.objects.filter(
                category=self.category,
                location=self.campus,
            ).exists()
        )
